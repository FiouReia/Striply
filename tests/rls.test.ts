import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const a = "10000000-0000-4000-8000-000000000001",
  b = "10000000-0000-4000-8000-000000000002",
  p = "20000000-0000-4000-8000-000000000001",
  asset = "30000000-0000-4000-8000-000000000001",
  event = "40000000-0000-4000-8000-000000000001";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;
 insert into auth.users values('${a}'),('${b}');`);
  await db.exec(
    await readFile("supabase/migrations/202610050001_cloud.sql", "utf8"),
  );
  await db.exec(
    await readFile("supabase/migrations/202610050002_cleanup.sql", "utf8"),
  );
  await db.exec(
    await readFile("supabase/migrations/202610050003_rpc_results.sql", "utf8"),
  );
  await db.exec(
    `insert into public.projects(id,owner_id,name,document) values('${p}','${a}','Private strip','{"version":2}');insert into public.events(id,owner_id,name)values('${event}','${a}','Private event');insert into public.project_assets(id,owner_id,project_id,asset_type,object_path,mime_type,bytes,width,height)values('${asset}','${a}','${p}','export','users/${a}/projects/${p}/export/test.png','image/png',100,100,100);insert into storage.objects(bucket_id,name)values('striply-private','users/${a}/projects/${p}/export/test.png');`,
  );
}, 120000);
afterAll(async () => {
  await db?.close();
});
async function asUser(user: string, sql: string) {
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${user}';`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role;reset request.jwt.claim.sub;");
  }
}
describe("actual PostgreSQL cloud access control", () => {
  it("enables RLS on every exposed user and capability table", async () => {
    const result = await db.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname,relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r'",
    );
    expect(result.rows.length).toBe(9);
    expect(result.rows.every((r) => r.relrowsecurity)).toBe(true);
  });
  it("owner can read a project and another user cannot guess its ID", async () => {
    expect(
      (await asUser(a, `select * from public.projects where id='${p}'`)).rows,
    ).toHaveLength(1);
    expect(
      (await asUser(b, `select * from public.projects where id='${p}'`)).rows,
    ).toHaveLength(0);
  });
  it("private bucket guards override unrelated permissive storage policies", async () => {
    await db.exec(
      "create policy unrelated_loose_storage on storage.objects for all to authenticated using(true) with check(true)",
    );
    expect(
      (
        await asUser(
          b,
          "select * from storage.objects where bucket_id='striply-private'",
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      asUser(
        b,
        "insert into storage.objects(bucket_id,name)values('striply-private','bypass.png')",
      ),
    ).rejects.toThrow();
  });
  it("storage originals and exports stay owner scoped", async () => {
    expect(
      (await asUser(a, "select * from storage.objects")).rows,
    ).toHaveLength(1);
    expect(
      (await asUser(b, "select * from storage.objects")).rows,
    ).toHaveLength(0);
    await expect(
      asUser(
        a,
        "insert into storage.objects(bucket_id,name)values('striply-private','unchecked.png')",
      ),
    ).rejects.toThrow();
  });
  it("guests cannot read capability tables or reserve uploads", async () => {
    await db.exec("set role anon");
    try {
      await expect(db.query("select * from public.shares")).rejects.toThrow();
      await expect(
        db.query("select public.reserve_upload('fake')"),
      ).rejects.toThrow();
    } finally {
      await db.exec("reset role");
    }
  });
  it("profile ownership is enforced for insert/update", async () => {
    await asUser(
      a,
      `insert into public.profiles(id,display_name)values('${a}','Host')`,
    );
    await expect(
      asUser(
        b,
        `insert into public.profiles(id,display_name)values('${a}','Intruder')`,
      ),
    ).rejects.toThrow();
    expect(
      (await asUser(b, "select * from public.profiles")).rows,
    ).toHaveLength(0);
  });
  it("rejects a cross-owner asset reference even for server writes", async () => {
    await expect(
      db.exec(
        `insert into public.project_assets(owner_id,project_id,asset_type,object_path,mime_type,bytes,width,height)values('${b}','${p}','original','wrong-owner','image/png',10,10,10)`,
      ),
    ).rejects.toThrow();
  });
  it("atomic revisions reject stale writes and unauthorized owners", async () => {
    const args = `'${p}','Updated','{"version":2}','{}','{}',1,null`;
    const result = await asUser(
      a,
      `select (public.save_project(${args})->>'revision')::integer as revision`,
    );
    expect(result.rows[0]).toEqual({ revision: 2 });
    await expect(
      asUser(a, `select public.save_project(${args})`),
    ).rejects.toThrow(/revision conflict/);
    await expect(
      asUser(
        b,
        `select public.save_project('${p}','Intruder','{}','{}','{}',2,null)`,
      ),
    ).rejects.toThrow(/unavailable/);
  });
  it("upload reservation count is bounded and expiry is enforced", async () => {
    await db.exec(
      `insert into public.upload_sessions(owner_id,project_id,token_hash,max_count)values('${a}','${p}','session-token',1)`,
    );
    await db.exec("set role service_role");
    try {
      await db.query("select public.reserve_upload('session-token')");
      await expect(
        db.query("select public.reserve_upload('session-token')"),
      ).rejects.toThrow(/unavailable/);
    } finally {
      await db.exec("reset role");
    }
    await db.exec(
      `insert into public.upload_sessions(owner_id,project_id,token_hash,expires_at)values('${a}','${p}','expired-token',now()-interval '1 second')`,
    );
    await expect(
      db.query("select public.reserve_upload('expired-token')"),
    ).rejects.toThrow(/unavailable/);
  });
  it("database rate limiter works across calls", async () => {
    expect(
      (await db.query("select public.check_rate('test-limit',1,60) as allowed"))
        .rows[0],
    ).toEqual({ allowed: true });
    expect(
      (await db.query("select public.check_rate('test-limit',1,60) as allowed"))
        .rows[0],
    ).toEqual({ allowed: false });
  });
  it("deletion queues storage before cascading metadata and keeps other projects", async () => {
    await db.exec(`delete from public.projects where id='${p}'`);
    expect(
      (await db.query("select * from public.project_assets")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from public.storage_cleanup")).rows,
    ).toHaveLength(1);
    expect((await db.query("select * from public.events")).rows).toHaveLength(
      1,
    );
  });
});
