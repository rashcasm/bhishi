/**
 * @file Bhishi Contract Simulator
 *
 * Simulates the bhishi.compact contract logic in TypeScript for testing.
 * Mirrors every assert and state transition in the circuits so the round
 * lifecycle, auction rules, and money conservation can be tested without
 * a chain. Real hashing is replaced with a deterministic stand-in.
 */

export enum Phase {
  JOINING = 0,
  CONTRIBUTION = 1,
  BIDDING = 2,
  REVEAL = 3,
  PAYOUT = 4,
  COMPLETE = 5,
}

const hashBytes = (parts: Uint8Array[]): string => {
  // Stand-in for persistentHash/persistentCommit — deterministic string key
  let h = 7n;
  for (const p of parts) for (const b of p) h = (h * 31n + BigInt(b)) % 2n ** 128n;
  return h.toString(16);
};

const u64 = (v: bigint, label: string): bigint => {
  if (v < 0n) throw new Error(`${label} underflow`);
  return v;
};

export class BhishiSimulator {
  // sealed config
  readonly organizer: string;
  readonly memberTarget: number;
  readonly contributionAmount: bigint;
  readonly feePerRound: bigint;

  // state
  phase: Phase = Phase.JOINING;
  currentRound = 0;
  memberCount = 0;
  members = new Set<string>();
  paidRound = new Map<string, number>();
  paidCount = 0;
  bidCommits = new Map<string, string>();
  bidRounds = new Map<string, number>();
  bestDiscount = 0n;
  bestBidder = '';
  winners = new Map<string, number>();
  carryover = 0n;
  treasury = 0n;

  // escrow tracking (receiveUnshielded / sendUnshielded)
  escrowBalance = 0n;
  payouts: Array<{ member: string; amount: bigint }> = [];

  constructor(organizerSecret: Uint8Array, memberTarget: number, contributionAmount: bigint, feePerRound: bigint) {
    if (!(memberTarget > 1)) throw new Error('need at least 2 members');
    if (!(contributionAmount > 0n)) throw new Error('contribution must be positive');
    if (!(feePerRound < contributionAmount)) throw new Error('fee too large');
    this.organizer = this.memberId(organizerSecret);
    this.memberTarget = memberTarget;
    this.contributionAmount = contributionAmount;
    this.feePerRound = feePerRound;
  }

  memberId(secret: Uint8Array): string {
    return hashBytes([new TextEncoder().encode('bhishi:member:v1'), secret]);
  }

  private commitment(discount: bigint, nonce: Uint8Array): string {
    const d = new Uint8Array(8);
    new DataView(d.buffer).setBigUint64(0, discount);
    return hashBytes([d, nonce]);
  }

  potAmount(): bigint {
    return BigInt(this.memberTarget) * this.contributionAmount + this.carryover;
  }

  joinCircle(secret: Uint8Array): void {
    if (this.phase !== Phase.JOINING) throw new Error('joining closed');
    const mid = this.memberId(secret);
    if (this.members.has(mid)) throw new Error('already joined');
    this.members.add(mid);
    this.memberCount += 1;
    if (this.memberCount === this.memberTarget) {
      this.phase = Phase.CONTRIBUTION;
      this.currentRound = 1;
    }
  }

  contribute(secret: Uint8Array): void {
    if (this.phase !== Phase.CONTRIBUTION) throw new Error('not contribution phase');
    const mid = this.memberId(secret);
    if (!this.members.has(mid)) throw new Error('not a member');
    if (this.paidRound.has(mid) && this.paidRound.get(mid)! >= this.currentRound) {
      throw new Error('already contributed this round');
    }
    this.escrowBalance += this.contributionAmount; // receiveUnshielded
    this.paidRound.set(mid, this.currentRound);
    this.paidCount += 1;
    if (this.paidCount === this.memberTarget) {
      this.phase = Phase.BIDDING;
      this.paidCount = 0;
    }
  }

  placeBid(secret: Uint8Array, discount: bigint, nonce: Uint8Array): void {
    if (this.phase !== Phase.BIDDING) throw new Error('not bidding phase');
    const mid = this.memberId(secret);
    if (!this.members.has(mid)) throw new Error('not a member');
    if (this.winners.has(mid)) throw new Error('already won a round');
    if (!(discount > 0n)) throw new Error('discount must be positive');
    if (!(discount + this.feePerRound < this.potAmount())) throw new Error('discount too large');
    this.bidCommits.set(mid, this.commitment(discount, nonce));
    this.bidRounds.set(mid, this.currentRound);
  }

  closeBidding(secret: Uint8Array): void {
    if (this.phase !== Phase.BIDDING) throw new Error('not bidding phase');
    if (this.memberId(secret) !== this.organizer) throw new Error('not organizer');
    this.phase = Phase.REVEAL;
  }

  revealBid(secret: Uint8Array, discount: bigint, nonce: Uint8Array): void {
    if (this.phase !== Phase.REVEAL) throw new Error('not reveal phase');
    const mid = this.memberId(secret);
    if (!this.bidCommits.has(mid)) throw new Error('no bid to reveal');
    if (this.bidRounds.get(mid) !== this.currentRound) throw new Error('bid is stale');
    if (this.bidCommits.get(mid) !== this.commitment(discount, nonce)) throw new Error('commitment mismatch');
    if (discount > this.bestDiscount) {
      this.bestDiscount = discount;
      this.bestBidder = mid;
    }
  }

  closeReveal(secret: Uint8Array): void {
    if (this.phase !== Phase.REVEAL) throw new Error('not reveal phase');
    if (this.memberId(secret) !== this.organizer) throw new Error('not organizer');
    if (!(this.bestDiscount > 0n)) throw new Error('no revealed bids');
    this.winners.set(this.bestBidder, this.currentRound);
    this.treasury += this.feePerRound;
    this.phase = Phase.PAYOUT;
  }

  claimPot(secret: Uint8Array): bigint {
    if (this.phase !== Phase.PAYOUT) throw new Error('not payout phase');
    const mid = this.memberId(secret);
    if (mid !== this.bestBidder) throw new Error('not the round winner');
    const payout = u64(this.potAmount() - this.bestDiscount - this.feePerRound, 'payout');
    this.escrowBalance = u64(this.escrowBalance - payout, 'escrow'); // sendUnshielded
    this.payouts.push({ member: mid, amount: payout });
    this.carryover = this.bestDiscount;
    this.bestDiscount = 0n;
    this.bestBidder = '';
    if (this.currentRound === this.memberTarget) {
      this.phase = Phase.COMPLETE;
    } else {
      this.currentRound += 1;
      this.phase = Phase.CONTRIBUTION;
    }
    return payout;
  }

  claimTreasury(secret: Uint8Array): bigint {
    if (this.phase !== Phase.COMPLETE) throw new Error('circle not complete');
    if (this.memberId(secret) !== this.organizer) throw new Error('not organizer');
    if (!(this.treasury > 0n)) throw new Error('treasury empty');
    const amount = this.treasury;
    this.escrowBalance = u64(this.escrowBalance - amount, 'escrow'); // sendUnshielded
    this.treasury = 0n;
    return amount;
  }
}
