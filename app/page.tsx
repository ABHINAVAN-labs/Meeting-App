import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <main className="home-shell">
      <div className="home-bg-wrap" aria-hidden="true">
        <Image
          src="/landing-background.png"
          alt=""
          fill
          priority
          className="home-bg-image"
          sizes="100vw"
        />
        <Image
          src="/landing-background.png"
          alt=""
          fill
          priority
          className="home-bg-art"
          sizes="100vw"
        />
        <div className="home-bg-overlay" />
      </div>
      <section className="home-card" aria-label="Meeting app entry">
        <p className="home-kicker">Zero Lag. Full Attention</p>
        <h1 className="home-brand-title meetigate-font">Meetigate</h1>
        <p className="home-copy">
          A simple meeting space for teachers and students to join, host, and keep class moving.
        </p>
        <div className="home-actions">
          <Link className="primary-action home-continue" href="/landing">
            Continue
          </Link>
        </div>
      </section>
    </main>
  );
}
