import { writable } from "svelte/store";

export const playback_store = writable({ time: null, playing: false, seek: 0 });

let state = { time: null, playing: false, seek: 0 };
let timer;
let anchor_time;
let anchor_clock;
let begin;
let end;

function publish(changes) {
  state = { ...state, ...changes };
  playback_store.set(state);
}

export function set_playback_bounds(start, finish) {
  if (!Number.isFinite(start) || !Number.isFinite(finish) || finish <= start) return;
  begin = start;
  end = finish;
  if (state.time === null) seek_playback((begin + end) / 2);
  else if (state.time < begin || state.time > end) seek_playback(state.time);
}

export function seek_playback(time) {
  if (!Number.isFinite(time)) return;
  time = Math.round(Math.max(begin ?? time, Math.min(end ?? time, time)));
  anchor_time = time;
  anchor_clock = performance.now();
  publish({ time, seek: state.seek + 1 });
}

function tick() {
  const time = anchor_time + performance.now() - anchor_clock;
  if (time >= end) {
    publish({ time: end });
    pause_playback();
  } else {
    publish({ time: Math.round(time) });
  }
}

export function play_playback() {
  if (state.playing || state.time === null || state.time >= end) return;
  anchor_time = state.time;
  anchor_clock = performance.now();
  publish({ playing: true });
  timer = setInterval(tick, 50);
}

export function pause_playback() {
  clearInterval(timer);
  if (state.playing) {
    const time = Math.min(end, anchor_time + performance.now() - anchor_clock);
    publish({ time: Math.round(time), playing: false });
  }
}
