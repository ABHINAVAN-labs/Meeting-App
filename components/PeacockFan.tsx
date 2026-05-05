"use client";

import { memo, useEffect } from "react";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";

type PeacockFanProps = {
  phase: "hidden" | "cover" | "retract";
};

const feathers = [-72, -54, -36, -18, 0, 18, 36, 54, 72];

const fanClusters = [
  {
    id: "bottom",
    left: "50%",
    bottom: "-8vh",
    rotate: 0,
    hiddenX: "-50%",
    hiddenY: 240,
    coverX: "-50%",
    coverY: 0,
    retractY: 280,
    origin: "50% 100%",
    scale: [0.75, 1.7, 4.2]
  },
  {
    id: "top-left",
    left: "-5vw",
    top: "-9vh",
    rotate: 135,
    hiddenX: -260,
    hiddenY: -260,
    coverX: 0,
    coverY: 0,
    retractX: -300,
    retractY: -300,
    origin: "50% 100%",
    scale: [0.65, 1.55, 3.7]
  },
  {
    id: "top-right",
    right: "-5vw",
    top: "-9vh",
    rotate: -135,
    hiddenX: 260,
    hiddenY: -260,
    coverX: 0,
    coverY: 0,
    retractX: 300,
    retractY: -300,
    origin: "50% 100%",
    scale: [0.65, 1.55, 3.7]
  }
];

const featherVariants: Variants = {
  hidden: (angle: number) => ({
    rotate: angle,
    scale: 0.25,
    opacity: 0,
    y: 220
  }),
  cover: (angle: number) => ({
    rotate: angle,
    scale: 1,
    opacity: 1,
    y: 0,
    transition: {
      delay: Math.abs(angle) * 0.01,
      duration: 0.6,
      ease: "easeInOut"
    }
  }),
  retract: (angle: number) => ({
    rotate: angle,
    scale: 0.25,
    opacity: 0,
    y: 220,
    transition: {
      duration: 0.55,
      ease: "easeInOut"
    }
  })
};

function FeatherSVG() {
  return (
    <svg width="150" height="315" viewBox="0 0 120 250" aria-hidden="true">
      <path d="M60 240 L60 80" stroke="#2F5D50" strokeWidth="3" />
      <path
        d="M60 80 C20 120,20 200,60 240 C100 200,100 120,60 80 Z"
        fill="#3A7D6D"
        stroke="#1F3D36"
        strokeWidth="2"
      />
      <path
        d="M60 100 C35 130,35 200,60 220 C85 200,85 130,60 100 Z"
        fill="#F4C542"
        stroke="#1F3D36"
        strokeWidth="1.5"
      />
      <circle cx="60" cy="150" r="12" fill="#1F3D36" />
      <circle cx="60" cy="150" r="8" fill="#2E8B7D" />
      <circle cx="60" cy="150" r="4" fill="#F4C542" />
      <circle cx="60" cy="150" r="2" fill="#8B1E2D" />
    </svg>
  );
}

function PeacockFan({ phase }: PeacockFanProps) {
  useEffect(() => {
    if (phase === "hidden") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [phase]);

  return (
    <div
      className="fixed inset-0 flex items-end justify-center pointer-events-none z-[999]"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999,
        pointerEvents: "none",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        transformOrigin: "50% 100%",
        willChange: "transform"
      }}
      aria-hidden="true"
    >
      {fanClusters.map((cluster) => (
        <motion.div
          key={cluster.id}
          initial="hidden"
          animate={phase}
          variants={{
            hidden: {
              x: cluster.hiddenX,
              y: cluster.hiddenY,
              scale: 0.45,
              rotate: cluster.rotate,
              opacity: 0
            },
            cover: {
              x: cluster.coverX,
              y: cluster.coverY,
              scale: cluster.scale,
              rotate: cluster.rotate,
              opacity: 1,
              transition: {
                duration: 1.2,
                ease: "easeInOut"
              }
            },
            retract: {
              x: cluster.retractX ?? cluster.hiddenX,
              y: cluster.retractY,
              scale: 0.35,
              rotate: cluster.rotate,
              opacity: 0,
              transition: {
                duration: 1.2,
                ease: "easeInOut"
              }
            }
          }}
          style={{
            position: "absolute",
            top: cluster.top,
            right: cluster.right,
            bottom: cluster.bottom,
            left: cluster.left,
            width: 150,
            height: 315,
            transformOrigin: cluster.origin,
            willChange: "transform, opacity"
          }}
        >
          {feathers.map((angle) => (
            <motion.div
              key={angle}
              custom={angle}
              variants={featherVariants}
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                transformOrigin: "50% 100%",
                willChange: "transform, opacity"
              }}
            >
              <FeatherSVG />
            </motion.div>
          ))}
        </motion.div>
      ))}
    </div>
  );
}

export default memo(PeacockFan);
