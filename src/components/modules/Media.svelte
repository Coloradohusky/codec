<script>
  import { ui_store, media_store } from "../../stores/store";
  import { onDestroy } from "svelte";
  import {
    playback_store,
    play_playback,
    pause_playback,
  } from "../../stores/playback";
  import { editor_store } from "../../stores/editor";
  import Module from "./Module.svelte";

  $: {
    if (!$ui_store.media_in_view.length || !$ui_store.modules_in_view.includes("media")) {
      pause_playback();
    }
  }

  onDestroy(pause_playback);
</script>

{#if $ui_store.media_in_view.length && $ui_store.modules_in_view.includes("media")}
  <div class="playback_controls">
    <button
      disabled={$playback_store.time === null || $editor_store.editing || $editor_store.saving}
      on:click={() => $playback_store.playing ? pause_playback() : play_playback()}
    >{$playback_store.playing ? "Pause feeds" : "Play feeds"}</button>
    <span>{ $playback_store.time === null
      ? ""
      : new Date($playback_store.time).toISOString().slice(0, 23).replace("T", " ") }</span>
    <span>Drag to seek all feeds. Hold Shift to snap to whole seconds.</span>
  </div>
{/if}

<div class="media">
  <!-- add (UAR) means it's a keyed each block, svelte tracks better -->
  {#each $ui_store.media_in_view as UAR (UAR)}
    <Module module={"media"} medium={$media_store[UAR]} />
  {/each}
</div>

<style>
  .playback_controls {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    color: white;
    margin-bottom: 10px;
    font-variant-numeric: tabular-nums;
  }

  button {
    color: white;
    border: 1px solid currentColor;
    padding: 4px 8px;
    cursor: pointer;
  }

  .media {
    display: flex;
    flex-flow: row nowrap;
    align-items: stretch;
    align-content: stretch;
    overflow-y: hidden;
  }
</style>
