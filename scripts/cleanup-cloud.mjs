import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key)
  throw new Error("Configure local server credentials before cleanup.");
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const result = await db.rpc("expire_cloud_resources");
if (result.error) throw new Error("Cloud expiry cleanup failed.");
for (let batch = 0; batch < 100; batch++) {
  const { data, error } = await db
    .from("storage_cleanup")
    .select("id,object_path")
    .limit(100);
  if (error) throw new Error("Cleanup queue unavailable.");
  if (!data?.length) break;
  const removed = await db.storage
    .from("striply-private")
    .remove(data.map((item) => item.object_path));
  if (removed.error)
    throw new Error("Storage cleanup failed; queued paths retained for retry.");
  const deleted = await db
    .from("storage_cleanup")
    .delete()
    .in(
      "id",
      data.map((item) => item.id),
    );
  if (deleted.error)
    throw new Error("Queue acknowledgement failed; safe to retry.");
  console.log(`Removed ${data.length} unused objects.`);
}
