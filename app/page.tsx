import Link from "next/link";
import type { CSSProperties } from "react";

const BORDER_SEGMENTS = Array.from({ length: 88 }, (_, index) => index);
const BORDER_ANGLE_PAIRS = [
  [-8, 5],
  [-3, 9],
  [6, -7],
  [-10, 2],
  [4, -5],
  [-6, 8],
  [9, -2],
  [-4, 6]
];

export default function Home() {
  return (
    <main className="home-shell">
      <div className="animated-line-border" aria-hidden="true">
        {BORDER_SEGMENTS.map((segment) => (
          <span
            key={segment}
            style={
              {
                "--segment-index": segment,
                "--segment-position": segment % 22,
                "--angle-a": `${BORDER_ANGLE_PAIRS[segment % BORDER_ANGLE_PAIRS.length][0]}deg`,
                "--angle-b": `${BORDER_ANGLE_PAIRS[segment % BORDER_ANGLE_PAIRS.length][1]}deg`
              } as CSSProperties
            }
          />
        ))}
      </div>
      <section className="home-card glass-panel" aria-label="Meeting app entry">
        <h1 className="meetigate-font">Meetigate</h1>
        <Link className="primary-action home-continue" href="/landing">
          Continue
        </Link>
      </section>
    </main>
  );
}
