import Link from "next/link";

/** Home. The scroll-driven pixel-cloud story is built later in Phase 3 (docs/PHASE3_NOTES.md). */
export default function HomePage() {
  return (
    <>
      <header className="bar container">
        <Link className="wordmark" href="/" aria-label="Colorway home">Colorway</Link>
        <nav className="links" aria-label="Sections"><ul><li><Link href="/inspiration">Open the studio</Link></li></ul></nav>
        <Link className="btn btn-secondary" href="/login">Sign in</Link>
      </header>
      <main>
        <section className="hero container" aria-labelledby="hero-h">
          <div className="hero-text">
            <h1 id="hero-h">See the colour in your photos</h1>
            <p className="lead">Colorway reads the photos you love and shows the palette behind them.</p>
            <div className="actions"><Link className="btn btn-primary btn-lg" href="/inspiration">Try the starter set</Link><Link className="btn btn-secondary btn-lg" href="/inspiration">Upload your photos</Link></div>
            <p className="privacy">Analysed in your browser. Your originals never leave your device.</p>
          </div>
        </section>
      </main>
    </>
  );
}
