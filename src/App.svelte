<script>
  import { onMount } from "svelte";
  import { editor_store } from "./stores/editor";
  import { throttle } from "underscore";
  import LocalMediaInput from "./components/LocalMediaInput.svelte";
  import Topbar from "./components/topbar/Topbar.svelte";
  import Tooltip from "./components/Tooltip.svelte";
  import Modules from "./components/modules/Modules.svelte";
  import FilterPanel from "./components/modules/FilterPanel.svelte";
  import {
    media_store,
    local_file_store,
    events_store,
    ui_store,
    filter_toggles,
    platform_config_store,
  } from "./stores/store";

  const mouse_xy = { x: 0, y: 0 };
  const handleMouseMove = throttle((event) => {
    mouse_xy.x = event.clientX;
    mouse_xy.y = event.clientY;
  }, 5);

  let width_mod_grid = Math.floor(document.body.clientWidth / 10) * 10;
  let height_mod_grid = Math.floor(document.body.clientHeight / 10) * 10;

  const handleWindowResize = throttle(() => {
    width_mod_grid = Math.floor(document.body.clientWidth / 10) * 10;
    height_mod_grid = Math.floor(document.body.clientHeight / 10) * 10;
  }, 500);

  onMount(() => {
    const fetch_interval = setInterval(() => {
      fetch_google_sheet_data().catch((error) => console.warn("Data refresh failed", error));
    }, 10000);
    return () => {
      clearInterval(fetch_interval);
    };
  });

  let processing_version = 0;
  $: if ($editor_store.draft && $platform_config_store["Source of media files"]) {
    process_event_sheet_response($editor_store.draft.events);
    // Reprocess local files when the user selects them, too.
    process_video_sheet_response($editor_store.draft.media, $local_file_store);
  }

  async function fetch_google_sheet_data() {
    if ($editor_store.saving) return;
    const epoch = $editor_store.epoch;
    const loadJson = async (url) => {
      const res = await fetch(url, { cache: "no-store" });
  
      if (!res.ok) {
        throw new Error(`Failed to load ${url}: ${res.status}`);
      }
  
      return res.json();
    };
  
    const platform_config = await loadJson("/data/platformconfig.json");
    $platform_config_store = platform_config;
    editor_store.configure(platform_config);
  
    const response = await fetch("/api/data", { cache: "no-store" });
    if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
      editor_store.receive(await response.json(), epoch);
    } else if (response.status === 404 || response.ok) {
      // Static hosting can still display the platform and keep browser drafts.
      const [media, events] = await Promise.all([
        loadJson("/data/media.json"), loadJson("/data/events.json"),
      ]);
      editor_store.receive({ files: { media, events }, revision: null }, epoch);
    } else {
      throw new Error("Could not load project data.");
    }
  }

  function process_event_sheet_response(rows) {
    // first row of table is column names
    const column_names = rows[0].map((col_name) => col_name.toLowerCase());

    // create array to feed data as being processed
    const events = [];

    // for every row (skipping the first row of column names)
    rows.slice(1).forEach((row, i) => {
      // create a video object
      const event = {};
      // for each column in row
      row.forEach((col_value, i) => {
        // assign the new object the column value under the correct key
        event[column_names[i]] = col_value;
      });

      // date time string to datetime object
      event.start_date_time = localtoUTCdatetimeobj(
        new Date(
          event["datetime (yyyy-mm-dd hh:mm:ss.sss)"] ??
            event["datetime (yyyy-mm-dd hh:mm:ss)"],
        ),
      );
      // create 10 second block for each event
      event.end_date_time = new Date(event.start_date_time.getTime() + 10000);
      // event.className = "case" + event.case
      event.start = event.start_date_time;
      event.end = event.end_date_time;

      const id = i + " event " + event.event;
      event.id = id;
      event.description = event.event;

      // add video object to data array
      events.push(event);
    });
    if (JSON.stringify($events_store) !== JSON.stringify(events)) {
      $events_store = events;
    }
  }

  // Cache promises so refreshes share pending loads as well as finished results.
  const duration_cache = new Map();

  function read_video_duration(source) {
    if (!duration_cache.has(source)) {
      const duration = new Promise((resolve, reject) => {
        const element = document.createElement("video");
        const url = source instanceof File ? URL.createObjectURL(source) : source;
        const timeout = setTimeout(
          () => finish(new Error("Video metadata timed out")),
          30000,
        );

        function finish(error, seconds) {
          clearTimeout(timeout);
          element.onloadedmetadata = null;
          element.onerror = null;
          element.removeAttribute("src");
          element.load();
          if (source instanceof File) URL.revokeObjectURL(url);
          if (error) reject(error);
          else resolve(seconds);
        }

        element.preload = "metadata";
        element.onloadedmetadata = () => {
          const seconds = element.duration;
          if (Number.isFinite(seconds) && seconds >= 0) {
            finish(null, seconds);
          } else {
            finish(new Error("Video has no finite duration"));
          }
        };
        element.onerror = () => finish(new Error("Could not load video metadata"));
        element.src = url;
      });
      duration_cache.set(source, duration);
      // Allow failed loads to be retried on the next refresh.
      duration.catch(() => duration_cache.delete(source));
    }
    return duration_cache.get(source);
  }

  function format_duration(seconds) {
    const milliseconds = Math.round(seconds * 1000);
    const total = Math.floor(milliseconds / 1000);
    const time = [
      Math.floor(total / 3600),
      Math.floor((total % 3600) / 60),
      total % 60,
    ]
      .map((value) => String(value).padStart(2, "0"))
      .join(":");
    return `${time}.${String(milliseconds % 1000).padStart(3, "0")}`;
  }

  async function process_video_sheet_response(rows, local_files) {
    const version = ++processing_version;
    // first row of table is column names
    const column_names = rows[0];
    // create array to feed data as being processed
    const new_videos = {};

    // for every row (skipping the first row of column names)
    await Promise.all(
      rows.slice(1).map(async (row, r) => {
        try {
          // create a video object
          const video = {};
          // for each column in row
          row.forEach((col_value, i) => {
            // assign the new object the column value under the correct key

            // if the col value a string boolean
            if (col_value === "TRUE" || col_value === "FALSE") {
              // transform string boolean to actual boolean
              video[column_names[i]] = col_value === "TRUE";
              // if boolean not already in filter_toggles (only need to do once on first row)
              // and checkig if already in there prevents from re-adding + resetting to false
              // at every sheet fetch
              if (
                (r === 0 || r === 1) &&
                !Object.keys($filter_toggles).includes(column_names[i])
              ) {
                $filter_toggles[column_names[i]] = false;
              }
            } else {
              video[column_names[i]] = col_value;
            }
          });

          // properties for map
          if (
            video[$platform_config_store["Title of column used for latitude"]] &&
            video[$platform_config_store["Title of column used for longitude"]]
          ) {
            video.lat = parseFloat(
              video[$platform_config_store["Title of column used for latitude"]],
            );
            video.long = parseFloat(
              video[$platform_config_store["Title of column used for longitude"]],
            );
          }

          // properties for timeline
          video.type = "range";
          video.label = video.UAR;
          video.id = video.UAR;
          video.url =
            video[$platform_config_store["Title of column used for url"]];

          const duration_column =
            $platform_config_store["Title of column used for duration"] ?? "Duration";
          const start_value =
            video[$platform_config_store["Title of column used for chronolocation"]];
          const source = $platform_config_store["Source of media files"].includes("local")
            ? local_files[video.UAR]
            : video.url;
          video.is_image = /\.(png|jpe?g|webp)(?:[?#]|$)/i.test(
            source instanceof File ? source.name : source || "",
          );

          // Never use the manually entered duration, even if metadata is unavailable.
          video[duration_column] = "";
          video.duration = "";
          if (source) {
            try {
              // Give still photos a visible timeline range without video metadata.
              const seconds = video.is_image ? 1 : await read_video_duration(source);
              video.duration = format_duration(seconds);
              video[duration_column] = video.duration;

              if (start_value) {
                video.start = localtoUTCdatetimeobj(new Date(start_value));
                video.end_date_time = video.start.getTime() + Math.round(seconds * 1000);
                video.end = video.end_date_time;
                video.times = [{
                  starting_time: video.start.getTime(),
                  ending_time: video.end_date_time,
                }];
              }
            } catch (error) {
              console.warn(`Could not read duration for ${video.UAR}`, error);
            }
          }

          // // properties for filter
          // Object.entries($filter_toggles).forEach((pair) => {
          //   let [toggle, value] = pair;
          //   if (typeof value === "object") {
          //     let responses = video[toggle];
          //     if (responses == undefined) return;
          //     responses = responses.replaceAll(" ", "");
          //     responses
          //       .split(",")
          //       .filter((response) => {eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
          //         return !["", " ", "NULL"].includes(response);
          //       })
          //       .forEach((response) => {
          //         if (!Object.keys(value).includes(response)) {
          //           value[response] = false;
          //         }
          //       });
          //   }
          //   $filter_toggles[toggle] = value;
          // });

          new_videos[video.UAR] = video;
        } catch (error) {
          console.log(error);
        }
      }),
    );

    if (version === processing_version && JSON.stringify($media_store) !== JSON.stringify(new_videos)) {
      $media_store = new_videos;
      $ui_store.media_in_view = $ui_store.media_in_view.filter((id) => new_videos[id]);
    }
  }

  // Takes datetime object created on local machine with time offset
  // returns datetime object in UTC time when read by same local machine
  function localtoUTCdatetimeobj(datetimeobj) {
    const userTimezoneOffset = datetimeobj.getTimezoneOffset() * 60000;
    return new Date(datetimeobj.getTime() - userTimezoneOffset);
  }
  const initial_load = fetch_google_sheet_data();
</script>

<svelte:window on:resize={handleWindowResize} />
<svelte:head>
  <title>Investigative Platform</title>
  <meta name="robots" content="noindex nofollow" />
  <html lang="en" />
</svelte:head>

<FilterPanel />
<Tooltip {mouse_xy} />

<main
  on:mousemove={handleMouseMove}
  style="width:{width_mod_grid}px; height:{height_mod_grid}px; left:{$ui_store.filter_in_view
    ? `var(--filtermenu-size)`
    : `0`} "
>
  {#await initial_load}
    <div class="modal_container">
      <div class="box modal_content text_level2">
        fetching initial data from the spreadsheet...
      </div>
    </div>
  {:then}
    {#if $platform_config_store["Source of media files"] && $platform_config_store["Source of media files"].includes("local")}
      <LocalMediaInput />
    {/if}
    <Topbar />
    <Modules />
  {:catch error}
    <div class="modal_container">
      <div class="box modal_content text_level2">
        <p>something went wrong, see below for error</p>
        <p>{error.message}</p>
        <p>please reload the page</p>
      </div>
    </div>
  {/await}
</main>
