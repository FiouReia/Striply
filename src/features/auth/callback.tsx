"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "./client";
export function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    async function finish() {
      const client = getBrowserClient();
      if (!client) throw new Error();
      // The SDK exchanges PKCE codes during initialization; never exchange a code twice.
      const { data, error } = await client.auth.getSession();
      if (error || !data.session) throw new Error();
      history.replaceState({}, "", "/auth/callback");
      const destination =
        sessionStorage.getItem("striply-auth-return") === "/"
          ? "/"
          : "/account";
      sessionStorage.removeItem("striply-auth-return");
      if (alive) router.replace(destination);
    }
    void finish().catch(() => {
      if (alive)
        setError(
          "The sign-in link could not be completed. It may have expired, or was opened in another browser. Request a new link.",
        );
    });
    return () => {
      alive = false;
    };
  }, [router]);
  return (
    <section className="account-card">
      <h1>Signing you in</h1>
      <p role={error ? "alert" : "status"}>
        {error || "Finishing your sign-in..."}
      </p>
      {error && <Link href="/sign-in">Try again</Link>}
    </section>
  );
}
