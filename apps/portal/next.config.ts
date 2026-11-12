import type { NextConfig } from "next";
const devOrigins = process.env.PORTAL_DEV_ALLOWED_ORIGINS?.split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const config: NextConfig = {
  transpilePackages: ["@zj/api-client", "@zj/contracts"],
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // 仅在局域网演示时显式放行开发资源，默认仍由 Next 拒绝跨源开发请求。
  allowedDevOrigins: devOrigins,
};
export default config;
