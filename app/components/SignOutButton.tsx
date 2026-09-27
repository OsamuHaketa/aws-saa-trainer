"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="link-button sign-out"
      aria-label="ログアウト"
      title="ログアウト"
      onClick={async () => {
        await authClient.signOut();
        router.replace("/login");
      }}
    >
      <span className="wide-only">ログアウト</span>
      {/* スマホではヘッダーを 1 段に収めるため、アイコンだけにする */}
      <svg
        className="narrow-only"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="M16 17l5-5-5-5" />
        <path d="M21 12H9" />
      </svg>
    </button>
  );
}
