<script>
  import { local_file_store, platform_config_store } from "../../stores/store";
  import { onDestroy } from "svelte";
  import { playback_store } from "../../stores/playback";
  export let medium;

  let video_element;
  let metadata_ready = false;
  let unavailable = true;
  let playback_error = "";
  let play_pending = false;
  let last_seek = -1;

  $: synchronize(video_element, medium, $playback_store, metadata_ready);

  function synchronize(element, video, playback, ready) {
    if (!element || !ready) return;
    const start = new Date(video.start).getTime();
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(element.duration) ||
      playback.time === null
    ) {
      unavailable = true;
      element.pause();
      return;
    }

    const offset = (playback.time - start) / 1000;
    unavailable = offset < 0 || offset >= element.duration;
    const target = Math.max(0, Math.min(element.duration, offset));
    const was_seek = last_seek !== playback.seek;
    // Seek exactly when paused; correct noticeable drift during playback.
    const tolerance = playback.playing && !element.paused ? 0.15 : 0.001;
    if (
      was_seek ||
      (!element.seeking && Math.abs(element.currentTime - target) > tolerance)
    ) {
      element.currentTime = target;
    }
    last_seek = playback.seek;

    if (!playback.playing || unavailable) {
      element.pause();
    } else if (element.paused && !play_pending && !playback_error) {
      play_pending = true;
      element.play().then(() => {
        if (!$playback_store.playing || unavailable) element.pause();
      }).catch((error) => {
        if (error.name !== "AbortError") playback_error = "Could not play this feed.";
      }).finally(() => {
        play_pending = false;
      });
    }
  }

  function retry_playback() {
    playback_error = "";
    if (video_element?.error) {
      metadata_ready = false;
      video_element.load();
    }
    synchronize(video_element, medium, $playback_store, metadata_ready);
  }

  onDestroy(() => {
    video_element?.pause();
    if (src?.startsWith("blob:")) URL.revokeObjectURL(src);
  });

  let src = null;
  let used_filepath = "";
  let current_source;

  $: set_source(
    $platform_config_store["Source of media files"].includes("local")
      ? $local_file_store[medium.UAR]
      : medium[$platform_config_store["Title of column used for url"]],
  );

  function set_source(source) {
    if (source === current_source) return;
    if (src?.startsWith("blob:")) URL.revokeObjectURL(src);
    current_source = source;
    metadata_ready = false;
    playback_error = "";
    last_seek = -1;
    used_filepath = source instanceof File ? source.name : source || "";
    src = source instanceof File ? URL.createObjectURL(source) : source || null;
  }

</script>

{#if src !== null}
  {#if used_filepath.toLowerCase().includes("mp4") || used_filepath
      .toLowerCase()
      .includes("mov") || used_filepath
      .toLowerCase()
      .includes("webm") || used_filepath.toLowerCase().includes("m4v")}
    <div class="medium_video" id={medium.id}>
      <video
        bind:this={video_element}
        class:unavailable
        muted
        playsinline
        preload="metadata"
        {src}
        on:loadedmetadata={() => metadata_ready = true}
        on:error={() => playback_error = "Could not load this feed."}
      />
      {#if playback_error}
        <div class="feed_status">
          {playback_error}
          <button on:click={retry_playback}>Retry</button>
        </div>
      {:else if !metadata_ready}
        <div class="feed_status">Loading feed...</div>
      {:else if unavailable}
        <div class="feed_status">No footage at this time.</div>
      {/if}
    </div>
  {:else if used_filepath.includes("png") || used_filepath.includes("jpeg") || used_filepath.includes("jpg") || used_filepath.includes("webp")}
    <div class="medium_image" id={medium.id}>
      <!-- svelte-ignore a11y-missing-attribute -->
      <img {src} />
    </div>
  {/if}
{/if}

<style>
  .medium_video {
    position: relative;
    width: 100%;
    height: 40vh;
    margin: 0 auto;
    overflow: hidden; /* Add this */
  }

  .medium_image {
    height: 40vh;
    display: flex;
    flex-flow: column;
    flex-direction: row;
    justify-content: center;
  }

  .feed_status {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: white;
    background: black;
  }

  .unavailable {
    visibility: hidden;
  }

  button {
    color: white;
    cursor: pointer;
    text-decoration: underline;
  }

  video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
</style>
