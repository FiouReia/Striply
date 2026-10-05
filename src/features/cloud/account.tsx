"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../auth/provider";
import { cloudRequest } from "./api";
import type { CloudProject, EventRecord } from "./types";
import { templates } from "../templates/templates";
import { layouts } from "../collage/layout";
import { ManageShares } from "./manage-shares";
import { duplicateProject } from "./duplicate";
function ProjectCard({
  project,
  onRefresh,
  onError,
}: {
  project: CloudProject;
  onRefresh: () => void;
  onError: (message: string) => void;
}) {
  const [thumbnail, setThumbnail] = useState("");
  useEffect(() => {
    let alive = true;
    if (project.thumbnail_asset_id)
      void cloudRequest<{ url: string }>(
        `assets/${project.thumbnail_asset_id}`,
      ).then((data) => {
        if (alive) setThumbnail(data.url);
      });
    return () => {
      alive = false;
    };
  }, [project.thumbnail_asset_id]);
  async function action(kind: string) {
    try {
      if (kind === "delete") {
        if (
          !confirm(
            "Delete this cloud project and its shares? Your current local editor is kept.",
          )
        )
          return;
        await cloudRequest(`projects/${project.id}`, { method: "DELETE" });
      } else if (kind === "rename") {
        const name = prompt("Project name", project.name);
        if (!name) return;
        await cloudRequest(`projects/${project.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name, revision: project.revision }),
        });
      } else await duplicateProject(project);
      onRefresh();
    } catch (failure) {
      onError(
        failure instanceof Error
          ? failure.message
          : "Could not update project.",
      );
    }
  }
  return (
    <article className="project-card">
      {thumbnail ? (
        <img src={thumbnail} alt={project.name} />
      ) : (
        <div className="project-placeholder">Your photo strip</div>
      )}
      <h2>{project.name}</h2>
      <p>{new Date(project.updated_at).toLocaleDateString()} · Cloud</p>
      <div className="card-actions">
        <Link className="primary" href={`/?cloud=${project.id}`}>
          Open
        </Link>
        <button className="secondary" onClick={() => void action("rename")}>
          Rename
        </button>
        <button className="secondary" onClick={() => void action("duplicate")}>
          Duplicate
        </button>
        <button className="text-button" onClick={() => void action("delete")}>
          Delete
        </button>
      </div>
    </article>
  );
}
export function AccountPage({ events = false }: { events?: boolean }) {
  const auth = useAuth(),
    [projects, setProjects] = useState<CloudProject[]>([]),
    [eventRows, setEvents] = useState<EventRecord[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [profile, setProfile] = useState(""),
    [loadedOwner, setLoadedOwner] = useState(""),
    [username, setUsername] = useState(""),
    [avatar, setAvatar] = useState("");
  const refresh = useCallback(async () => {
    if (!auth.session) return;
    setLoading(true);
    try {
      if (events) setEvents(await cloudRequest<EventRecord[]>("events"));
      else setProjects(await cloudRequest<CloudProject[]>("projects"));
      const data = await cloudRequest<{
        display_name: string;
        username: string | null;
        avatar_url: string | null;
      } | null>("profile");
      setProfile(data?.display_name ?? "");
      setUsername(data?.username ?? "");
      setAvatar(data?.avatar_url ?? "");
      setLoadedOwner(auth.session.user.id);
      setError("");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not load your account.",
      );
    } finally {
      setLoading(false);
    }
  }, [auth.session, events]);
  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);
  if (auth.loading)
    return (
      <main className="account-page">
        <p role="status">Restoring your session...</p>
      </main>
    );
  if (!auth.session)
    return (
      <main className="account-page">
        <h1>{events ? "My Events" : "My Projects"}</h1>
        <p>Sign in to view your private cloud collection.</p>
        <Link className="primary" href="/sign-in">
          Sign in
        </Link>
        <Link className="secondary" href="/">
          Keep creating
        </Link>
      </main>
    );
  if (loadedOwner !== auth.session.user.id)
    return (
      <main className="account-page">
        <p role="status">Loading your private collection...</p>
        {error && (
          <>
            <p role="alert">{error}</p>
            <button className="secondary" onClick={() => void refresh()}>
              Retry
            </button>
          </>
        )}
        <Link href="/">Keep creating</Link>
      </main>
    );
  return (
    <main className="account-page">
      <nav className="account-nav">
        <Link href="/">Create a strip</Link>
        <Link href="/account">My Projects</Link>
        <Link href="/events">My Events</Link>
        <button
          onClick={() => void auth.signOut().catch((f) => setError(f.message))}
        >
          Sign out
        </button>
      </nav>
      <h1>{events ? "My Events" : "My Projects"}</h1>
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Loading your collection...</p>}
      {events ? (
        <>
          <EventForm onSaved={() => void refresh()} />
          <div className="gallery-grid">
            {eventRows.map((event) => (
              <article className="project-card" key={event.id}>
                <div
                  className="event-preview"
                  style={{
                    background: event.background,
                    color: event.foreground,
                  }}
                >
                  {templates.find((t) => t.id === event.template_id)?.name}
                </div>
                <h2>{event.name}</h2>
                <p>
                  {event.event_date || "Date to come"} ·{" "}
                  {event.session_count ?? 0} sessions
                </p>
                <Link className="primary" href={`/?event=${event.id}`}>
                  Start Booth Session
                </Link>
                <details>
                  <summary>Edit Event & Gallery</summary>
                  <EventForm event={event} onSaved={() => void refresh()} />
                </details>
              </article>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="gallery-grid">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onRefresh={() => void refresh()}
                onError={setError}
              />
            ))}
          </div>
          {!loading && !projects.length && (
            <p>
              No cloud projects yet. Create a strip, then choose Save to Cloud.
            </p>
          )}
        </>
      )}
      {!events && <ManageShares key={auth.session.user.id} />}
      <details className="profile-settings">
        <summary>Your profile</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void cloudRequest("profile", {
              method: "PUT",
              body: JSON.stringify({
                display_name: profile,
                username,
                avatar_url: avatar,
              }),
            })
              .then(() => setError(""))
              .catch((f) => setError(f.message));
          }}
        >
          <label>
            Display name
            <input
              maxLength={80}
              required
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
            />
          </label>
          <label>
            Username (optional)
            <input
              maxLength={30}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label>
            Avatar URL (optional, HTTPS)
            <input
              type="url"
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
            />
          </label>
          <button className="secondary">Save profile</button>
        </form>
      </details>
    </main>
  );
}
function EventForm({
  event,
  onSaved,
}: {
  event?: EventRecord;
  onSaved: () => void;
}) {
  const [name, setName] = useState(event?.name ?? ""),
    [date, setDate] = useState(event?.event_date ?? ""),
    [theme, setTheme] = useState(event?.template_id ?? "classic"),
    [layout, setLayout] = useState(event?.layout_id ?? "classic"),
    [background, setBackground] = useState(event?.background ?? "#ffffff"),
    [foreground, setForeground] = useState(event?.foreground ?? "#292c27"),
    [gallery, setGallery] = useState(event?.gallery_visibility ?? "private"),
    [customize, setCustomize] = useState(event?.allow_customization ?? true),
    [logo, setLogo] = useState<File | null>(null),
    [galleryUrl, setGalleryUrl] = useState(event?.gallery_url ?? ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [autoDelivery, setAutoDelivery] = useState(event?.auto_delivery ?? false),
    [shareVisibility, setShareVisibility] = useState(
      event?.share_visibility ?? "private",
    );
  async function save() {
    setBusy(true);
    setError("");
    try {
      const body = {
        name,
        event_date: date,
        template_id: theme,
        layout_id: layout,
        background,
        foreground,
        gallery_visibility: gallery,
        allow_customization: customize,
        auto_delivery: autoDelivery,
        share_visibility: shareVisibility,
        share_days: 7,
        logo_asset_id: event?.logo_asset_id ?? null,
      };
      let row = await cloudRequest<EventRecord & { gallery_url: string }>(
        event ? `events/${event.id}` : "events",
        { method: event ? "PUT" : "POST", body: JSON.stringify(body) },
      );
      if (logo) {
        const { uploadAsset } = await import("./api"),
          asset = await uploadAsset(logo, null, "logo", undefined, row.id);
        row = await cloudRequest(`events/${row.id}`, {
          method: "PUT",
          body: JSON.stringify({ ...body, logo_asset_id: asset.id }),
        });
      }
      setGalleryUrl(gallery !== "private" ? row.gallery_url : "");
      onSaved();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not save event.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="event-form">
      <h2>{event ? "Event settings" : "Create an event"}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label>
          Event name
          <input
            required
            maxLength={45}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Event date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          Default theme
          <select
            aria-label="Default theme"
            value={theme}
            onChange={(e) => {
              setTheme(e.target.value);
              const settings = templates.find(
                (t) => t.id === e.target.value,
              )!.settings;
              setBackground(settings.background);
              setForeground(settings.foreground);
            }}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Default layout
          <select
            aria-label="Default layout"
            value={layout}
            onChange={(e) => setLayout(e.target.value)}
          >
            {layouts.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Background
          <input
            type="color"
            value={background}
            onChange={(e) => setBackground(e.target.value)}
          />
        </label>
        <label>
          Text color
          <input
            type="color"
            value={foreground}
            onChange={(e) => setForeground(e.target.value)}
          />
        </label>
        <label>
          Event logo
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="check-field">
          Allow manual customization
          <input
            type="checkbox"
            checked={customize}
            onChange={(e) => setCustomize(e.target.checked)}
          />
        </label>
        <label>
          Guest gallery
          <select
            aria-label="Guest gallery"
            value={gallery}
            onChange={(e) => setGallery(e.target.value as typeof gallery)}
          >
            <option value="private">Private (default)</option>
            <option value="link">Link Only</option>
            <option value="public">Public via gallery link</option>
          </select>
        </label>
        <label>
          Event strip sharing
          <select
            aria-label="Event strip sharing"
            value={shareVisibility}
            onChange={(e) =>
              setShareVisibility(e.target.value as typeof shareVisibility)
            }
          >
            <option value="private">Private</option>
            <option value="link">Anyone with Link</option>
          </select>
        </label>
        <label className="check-field">
          Automatically create a download QR after captures
          <input
            type="checkbox"
            checked={autoDelivery}
            disabled={shareVisibility !== "link"}
            onChange={(e) => setAutoDelivery(e.target.checked)}
          />
        </label>
        <p>
          Only finished strips explicitly shared with a link appear in a
          gallery.
        </p>
        <button className="primary" disabled={busy}>
          {busy ? "Saving..." : event ? "Save Event" : "Create Event"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {galleryUrl && (
        <>
          <a href={galleryUrl} target="_blank" rel="noreferrer">
            Open Gallery
          </a>
          <p>
            Guests can view finished, active shares through this gallery link.
          </p>
        </>
      )}
      {event && (
        <button
          className="text-button"
          onClick={() => {
            if (
              confirm(
                "Delete this event, its session records and event shares? Cloud projects are kept.",
              )
            )
              void cloudRequest(`events/${event.id}`, { method: "DELETE" })
                .then(onSaved)
                .catch((f) => setError(f.message));
          }}
        >
          Delete Event
        </button>
      )}
    </section>
  );
}
