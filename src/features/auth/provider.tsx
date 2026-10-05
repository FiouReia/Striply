"use client";
import { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getBrowserClient } from "./client";
interface AuthState {
  session: Session | null;
  loading: boolean;
  configured: boolean;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  configured: false,
  signOut: async () => {},
});
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true);
  const client = getBrowserClient();
  useEffect(() => {
    let alive = true;
    if (!client) {
      void Promise.resolve().then(() => {
        if (alive) setLoading(false);
      });
      return () => {
        alive = false;
      };
    }
    void client.auth
      .getSession()
      .then(({ data }) => {
        if (alive) {
          setSession(data.session);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    const { data } = client.auth.onAuthStateChange((_event, current) => {
      if (alive) {
        setSession(current);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [client]);
  return (
    <AuthContext
      value={{
        session,
        loading,
        configured: !!client,
        signOut: async () => {
          const result = await client?.auth.signOut();
          if (result?.error)
            throw new Error("Could not sign out. Reconnect and retry.");
          setSession(null);
        },
      }}
    >
      {children}
    </AuthContext>
  );
}
export function useAuth() {
  return useContext(AuthContext);
}
