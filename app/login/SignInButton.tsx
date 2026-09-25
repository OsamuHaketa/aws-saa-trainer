"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";

export function SignInButton() {
  const [pending, setPending] = useState(false);
  return (
    <button
      className="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signIn.social({ provider: "google", callbackURL: "/", errorCallbackURL: "/login" });
      }}
    >
      {pending ? "Google に移動しています…" : "Google でログイン"}
    </button>
  );
}
