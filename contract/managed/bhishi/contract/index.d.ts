import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum Phase { JOINING = 0,
                    CONTRIBUTION = 1,
                    BIDDING = 2,
                    REVEAL = 3,
                    PAYOUT = 4,
                    COMPLETE = 5
}

export type Witnesses<PS> = {
  localSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  joinCircle(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  contribute(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  placeBid(context: __compactRuntime.CircuitContext<PS>,
           discount_0: bigint,
           nonce_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  closeBidding(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  revealBid(context: __compactRuntime.CircuitContext<PS>,
            discount_0: bigint,
            nonce_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  closeReveal(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  claimPot(context: __compactRuntime.CircuitContext<PS>,
           payoutAddress_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  claimTreasury(context: __compactRuntime.CircuitContext<PS>,
                payoutAddress_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  joinCircle(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  contribute(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  placeBid(context: __compactRuntime.CircuitContext<PS>,
           discount_0: bigint,
           nonce_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  closeBidding(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  revealBid(context: __compactRuntime.CircuitContext<PS>,
            discount_0: bigint,
            nonce_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  closeReveal(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  claimPot(context: __compactRuntime.CircuitContext<PS>,
           payoutAddress_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  claimTreasury(context: __compactRuntime.CircuitContext<PS>,
                payoutAddress_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  memberId(sk_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  memberId(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  joinCircle(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  contribute(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  placeBid(context: __compactRuntime.CircuitContext<PS>,
           discount_0: bigint,
           nonce_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  closeBidding(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  revealBid(context: __compactRuntime.CircuitContext<PS>,
            discount_0: bigint,
            nonce_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  closeReveal(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  claimPot(context: __compactRuntime.CircuitContext<PS>,
           payoutAddress_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  claimTreasury(context: __compactRuntime.CircuitContext<PS>,
                payoutAddress_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly organizer: Uint8Array;
  readonly memberTarget: bigint;
  readonly contributionAmount: bigint;
  readonly feePerRound: bigint;
  readonly phase: Phase;
  readonly currentRound: bigint;
  readonly memberCount: bigint;
  members: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<[Uint8Array, boolean]>
  };
  paidRound: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  readonly paidCount: bigint;
  bidCommits: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  bidRounds: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  readonly bestDiscount: bigint;
  readonly bestBidder: Uint8Array;
  winners: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  readonly carryover: bigint;
  readonly treasury: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               target_0: bigint,
               contribution_0: bigint,
               fee_0: bigint): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
