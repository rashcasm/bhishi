/** Bhishi — "How it works" page. Explains the chit fund, the two problems it solves, and the privacy model. */

export default function About({ onStart }: { onStart: () => void }) {
  return (
    <main className="about">
      <section className="about-hero">
        <span className="pill">भिशी · a 200-year-old idea, made trustless</span>
        <h1>Save together.<br />Borrow early.<br /><span className="grad">Nobody watches.</span></h1>
        <p>
          A <strong>chit fund</strong> is how millions of families across India, and the world
          (tandas, susus, hui), save and borrow as a group — no bank required. Bhishi puts it
          on-chain and fixes the two things that always broke it.
        </p>
      </section>

      <section className="how-steps">
        <h2>How a circle works</h2>
        <div className="steps">
          <div className="step-card"><span className="step-n">1</span><h3>Everyone chips in</h3><p>Say 4 friends each put in 100 NIGHT every round. That's a 400 NIGHT pot on the table.</p></div>
          <div className="step-card"><span className="step-n">2</span><h3>Bid for it — secretly</h3><p>Need cash now? Offer a discount to take the pot early. Your bid is sealed — only a hash goes on-chain.</p></div>
          <div className="step-card"><span className="step-n">3</span><h3>Biggest discount wins</h3><p>Bids are revealed and checked against their seal. Highest discount takes the pot. Losing bids stay secret forever.</p></div>
          <div className="step-card"><span className="step-n">4</span><h3>The discount = everyone's dividend</h3><p>The discount the winner gave up rolls into next round's pot. Patient savers earn it. Everyone wins exactly once.</p></div>
        </div>
      </section>

      <section className="problems">
        <h2>The two problems Bhishi kills</h2>
        <div className="prob-grid">
          <div className="prob-card">
            <span className="prob-icon">🏃</span>
            <h3>The foreman runs away</h3>
            <p className="was">Traditionally, one person holds everyone's money. Chit scams have wiped out life savings for millions.</p>
            <p className="fix">→ The <strong>smart contract</strong> holds the pot in escrow. Nobody can touch it but the rightful winner. There is no foreman to run.</p>
          </div>
          <div className="prob-card">
            <span className="prob-icon">🙈</span>
            <h3>Bidding high = broadcasting you're broke</h3>
            <p className="was">In a normal chit auction, bidding a big discount tells your neighbours and colleagues you're desperate for cash this month.</p>
            <p className="fix">→ <strong>Zero-knowledge sealed bids.</strong> Your bid is a commitment nobody can open. The distress signal never exists.</p>
          </div>
        </div>
      </section>

      <section className="privacy-model">
        <h2>What's public vs. private</h2>
        <div className="pv-cols">
          <div className="pv-col public">
            <h3>👁 On-chain, public</h3>
            <ul>
              <li>Circle terms & current phase</li>
              <li>Pseudonymous member hashes</li>
              <li>Sealed bid commitments (just hashes)</li>
              <li>The winning discount (needed for dividends)</li>
            </ul>
          </div>
          <div className="pv-col private">
            <h3>🔒 Never revealed</h3>
            <ul>
              <li>Every losing bid amount</li>
              <li>Who was desperate for the money</li>
              <li>Your bidding pattern over time</li>
              <li>Your identity behind the hash</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="revenue">
        <h2>The model</h2>
        <p>
          The traditional foreman took ~5% of every pot for running the circle. Bhishi automates
          that role — so the protocol earns the <strong>same 5% of every pot, every round</strong>,
          with no one to trust. Recurring, culturally accepted, and it scales with every new circle.
        </p>
      </section>

      <div className="about-cta">
        <button className="btn-primary big" onClick={onStart}>Start a circle →</button>
        <span className="dim">Built on <a href="https://midnight.network" target="_blank" rel="noopener noreferrer">Midnight</a> — where privacy is the whole point.</span>
      </div>
    </main>
  );
}
