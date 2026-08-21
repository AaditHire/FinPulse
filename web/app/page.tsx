const githubUrl = process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/AaditHire/FinPulse";

const stack = ["Python 3.11", "FastAPI", "Groq", "CoinGecko", "SQLite", "GitHub Actions", "Next.js", "Gmail SMTP"];

function Arrow() {
  return <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">↗</span>;
}

export default function Home() {
  return (
    <main>
      <nav className="nav shell" aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="FinPulse home"><span className="pulse-dot" />FinPulse</a>
        <div className="nav-links">
          <a href="#how">How it works</a>
          <a className="github-mini group" href={githubUrl} target="_blank" rel="noreferrer">GitHub <Arrow /></a>
        </div>
      </nav>

      <section id="top" className="hero shell">
        <div className="eyebrow"><span /> Open source · Zero paid APIs</div>
        <h1>Know what moved.<br /><em>Skip the noise.</em></h1>
        <p className="hero-copy">FinPulse is an autonomous AI agent that reads the market for your portfolio and sends one calm, concise brief to your inbox.</p>
        <div className="hero-actions">
          <a className="button primary group" href={githubUrl} target="_blank" rel="noreferrer">Deploy your own <Arrow /></a>
          <a className="button secondary" href="#sample">See a sample brief</a>
        </div>
        <div className="trust-row">
          <span><b>2×</b> daily delivery</span><i />
          <span><b>$0</b> monthly cost</span><i />
          <span><b>100%</b> your data</span>
        </div>
      </section>

      <section id="sample" className="sample-wrap shell">
        <div className="ambient ambient-one" /><div className="ambient ambient-two" />
        <article className="email-window" aria-label="Sample FinPulse email digest">
          <div className="email-chrome"><span /><span /><span /><p>FinPulse Daily Brief — Aug 21, 2026</p></div>
          <div className="email-body">
            <header><div><small>FINPULSE</small><h2>The market, distilled.</h2><p>Friday, August 21 · AI-ranked portfolio intelligence</p></div><span className="status">LIVE</span></header>
            <div className="prices">
              <div><small>BTC / USD</small><strong>$112,480.20</strong><span className="up">+2.84%</span></div>
              <div><small>ETH / USD</small><strong>$4,318.64</strong><span className="up">+1.37%</span></div>
            </div>
            <DigestRow ticker="BTC" sentiment="POSITIVE" text="Institutional demand accelerated after a new wave of spot ETF inflows, while exchange balances continued to fall. The combination may tighten near-term supply and remains the clearest price-moving catalyst." links={["Bitcoin climbs as ETF inflows reach weekly high", "Exchange reserves fall to multi-year low"]} />
            <DigestRow ticker="AAPL" sentiment="NEUTRAL" text="Apple expanded its on-device AI rollout while suppliers signaled steady production plans. Attention now turns to next quarter’s product event; no immediate earnings revision followed the reports." links={["Apple broadens private AI beta access"]} />
          </div>
        </article>
      </section>

      <section id="how" className="section shell">
        <div className="section-label">THE AUTONOMOUS LOOP</div>
        <div className="section-heading"><h2>From market noise<br />to signal, automatically.</h2><p>No dashboard to check. No app to maintain. A scheduled agent does the reading, reasoning, and delivery.</p></div>
        <div className="flow">
          <Flow number="01" title="Collect" text="Public price APIs and trusted RSS feeds gather fresh stories for every asset in your portfolio." tag="CoinGecko + RSS" />
          <Flow number="02" title="Distill" text="Semantic deduplication removes echoes. Groq ranks relevance and writes grounded, asset-level summaries." tag="MiniLM + Llama 3.3" />
          <Flow number="03" title="Deliver" text="A polished HTML brief arrives by Gmail. SQLite remembers every link so yesterday never repeats." tag="SMTP + SQLite" />
        </div>
      </section>

      <section className="stack-section shell">
        <div><div className="section-label">BUILT IN THE OPEN</div><h2>Small stack.<br />Serious signal.</h2></div>
        <div className="stack-grid">{stack.map((item, index) => <div key={item}><span>{String(index + 1).padStart(2, "0")}</span>{item}</div>)}</div>
      </section>

      <section className="cta shell">
        <div className="cta-glow" />
        <p>YOUR PORTFOLIO. YOUR INBOX.</p>
        <h2>Let the market<br /><em>come to you.</em></h2>
        <a className="button light group" href={githubUrl} target="_blank" rel="noreferrer">View on GitHub <Arrow /></a>
      </section>

      <footer className="shell"><a className="brand" href="#top"><span className="pulse-dot" />FinPulse</a><p>Open-source market intelligence. Not financial advice.</p><span>MIT License · 2026</span></footer>
    </main>
  );
}

function DigestRow({ ticker, sentiment, text, links }: { ticker: string; sentiment: string; text: string; links: string[] }) {
  return <section className="digest-row"><div className="digest-title"><h3>{ticker}</h3><span>{sentiment}</span></div><p>{text}</p>{links.map(link => <a href="#how" key={link}>{link}<small> ↗</small></a>)}</section>;
}

function Flow({ number, title, text, tag }: { number: string; title: string; text: string; tag: string }) {
  return <article className="flow-card"><div className="flow-top"><span>{number}</span><i /></div><h3>{title}</h3><p>{text}</p><small>{tag}</small></article>;
}
