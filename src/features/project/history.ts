import type { StriplyProject } from "./model";
export interface HistoryState { present: StriplyProject; past: StriplyProject[]; future: StriplyProject[]; group: string | null }
export const HISTORY_LIMIT = 40;
export function commitHistory(state: HistoryState, project: StriplyProject, group: string | null = null): HistoryState {
 if (JSON.stringify(state.present) === JSON.stringify(project)) return state;
 const coalesce = group !== null && state.group === group;
 return { present: { ...project, updatedAt: new Date().toISOString() }, past: coalesce ? state.past : [...state.past, state.present].slice(-HISTORY_LIMIT), future: [], group };
}
export function undoHistory(state: HistoryState): HistoryState {
 const previous = state.past.at(-1); if (!previous) return state;
 return { present: previous, past: state.past.slice(0, -1), future: [state.present, ...state.future].slice(0, HISTORY_LIMIT), group: null };
}
export function redoHistory(state: HistoryState): HistoryState {
 const next = state.future[0]; if (!next) return state;
 return { present: next, past: [...state.past, state.present].slice(-HISTORY_LIMIT), future: state.future.slice(1), group: null };
}
