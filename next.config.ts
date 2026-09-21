import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce the self-contained server bundle used by the production image.
  output: "standalone",
};

export default nextConfig;
