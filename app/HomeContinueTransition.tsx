"use client";

import { useState } from "react";
import { PEACOCK_NAVIGATE_EVENT } from "./PeacockRouteTransition";

export default function HomeContinueTransition() {
  const [active, setActive] = useState(false);

  function handleContinue() {
    if (active) {
      return;
    }

    setActive(true);
    window.dispatchEvent(
      new CustomEvent(PEACOCK_NAVIGATE_EVENT, {
        detail: { href: "/landing" }
      })
    );
  }

  return (
    <button
      className="primary-action home-continue"
      type="button"
      onClick={handleContinue}
      aria-busy={active}
      suppressHydrationWarning
    >
      Continue
    </button>
  );
}
