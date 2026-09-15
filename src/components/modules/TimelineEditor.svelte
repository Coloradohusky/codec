<script>
  import { editor_store, event_time_column } from "../../stores/editor";
  import { platform_config_store } from "../../stores/store";
  import { pause_playback } from "../../stores/playback";

  let selected = "";
  let timestamp = "";
  let input_error = "";
  $: rows = $editor_store.draft;
  $: [kind, row_text] = selected.split(":");
  $: row = Number(row_text);
  $: column = rows && kind === "media"
    ? rows.media[0].indexOf($platform_config_store["Title of column used for chronolocation"])
    : rows ? event_time_column(rows.events) : -1;
  $: saved_timestamp = rows?.[kind]?.[row]?.[column]?.replace(" ", "T") || "";
  $: timestamp = saved_timestamp;

  function toggle_editing() {
    pause_playback();
    editor_store.set_editing(!$editor_store.editing);
  }

  function apply_time() {
    const time = new Date(`${timestamp}Z`);
    if (!timestamp || !Number.isFinite(+time)) {
      input_error = "Enter a valid timestamp.";
      return;
    }
    input_error = "";
    editor_store.move(kind, row, column, +time);
  }

  function nudge(milliseconds) {
    const value = rows[kind][row][column].replace(" ", "T");
    editor_store.move(kind, row, column, +new Date(`${value}Z`) + milliseconds);
  }
</script>

<div class="editor_controls">
  <button on:click={toggle_editing} disabled={!rows || $editor_store.saving} aria-pressed={$editor_store.editing}>
    {$editor_store.editing ? "Finish editing" : "Edit timeline"}
  </button>
  {#if $editor_store.editing || $editor_store.dirty}
    <button on:click={() => editor_store.undo()} disabled={!$editor_store.past.length || $editor_store.saving}>Undo</button>
    <button on:click={() => editor_store.redo()} disabled={!$editor_store.future.length || $editor_store.saving}>Redo</button>
    <button on:click={() => editor_store.save()} disabled={!$editor_store.dirty || $editor_store.saving || $editor_store.conflict}>
      {$editor_store.saving ? "Saving..." : "Save"}
    </button>
    <button on:click={() => editor_store.discard()} disabled={(!$editor_store.dirty && !$editor_store.conflict) || $editor_store.saving}>Discard</button>
    <span>{$editor_store.dirty ? "Unsaved changes" : "Saved"}</span>
  {/if}
  {#if $editor_store.editing && rows}
    <span>Drag videos or event markers. Shift snaps to seconds.</span>
    <div class="details">
      <select bind:value={selected} aria-label="Record to align" disabled={$editor_store.saving}>
        <option value="">Choose a record for precise alignment</option>
        {#each rows.media.slice(1) as record, i}
          <option value={`media:${i + 1}`}>Video: {record[rows.media[0].indexOf("UAR")]}</option>
        {/each}
        {#each rows.events.slice(1) as record, i}
          <option value={`events:${i + 1}`}>Event: {record[0]}</option>
        {/each}
      </select>
      {#if selected && rows[kind]?.[row]}
        <input type="datetime-local" step="0.001" bind:value={timestamp} aria-label="Start timestamp" disabled={$editor_store.saving} />
        <button on:click={apply_time} disabled={$editor_store.saving}>Apply</button>
        {#each [-100, -10, -1, 1, 10, 100] as milliseconds}
          <button on:click={() => nudge(milliseconds)} disabled={$editor_store.saving}>{milliseconds > 0 ? "+" : ""}{milliseconds} ms</button>
        {/each}
      {/if}
    </div>
  {/if}
  {#if $editor_store.conflict}
    <p role="alert">Files changed on disk. Your draft is preserved. Discard loads the latest saved files.</p>
  {/if}
  {#if $editor_store.error || input_error}<p role="alert">{$editor_store.error || input_error}</p>{/if}
  {#if $editor_store.warning}<p role="status">{$editor_store.warning}</p>{/if}
</div>

<style>
  .editor_controls, .details {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    color: white;
  }
  .editor_controls { padding: 8px; }
  .details, p { width: 100%; }
  p { margin: 0; }
  button, select, input {
    color: white;
    background: var(--grey1);
    border: 1px solid var(--grey2);
    padding: 4px 8px;
  }
  button { cursor: pointer; }
  button:disabled { opacity: 0.45; cursor: default; }
  button[aria-pressed="true"] { border-color: white; }
</style>
