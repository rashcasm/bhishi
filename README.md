# Bhishi — Private Savings Circles on Midnight

**The un-stealable, un-embarrassing chit fund.** *Bhishi* (Marathi: भिशी) is a rotating
savings circle — India's centuries-old chit fund, run by millions of communities and
plagued by two problems: organizers who abscond with the pot, and auctions that force
you to **publicly signal financial distress** to your own social circle.

Bhishi fixes both on [Midnight](https://midnight.network):

- **The contract replaces the foreman.** Contributions sit in trustless escrow; nobody can run away with the pot. The traditional ~5% foreman commission accrues to the protocol treasury instead.
- **Bids are sealed with zero-knowledge commitments.** Each round's pot is auctioned by discount — but your bid is `persistentCommit(discount, nonce)` on-chain. **Losing bids are never revealed.** Nobody learns you needed the money.

## How a circle works

```
JOINING → CONTRIBUTION → BIDDING → REVEAL → PAYOUT → …next round… → COMPLETE
```

1. Organizer deploys a circle: N members, contribution per round. Terms are sealed on-chain.
2. Each round, every member contributes NIGHT into escrow.
3. Members place **sealed bids**: the discount they'd accept to take the pot early.
4. After the organizer closes bidding, bidders reveal — the circuit proves each reveal
   matches its commitment (history can't be rewritten). Highest discount wins.
5. Winner takes `pot − discount − fee`. The discount rolls into next round's pot as the
   communal dividend; the fee (5% of pot, protocol-fixed) accrues to the treasury.
6. Everyone wins exactly once; after N rounds the circle completes.

**Public on-chain:** terms, phase, pseudonymous member hashes, sealed bid commitments, the winning discount.
**Never revealed:** losing bid amounts — the distress signal stays private, forever.

## Prerequisites

- **Node.js** 20+
- **Compact compiler** (`compact` on PATH) — only needed if you modify the contract
- A Midnight wallet extension in Chrome:
  - **[1AM wallet](https://1am.xyz)** — preprod/preview/mainnet, dust-free (ProofStation pays fees)
  - **Lace** — required for the local `undeployed` network

## Run (preprod + 1AM — default)

```bash
npm install
npm run compile        # compile bhishi.compact → managed/bhishi (ZK keys)
npm run build          # build contract + api TS packages
cd ui && npm run dev   # → http://localhost:3000
```

1. Set the **1AM wallet to Preprod** (the app's `.env` is preprod by default — a network
   mismatch error means the wallet and app disagree; switch the wallet, reconnect).
2. Get **tNIGHT** from the preprod faucet: https://midnight-tmnight-preprod.nethermind.dev/
   (funding takes 2–3 minutes; contributions move real tNIGHT into escrow).
3. Open http://localhost:3000 → Connect → **Deploy Circle** (address auto-copies).
4. Other members: separate Chrome profiles (each profile = its own member identity +
   wallet) → paste the circle address → **Join**.

## Run (local undeployed + Lace)

The 1AM wallet **cannot** connect to a local chain — use Lace for this mode.

```bash
# 1. start the local stack (node + indexer + proof server) & fund wallets
cd ../midnight-local-dev && npm start

# 2. point the UI at the local network
cd ../bhishi/ui && cp .env.undeployed .env && npm run dev
```

Switch Lace's network to **Undeployed** — it hardcodes the local ports (9944/8088/6300).

## Test

```bash
cd contract && npm test    # vitest — simulator mirrors every circuit assert
```

14 tests cover: circle setup & term validation, contribution escrow, **sealed-bid
integrity** (commitment ≠ plaintext, reveal must open the exact commitment), running-max
winner selection, unrevealed-bids-lose, one-win-per-cycle, organizer-only phase gates,
payout math, and **full-cycle money conservation** (every micro-NIGHT in = out).

To recompile after contract changes (any change regenerates verifier keys → old
deployments become incompatible, always deploy a fresh circle):

```bash
npm run compile && npm run build && cd ui && npm run dev
```

## Architecture

```
contract/bhishi.compact     Compact contract — 8 circuits, sealed-bid auction core
contract/src/               witnesses (member secret key) + compiled contract export
contract/test/              TS simulator + vitest suite
api/src/                    BhishiAPI (deploy/join + circuit calls), state parser
ui/src/App.tsx              light-theme React app (landing + circle dashboard)
ui/src/contexts/            wallet manager: 1AM-first detection, providers, proving
ui/src/hooks/useCircle.ts   indexer state reads (works without a wallet)
```

### Key design decisions

- **Protocol fee is not user input** — it's a protocol constant (5% of each pot, the
  culturally standard foreman commission), computed at deploy and sealed into the
  contract. Revenue = `circles × pot × 5% × rounds`.
- **Member identity** = `persistentHash("bhishi:member:v1", secretKey)` — the secret
  lives in browser localStorage and never leaves; the chain sees only the hash.
- **Reveal secrets** (discount + nonce) are stored per-round in localStorage; reveal
  from the same browser that placed the bid.
- **1AM proving**: the wallet's own `getProvingProvider` handles ZK proving +
  `balanceUnsealedTransaction` sponsors dust fees. Lace/local falls back to the
  HTTP proof server.

## Known limitations (MVP)

- Winners are visible at payout (funds must move) — losing bids are the protected secret.
- Members must escrow each round manually; default risk (winner stops contributing) is
  handled in real deployments via collateral or reputation — out of scope here.
- Reveal requires the browser that placed the bid (localStorage nonce).
- Organizer advances phases manually; block-time deadlines are a roadmap item.
