/**
 * Shared business logic for the Bhishi circle contract.
 *
 * Platform-agnostic — works from browser (1AM / Lace DApp connector) or
 * CLI (wallet-sdk). Each platform provides its own provider implementations.
 *
 * @packageDocumentation
 */

import * as Bhishi from '../../contract/managed/bhishi/contract/index.js';
import { type ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { type Logger } from 'pino';
import {
  type BhishiProviders,
  type DeployedBhishiContract,
  type CircleState,
  CirclePhase,
  bhishiPrivateStateKey,
} from './common-types.js';
import { CompiledBhishiContract, createBhishiPrivateState } from '../../contract/src/index';
import * as utils from './utils/index.js';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { map, type Observable } from 'rxjs';

/** Parse the raw ledger() output into a UI-friendly CircleState. */
export function parseCircleState(ledgerState: any): CircleState {
  const hex = utils.toHexString;

  const members: string[] = [];
  for (const [key] of ledgerState.members) members.push(hex(key));

  const paidRound = new Map<string, number>();
  for (const [key, round] of ledgerState.paidRound) paidRound.set(hex(key), Number(round));

  const winners = new Map<string, number>();
  for (const [key, round] of ledgerState.winners) winners.set(hex(key), Number(round));

  const currentRound = Number(ledgerState.currentRound);

  // Only surface bids that belong to the current round (stale commits are ignored)
  const bidRounds = new Map<string, number>();
  for (const [key, round] of ledgerState.bidRounds) bidRounds.set(hex(key), Number(round));
  const sealedBids = new Map<string, string>();
  for (const [key, commit] of ledgerState.bidCommits) {
    const k = hex(key);
    if (bidRounds.get(k) === currentRound) sealedBids.set(k, hex(commit));
  }

  return {
    phase: Number(ledgerState.phase) as CirclePhase,
    currentRound,
    memberTarget: Number(ledgerState.memberTarget),
    memberCount: Number(ledgerState.memberCount),
    contributionAmount: BigInt(ledgerState.contributionAmount),
    feePerRound: BigInt(ledgerState.feePerRound),
    carryover: BigInt(ledgerState.carryover),
    treasury: BigInt(ledgerState.treasury),
    bestDiscount: BigInt(ledgerState.bestDiscount),
    bestBidderHex: hex(ledgerState.bestBidder),
    organizerHex: hex(ledgerState.organizer),
    paidRound,
    members,
    sealedBids,
    winners,
    paidCount: Number(ledgerState.paidCount),
  };
}

/** Re-export the compiled contract's ledger parser for indexer-side reads. */
export const bhishiLedger = Bhishi.ledger;

/**
 * API for a deployed Bhishi circle.
 *
 * Created via `BhishiAPI.deploy()` (organizer) or `BhishiAPI.join()` (member).
 */
export class BhishiAPI {
  private constructor(
    public readonly deployedContract: DeployedBhishiContract,
    providers: BhishiProviders,
    private readonly logger?: Logger,
  ) {
    this.deployedContractAddress = deployedContract.deployTxData.public.contractAddress;
    providers.privateStateProvider.setContractAddress(this.deployedContractAddress);

    this.state$ = providers.publicDataProvider
      .contractStateObservable(this.deployedContractAddress, { type: 'latest' })
      .pipe(map((contractState) => parseCircleState(Bhishi.ledger(contractState.data))));
  }

  readonly deployedContractAddress: ContractAddress;
  readonly state$: Observable<CircleState>;

  /** Join the circle as a member. */
  async joinCircle(): Promise<void> {
    await (this.deployedContract as any).callTx.joinCircle();
  }

  /** Pay this round's contribution (unshielded NIGHT into escrow). */
  async contribute(): Promise<void> {
    await (this.deployedContract as any).callTx.contribute();
  }

  /**
   * Place a sealed bid. Only the commitment hash goes on-chain.
   * Returns the nonce — the caller must keep it to reveal later.
   */
  async placeBid(discount: bigint, nonce: Uint8Array): Promise<void> {
    await (this.deployedContract as any).callTx.placeBid(discount, nonce);
  }

  /** Organizer: close bidding, open the reveal window. */
  async closeBidding(): Promise<void> {
    await (this.deployedContract as any).callTx.closeBidding();
  }

  /** Open your sealed bid — proves it matches the on-chain commitment. */
  async revealBid(discount: bigint, nonce: Uint8Array): Promise<void> {
    await (this.deployedContract as any).callTx.revealBid(discount, nonce);
  }

  /** Organizer: settle the auction (records winner, accrues protocol fee). */
  async closeReveal(): Promise<void> {
    await (this.deployedContract as any).callTx.closeReveal();
  }

  /** Winner: claim the discounted pot to an unshielded address. */
  async claimPot(bech32Address: string, networkId: string): Promise<void> {
    const addr = utils.bech32ToUserAddress(bech32Address, networkId);
    await (this.deployedContract as any).callTx.claimPot(addr);
  }

  /** Organizer: withdraw protocol fees after the circle completes. */
  async claimTreasury(bech32Address: string, networkId: string): Promise<void> {
    const addr = utils.bech32ToUserAddress(bech32Address, networkId);
    await (this.deployedContract as any).callTx.claimTreasury(addr);
  }

  /** Deploy a new circle (organizer operation). Amounts are in micro-NIGHT. */
  static async deploy(
    providers: BhishiProviders,
    secretKey: Uint8Array,
    terms: { memberTarget: number; contributionAmount: bigint; feePerRound: bigint },
    logger?: Logger,
  ): Promise<BhishiAPI> {
    const deployedContract = await deployContract(providers as any, {
      compiledContract: CompiledBhishiContract,
      privateStateId: bhishiPrivateStateKey,
      initialPrivateState: createBhishiPrivateState(secretKey),
      args: [BigInt(terms.memberTarget), terms.contributionAmount, terms.feePerRound],
    });
    return new BhishiAPI(deployedContract, providers, logger);
  }

  /** Connect to an existing circle (member operation). */
  static async join(
    providers: BhishiProviders,
    contractAddress: ContractAddress,
    secretKey: Uint8Array,
    logger?: Logger,
  ): Promise<BhishiAPI> {
    const deployedContract = await findDeployedContract(providers as any, {
      contractAddress,
      compiledContract: CompiledBhishiContract,
      privateStateId: bhishiPrivateStateKey,
      initialPrivateState: createBhishiPrivateState(secretKey),
    });
    return new BhishiAPI(deployedContract, providers, logger);
  }
}

export * as utils from './utils/index.js';
export * from './common-types.js';
