/**
 * @file Bhishi Contract Tests
 *
 * Tests the full circle lifecycle, auction rules, privacy-relevant
 * invariants (sealed bids, one win per cycle), and money conservation
 * against the TypeScript simulator that mirrors bhishi.compact.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BhishiSimulator, Phase } from './bhishi-simulator';

const NIGHT = 1_000_000n;
const secret = (n: number): Uint8Array => new Uint8Array(32).fill(n);
const nonce = (n: number): Uint8Array => new Uint8Array(32).fill(100 + n);

// 4 members · 100 NIGHT contribution · 5 NIGHT fee per round
const ORGANIZER = secret(1); // organizer is also member #1
const MEMBERS = [secret(1), secret(2), secret(3), secret(4)];
const CONTRIBUTION = 100n * NIGHT;
const FEE = 5n * NIGHT;

const newCircle = () => new BhishiSimulator(ORGANIZER, 4, CONTRIBUTION, FEE);

const fillCircle = (sim: BhishiSimulator) => MEMBERS.forEach((m) => sim.joinCircle(m));
const allContribute = (sim: BhishiSimulator) => MEMBERS.forEach((m) => sim.contribute(m));

describe('circle setup', () => {
  it('rejects invalid terms', () => {
    expect(() => new BhishiSimulator(ORGANIZER, 1, CONTRIBUTION, FEE)).toThrow('at least 2');
    expect(() => new BhishiSimulator(ORGANIZER, 4, 0n, 0n)).toThrow('positive');
    expect(() => new BhishiSimulator(ORGANIZER, 4, CONTRIBUTION, CONTRIBUTION)).toThrow('fee too large');
  });

  it('auto-starts round 1 when full', () => {
    const sim = newCircle();
    expect(sim.phase).toBe(Phase.JOINING);
    fillCircle(sim);
    expect(sim.phase).toBe(Phase.CONTRIBUTION);
    expect(sim.currentRound).toBe(1);
  });

  it('rejects duplicate joins and joins after full', () => {
    const sim = newCircle();
    sim.joinCircle(MEMBERS[0]);
    expect(() => sim.joinCircle(MEMBERS[0])).toThrow('already joined');
    MEMBERS.slice(1).forEach((m) => sim.joinCircle(m)); // remaining 3 join → full
    expect(() => sim.joinCircle(secret(9))).toThrow('joining closed');
  });
});

describe('contribution phase', () => {
  it('collects escrow and opens bidding when all have paid', () => {
    const sim = newCircle();
    fillCircle(sim);
    allContribute(sim);
    expect(sim.escrowBalance).toBe(4n * CONTRIBUTION);
    expect(sim.phase).toBe(Phase.BIDDING);
  });

  it('rejects double contribution and non-members', () => {
    const sim = newCircle();
    fillCircle(sim);
    sim.contribute(MEMBERS[0]);
    expect(() => sim.contribute(MEMBERS[0])).toThrow('already contributed');
    expect(() => sim.contribute(secret(9))).toThrow('not a member');
  });
});

describe('sealed-bid auction', () => {
  let sim: BhishiSimulator;
  beforeEach(() => {
    sim = newCircle();
    fillCircle(sim);
    allContribute(sim);
  });

  it('stores only commitments during bidding (bids are sealed)', () => {
    sim.placeBid(MEMBERS[1], 20n * NIGHT, nonce(1));
    const stored = sim.bidCommits.get(sim.memberId(MEMBERS[1])!)!;
    expect(stored).toBeTypeOf('string');
    expect(stored).not.toContain((20n * NIGHT).toString()); // commitment ≠ plaintext
    expect(sim.bestDiscount).toBe(0n); // nothing revealed yet
  });

  it('enforces bid bounds', () => {
    expect(() => sim.placeBid(MEMBERS[1], 0n, nonce(1))).toThrow('positive');
    expect(() => sim.placeBid(MEMBERS[1], sim.potAmount(), nonce(1))).toThrow('too large');
  });

  it('reveal must match the sealed commitment exactly', () => {
    sim.placeBid(MEMBERS[1], 20n * NIGHT, nonce(1));
    sim.closeBidding(ORGANIZER);
    expect(() => sim.revealBid(MEMBERS[1], 21n * NIGHT, nonce(1))).toThrow('commitment mismatch');
    expect(() => sim.revealBid(MEMBERS[1], 20n * NIGHT, nonce(2))).toThrow('commitment mismatch');
    sim.revealBid(MEMBERS[1], 20n * NIGHT, nonce(1)); // correct opening works
    expect(sim.bestDiscount).toBe(20n * NIGHT);
  });

  it('highest revealed discount wins; unrevealed bids lose silently', () => {
    sim.placeBid(MEMBERS[1], 20n * NIGHT, nonce(1));
    sim.placeBid(MEMBERS[2], 30n * NIGHT, nonce(2));
    sim.placeBid(MEMBERS[3], 50n * NIGHT, nonce(3)); // never reveals
    sim.closeBidding(ORGANIZER);
    sim.revealBid(MEMBERS[1], 20n * NIGHT, nonce(1));
    sim.revealBid(MEMBERS[2], 30n * NIGHT, nonce(2));
    sim.closeReveal(ORGANIZER);
    expect(sim.bestBidder === sim.memberId(MEMBERS[2])).toBe(true); // 30 > 20; 50 unrevealed loses
  });

  it('only organizer can close phases; settle requires a revealed bid', () => {
    sim.placeBid(MEMBERS[1], 20n * NIGHT, nonce(1));
    expect(() => sim.closeBidding(MEMBERS[2])).toThrow('not organizer');
    sim.closeBidding(ORGANIZER);
    expect(() => sim.closeReveal(ORGANIZER)).toThrow('no revealed bids');
  });
});

describe('payout and full cycle', () => {
  it('pays winner pot − discount − fee; discount carries over; fee accrues', () => {
    const sim = newCircle();
    fillCircle(sim);
    allContribute(sim);
    sim.placeBid(MEMBERS[1], 20n * NIGHT, nonce(1));
    sim.closeBidding(ORGANIZER);
    sim.revealBid(MEMBERS[1], 20n * NIGHT, nonce(1));
    sim.closeReveal(ORGANIZER);

    const pot = 4n * CONTRIBUTION; // 400 NIGHT, round 1: no carryover
    const payout = sim.claimPot(MEMBERS[1]);
    expect(payout).toBe(pot - 20n * NIGHT - FEE); // 375 NIGHT
    expect(sim.carryover).toBe(20n * NIGHT);      // dividend to next pot
    expect(sim.treasury).toBe(FEE);               // protocol revenue
    expect(sim.phase).toBe(Phase.CONTRIBUTION);
    expect(sim.currentRound).toBe(2);
    // next round pot includes the carryover
    expect(sim.potAmount()).toBe(4n * CONTRIBUTION + 20n * NIGHT);
  });

  it('winners cannot bid again; wrong member cannot claim', () => {
    const sim = newCircle();
    fillCircle(sim);
    allContribute(sim);
    sim.placeBid(MEMBERS[1], 20n * NIGHT, nonce(1));
    sim.closeBidding(ORGANIZER);
    sim.revealBid(MEMBERS[1], 20n * NIGHT, nonce(1));
    sim.closeReveal(ORGANIZER);
    expect(() => sim.claimPot(MEMBERS[2])).toThrow('not the round winner');
    sim.claimPot(MEMBERS[1]);
    allContribute(sim);
    expect(() => sim.placeBid(MEMBERS[1], 10n * NIGHT, nonce(9))).toThrow('already won');
  });

  it('runs a complete 4-round cycle and conserves every micro-NIGHT', () => {
    const sim = newCircle();
    fillCircle(sim);

    for (let round = 1; round <= 4; round++) {
      allContribute(sim);
      const bidder = MEMBERS[round - 1]; // each member wins once
      sim.placeBid(bidder, BigInt(round) * 10n * NIGHT, nonce(round));
      sim.closeBidding(ORGANIZER);
      sim.revealBid(bidder, BigInt(round) * 10n * NIGHT, nonce(round));
      sim.closeReveal(ORGANIZER);
      sim.claimPot(bidder);
    }

    expect(sim.phase).toBe(Phase.COMPLETE);
    expect(sim.winners.size).toBe(4);
    expect(sim.treasury).toBe(4n * FEE); // revenue = fee × rounds

    const treasuryPaid = sim.claimTreasury(ORGANIZER);
    expect(treasuryPaid).toBe(4n * FEE);

    // Money conservation: in = 16 contributions; out = 4 payouts + treasury;
    // remainder in escrow = final round's carryover (last discount)
    const totalIn = 16n * CONTRIBUTION;
    const totalOut = sim.payouts.reduce((s, p) => s + p.amount, 0n) + treasuryPaid;
    expect(totalIn - totalOut).toBe(sim.carryover);
    expect(sim.escrowBalance).toBe(sim.carryover);
  });

  it('only organizer claims treasury, exactly once', () => {
    const sim = newCircle();
    fillCircle(sim);
    for (let round = 1; round <= 4; round++) {
      allContribute(sim);
      const bidder = MEMBERS[round - 1];
      sim.placeBid(bidder, 10n * NIGHT, nonce(round));
      sim.closeBidding(ORGANIZER);
      sim.revealBid(bidder, 10n * NIGHT, nonce(round));
      sim.closeReveal(ORGANIZER);
      sim.claimPot(bidder);
    }
    expect(() => sim.claimTreasury(MEMBERS[1])).toThrow('not organizer');
    sim.claimTreasury(ORGANIZER);
    expect(() => sim.claimTreasury(ORGANIZER)).toThrow('treasury empty');
  });
});
