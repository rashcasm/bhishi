/**
 * Bhishi — Private Savings Circles on Midnight
 *
 * React web interface. Reads circle state from the indexer (no wallet
 * needed); all actions (join / contribute / sealed bid / reveal / claim)
 * go through the connected Midnight wallet (1AM or Lace).
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { InitialAPI, ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { Bhishi } from 'bhishi-contract';
import { useCircle } from './hooks/useCircle';
import About from './About';
import { BrowserBhishiManager, type CircleTerms } from './contexts/BrowserBhishiManager';
import { CirclePhase, PHASE_LABELS, potOf, utils, type BhishiAPI } from '../../api/src/index';
import pino from 'pino';

const NETWORK_ID = import.meta.env.VITE_NETWORK_ID ?? 'preprod';
const DEFAULT_CONTRACT = import.meta.env.VITE_DEFAULT_CONTRACT ?? '';
const { fmtNight, friendlyName, shortId, toHexString } = utils;

/**
 * Protocol fee — 5% of each round's pot, the traditional chit-fund
 * foreman commission. Fixed by the protocol, not user-configurable;
 * it is sealed into the contract at deploy time.
 */
const PROTOCOL_FEE_BPS = 500n;
const feeForTerms = (memberTarget: number, contributionMicro: bigint): bigint =>
  (BigInt(memberTarget) * contributionMicro * PROTOCOL_FEE_BPS) / 10_000n;

type WalletState = 'detecting' | 'no-wallet' | 'ready' | 'connecting' | 'connected';

const PHASE_ORDER = [
  CirclePhase.JOINING,
  CirclePhase.CONTRIBUTION,
  CirclePhase.BIDDING,
  CirclePhase.REVEAL,
  CirclePhase.PAYOUT,
] as const;

function findWallet(): InitialAPI | undefined {
  const midnight = (window as any).midnight;
  if (!midnight) return undefined;
  if (midnight['1am']) return midnight['1am'] as InitialAPI;
  return Object.values(midnight).find(
    (w): w is InitialAPI => !!w && typeof w === 'object' && 'apiVersion' in w,
  );
}

function truncAddr(addr: string): string {
  return addr.length <= 24 ? addr : `${addr.slice(0, 14)}…${addr.slice(-8)}`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { return false; }
}

function friendlyError(e: any): string {
  const msg = extractErrorMessage(e);
  if (msg.includes('User rejected')) return 'Transaction cancelled.';
  if (msg.includes('Network mismatch') || msg.includes('requested undeployed')) {
    return `Network mismatch: this app is configured for "${NETWORK_ID}" but your wallet is on a different network. Open the wallet extension and switch it to ${NETWORK_ID}, then reconnect.`;
  }
  if (msg.includes('already joined')) return 'You have already joined this circle.';
  if (msg.includes('joining closed')) return 'This circle is full — joining is closed.';
  if (msg.includes('not a member')) return 'This wallet identity is not a member of the circle.';
  if (msg.includes('already contributed')) return 'You already contributed this round.';
  if (msg.includes('already won')) return 'You already won a round — winners sit out remaining auctions.';
  if (msg.includes('discount too large')) return 'Discount is too large for this pot.';
  if (msg.includes('commitment mismatch')) return 'Reveal does not match your sealed bid. Check discount and nonce.';
  if (msg.includes('bid is stale')) return 'Your sealed bid is from a previous round.';
  if (msg.includes('no bid to reveal')) return 'No sealed bid found for your identity.';
  if (msg.includes('not the round winner')) return 'Only the round winner can claim the pot.';
  if (msg.includes('not organizer')) return 'Only the organizer can do this.';
  if (msg.includes('no revealed bids')) return 'No bids revealed yet — the auction cannot settle.';
  if (msg.includes('Failed to fetch') || msg.includes('Proof Server')) return 'Could not reach the proof server. Is it running on port 6300?';
  if (msg.includes('mismatched verifier keys')) return 'Contract version mismatch. Deploy a fresh circle.';
  if (msg.includes('not authorized')) return 'Wallet connection was rejected. Try connecting again.';
  if (msg.includes('insufficient') || msg.includes('DUST') || msg.includes('dust')) return 'Insufficient NIGHT or DUST. Fund this wallet from midnight-local-dev.';
  return msg || 'An unexpected error occurred. Check the browser console for details.';
}

function extractErrorMessage(e: any): string {
  if (!e) return '';
  if (e.message && e.message !== '') return e.message;
  const failure = e?.cause?.failure;
  if (failure?.message) return failure.message;
  if (failure?.cause?.message) return failure.cause.message;
  if (e?.cause?.message) return e.cause.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}

/** Locally stored sealed-bid secret (discount + nonce) so we can reveal later. */
type StoredBid = { discount: string; nonceB64: string };
const bidKey = (contract: string, round: number) => `bhishi-bid-${contract}-${round}`;
const saveBid = (contract: string, round: number, discount: bigint, nonce: Uint8Array) =>
  localStorage.setItem(bidKey(contract, round), JSON.stringify({
    discount: discount.toString(),
    nonceB64: btoa(String.fromCharCode(...nonce)),
  } satisfies StoredBid));
const loadBid = (contract: string, round: number): { discount: bigint; nonce: Uint8Array } | null => {
  const raw = localStorage.getItem(bidKey(contract, round));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredBid;
    return {
      discount: BigInt(parsed.discount),
      nonce: Uint8Array.from(atob(parsed.nonceB64), (c) => c.charCodeAt(0)),
    };
  } catch { return null; }
};

export default function App() {
  const [walletState, setWalletState] = useState<WalletState>('detecting');
  const [walletAPI, setWalletAPI] = useState<InitialAPI | undefined>();
  const [wallet, setWallet] = useState<ConnectedAPI | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<'app' | 'about'>('app');
  const [contractAddress, setContractAddress] = useState(DEFAULT_CONTRACT);
  const [joinInput, setJoinInput] = useState('');
  const [copied, setCopied] = useState(false);

  // Create-circle form (fee is protocol-fixed, not user input)
  const [formMembers, setFormMembers] = useState('4');
  const [formContribution, setFormContribution] = useState('100');
  const [deploying, setDeploying] = useState(false);

  // Actions
  const [busy, setBusy] = useState<string | null>(null); // circuit currently running
  const [bidInput, setBidInput] = useState('');

  const managerRef = useRef<BrowserBhishiManager | null>(null);
  const getManager = useCallback(() => {
    if (!managerRef.current) {
      const logger = pino({ level: 'warn', browser: { asObject: true } });
      managerRef.current = new BrowserBhishiManager(logger);
    }
    return managerRef.current;
  }, []);

  const { circle, error: circleError, refresh } = useCircle(contractAddress || null);

  // My pseudonymous identity — computed locally from the browser secret.
  const myId = useMemo(() => {
    try {
      return toHexString(Bhishi.pureCircuits.memberId(getManager().getSecretKey()));
    } catch { return ''; }
  }, [getManager]);

  // ── Wallet detection ─────────────────────────────────────────────────
  useEffect(() => {
    const found = findWallet();
    if (found) { setWalletAPI(found); setWalletState('ready'); return; }
    let elapsed = 0;
    const t = setInterval(() => {
      elapsed += 100;
      const w = findWallet();
      if (w) { setWalletAPI(w); setWalletState('ready'); clearInterval(t); }
      else if (elapsed >= 5_000) { setWalletState('no-wallet'); clearInterval(t); }
    }, 100);
    return () => clearInterval(t);
  }, []);

  const connect = useCallback(async () => {
    if (!walletAPI) return;
    setWalletState('connecting');
    setError(null);
    try {
      const c = await walletAPI.connect(NETWORK_ID);
      setWallet(c);
      const { unshieldedAddress } = await c.getUnshieldedAddress();
      setAddress(unshieldedAddress);
      setWalletState('connected');
    } catch (e) {
      setError(friendlyError(e));
      setWalletState('ready');
    }
  }, [walletAPI]);

  // ── Contract session (join/deploy through the manager) ──────────────
  const resolveApi = useCallback(async (): Promise<BhishiAPI> => {
    const manager = getManager();
    const deployment$ = manager.resolve(contractAddress as any);
    return new Promise((resolve, reject) => {
      const sub = deployment$.subscribe((d) => {
        if (d.status === 'deployed') { Promise.resolve().then(() => sub.unsubscribe()); resolve(d.api); }
        if (d.status === 'failed') { Promise.resolve().then(() => sub.unsubscribe()); reject(d.error); }
      });
    });
  }, [contractAddress, getManager]);

  const deployCircle = useCallback(async () => {
    if (!wallet) return;
    setDeploying(true);
    setError(null);
    try {
      const memberTarget = parseInt(formMembers, 10);
      const contributionAmount = BigInt(Math.round(parseFloat(formContribution) * 1e6));
      const terms: CircleTerms = {
        memberTarget,
        contributionAmount,
        feePerRound: feeForTerms(memberTarget, contributionAmount),
      };
      if (!(memberTarget > 1 && memberTarget <= 12)) throw new Error('Members must be between 2 and 12');
      if (!(contributionAmount > 0n)) throw new Error('Contribution must be positive');
      const manager = getManager();
      const deployment$ = manager.deployNew(terms);
      const api = await new Promise<BhishiAPI>((resolve, reject) => {
        const sub = deployment$.subscribe((d) => {
          if (d.status === 'deployed') { Promise.resolve().then(() => sub.unsubscribe()); resolve(d.api); }
          if (d.status === 'failed') { Promise.resolve().then(() => sub.unsubscribe()); reject(d.error); }
        });
      });
      setContractAddress(api.deployedContractAddress);
      await copyToClipboard(api.deployedContractAddress);
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setDeploying(false);
    }
  }, [wallet, formMembers, formContribution, getManager]);

  const runAction = useCallback(async (label: string, fn: (api: BhishiAPI) => Promise<void>) => {
    if (!wallet) { setError('Connect your wallet first.'); return; }
    setBusy(label);
    setError(null);
    try {
      const api = await resolveApi();
      await fn(api);
      setTimeout(() => refresh(), 2500);
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }, [wallet, resolveApi, refresh]);

  // ── Circle actions ──────────────────────────────────────────────────
  const doJoin = () => runAction('join', (api) => api.joinCircle());
  const doContribute = () => runAction('contribute', (api) => api.contribute());

  const doPlaceBid = () => {
    const discountNight = parseFloat(bidInput);
    if (!circle || !(discountNight > 0)) { setError('Enter a discount amount in NIGHT.'); return; }
    const discount = BigInt(Math.round(discountNight * 1e6));
    const nonce = crypto.getRandomValues(new Uint8Array(32));
    return runAction('bid', async (api) => {
      await api.placeBid(discount, nonce);
      saveBid(contractAddress, circle.currentRound, discount, nonce);
      setBidInput('');
    });
  };

  const doReveal = () => {
    if (!circle) return;
    const stored = loadBid(contractAddress, circle.currentRound);
    if (!stored) { setError('No sealed bid stored in this browser for this round.'); return; }
    return runAction('reveal', (api) => api.revealBid(stored.discount, stored.nonce));
  };

  const doCloseBidding = () => runAction('closeBidding', (api) => api.closeBidding());
  const doCloseReveal = () => runAction('closeReveal', (api) => api.closeReveal());
  const doClaimPot = () => {
    if (!address) { setError('Connect your wallet first.'); return; }
    return runAction('claimPot', (api) => api.claimPot(address, NETWORK_ID));
  };
  const doClaimTreasury = () => {
    if (!address) { setError('Connect your wallet first.'); return; }
    return runAction('claimTreasury', (api) => api.claimTreasury(address, NETWORK_ID));
  };

  const handleCopy = useCallback(async () => {
    if (!contractAddress) return;
    if (await copyToClipboard(contractAddress)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [contractAddress]);

  // ── Derived state ───────────────────────────────────────────────────
  const isConnected = walletState === 'connected';
  const isMember = !!circle && circle.members.includes(myId);
  const isOrganizer = !!circle && circle.organizerHex === myId;
  const hasPaidThisRound = !!circle && circle.paidRound.get(myId) === circle.currentRound;
  const hasBidThisRound = !!circle && circle.sealedBids.has(myId);
  const hasWon = !!circle && circle.winners.has(myId);
  const storedBid = circle ? loadBid(contractAddress, circle.currentRound) : null;
  const pot = circle ? potOf(circle) : 0n;

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <button className="brand" onClick={() => { setView('app'); }}>
            <span className="title">Bhishi</span>
            <span className="tagline">private savings circles</span>
          </button>
          <nav className="nav">
            <button className={view === 'app' ? 'nav-on' : ''} onClick={() => setView('app')}>App</button>
            <button className={view === 'about' ? 'nav-on' : ''} onClick={() => setView('about')}>How it works</button>
          </nav>
        </div>
        <div className="header-right">
          {isConnected && address ? (
            <div className="chip"><span className="dot" />{truncAddr(address)}</div>
          ) : walletState === 'detecting' || walletState === 'connecting' ? (
            <div className="chip muted"><span className="spinner" />{walletState === 'detecting' ? 'Detecting wallet…' : 'Connecting…'}</div>
          ) : walletState === 'no-wallet' ? (
            <div className="chip warn">Install the 1AM wallet extension</div>
          ) : (
            <button className="btn-connect" onClick={connect}>Connect Wallet</button>
          )}
        </div>
      </header>

      {error && (
        <div className="error-bar">
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {view === 'about' ? (
        <About onStart={() => setView('app')} />
      ) : !contractAddress ? (
        /* ── Landing: create or join ─────────────────────────────────── */
        <main className="landing">
          <div className="hero">
            <h1>The un-stealable, un-embarrassing chit fund.</h1>
            <p>
              The contract replaces the foreman — nobody can run away with the pot.
              Zero-knowledge sealed bids mean <strong>nobody learns you needed the money</strong>.
            </p>
            <button className="hero-link" onClick={() => setView('about')}>Learn how it works →</button>
          </div>
          <div className="landing-grid">
            <section className="card">
              <h2>Start a circle</h2>
              <p className="dim">Set the terms. They're sealed on-chain at deploy.</p>
              <label className="field">
                <span>Members</span>
                <input className="input" type="number" min={2} max={12} value={formMembers}
                  onChange={(e) => setFormMembers(e.target.value)} />
              </label>
              <label className="field">
                <span>Contribution per round (NIGHT)</span>
                <input className="input" type="number" min={1} value={formContribution}
                  onChange={(e) => setFormContribution(e.target.value)} />
              </label>
              <div className="terms-summary">
                {(() => {
                  const m = parseInt(formMembers, 10) || 0;
                  const c = Number.isFinite(parseFloat(formContribution)) ? BigInt(Math.round(parseFloat(formContribution) * 1e6)) : 0n;
                  const pot = BigInt(m) * c;
                  const fee = m > 1 && c > 0n ? feeForTerms(m, c) : 0n;
                  return (
                    <>
                      <div><span>Pot per round</span><strong>{fmtNight(pot)} NIGHT</strong></div>
                      <div><span>Protocol fee (5% of pot)</span><strong>{fmtNight(fee)} NIGHT / round</strong></div>
                      <div><span>Circle length</span><strong>{m || '—'} rounds</strong></div>
                    </>
                  );
                })()}
              </div>
              {isConnected ? (
                <button className="btn-primary" onClick={deployCircle} disabled={deploying}>
                  {deploying ? <><span className="spinner" /> Deploying circle…</> : 'Deploy Circle'}
                </button>
              ) : (
                <button className="btn-primary" onClick={connect} disabled={walletState !== 'ready'}>
                  Connect to Deploy
                </button>
              )}
            </section>
            <section className="card">
              <h2>Join a circle</h2>
              <p className="dim">Paste the contract address the organizer shared.</p>
              <input className="input" type="text" placeholder="Contract address (64 hex chars)"
                value={joinInput} onChange={(e) => setJoinInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && /^[0-9a-fA-F]{64}$/.test(joinInput.trim()) && setContractAddress(joinInput.trim())} />
              <button className="btn-secondary" disabled={!/^[0-9a-fA-F]{64}$/.test(joinInput.trim())}
                onClick={() => setContractAddress(joinInput.trim())}>
                Open Circle
              </button>
            </section>
          </div>
          <div className="privacy-note">
            🔒 Bids are <code>persistentCommit(discount, nonce)</code> on-chain — losing bids are never revealed.
          </div>
        </main>
      ) : (
        /* ── Circle dashboard ───────────────────────────────────────── */
        <main className="dashboard">
          <div className="circle-bar">
            <button className="contract-addr" onClick={handleCopy} title={`Click to copy: ${contractAddress}`}>
              <span className="mono">{truncAddr(contractAddress)}</span>
              <span className="copy-icon">{copied ? '✓' : '⎘'}</span>
            </button>
            {circle && circle.phase !== CirclePhase.JOINING && circle.phase !== CirclePhase.COMPLETE && (
              <span className="round-badge">Round {circle.currentRound} of {circle.memberTarget}</span>
            )}
            <button className="btn-text" onClick={() => { setContractAddress(''); setJoinInput(''); }}>
              ← Leave
            </button>
          </div>

          {!circle ? (
            <div className="card center-card">
              {circleError
                ? <p className="dim">{circleError} — waiting for the indexer…</p>
                : <p className="dim"><span className="spinner" /> Loading circle state…</p>}
            </div>
          ) : (
            <>
              {/* Phase stepper */}
              {circle.phase !== CirclePhase.COMPLETE ? (
                <div className="stepper">
                  {PHASE_ORDER.map((p) => (
                    <div key={p} className={`step ${circle.phase === p ? 'active' : ''} ${circle.phase > p ? 'done' : ''}`}>
                      <span className="step-dot" />
                      <span className="step-label">{PHASE_LABELS[p]}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="complete-banner">🎉 Circle complete — every member has taken a pot.</div>
              )}

              {/* Stats */}
              <div className="stats-row">
                <div className="stat"><span className="stat-label">Pot this round</span><span className="stat-value">{fmtNight(pot)} <em>NIGHT</em></span></div>
                <div className="stat"><span className="stat-label">Contribution</span><span className="stat-value">{fmtNight(circle.contributionAmount)} <em>NIGHT</em></span></div>
                <div className="stat"><span className="stat-label">Members</span><span className="stat-value">{circle.memberCount}/{circle.memberTarget}</span></div>
                <div className="stat"><span className="stat-label">Dividend carryover</span><span className="stat-value">{fmtNight(circle.carryover)} <em>NIGHT</em></span></div>
                <div className="stat treasury"><span className="stat-label">Protocol treasury</span><span className="stat-value">{fmtNight(circle.treasury)} <em>NIGHT</em></span></div>
              </div>

              <div className="dash-grid">
                {/* Members panel */}
                <section className="card">
                  <h2>Members</h2>
                  {circle.members.length === 0 && <p className="dim">Nobody has joined yet.</p>}
                  <div className="member-list">
                    {circle.members.map((m) => (
                      <div key={m} className={`member-row ${m === myId ? 'me' : ''}`}>
                        <span className="member-name">
                          {friendlyName(m)}
                          {m === myId && <span className="you-tag">you</span>}
                          {m === circle.organizerHex && <span className="org-tag">organizer</span>}
                        </span>
                        <span className="member-badges">
                          {circle.paidRound.get(m) === circle.currentRound && circle.phase !== CirclePhase.JOINING &&
                            <span className="badge paid" title="Contributed this round">paid</span>}
                          {circle.sealedBids.has(m) &&
                            <span className="badge sealed" title="Sealed bid placed — amount hidden">🔒 bid</span>}
                          {circle.winners.has(m) &&
                            <span className="badge won" title={`Won round ${circle.winners.get(m)}`}>won R{circle.winners.get(m)}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="member-id dim">Your identity: <span className="mono">{shortId(myId)}</span> — a pseudonymous hash; the secret never leaves this browser.</p>
                </section>

                {/* Action panel */}
                <section className="card action-card">
                  <h2>{PHASE_LABELS[circle.phase]}</h2>

                  {circle.phase === CirclePhase.JOINING && (
                    <>
                      <p className="dim">{circle.memberTarget - circle.memberCount} spot(s) left. Round 1 starts automatically when the circle is full.</p>
                      {isMember
                        ? <p className="ok">✓ You're in. Waiting for others…</p>
                        : <button className="btn-primary" onClick={doJoin} disabled={busy !== null}>
                            {busy === 'join' ? <><span className="spinner" /> Proving & joining…</> : 'Join Circle'}
                          </button>}
                    </>
                  )}

                  {circle.phase === CirclePhase.CONTRIBUTION && (
                    <>
                      <p className="dim">{circle.paidCount}/{circle.memberTarget} contributions in. Bidding opens when everyone has paid.</p>
                      {!isMember ? <p className="dim">You're not a member of this circle.</p>
                        : hasPaidThisRound ? <p className="ok">✓ Contribution paid for round {circle.currentRound}.</p>
                        : <button className="btn-primary" onClick={doContribute} disabled={busy !== null}>
                            {busy === 'contribute' ? <><span className="spinner" /> Sending {fmtNight(circle.contributionAmount)} NIGHT…</> : `Contribute ${fmtNight(circle.contributionAmount)} NIGHT`}
                          </button>}
                    </>
                  )}

                  {circle.phase === CirclePhase.BIDDING && (
                    <>
                      <p className="dim">
                        Bid the <strong>discount</strong> you'd accept to take the pot now.
                        Your amount is sealed — only a hash goes on-chain.
                      </p>
                      {!isMember ? <p className="dim">You're not a member of this circle.</p>
                        : hasWon ? <p className="dim">You already won a round — you sit out this auction.</p>
                        : (
                        <>
                          <label className="field">
                            <span>Discount (NIGHT)</span>
                            <input className="input" type="number" min={1} value={bidInput}
                              onChange={(e) => setBidInput(e.target.value)} placeholder="e.g. 20" />
                          </label>
                          <button className="btn-primary" onClick={doPlaceBid} disabled={busy !== null || !bidInput}>
                            {busy === 'bid' ? <><span className="spinner" /> Sealing bid…</> : hasBidThisRound ? 'Replace Sealed Bid 🔒' : 'Place Sealed Bid 🔒'}
                          </button>
                          {hasBidThisRound && <p className="ok">✓ Sealed bid on-chain. Keep this browser — it holds your reveal secret.</p>}
                        </>
                      )}
                      {isOrganizer && (
                        <div className="org-actions">
                          <p className="dim">{circle.sealedBids.size} sealed bid(s) placed.</p>
                          <button className="btn-secondary" onClick={doCloseBidding} disabled={busy !== null || circle.sealedBids.size === 0}>
                            {busy === 'closeBidding' ? <><span className="spinner" /> Closing…</> : 'Close Bidding → Open Reveals'}
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {circle.phase === CirclePhase.REVEAL && (
                    <>
                      <p className="dim">
                        Revealing proves your bid matches the sealed commitment — history can't be rewritten.
                        Unrevealed bids simply lose and stay secret forever.
                      </p>
                      <div className="best-bid">
                        Current best discount: <strong>{circle.bestDiscount > 0n ? `${fmtNight(circle.bestDiscount)} NIGHT` : '— none revealed yet'}</strong>
                        {circle.bestDiscount > 0n && circle.bestBidderHex === myId && <span className="you-tag">you lead</span>}
                      </div>
                      {isMember && hasBidThisRound && (
                        storedBid
                          ? <button className="btn-primary" onClick={doReveal} disabled={busy !== null}>
                              {busy === 'reveal' ? <><span className="spinner" /> Proving reveal…</> : `Reveal My Bid (${fmtNight(storedBid.discount)} NIGHT)`}
                            </button>
                          : <p className="dim">⚠ Your reveal secret isn't in this browser. Reveal from the device you bid on.</p>
                      )}
                      {isOrganizer && (
                        <div className="org-actions">
                          <button className="btn-secondary" onClick={doCloseReveal} disabled={busy !== null || circle.bestDiscount === 0n}>
                            {busy === 'closeReveal' ? <><span className="spinner" /> Settling…</> : 'Settle Auction'}
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {circle.phase === CirclePhase.PAYOUT && (
                    <>
                      <p className="dim">
                        Winner takes <strong>{fmtNight(pot - circle.bestDiscount - circle.feePerRound)} NIGHT</strong> (pot − discount − fee).
                        The {fmtNight(circle.bestDiscount)} NIGHT discount rolls into next round's pot as the communal dividend.
                      </p>
                      {circle.bestBidderHex === myId
                        ? <button className="btn-primary" onClick={doClaimPot} disabled={busy !== null}>
                            {busy === 'claimPot' ? <><span className="spinner" /> Claiming pot…</> : `🏆 Claim ${fmtNight(pot - circle.bestDiscount - circle.feePerRound)} NIGHT`}
                          </button>
                        : <p className="dim">Waiting for <strong>{friendlyName(circle.bestBidderHex)}</strong> to claim the pot…</p>}
                    </>
                  )}

                  {circle.phase === CirclePhase.COMPLETE && (
                    <>
                      <p className="dim">All {circle.memberTarget} rounds settled. Protocol earned <strong>{fmtNight(circle.treasury)} NIGHT</strong> in foreman fees.</p>
                      {isOrganizer && circle.treasury > 0n && (
                        <button className="btn-primary" onClick={doClaimTreasury} disabled={busy !== null}>
                          {busy === 'claimTreasury' ? <><span className="spinner" /> Withdrawing…</> : `Withdraw Treasury (${fmtNight(circle.treasury)} NIGHT)`}
                        </button>
                      )}
                      {isOrganizer && circle.treasury === 0n && <p className="ok">✓ Treasury withdrawn.</p>}
                    </>
                  )}
                </section>
              </div>

              <div className="privacy-note">
                🔒 Public on-chain: circle terms, phase, member hashes, sealed bid commitments, the winning discount.
                Never revealed: losing bid amounts — the financial distress signal stays private, forever.
              </div>
            </>
          )}
        </main>
      )}

      <footer className="footer">
        <span>Bhishi · built on <a href="https://midnight.network" target="_blank" rel="noopener noreferrer">Midnight</a> · network: <span className="mono">{NETWORK_ID}</span></span>
      </footer>
    </div>
  );
}
