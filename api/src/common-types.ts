/**
 * Bhishi common types and abstractions.
 * @module
 */

import { type MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import { type FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import { type BhishiPrivateState } from '../../contract/src/index';

export const bhishiPrivateStateKey = 'bhishiPrivateState';
export type PrivateStateId = typeof bhishiPrivateStateKey;

export type BhishiCircuitKeys =
  | 'joinCircle'
  | 'contribute'
  | 'placeBid'
  | 'closeBidding'
  | 'revealBid'
  | 'closeReveal'
  | 'claimPot'
  | 'claimTreasury';

export type BhishiProviders = MidnightProviders<BhishiCircuitKeys, PrivateStateId, BhishiPrivateState>;
export type DeployedBhishiContract = FoundContract<any>;

/** Mirrors the on-chain Phase enum ordering. */
export enum CirclePhase {
  JOINING = 0,
  CONTRIBUTION = 1,
  BIDDING = 2,
  REVEAL = 3,
  PAYOUT = 4,
  COMPLETE = 5,
}

export const PHASE_LABELS: Record<CirclePhase, string> = {
  [CirclePhase.JOINING]: 'Joining',
  [CirclePhase.CONTRIBUTION]: 'Contribution',
  [CirclePhase.BIDDING]: 'Sealed Bidding',
  [CirclePhase.REVEAL]: 'Reveal',
  [CirclePhase.PAYOUT]: 'Payout',
  [CirclePhase.COMPLETE]: 'Complete',
};

/** Parsed, UI-friendly view of the on-chain circle state. */
export interface CircleState {
  readonly phase: CirclePhase;
  readonly currentRound: number;
  readonly memberTarget: number;
  readonly memberCount: number;
  readonly contributionAmount: bigint;
  readonly feePerRound: bigint;
  readonly carryover: bigint;
  readonly treasury: bigint;
  readonly bestDiscount: bigint;
  readonly bestBidderHex: string;
  readonly organizerHex: string;
  /** memberIdHex → last round contributed */
  readonly paidRound: ReadonlyMap<string, number>;
  /** memberIdHex list */
  readonly members: readonly string[];
  /** memberIdHex → sealed commitment hex (this round only) */
  readonly sealedBids: ReadonlyMap<string, string>;
  /** memberIdHex → round won */
  readonly winners: ReadonlyMap<string, number>;
  /** contributions received this round */
  readonly paidCount: number;
}

/** Pot available in the current round. */
export const potOf = (s: CircleState): bigint =>
  BigInt(s.memberTarget) * s.contributionAmount + s.carryover;
