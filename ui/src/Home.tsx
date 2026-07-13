/**
 * Bhishi — animated homepage.
 * Scroll-linked hero (blur/fade via useScroll + useTransform), a canvas
 * background of coins orbiting into the pot (the rotating-savings metaphor),
 * whileInView section reveals, and a sealed-bid marquee. Flat ledger
 * aesthetic — motion, not gradients.
 */

import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform, useInView } from 'motion/react';

/* ── Canvas: coins orbiting a central pot, one drops in periodically ── */
function OrbitBackground() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      canvas.width = canvas.offsetWidth * DPR;
      canvas.height = canvas.offsetHeight * DPR;
    };
    resize();
    window.addEventListener('resize', resize);

    const N = 14;
    const coins = Array.from({ length: N }, (_, i) => ({
      angle: (i / N) * Math.PI * 2,
      speed: 0.0016 + (i % 3) * 0.0004,
      rx: 0.32 + (i % 4) * 0.045,   // ellipse radii as fraction of canvas
      ry: 0.22 + (i % 3) * 0.04,
      r: 3 + (i % 3),               // coin size
      drop: 0,                      // 0 = orbiting, >0 = dropping into pot
    }));

    const draw = (t: number) => {
      const W = canvas.width, H = canvas.height;
      const cx = W / 2, cy = H / 2;
      ctx.clearRect(0, 0, W, H);

      // dashed orbit ring
      ctx.strokeStyle = 'rgba(31,36,48,0.10)';
      ctx.lineWidth = 1 * DPR;
      ctx.setLineDash([3 * DPR, 6 * DPR]);
      ctx.beginPath();
      ctx.ellipse(cx, cy, W * 0.36, H * 0.28, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // pot
      ctx.strokeStyle = 'rgba(217,121,25,0.55)';
      ctx.fillStyle = 'rgba(253,241,227,0.9)';
      ctx.lineWidth = 2 * DPR;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 4 * DPR, 26 * DPR, 20 * DPR, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      coins.forEach((c, i) => {
        c.angle += c.speed;
        // every ~9s one coin dives into the pot and respawns
        if (c.drop === 0 && Math.floor(t / 9000) % N === i && (t % 9000) < 16) c.drop = 0.001;

        let x = cx + Math.cos(c.angle) * W * c.rx;
        let y = cy + Math.sin(c.angle) * H * c.ry;
        let alpha = 0.5;
        if (c.drop > 0) {
          c.drop = Math.min(1, c.drop + 0.02);
          x = x + (cx - x) * c.drop;
          y = y + (cy - y) * c.drop;
          alpha = 0.5 * (1 - c.drop);
          if (c.drop >= 1) c.drop = 0;
        }
        ctx.fillStyle = i % 3 === 0 ? `rgba(217,121,25,${alpha})` : `rgba(31,36,48,${alpha * 0.7})`;
        ctx.beginPath();
        ctx.arc(x, y, c.r * DPR, 0, Math.PI * 2);
        ctx.fill();
      });

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} className="orbit-bg" aria-hidden />;
}

/* ── Count-up number when scrolled into view ────────────────────────── */
function CountUp({ to, prefix = '', suffix = '', duration = 1200 }: { to: number; prefix?: string; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setVal(Math.round(to * (1 - Math.pow(1 - p, 3)))); // ease-out cubic
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration]);
  return <span ref={ref}>{prefix}{val.toLocaleString()}{suffix}</span>;
}

/* ── Sealed-bid marquee data (deterministic, module-level) ──────────── */
const HASHES = [
  '9f2ac1…e7d0', '44b8e0…12af', 'c7d391…88be', '02fe67…4a1c',
  '7a10cd…f33e', 'e8b54f…09d2', '31c9a8…b6f7', 'd0457e…21aa',
];

const reveal = { hidden: { opacity: 0, y: 28 }, show: { opacity: 1, y: 0 } };
const sectionProps = {
  variants: reveal,
  initial: 'hidden' as const,
  whileInView: 'show' as const,
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.55, ease: 'easeOut' as const },
};

export default function Home({ onLaunch, onAbout }: { onLaunch: () => void; onAbout: () => void }) {
  // scroll-linked hero: blurs and fades as you scroll past it
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const filter = useTransform(scrollYProgress, [0, 1], ['blur(0px)', 'blur(8px)']);
  const opacity = useTransform(scrollYProgress, [0, 0.9], [1, 0]);
  const y = useTransform(scrollYProgress, [0, 1], [0, 80]);

  return (
    <main className="home">
      {/* ── Hero ── */}
      <div ref={heroRef} className="hm-hero">
        <OrbitBackground />
        <motion.div className="hm-hero-inner" style={{ filter, opacity, y }}>
          <motion.p className="kicker" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            भिशी · private savings circles on Midnight
          </motion.p>
          <h1>
            {['Your', 'money,', 'pooled.'].map((w, i) => (
              <motion.span key={w} className="hm-word" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.09, duration: 0.5, ease: 'easeOut' }}>{w} </motion.span>
            ))}
            <br />
            {['Your', 'need,'].map((w, i) => (
              <motion.span key={w} className="hm-word" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.42 + i * 0.09, duration: 0.5, ease: 'easeOut' }}>{w} </motion.span>
            ))}
            <motion.span className="hm-word hm-accent" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.5, ease: 'easeOut' }}>sealed.</motion.span>
          </h1>
          <motion.p className="hm-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.75 }}>
            The chit fund your family already trusts - with the foreman replaced by a contract,
            and every bid sealed by a zero-knowledge proof.
          </motion.p>
          <motion.div className="hm-ctas" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}>
            <button className="btn-primary big" onClick={onLaunch}>Launch app</button>
            <button className="hero-link" onClick={onAbout}>How it works →</button>
          </motion.div>
        </motion.div>
        <div className="hm-scroll-hint" aria-hidden>scroll ↓</div>
      </div>

      {/* ── Sealed-bid marquee ── */}
      <motion.section className="hm-marquee-wrap" {...sectionProps}>
        <div className="hm-marquee">
          <div className="hm-track">
            {[...HASHES, ...HASHES].map((h, i) => (
              <span key={i} className={`hm-seal ${i % 8 === 5 ? 'winner' : ''}`}>
                {i % 8 === 5 ? 'winning bid · 40 NIGHT' : `sealed · ${h}`}
              </span>
            ))}
          </div>
        </div>
        <p className="hm-marquee-cap">Eight bids on-chain. One number ever revealed.</p>
      </motion.section>

      {/* ── Three ledger rows ── */}
      <motion.section className="hm-props" {...sectionProps}>
        <div className="lrow hm-prop">
          <span className="ln">01</span>
          <div><h3>Un-stealable</h3><p>The pot lives in contract escrow. No foreman, no scam, no midnight disappearance — funds can only move to the round's winner.</p></div>
        </div>
        <div className="lrow hm-prop">
          <span className="ln">02</span>
          <div><h3>Un-embarrassing</h3><p>Need cash? Bid high behind a sealed commitment. Losing bids are never opened — your circle never learns you were desperate.</p></div>
        </div>
        <div className="lrow hm-prop">
          <span className="ln">03</span>
          <div><h3>Still a community</h3><p>The winner's discount flows back to everyone else as the dividend, exactly like the bhishi your parents ran — just provable now.</p></div>
        </div>
      </motion.section>

      {/* ── Numbers ── */}
      <motion.section className="hm-stats" {...sectionProps}>
        <div className="hm-stat">
          <span className="hm-num"><CountUp to={200} suffix=" yrs" /></span>
          <p>the model has worked - tandas, susus, hui, chits</p>
        </div>
        <div className="hm-stat">
          <span className="hm-num">₹<CountUp to={150} suffix="k Cr" /></span>
          <p>India's chit market - informal side estimated far larger</p>
        </div>
        <div className="hm-stat">
          <span className="hm-num"><CountUp to={5} suffix="%" /></span>
          <p>the foreman's fee, now earned by the protocol each round</p>
        </div>
        <div className="hm-stat">
          <span className="hm-num"><CountUp to={0} /></span>
          <p>losing bids ever revealed, by construction</p>
        </div>
      </motion.section>

      {/* ── Final CTA ── */}
      <motion.section className="hm-final" {...sectionProps}>
        <h2>The circle is waiting.</h2>
        <p>Deploy one in a minute. Invite three friends. Watch the first sealed auction settle.</p>
        <button className="btn-primary big" onClick={onLaunch}>Start a circle</button>
      </motion.section>
    </main>
  );
}
