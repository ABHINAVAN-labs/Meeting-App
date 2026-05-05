import Link from "next/link";
import Script from "next/script";
import { Nunito, Oxygen } from "next/font/google";

const oxygen = Oxygen({
  subsets: ["latin"],
  weight: ["700"],
});

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400"],
});

export default function Home() {
  return (
    <>
      <main className="home-shell" suppressHydrationWarning>
        <div className="home-bg-wrap" aria-hidden="true">
          <div className="home-bg-overlay" />
        </div>
        <section className="home-card" aria-label="Meeting app entry">
          <p className={`home-kicker ${oxygen.className}`} style={{ fontWeight: 700 }}>
            Zero Lag. Full Attention
          </p>
          <h1 className="home-brand-title meetigate-font">Meetigate</h1>
          <p className={`home-copy ${nunito.className}`} style={{ fontWeight: 400 }}>
            We help teachers and students stay connected and learn without interruption.
          </p>
          <div className="home-actions">
            <Link className="primary-action home-continue" href="/landing">
              Continue
            </Link>
          </div>
        </section>
      </main>
      <Script
        id="remove-home-canvases"
        dangerouslySetInnerHTML={{
          __html:
            'document.querySelectorAll(".home-shell canvas.p5Canvas, .home-shell #defaultCanvas0").forEach(function(canvas){canvas.remove();});'
        }}
      />
    </>
  );
}
