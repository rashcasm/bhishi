/** Bhishi — "How it works" page. Ledger-book aesthetic: the chit fund, the two fixes, the privacy model. */

function CircleDiagram() {
  // A rotating savings circle: four members around a central pot, one arrow showing the pot rotates.
  const members = [
    { x: 150, y: 34, label: 'A' },
    { x: 266, y: 150, label: 'B' },
    { x: 150, y: 266, label: 'C' },
    { x: 34, y: 150, label: 'D' },
  ];
  return (
    <svg viewBox="0 0 300 300" className="circle-svg" role="img" aria-label="Rotating savings circle">
      <circle cx="150" cy="150" r="116" className="ring" />
      {/* rotation arrow along the ring */}
      <path d="M150 34 A116 116 0 0 1 258 108" className="rot" markerEnd="url(#arw)" />
      <defs>
        <marker id="arw" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" className="arw-head" />
        </marker>
      </defs>
      {/* central pot */}
      <g>
        <ellipse cx="150" cy="158" rx="40" ry="34" className="pot" />
        <path d="M118 138 Q150 120 182 138" className="pot-lip" />
        <text x="150" y="164" className="pot-txt">POT</text>
      </g>
      {members.map((m) => (
        <g key={m.label}>
          <line x1="150" y1="150" x2={m.x} y2={m.y} className="spoke" />
          <circle cx={m.x} cy={m.y} r="24" className="node" />
          <text x={m.x} y={m.y + 5} className="node-txt">{m.label}</text>
        </g>
      ))}
    </svg>
  );
}

export default function About({ onStart }: { onStart: () => void }) {
  return (
    <main className="about">
      {/* Hero — editorial, left aligned, with the circle illustration */}
      <section className="ab-hero">
        <div className="ab-hero-text">
          <span className="kicker">भिशी — the savings circle, on-chain</span>
          <h1>A way to save and borrow together, without a bank — or a middleman who can run off with the money.</h1>
          <p>
            A <b>chit fund</b> is one of the oldest group-finance ideas in the world. A handful of
            people you trust pool money every month; each month one person takes the whole pot.
            It's a savings account, a loan, and a lottery in one. Bhishi keeps everything that
            makes it work and removes the two things that always broke it.
          </p>
        </div>
        <div className="ab-hero-art"><CircleDiagram /></div>
      </section>

      {/* Worked example — reads like a page from the foreman's ledger */}
      <section className="ledger">
        <div className="ledger-head">
          <span>An example round</span><span>4 members · 100 NIGHT each</span>
        </div>
        <div className="ledger-rows">
          <div className="lrow"><span className="ln">01</span><span className="ld">Everyone pays in 100</span><span className="lv">pot = 400 NIGHT</span></div>
          <div className="lrow"><span className="ln">02</span><span className="ld">Members secretly bid a discount to take the pot now</span><span className="lv">sealed</span></div>
          <div className="lrow"><span className="ln">03</span><span className="ld">Highest discount wins — say Meera bids 40 off</span><span className="lv">she takes 355</span></div>
          <div className="lrow"><span className="ln">04</span><span className="ld">Her 40 discount is split back to the group</span><span className="lv">+ next pot</span></div>
          <div className="lrow"><span className="ln">05</span><span className="ld">Protocol keeps the old foreman's cut (5%)</span><span className="lv">5 NIGHT</span></div>
        </div>
        <p className="ledger-foot">Whoever needs cash soonest bids the biggest discount. Whoever can wait earns the discounts as dividends. After four rounds, all four have had a turn.</p>
      </section>

      {/* The two problems — set as a comparison, no emoji, no cards */}
      <section className="fixes">
        <h2>The two things Bhishi fixes</h2>
        <div className="fix-row">
          <div className="fix-old">
            <span className="tag-old">The old way</span>
            <h3>One person holds the money</h3>
            <p>A foreman collects everyone's contributions and hands out the pot. When they vanish with it — and they have, at enormous scale — the savings are simply gone.</p>
          </div>
          <div className="fix-arrow">→</div>
          <div className="fix-new">
            <span className="tag-new">With Bhishi</span>
            <h3>The contract holds the money</h3>
            <p>Contributions sit in on-chain escrow. Funds only ever move to the round's rightful winner. There is no foreman, so there is no one to run.</p>
          </div>
        </div>
        <div className="fix-row">
          <div className="fix-old">
            <span className="tag-old">The old way</span>
            <h3>Bidding high tells everyone you're broke</h3>
            <p>The other members are your neighbours and colleagues. Offering a big discount publicly announces that you're desperate for cash this month.</p>
          </div>
          <div className="fix-arrow">→</div>
          <div className="fix-new">
            <span className="tag-new">With Bhishi</span>
            <h3>Bids are sealed with zero-knowledge proofs</h3>
            <p>Your bid is a cryptographic commitment nobody can open. Only the winning discount is ever revealed. Losing bids — and who was desperate — stay secret forever.</p>
          </div>
        </div>
      </section>

      {/* Privacy model — plain two-column ledger */}
      <section className="visibility">
        <h2>What the chain can and can't see</h2>
        <div className="vis-grid">
          <div className="vis-col">
            <h4>Recorded publicly</h4>
            <ul>
              <li>The circle's terms and current stage</li>
              <li>Anonymous member codes (a hash, not a name)</li>
              <li>Sealed bids — stored only as commitments</li>
              <li>The winning discount, so dividends can be paid</li>
            </ul>
          </div>
          <div className="vis-col dark">
            <h4>Never revealed</h4>
            <ul>
              <li>Every losing bid amount</li>
              <li>Who needed the money this month</li>
              <li>Your bidding pattern across rounds</li>
              <li>The identity behind your member code</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Revenue */}
      <section className="model">
        <h2>How it sustains itself</h2>
        <p>
          The traditional foreman earned roughly <b>5% of every pot</b> for running the circle.
          Bhishi automates that role, so the protocol earns the same cut — recurring every round,
          on every circle, with nobody to trust. It's a fee people have paid for generations.
        </p>
        <div className="model-num">
          <span>5%</span>
          <p>of each pot, each round — the automated foreman's fee</p>
        </div>
      </section>

      <div className="ab-cta">
        <button className="btn-primary big" onClick={onStart}>Start a circle</button>
        <span className="dim">Built on <a href="https://midnight.network" target="_blank" rel="noopener noreferrer">Midnight</a>, a blockchain where privacy is the default.</span>
      </div>
    </main>
  );
}
