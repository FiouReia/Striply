"use client";
import { useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "./client";
import { useAuth } from "./provider";
export function SignIn() {
  const auth = useAuth(),
    [email, setEmail] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function signIn(provider?: "google") {
    const client = getBrowserClient();
    if (!client) return;
    setBusy(true);
    setMessage("");
    try {
      const redirectTo = `${location.origin}/auth/callback`;
      const result = provider
        ? await client.auth.signInWithOAuth({
            provider,
            options: { redirectTo },
          })
        : await client.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: redirectTo },
          });
      if (result.error) throw result.error;
      if (!provider)
        setMessage(
          "Check your email for a sign-in link. Open it in this browser.",
        );
    } catch {
      setMessage(
        "Sign-in could not be started. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="account-card">
      <h1>Save your moments</h1>
      <p>
        Sign in for cloud projects and sharing. You can always create and export
        without an account.
      </p>
      {!auth.configured ? (
        <p role="status">
          Cloud features are not configured on this installation. The local
          editor is ready to use.
        </p>
      ) : auth.session ? (
        <p>
          You are signed in. <Link href="/account">Open My Projects</Link>
        </p>
      ) : (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void signIn();
            }}
          >
            <label>
              Email address
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <button className="primary" disabled={busy || auth.loading}>
              Email me a sign-in link
            </button>
          </form>
          <button
            className="secondary"
            disabled={busy || auth.loading}
            onClick={() => void signIn("google")}
          >
            Continue with Google
          </button>
        </>
      )}
      {message && <p role="status">{message}</p>}
      <Link className="text-button" href="/">
        Continue creating
      </Link>
    </section>
  );
}
