import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 本番のアプリが読むコンテンツ（npm run build-content で書き出す）を、すべてのルートの関数に含める
  outputFileTracingIncludes: { "/**": [".generated/content.json"] },
};

export default nextConfig;
