/**
 * Browser-side provider initialization for the Bhishi DApp.
 *
 * Connects to a Midnight browser wallet (1AM or Lace) via the DApp
 * Connector API and bridges wallet operations to the BhishiAPI.
 * Wallet preference: 1AM first (window.midnight['1am']), then any
 * other connector with a compatible API version.
 */

import { BhishiAPI, type BhishiCircuitKeys, type BhishiProviders } from '../../../api/src/index';
import { type ContractAddress, fromHex, toHex } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { BehaviorSubject, catchError, concatMap, filter, firstValueFrom, interval, map, type Observable, take, throwError, timeout } from 'rxjs';
import { pipe as fnPipe } from 'fp-ts/function';
import { type Logger } from 'pino';
import { type ConnectedAPI, type InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import semver from 'semver';
import { Binding, type FinalizedTransaction, Proof, SignatureEnabled, Transaction, type TransactionId } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { type BhishiPrivateState } from 'bhishi-contract';
import { inMemoryPrivateStateProvider } from '../in-memory-private-state-provider';
import { type NetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import type { UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';

export type CircleTerms = {
  memberTarget: number;
  contributionAmount: bigint; // micro-NIGHT
  feePerRound: bigint;        // micro-NIGHT
};

export type BhishiDeployment =
  | { readonly status: 'in-progress' }
  | { readonly status: 'deployed'; readonly api: BhishiAPI }
  | { readonly status: 'failed'; readonly error: Error };

/**
 * Manages Bhishi contract connections in a browser setting.
 * Connects to the wallet, initializes providers, delegates to BhishiAPI.
 */
export class BrowserBhishiManager {
  readonly #deploymentsSubject = new BehaviorSubject<Array<BehaviorSubject<BhishiDeployment>>>([]);
  #initializedProviders: Promise<BhishiProviders> | undefined;

  constructor(private readonly logger: Logger) {}

  readonly deployments$: Observable<Array<Observable<BhishiDeployment>>> = this.#deploymentsSubject;

  /** Connect to an existing circle. */
  resolve(contractAddress: ContractAddress): Observable<BhishiDeployment> {
    const deployments = this.#deploymentsSubject.value;
    const existing = deployments.find(
      (d) => d.value.status === 'deployed' && d.value.api.deployedContractAddress === contractAddress,
    );
    if (existing) return existing;

    const deployment = new BehaviorSubject<BhishiDeployment>({ status: 'in-progress' });
    void this.run(deployment, (providers) =>
      BhishiAPI.join(providers, contractAddress, this.getSecretKey(), this.logger),
    );
    this.#deploymentsSubject.next([...deployments, deployment]);
    return deployment;
  }

  /** Deploy a new circle with the given terms (organizer). */
  deployNew(terms: CircleTerms): Observable<BhishiDeployment> {
    const deployments = this.#deploymentsSubject.value;
    const deployment = new BehaviorSubject<BhishiDeployment>({ status: 'in-progress' });
    void this.run(deployment, (providers) =>
      BhishiAPI.deploy(providers, this.getSecretKey(), terms, this.logger),
    );
    this.#deploymentsSubject.next([...deployments, deployment]);
    return deployment;
  }

  /**
   * Member identity secret — stays in localStorage, never leaves the browser.
   * On-chain identity is persistentHash("bhishi:member:v1", secret).
   */
  getSecretKey(): Uint8Array {
    const storageKey = 'bhishi-member-secret';
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      return Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
    }
    const secret = crypto.getRandomValues(new Uint8Array(32));
    localStorage.setItem(storageKey, btoa(String.fromCharCode(...secret)));
    return secret;
  }

  private getProviders(): Promise<BhishiProviders> {
    return this.#initializedProviders ?? (this.#initializedProviders = initializeProviders(this.logger));
  }

  private async run(
    deployment: BehaviorSubject<BhishiDeployment>,
    factory: (providers: BhishiProviders) => Promise<BhishiAPI>,
  ): Promise<void> {
    try {
      const providers = await this.getProviders();
      const api = await factory(providers);
      deployment.next({ status: 'deployed', api });
    } catch (error: unknown) {
      console.error('Contract operation failed:', error);
      let err: Error;
      if (error instanceof Error) {
        err = error;
      } else if (typeof error === 'string') {
        err = new Error(error);
      } else {
        err = new Error(JSON.stringify(error) || 'Unknown error during contract operation');
      }
      deployment.next({ status: 'failed', error: err });
    }
  }
}

// ── Provider initialization ────────────────────────────────────────────

const COMPATIBLE_CONNECTOR_API_VERSION = '4.x';

const initializeProviders = async (logger: Logger): Promise<BhishiProviders> => {
  const networkId = import.meta.env.VITE_NETWORK_ID as NetworkId;
  setNetworkId(networkId);

  const connectedAPI = await connectToWallet(logger, networkId);
  const config = await connectedAPI.getConfiguration();
  const proofServerUri = config.proverServerUri ?? import.meta.env.VITE_PROOF_SERVER_URL;
  const shieldedAddresses = await connectedAPI.getShieldedAddresses();
  const zkConfigProvider = new FetchZkConfigProvider<BhishiCircuitKeys>(window.location.origin, fetch.bind(window));

  // 1AM path: the wallet supplies its own proving provider (ProofStation-
  // backed, dust-free). Per the 1am-wallet skill, call unprovenTx.prove()
  // directly with CostModel — do NOT wrap with createProofProvider().
  // Fallback (Lace / local proof server): standard HTTP proof provider.
  let proofProvider = httpClientProofProvider(proofServerUri, zkConfigProvider);
  if (typeof (connectedAPI as any).getProvingProvider === 'function') {
    try {
      const provingProvider = await (connectedAPI as any).getProvingProvider(zkConfigProvider);
      const { CostModel } = await import('@midnight-ntwrk/midnight-js-protocol/ledger');
      proofProvider = {
        proveTx: async (unprovenTx: any, _cfg?: any) =>
          unprovenTx.prove(provingProvider, CostModel.initialCostModel()),
      } as any;
    } catch (e) {
      logger.warn({ err: e }, 'wallet proving provider unavailable, using HTTP proof server');
    }
  }

  return {
    privateStateProvider: inMemoryPrivateStateProvider<string, BhishiPrivateState>(),
    zkConfigProvider,
    proofProvider,
    publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri),
    walletProvider: {
      getCoinPublicKey: () => shieldedAddresses.shieldedCoinPublicKey,
      getEncryptionPublicKey: () => shieldedAddresses.shieldedEncryptionPublicKey,
      balanceTx: async (tx: UnboundTransaction): Promise<FinalizedTransaction> => {
        const received = await connectedAPI.balanceUnsealedTransaction(toHex(tx.serialize()));
        return Transaction.deserialize<SignatureEnabled, Proof, Binding>('signature', 'proof', 'binding', fromHex(received.tx));
      },
    },
    midnightProvider: {
      submitTx: async (tx: FinalizedTransaction): Promise<TransactionId> => {
        await connectedAPI.submitTransaction(toHex(tx.serialize()));
        return tx.identifiers()[0];
      },
    },
  };
};

// ── Wallet detection (prefers 1AM, falls back to any compatible) ──────

const getPreferredWallet = (): InitialAPI | undefined => {
  const midnight = (window as any).midnight;
  if (!midnight) return undefined;
  const oneAm = midnight['1am'];
  if (oneAm && typeof oneAm === 'object' && 'apiVersion' in oneAm &&
      semver.satisfies(oneAm.apiVersion, COMPATIBLE_CONNECTOR_API_VERSION)) {
    return oneAm as InitialAPI;
  }
  return Object.values(midnight).find(
    (wallet): wallet is InitialAPI =>
      !!wallet && typeof wallet === 'object' && 'apiVersion' in wallet &&
      semver.satisfies((wallet as InitialAPI).apiVersion, COMPATIBLE_CONNECTOR_API_VERSION),
  );
};

const connectToWallet = (logger: Logger, networkId: string): Promise<ConnectedAPI> =>
  firstValueFrom(
    fnPipe(
      interval(100),
      map(() => getPreferredWallet()),
      filter((api): api is InitialAPI => !!api),
      take(1),
      timeout({ first: 3_000, with: () => throwError(() => new Error('Could not find a Midnight wallet (1AM or Lace).')) }),
      concatMap(async (initialAPI) => initialAPI.connect(networkId)),
      timeout({ first: 8_000, with: () => throwError(() => new Error('Wallet failed to respond. Approve the connection in the extension.')) }),
      catchError((error) => throwError(() => error instanceof Error ? error : new Error('Wallet not authorized'))),
    ),
  );
