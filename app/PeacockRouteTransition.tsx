"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PeacockFan from "../components/PeacockFan";

const COVER_DURATION_MS = 1200;
const RETRACT_DURATION_MS = COVER_DURATION_MS;

type PeacockNavigateEvent = CustomEvent<{
  href: string;
}>;

export const PEACOCK_NAVIGATE_EVENT = "peacock:navigate";

export default function PeacockRouteTransition() {
  const router = useRouter();
  const [phase, setPhase] = useState<"hidden" | "cover" | "retract">("hidden");
  const timeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const isAnimatingRef = useRef(false);

  useEffect(() => {
    function clearTimers() {
      timeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
      timeoutsRef.current = [];
    }

    function handleNavigate(event: Event) {
      const { href } = (event as PeacockNavigateEvent).detail;

      if (isAnimatingRef.current) {
        return;
      }

      isAnimatingRef.current = true;
      setPhase("cover");

      timeoutsRef.current.push(
        setTimeout(() => {
          router.push(href);
          setPhase("retract");
        }, COVER_DURATION_MS)
      );

      timeoutsRef.current.push(
        setTimeout(() => {
          setPhase("hidden");
          isAnimatingRef.current = false;
        }, COVER_DURATION_MS + RETRACT_DURATION_MS)
      );
    }

    window.addEventListener(PEACOCK_NAVIGATE_EVENT, handleNavigate);

    return () => {
      window.removeEventListener(PEACOCK_NAVIGATE_EVENT, handleNavigate);
      clearTimers();
    };
  }, [router]);

  return <PeacockFan phase={phase} />;
}
