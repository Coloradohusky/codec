const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const { create_editor_server, allowed_host } = require("../scripts/server.cjs");
const files = () => ({
  media: [["UAR", "Start", "URL"], ["a", "2001-09-11T09:00:00.000", "https://example.com/a.mp4"]],
  events: [["Event", "Datetime (yyyy-mm-dd hh:mm:ss.sss)"], ["Event A", "2001-09-11T09:00:00.000"]],
});

function browser(storage = new Map()) {
  const context = vm.createContext({
    writable: (initial) => {
      let value = initial;
      let subscriber = () => {};
      return { set(next) { value = next; subscriber(next); }, subscribe(fn) { subscriber = fn; fn(value); return () => {}; } };
    },
    fetch: async () => { throw new Error("offline"); },
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
  });
  const code = fs.readFileSync(path.join(__dirname, "../src/stores/editor.js"), "utf8")
    .replace(/import[^;]+;/, "").replace(/export /g, "");
  vm.runInContext(code, context);
  const editor = vm.runInContext("editor_store", context);
  let state;
  editor.subscribe((next) => state = next);
  return { editor, context, state: () => state, storage };
}
const first = () => ({ files: files(), revision: "first" });
const shifted = +new Date("2001-09-11T09:00:01.125Z");

test("draft survives refresh and reload, with Undo/Redo history", () => {
  const b = browser();
  b.editor.receive(first());
  b.editor.set_editing(true);
  b.editor.move("media", 1, 1, shifted);
  b.editor.receive(first());
  assert.equal(b.state().draft.media[1][1], "2001-09-11T09:00:01.125");
  const restored = browser(b.storage);
  restored.editor.receive(first());
  assert.equal(restored.state().dirty, true);
  restored.editor.undo();
  assert.equal(restored.state().draft.media[1][1], files().media[1][1]);
  restored.editor.redo();
  assert.equal(restored.state().draft.media[1][1], "2001-09-11T09:00:01.125");
});

test("external changes flag conflict without replacing draft; discard reloads disk", async () => {
  const b = browser();
  b.editor.receive(first());
  b.editor.set_editing(true);
  b.editor.move("events", 1, 1, shifted);
  const external = first();
  external.revision = "external";
  external.files.media[1][1] = "2001-09-11T10:00:00.000";
  b.editor.receive(external);
  assert.equal(b.state().conflict, true);
  assert.equal(b.state().draft.events[1][1], "2001-09-11T09:00:01.125");
  b.context.fetch = async () => new Response(JSON.stringify(external), { headers: { "content-type": "application/json" } });
  await b.editor.discard();
  assert.equal(b.state().dirty, false);
  assert.equal(b.state().draft.media[1][1], "2001-09-11T10:00:00.000");
  assert.equal(b.state().past.length, 0);
});

test("save failure retains draft and history; success resets history and ignores stale refresh", async () => {
  const b = browser();
  b.editor.receive(first());
  b.editor.set_editing(true);
  b.editor.move("media", 1, 1, shifted);
  await b.editor.save();
  assert.equal(b.state().dirty, true);
  assert.equal(b.state().past.length, 1);
  assert.match(b.state().error, /offline/);
  b.context.fetch = async (url, options) => new Response(JSON.stringify({ files: JSON.parse(options.body).files, revision: "saved" }));
  await b.editor.save();
  assert.equal(b.state().dirty, false);
  assert.equal(b.state().past.length, 0);
  b.editor.receive(first(), 0);
  assert.equal(b.state().revision, "saved");
});

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codec-editor-"));
  const data = path.join(root, "public/data");
  fs.mkdirSync(data, { recursive: true });
  for (const [name, value] of Object.entries(files())) fs.writeFileSync(path.join(data, `${name}.json`), JSON.stringify(value));
  fs.writeFileSync(path.join(data, "platformconfig.json"), JSON.stringify({ "Title of column used for chronolocation": "Start" }));
  const server = create_editor_server(root);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${server.address().port}/api/data`;
  return { root, data, url, get: async () => (await fetch(url)).json(), put: (body, headers = {}) => fetch(url, { method: "PUT", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }) };
}

test("server saves both timestamps, preserves other fields, and rejects stale revisions", async (t) => {
  const f = await fixture(t);
  const snapshot = await f.get();
  snapshot.files.media[1][1] = "2001-09-11T09:00:01.125";
  snapshot.files.events[1][1] = "2001-09-11T09:00:02.250";
  const response = await f.put(snapshot);
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.notEqual(saved.revision, snapshot.revision);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.data, "media.json")))[1][2], files().media[1][2]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.data, "events.json")))[1][1], "2001-09-11T09:00:02.250");
  assert.equal((await f.put(snapshot)).status, 409);
  assert.equal(fs.existsSync(path.join(f.root, ".codec-save-journal.json")), false);
});

test("server rejects invalid dates, unexpected changes, and cross-origin saves without writing", async (t) => {
  const f = await fixture(t);
  const original = await f.get();
  const malformed = structuredClone(original);
  malformed.files.media[1][1] = "2001-02-30T09:00:00.000";
  assert.equal((await f.put(malformed)).status, 400);
  const changed_url = structuredClone(original);
  changed_url.files.media[1][2] = "changed";
  assert.equal((await f.put(changed_url)).status, 400);
  assert.equal((await f.put(original, { origin: "https://example.com" })).status, 403);
  assert.equal((await f.get()).revision, original.revision);
});

test("external file modifications conflict and an interrupted save is recovered", async (t) => {
  const f = await fixture(t);
  const snapshot = await f.get();
  const old = Object.fromEntries(["media", "events"].map((name) => [name, fs.readFileSync(path.join(f.data, `${name}.json`), "utf8")]));
  fs.appendFileSync(path.join(f.data, "events.json"), "\n");
  assert.equal((await f.put(snapshot)).status, 409);
  fs.writeFileSync(path.join(f.root, ".codec-save-journal.json"), JSON.stringify(old));
  fs.writeFileSync(path.join(f.data, "media.json"), "[]");
  const recovered = create_editor_server(f.root);
  recovered.close();
  assert.equal(fs.readFileSync(path.join(f.data, "media.json"), "utf8"), old.media);
  assert.equal(fs.readFileSync(path.join(f.data, "events.json"), "utf8"), old.events);
});

test("a failed second file replacement rolls back the entire save", async (t) => {
  const f = await fixture(t);
  const snapshot = await f.get();
  const original = JSON.stringify(snapshot.files);
  snapshot.files.media[1][1] = "2001-09-11T09:00:01.000";
  snapshot.files.events[1][1] = "2001-09-11T09:00:02.000";
  const rename = fs.renameSync;
  let failed = false;
  fs.renameSync = (source, target) => {
    if (!failed && target === path.join(f.data, "events.json")) {
      failed = true;
      throw new Error("Simulated disk failure");
    }
    return rename(source, target);
  };
  try {
    assert.equal((await f.put(snapshot)).status, 500);
  } finally {
    fs.renameSync = rename;
  }
  assert.equal(JSON.stringify((await f.get()).files), original);
});

test("timeline alignment preserves duration and commits one timestamp change", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/components/modules/Timeline.svelte"), "utf8");
  const start = source.indexOf("  function align_video");
  const finish = source.indexOf("\n  function update_timeline", start);
  const changes = [];
  const context = vm.createContext({
    $editor_store: { editing: true, saving: false, draft: files() },
    $media_store_filtered: { a: { start: new Date(1000), end: 6250 } },
    $platform_config_store: { "Title of column used for chronolocation": "Start" },
    editor_store: { move: (...args) => changes.push(args) },
    snap_time: (time) => time,
  });
  vm.runInContext(source.slice(start, finish), context);
  context.item = { id: "a", start: new Date(2000), end: new Date(99999) };
  context.callback = (item) => assert.equal(+item.end - +item.start, 5250);
  vm.runInContext("align_video(item, callback, false)", context);
  assert.equal(changes.length, 0);
  vm.runInContext("align_video(item, callback, true)", context);
  assert.deepEqual(changes, [["media", 1, 1, 2000]]);
});


test("host validation accepts the connected Tailscale interface and rejects unrelated hosts", () => {
  assert.equal(allowed_host("100.90.80.70:8080", "100.90.80.70", 8080), true);
  assert.equal(allowed_host("100.90.80.70:8080", "::ffff:100.90.80.70", 8080), true);
  assert.equal(allowed_host("localhost:8080", "127.0.0.1", 8080), true);
  assert.equal(allowed_host("attacker.example:8080", "100.90.80.70", 8080), false);
  assert.equal(allowed_host("100.90.80.71:8080", "100.90.80.70", 8080), false);
  assert.equal(allowed_host("100.90.80.70:9999", "100.90.80.70", 8080), false);
});
