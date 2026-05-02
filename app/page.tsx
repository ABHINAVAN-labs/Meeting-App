import Link from "next/link";

export default function Home() {
  return (
    <main className="home-shell">
      <section className="home-card glass-panel" aria-label="Meeting app entry">
        <h1>Meeting App</h1>
        <Link className="primary-action home-continue" href="/landing">
          Continue
        </Link>
      </section>
    </main>
  );
}
