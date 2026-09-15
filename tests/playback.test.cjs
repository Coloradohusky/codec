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
    requestAnimationFrame: (fn) => { callback = fn; return 1; },
    cancelAnimationFrame: () => { callback = null; },
  });
  vm.runInContext(read("src/stores/playback.js")
    .replace(/import[^;]+;/, "").replace(/export /g, ""), context);
  return {
    run: (code) => vm.runInContext(code, context),
    advance: (milliseconds) => { now += milliseconds; const frame = callback; callback = null; frame?.(); },
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
    sync(time, playing = false, seek = 0, rate = 1) {
      context.$playback_store = { time, playing, seek, rate };
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

test("marker dragging is unsnapped by default and Shift snaps to seconds", () => {
  const source = read("src/components/modules/Timeline.svelte");
  const start = source.indexOf("  function snap_time");
  const finish = source.indexOf("\n  }", start) + 4;
  const context = vm.createContext({ snap_to_seconds: false });
  vm.runInContext(source.slice(start, finish), context);
  assert.equal(vm.runInContext("+snap_time(new Date(6125))", context), 6125);
  context.snap_to_seconds = true;
  assert.equal(vm.runInContext("+snap_time(new Date(6125))", context), 6000);
  assert.equal(vm.runInContext("+snap_time(new Date(6750))", context), 7000);
  context.snap_to_seconds = false;
  assert.equal(vm.runInContext("+snap_time(new Date(6750))", context), 6750);
});


test("speed changes keep the clock continuous, including pause and resume", () => {
  const player = clock();
  player.run("set_playback_bounds(0, 10000); seek_playback(1000); play_playback()");
  player.advance(100);
  player.run("set_playback_rate(2)");
  assert.equal(player.state().time, 1100);
  player.advance(100);
  assert.equal(player.state().time, 1300);
  player.run("pause_playback(); set_playback_rate(0.25)");
  player.advance(1000);
  assert.equal(player.state().time, 1300);
  player.run("play_playback()");
  player.advance(100);
  assert.equal(player.state().time, 1325);
});

test("one-second skips preserve playback state and clamp at timeline limits", () => {
  const player = clock();
  player.run("set_playback_bounds(0, 10000); seek_playback(125); skip_playback(-1)");
  assert.equal(player.state().time, 0);
  player.run("seek_playback(9125); play_playback(); skip_playback(1)");
  assert.equal(player.state().time, 10000);
  player.advance(10);
  assert.equal(player.state().playing, false);
});

test("FPS stepping pauses all playback and targets the neighboring frame", () => {
  const player = clock();
  player.run("set_playback_bounds(0, 10000); seek_playback(2000); play_playback()");
  player.run("step_playback_frame(1000, 1, 25, 1, 10)");
  assert.equal(player.state().playing, false);
  assert.equal(player.state().time, 2060);
  player.run("step_playback_frame(1000, 1.04, 25, -1, 10)");
  assert.equal(player.state().time, 2020);
  player.run("step_playback_frame(1000, 0, 25, -1, 10)");
  assert.equal(player.state().time, 1020);
  player.run("step_playback_frame(1000, 1, 0, 1, 10)");
  assert.equal(player.state().time, 1020);
});

test("each synchronized feed receives the shared playback speed", () => {
  const video = feed();
  video.sync(2000, true, 1, 2);
  assert.equal(video.element.playbackRate, 2);
  video.sync(2000, false, 1, 0.5);
  assert.equal(video.element.playbackRate, 0.5);
});

test("frame readout uses presented media timestamps and cancels its callback", () => {
  const source = read("src/components/modules/MediumVideo.svelte");
  const start = source.indexOf("  function track_frames");
  const finish = source.indexOf("  function step_frame", start);
  let callback;
  let cancelled;
  const element = {
    requestVideoFrameCallback(fn) { callback = fn; return 123; },
    cancelVideoFrameCallback(id) { cancelled = id; },
    removeEventListener() {},
  };
  const context = vm.createContext({ element, frame_time: null, frame_callback_supported: false });
  vm.runInContext(source.slice(start, finish), context);
  const tracker = vm.runInContext("track_frames(element)", context);
  callback(1000, { mediaTime: 1.125, presentedFrames: 999 });
  assert.equal(context.frame_time, 1.125);
  tracker.destroy();
  assert.equal(cancelled, 123);
});
