"use client";

import { motion } from "framer-motion";
import Image from "next/image";

export default function AuthIllustration() {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.55, ease: "easeOut", delay: 0.05 }}
      className="relative hidden items-center justify-center lg:flex"
    >
      <div className="absolute h-[360px] w-[360px] rounded-full bg-gradient-to-br from-cyan-200/65 via-teal-200/55 to-violet-200/60 blur-3xl" />
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 7.5, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        className="relative z-10"
      >
        <Image
          src="/lumina-girl-reading-cat.png"
          alt="Student reading with a cat"
          width={560}
          height={560}
          priority
          className="h-auto w-[min(92%,560px)]"
        />
      </motion.div>
    </motion.div>
  );
}

