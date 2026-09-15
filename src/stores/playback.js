import { writable } from "svelte/store";

export const playback_store = writable({ time: null, playing: false, seek: 0, rate: 1 });

let state = { time: null, playing: false, seek: 0, rate: 1 };
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
  const time = anchor_time + (performance.now() - anchor_clock) * state.rate;
  if (time >= end) {
    publish({ time: end });
    pause_playback();
  } else {
    publish({ time: Math.round(time) });
    timer = requestAnimationFrame(tick);
  }
}

export function play_playback() {
  if (state.playing || state.time === null || state.time >= end) return;
  anchor_time = state.time;
  anchor_clock = performance.now();
  publish({ playing: true });
  timer = requestAnimationFrame(tick);
}

export function pause_playback() {
  cancelAnimationFrame(timer);
  if (state.playing) {
    const time = Math.min(end, anchor_time + (performance.now() - anchor_clock) * state.rate);
    publish({ time: Math.round(time), playing: false });
  }
}

// Preserve the current position when changing speed, including between frames.
export function set_playback_rate(rate) {
  if (![0.25, 0.5, 1, 1.5, 2, 4].includes(rate)) return;
  const time = state.playing
    ? Math.min(end, anchor_time + (performance.now() - anchor_clock) * state.rate)
    : state.time;
  anchor_time = time;
  anchor_clock = performance.now();
  publish({ time: time === null ? null : Math.round(time), rate });
}

export function skip_playback(seconds) {
  if (state.time === null || !Number.isFinite(seconds)) return;
  const time = state.playing
    ? anchor_time + (performance.now() - anchor_clock) * state.rate
    : state.time;
  seek_playback(time + seconds * 1000);
}

// HTML video seeks by time; FPS-based stepping is approximate for variable-rate sources.
export function step_playback_frame(start, position, fps, direction, duration) {
  if (![start, position, fps, duration].every(Number.isFinite) || fps < 1 || fps > 240 || duration <= 0 || ![-1, 1].includes(direction)) return;
  pause_playback();
  const frame = Math.max(0, Math.min(Math.ceil(duration * fps) - 1, Math.floor(position * fps + 0.0001) + direction));
  // Aim inside the frame so millisecond rounding cannot select the preceding frame.
  const target = Math.min(duration - 0.001, (frame + 0.5) / fps);
  seek_playback(start + Math.max(0, target) * 1000);
}
