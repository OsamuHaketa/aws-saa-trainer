import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ネイティブモジュールなのでバンドルしない
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
