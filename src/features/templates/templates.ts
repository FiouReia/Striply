export interface StripSettings { background: string; foreground: string; spacing: number; radius: number; border: boolean; title: string; date: string; footer: string; showFooter: boolean; font?: "serif" | "sans" | "mono" | "script" }
export interface StripTemplate { id: string; name: string; note: string; settings: StripSettings; category?: string; stickerPresets?: string[] }
const base: StripSettings = { background: "#fffdf8", foreground: "#292820", spacing: 18, radius: 0, border: false, title: "The good old days", date: "", footer: "a little moment, forever", showFooter: true };
export const templates: StripTemplate[] = [
 { id: "classic", name: "Classic White", category: "Minimal", note: "Timeless, just like you", settings: { ...base } },
 { id: "black", name: "Minimal Black", category: "Dark", note: "A little after hours", settings: { ...base, background: "#222323", foreground: "#fffdf8", spacing: 16 } },
 { id: "pastel", name: "Soft Pastel", category: "Pastel", note: "Something sweet", settings: { ...base, background: "#f4dde8", foreground: "#643548", radius: 14, spacing: 22 } },
 { id: "film", name: "Film", category: "Film", note: "Made of memories", settings: { ...base, background: "#e9dbbb", foreground: "#493d28", border: true, spacing: 26, title: "MEMORY NO. 004" } },
 { id: "event", name: "Clean Event", category: "Minimal", note: "For your favorite people", settings: { ...base, background: "#e5eddf", foreground: "#324b32", radius: 10, title: "Together is better" } },
 { id: "wedding", name: "Wedding Bloom", category: "Wedding", note: "For your forever people", stickerPresets: ["flower"], settings: { ...base, background: "#f4ece2", foreground: "#6c574d", title: "Our forever day", font: "script" } },
 { id: "birthday", name: "Birthday Wish", category: "Birthday", note: "Another wonderful year", settings: { ...base, background: "#f5e4bd", foreground: "#664930", title: "Make a wish", radius: 18, font: "sans" } },
 { id: "graduation", name: "New Chapter", category: "Graduation", note: "The best is ahead", settings: { ...base, background: "#e0e8f0", foreground: "#293e59", title: "Here's to what's next", font: "serif" } },
 { id: "retro", name: "Retro Summer", category: "Retro", note: "A sunny little time capsule", settings: { ...base, background: "#e8c69c", foreground: "#6a4230", title: "GOOD TIMES", font: "mono", border: true } },
];
