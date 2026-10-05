import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CloudError } from "@/features/cloud/types";
export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new CloudError(
      "Cloud features are not configured on this installation.",
      503,
    );
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
export async function authenticatedClient(
  request: Request,
): Promise<{ db: SupabaseClient; owner: string }> {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new CloudError("Sign in to continue.", 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new CloudError("Cloud features are not configured.", 503);
  const db = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user)
    throw new CloudError("Your session has expired. Sign in again.", 401);
  const name = String(
    data.user.user_metadata?.full_name ??
      data.user.email?.split("@")[0] ??
      "Striply creator",
  ).slice(0, 80);
  await db
    .from("profiles")
    .upsert(
      { id: data.user.id, display_name: name },
      { onConflict: "id", ignoreDuplicates: true },
    );
  return { db, owner: data.user.id };
}
export function checked<T>(result: {
  data: T;
  error: { code?: string; message: string } | null;
}): NonNullable<T> {
  if (result.error)
    throw new CloudError(
      result.error.code === "40001"
        ? "This project changed on another device. Choose which version to keep."
        : "Cloud operation failed. Please retry.",
      result.error.code === "40001" ? 409 : 500,
    );
  return result.data as NonNullable<T>;
}
export async function owned(db: SupabaseClient, table: string, id: string) {
  const result = await db.from(table).select("*").eq("id", id).maybeSingle();
  const item = checked(result);
  if (!item) throw new CloudError("This resource is unavailable.", 404);
  return item;
}
export async function cleanupStorage(admin = adminClient()) {
  const { data } = await admin
    .from("storage_cleanup")
    .select("id,object_path")
    .limit(100);
  if (!data?.length) return;
  const result = await admin.storage
    .from("striply-private")
    .remove(data.map((item) => item.object_path));
  if (!result.error)
    await admin
      .from("storage_cleanup")
      .delete()
      .in(
        "id",
        data.map((item) => item.id),
      );
}
export async function rateLimit(
  request: Request,
  scope: string,
  limit: number,
  seconds = 60,
) {
  const admin = adminClient();
  const ip =
    process.env.TRUST_PROXY === "true"
      ? (request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
        "unknown")
      : "global";
  const { createHash } = await import("node:crypto");
  const key = createHash("sha256").update(`${scope}:${ip}`).digest("hex");
  const result = await admin.rpc("check_rate", {
    p_key: key,
    p_limit: limit,
    p_seconds: seconds,
  });
  if (!checked(result))
    throw new CloudError(
      "Too many requests. Please wait a minute and retry.",
      429,
    );
}
export function noStore(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function safeFailure(error: unknown) {
  return noStore(
    {
      error:
        error instanceof CloudError
          ? error.message
          : "This request could not be completed. Please try again.",
    },
    error instanceof CloudError ? error.status : 500,
  );
}
