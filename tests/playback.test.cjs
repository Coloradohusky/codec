const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

function clock() {
  let now = 0;
  let callback;
  let state;
  const context = vm.createContext({
    writable: (initial) => {
      state = initial;
      return { set: (value) => state = value };
    },
    performance: { now: () => now },
    setInterval: (fn) => { callback = fn; return 1; },
    clearInterval: () => { callback = null; },
  });
  vm.runInContext(read("src/stores/playback.js")
    .replace(/import[^;]+;/, "").replace(/export /g, ""), context);
  return {
    run: (code) => vm.runInContext(code, context),
    advance: (milliseconds) => { now += milliseconds; callback?.(); },
    state: () => state,
    running: () => Boolean(callback),
  };
}

test("shared clock preserves milliseconds, clamps seeks, and stops at the end", () => {
  const player = clock();
  player.run("set_playback_bounds(1000, 10000)");
  player.run("seek_playback(1125); play_playback()");
  player.advance(1005);
  assert.equal(player.state().time, 2130);
  player.run("seek_playback(8125)");
  player.advance(125);
  assert.equal(player.state().time, 8250);
  player.advance(5000);
  assert.equal(player.state().time, 10000);
  assert.equal(player.state().playing, false);
  assert.equal(player.running(), false);
  player.run("seek_playback(-500)");
  assert.equal(player.state().time, 1000);
});

test("paused clock stays fixed and resume uses a fresh time anchor", () => {
  const player = clock();
  player.run("set_playback_bounds(0, 10000); seek_playback(125); play_playback()");
  player.advance(200);
  player.run("pause_playback()");
  player.advance(3000);
  assert.equal(player.state().time, 325);
  player.run("play_playback()");
  player.advance(100);
  assert.equal(player.state().time, 425);
});

function feed(start = 1000) {
  const script = read("src/components/modules/MediumVideo.svelte")
    .split("<script>")[1].split("</script>")[0]
    .replace(/import[\s\S]*?from\s+"[^"]+";/g, "")
    .replace("export let medium;", "let medium = { start: new Date(1000), UAR: 'test', URL: 'test.mp4' };");
  const element = {
    currentTime: 0, duration: 10, paused: true, seeking: false,
    plays: 0,
    pause() { this.paused = true; },
    play() { this.paused = false; this.plays++; return Promise.resolve(); },
  };
  const context = vm.createContext({
    onDestroy: () => {}, File: class {}, URL,
    $platform_config_store: { "Source of media files": "url", "Title of column used for url": "URL" },
    $local_file_store: {}, $playback_store: { time: 1000, playing: false, seek: 0 },
  });
  vm.runInContext(script, context);
  context.element = element;
  vm.runInContext(`medium.start = new Date(${start})`, context);
  return {
    element,
    sync(time, playing = false, seek = 0) {
      context.$playback_store = { time, playing, seek };
      vm.runInContext("synchronize(element, medium, $playback_store, true)", context);
    },
    unavailable: () => vm.runInContext("unavailable", context),
  };
}

test("feed maps shared timestamps to exact offsets, including paused seeks", () => {
  const video = feed();
  video.sync(6125, false, 1);
  assert.equal(video.element.currentTime, 5.125);
  assert.equal(video.element.paused, true);
  assert.equal(video.unavailable(), false);
  video.sync(6130, false, 2);
  assert.equal(video.element.currentTime, 5.13);
});

test("feeds outside their recording window pause and rejoin on entry", async () => {
  const video = feed();
  video.sync(500, true);
  assert.equal(video.unavailable(), true);
  assert.equal(video.element.paused, true);
  video.sync(1125, true);
  assert.equal(video.element.currentTime, 0.125);
  assert.equal(video.unavailable(), false);
  assert.equal(video.element.paused, false);
  await Promise.resolve();
  video.sync(11000, true);
  assert.equal(video.unavailable(), true);
  assert.equal(video.element.paused, true);
});

test("playback corrects drift without repeatedly seeking an aligned video", () => {
  const video = feed();
  video.sync(2000, true, 1);
  video.element.currentTime = 1.04;
  video.sync(2050, true, 1);
  assert.equal(video.element.currentTime, 1.04);
  video.sync(2500, true, 1);
  assert.equal(video.element.currentTime, 1.5);
  assert.equal(video.element.plays, 1);
});

test("feeds with different Start values align to the same absolute time", () => {
  const first = feed(1000);
  const second = feed(3000);
  first.sync(6125, false, 1);
  second.sync(6125, false, 1);
  assert.equal(first.element.currentTime, 5.125);
  assert.equal(second.element.currentTime, 3.125);
});
