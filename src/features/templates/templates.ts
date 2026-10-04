export interface StripSettings { background: string; foreground: string; spacing: number; radius: number; border: boolean; title: string; date: string; footer: string; showFooter: boolean }
export interface StripTemplate { id: string; name: string; note: string; settings: StripSettings }
const base: StripSettings = { background: "#fffdf8", foreground: "#292820", spacing: 18, radius: 0, border: false, title: "The good old days", date: "", footer: "a little moment, forever", showFooter: true };
export const templates: StripTemplate[] = [
 { id: "classic", name: "Classic White", note: "Timeless, just like you", settings: { ...base } },
 { id: "black", name: "Minimal Black", note: "A little after hours", settings: { ...base, background: "#222323", foreground: "#fffdf8", spacing: 16 } },
 { id: "pastel", name: "Soft Pastel", note: "Something sweet", settings: { ...base, background: "#f4dde8", foreground: "#643548", radius: 14, spacing: 22 } },
 { id: "film", name: "Film", note: "Made of memories", settings: { ...base, background: "#e9dbbb", foreground: "#493d28", border: true, spacing: 26, title: "MEMORY NO. 004" } },
 { id: "event", name: "Clean Event", note: "For your favorite people", settings: { ...base, background: "#e5eddf", foreground: "#324b32", radius: 10, title: "Together is better" } },
];
