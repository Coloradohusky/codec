<script>
  import { editor_store } from "../../stores/editor";
  import { pause_playback } from "../../stores/playback";
  let open = false;
  let file = "media";

  function toggle() {
    open = !open;
    if (open) {
      pause_playback();
      editor_store.set_editing(true);
    }
  }

  function edit(event) {
    pause_playback();
    editor_store.set_json_text(file, event.currentTarget.value);
  }
</script>

<div class="json_editor">
  <button on:click={toggle} aria-expanded={open}> {open ? "Hide JSON editor" : "Edit JSON"} </button>
  {#if open && $editor_store.draft}
    <label>
      File
      <select bind:value={file}>
        <option value="media">media.json</option>
        <option value="events">events.json</option>
      </select>
    </label>
    <textarea
      aria-label={`Edit ${file}.json`}
      spellcheck="false"
      value={$editor_store.json_text?.[file] ?? JSON.stringify($editor_store.draft[file], null, 2)}
      on:input={edit}
      disabled={$editor_store.saving}
    />
    <button on:click={() => editor_store.apply_json()} disabled={!$editor_store.json_text || $editor_store.saving}>Apply JSON</button>
    <button on:click={() => editor_store.reset_json()} disabled={!$editor_store.json_text || $editor_store.saving}>Reset text</button>
    <span>Apply updates the draft. Save writes both files. Invalid JSON stays here until corrected or discarded.</span>
  {/if}
</div>

<style>
  .json_editor { width: 100%; }
  textarea {
    display: block;
    box-sizing: border-box;
    width: 100%;
    height: 220px;
    resize: vertical;
    margin: 8px 0;
    padding: 8px;
    font-family: monospace;
    tab-size: 2;
    white-space: pre;
  }
  button, select, textarea {
    color: white;
    background: var(--grey1);
    border: 1px solid var(--grey2);
  }
  button, select { padding: 4px 8px; }
  button { cursor: pointer; }
  button:disabled { opacity: 0.45; cursor: default; }
</style>
