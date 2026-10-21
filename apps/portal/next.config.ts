import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@zj/api-client", "@zj/contracts"],
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};
export default config;
