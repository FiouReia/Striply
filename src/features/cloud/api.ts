import { getBrowserClient } from "../auth/client";
import { CloudError } from "./types";
export async function cloudRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const client = getBrowserClient(),
    { data } = client
      ? await client.auth.getSession()
      : { data: { session: null } };
  if (!data.session)
    throw new CloudError("Sign in to use cloud features.", 401);
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${data.session.access_token}`);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(`/api/cloud/${path}`, {
      ...options,
      headers,
      cache: "no-store",
    });
  } catch (failure) {
    if (options.signal?.aborted) throw failure;
    throw new CloudError(
      "Connection lost. Your local work is kept; reconnect and retry.",
      503,
    );
  }
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new CloudError(
      result.error ?? "Cloud request failed. Try again.",
      response.status,
    );
  }
  return response.json();
}
export async function assetBlob(id: string, signal?: AbortSignal) {
  const { url } = await cloudRequest<{ url: string }>(`assets/${id}`);
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok)
    throw new CloudError("A cloud image could not be loaded. Retry.");
  return response.blob();
}
export async function uploadAsset(
  file: Blob,
  projectId: string | null,
  type: string,
  sourceId?: string,
  eventId?: string,
) {
  const data = new FormData();
  data.set("file", file, "photo");
  data.set("type", type);
  if (projectId) data.set("projectId", projectId);
  if (sourceId) data.set("sourceId", sourceId);
  if (eventId) data.set("eventId", eventId);
  return cloudRequest<import("./types").Asset>("assets", {
    method: "POST",
    body: data,
  });
}
