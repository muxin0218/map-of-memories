import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingExcludes: {
    "/*": ["data/*.private.json"],
  },
  devIndicators: false,
};

export default nextConfig;
