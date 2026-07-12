/**
 * useCircle — reads on-chain Bhishi circle state from the indexer.
 *
 * Uses the same GraphQL query as midnight-js-indexer-public-data-provider
 * but via a simple fetch() so state is readable without a connected wallet.
 * Parses the state with the compiled contract's ledger() function.
 */

import { useState, useEffect, useCallback } from 'react';
import { ContractState } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { Bhishi } from 'bhishi-contract';
import { parseCircleState, type CircleState } from '../../../api/src/index';

const INDEXER_DEFAULTS: Record<string, string> = {
  undeployed: 'http://localhost:8088/api/v3/graphql',
  preview: 'https://indexer.preview.midnight.network/api/v4/graphql',
  preprod: 'https://indexer.preprod.midnight.network/api/v4/graphql',
  mainnet: 'https://indexer.mainnet.midnight.network/api/v4/graphql',
};
const NETWORK_ID = import.meta.env.VITE_NETWORK_ID ?? 'preprod';
const INDEXER_URL = import.meta.env.VITE_INDEXER_URL ?? INDEXER_DEFAULTS[NETWORK_ID] ?? INDEXER_DEFAULTS.preprod;

const CONTRACT_STATE_QUERY = `
  query ContractState($address: HexEncoded!) {
    contractAction(address: $address) {
      state
    }
  }
`;

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

export function useCircle(contractAddress: string | null, refreshInterval = 8_000) {
  const [circle, setCircle] = useState<CircleState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCircle = useCallback(async () => {
    if (!contractAddress || !/^[0-9a-fA-F]{64}$/.test(contractAddress)) return;

    try {
      setLoading(true);
      const res = await fetch(INDEXER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: CONTRACT_STATE_QUERY, variables: { address: contractAddress } }),
      });

      const gql = await res.json();
      if (gql.errors) {
        throw new Error(gql.errors[0]?.message ?? 'Indexer query failed');
      }

      const stateHex = gql.data?.contractAction?.state;
      if (!stateHex) {
        throw new Error('Circle not found on this network yet');
      }

      const contractState = ContractState.deserialize(hexToBytes(stateHex));
      setCircle(parseCircleState(Bhishi.ledger(contractState.data)));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [contractAddress]);

  useEffect(() => {
    fetchCircle();
  }, [fetchCircle]);

  useEffect(() => {
    if (!contractAddress) return;
    const interval = setInterval(fetchCircle, refreshInterval);
    return () => clearInterval(interval);
  }, [contractAddress, refreshInterval, fetchCircle]);

  return { circle, loading, error, refresh: fetchCircle };
}
