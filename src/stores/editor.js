import { writable } from "svelte/store";
import { validate_files } from "../../shared/data.cjs";

const copy = (value) => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const storage_key = "codec-timeline-draft-v1";

export function create_editor(storage) {
  let state = {
    base: null, draft: null, json_text: null, revision: null, editing: false,
    past: [], future: [], dirty: false, saving: false,
    conflict: false, error: "", warning: storage ? "" : "Browser storage is unavailable. Keep this tab open until you save.", epoch: 0,
  };
  let latest;
  let config = {};
  try {
    const saved = JSON.parse(storage?.getItem(storage_key) || "null");
    if (saved?.base && saved?.draft && Array.isArray(saved.draft.media) && Array.isArray(saved.draft.events)) {
      state = { ...state, ...saved, editing: true, dirty: !!saved.json_text || !same(saved.base, saved.draft) };
    }
  } catch {
    state.warning = "Could not restore the browser draft.";
  }
  const store = writable(state);

  function publish(changes, persist = false) {
    state = { ...state, ...changes };
    state.dirty = !!state.json_text || (state.base !== null && !same(state.base, state.draft));
    if (persist) {
      try {
        if (state.dirty) storage?.setItem(storage_key, JSON.stringify({
          base: state.base, draft: state.draft, json_text: state.json_text, revision: state.revision,
          past: state.past, future: state.future,
        }));
        else storage?.removeItem(storage_key);
      } catch {
        state.warning = "Browser storage is unavailable. Keep this tab open until you save.";
      }
    }
    store.set(state);
  }

  function receive(snapshot, epoch = state.epoch) {
    if (state.saving || epoch !== state.epoch) return;
    latest = snapshot;
    if (state.draft && (state.dirty || state.editing)) {
      const conflict = !same(state.base, snapshot.files) || (state.revision !== null && state.revision !== snapshot.revision);
      if (conflict !== state.conflict) publish({ conflict });
    } else if (!same(state.base, snapshot.files) || state.revision !== snapshot.revision) {
      publish({ base: copy(snapshot.files), draft: copy(snapshot.files), revision: snapshot.revision, past: [], future: [], conflict: false }, true);
    }
  }

  function move(kind, row, column, time) {
    if (!state.editing || state.saving || state.json_text || !Number.isFinite(time) || column < 0) return;
    if (!state.draft?.[kind]?.[row] || row === 0) return;
    const value = new Date(time).toISOString().slice(0, 23);
    if (state.draft[kind][row][column] === value) return;
    const draft = copy(state.draft);
    draft[kind][row][column] = value;
    publish({ draft, past: [...state.past.slice(-99), state.draft], future: [], error: "" }, true);
  }

  function undo() {
    if (state.saving || state.json_text || !state.past.length) return;
    publish({ draft: state.past.at(-1), past: state.past.slice(0, -1), future: [state.draft, ...state.future], error: "" }, true);
  }

  function redo() {
    if (state.saving || state.json_text || !state.future.length) return;
    publish({ draft: state.future[0], past: [...state.past, state.draft], future: state.future.slice(1), error: "" }, true);
  }

  async function discard() {
    if (state.saving || !latest) return;
    publish({ saving: true, error: "", epoch: state.epoch + 1 });
    try {
      const response = await fetch("/api/data", { cache: "no-store" });
      if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
        latest = await response.json();
      } else if (response.status !== 404) {
        throw new Error("Could not reload saved files. Your draft is intact.");
      }
      publish({ base: copy(latest.files), draft: copy(latest.files), json_text: null, revision: latest.revision, past: [], future: [], conflict: false, error: "" }, true);
    } catch (error) {
      publish({ error: error.message });
    } finally {
      publish({ saving: false });
    }
  }

  function apply_json() {
    if (state.saving) return false;
    if (!state.json_text) return true;
    try {
      const draft = copy(state.draft);
      for (const [name, text] of Object.entries(state.json_text)) draft[name] = JSON.parse(text);
      validate_files(draft, config);
      publish({ draft, json_text: null, past: same(draft, state.draft) ? state.past : [...state.past.slice(-99), state.draft], future: [], error: "" }, true);
      return true;
    } catch (error) {
      publish({ error: error.message });
      return false;
    }
  }

  async function save() {
    if (state.saving || !state.dirty || !apply_json()) return;
    publish({ saving: true, error: "", epoch: state.epoch + 1 });
    try {
      const response = await fetch("/api/data", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: state.revision, files: state.draft }),
      });
      if (response.status === 404 || response.status === 405) throw new Error("Saving requires the local Codec server. Start it with npm run dev.");
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) publish({ conflict: true });
        throw new Error(result.error || "Could not save. Your draft is intact.");
      }
      latest = result;
      publish({ base: copy(result.files), draft: copy(result.files), revision: result.revision, past: [], future: [], conflict: false }, true);
    } catch (error) {
      publish({ error: error.message });
    } finally {
      publish({ saving: false });
    }
  }

  return {
    subscribe: store.subscribe, receive, move, undo, redo, discard, save, apply_json,
    configure(value) { config = value; },
    set_json_text(name, text) {
      if (state.saving || !["media", "events"].includes(name)) return;
      publish({ json_text: { ...state.json_text, [name]: text }, editing: true, error: "" }, true);
    },
    reset_json() { if (!state.saving) publish({ json_text: null, error: "" }, true); },
    set_editing(editing) { if (!state.saving) publish({ editing }); },
  };
}

let browser_storage;
try { browser_storage = globalThis.localStorage; } catch { /* In-memory editing still works. */ }
export const editor_store = create_editor(browser_storage);

export function event_time_column(rows) {
  return rows[0].findIndex((title) => /^datetime \(yyyy-mm-dd hh:mm:ss(?:\.sss)?\)$/i.test(title));
}
