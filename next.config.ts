import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  middleware: [
    "src/middleware.ts",
  ],
};

export default nextConfig;
