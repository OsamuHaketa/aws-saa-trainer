import { redirect } from "next/navigation";
import { authenticate } from "@/lib/auth/session";
import { SignInButton } from "./SignInButton";
import styles from "./login.module.css";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if ((await authenticate()).ok) redirect("/");
  const { error } = await searchParams;

  return (
    <div className={`card ${styles.box}`}>
      <h1>ログイン</h1>
      <p className="muted">学習の記録は、ログインしたアカウントごとに保存されます。PC とスマホで同じアカウントを使うと、記録が共通になります。</p>
      {error && (
        <p className={styles.error} role="alert">
          {error === "not_allowed"
            ? "このアカウントでは利用できません。許可されたアカウントでログインしてください。"
            : "ログインできませんでした。もう一度お試しください。"}
        </p>
      )}
      <SignInButton />
    </div>
  );
}
