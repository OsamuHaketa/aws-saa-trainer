import type { MetadataRoute } from "next";

/** PWA のマニフェスト。Android の Chrome で「ホーム画面に追加」すると、単独のアプリとして開く */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AWS Decision Trainer",
    short_name: "SAA Trainer",
    description: "AWS SAA の設計判断を 4 択で高速に回す学習ツール",
    start_url: "/study",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f7f5",
    theme_color: "#ffffff",
    lang: "ja",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
