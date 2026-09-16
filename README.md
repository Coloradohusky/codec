<img src="codec white on black logo cropped center.png" alt="SITU Research and Codec logos">

Codec is a collaborative tool for managing video evidence. A public demo site is available [here](https://codec-demo.netlify.app/)

A response to the deluge of visual information flowing out of conflict environments and contested events, Codec is designed to support the work of researchers, journalists, legal teams, activist groups and others in adjacent fields. While the tool has many potential applications, the driving goal has been to further investigations, amplify truth, and pursue accountability for human rights abuses. The interface is a modular system split into three components: a timeline, a map, and a media player that allows users to securely synthesize large data sets of multimedia assets across the time and space of an event or series of events.

Codec originally emerged as a byproduct of attempting to solve recurring challenges in our investigative workflows—issues around collaboration, rapid visualization, and the management of video evidence. While the amount of user generated content has increased exponentially in recent years, managing the sheer volume of material can become inefficient at best and, often, simply prohibitive. Codec is designed to make this process collaborative, streamlined, efficient and intuitive. Research and development for this beta version of Codec unfolded across various cases of differing scales, and through collaborating with partners, including: Carnegie Mellon University’s Center for Human Rights Science, Amnesty International, UC Berkeley's Human Rights Center, Columbia Law School’s Human Rights Initiative, Human Rights Watch, UNITAD and many more.


Our goal with releasing this open-source tool is two-fold: <br>
\- to make it easily accessible for other researchers engaged in similar work <br>
\- to open it up to others with software development skills in order to build a shared tool

If you'd like to work with us on using or developing Codec, please fill out [this form](https://forms.gle/7Pg7GPZmYpN6CVSa9). As a small team we won't be able to work with all collaborators, but we will do our best to support serious inquiries. We have written out detailed instructions below to help you get started without the need for direct communication.

***

## Tables of contents

1. [General Instructions (no code)](#general-instructions-no-code)
2. [Instructions for developers](#instructions-for-developers)
3. [Troubleshooting](#troubleshooting)
4. [Contributing](#contributing)

***

## General instructions (no code)

We have strived to make Codec as easy as possible to use, especially for researchers with no coding experience. You'll need 4 things to setup Codec: **your media files**, **a googlesheet**, **a google service account**, and **a deployed instance of this repository** (more details on each below).

### 1. A folder with your media files

You will need a folder with all your media assets, each named as their [UAR (unique asset reference) + file extension]. This folder can be a local folder containing the files, or can be a mounted drive, like Google Drive, OneDrive, Tresorit (for maximum security) or another cloud storage service that has a similar local drive mount feature. (If you choose this option, make sure that, in the Platform config sheet, 'Source of media files' is set to 'local'.)

<details>

<summary>Another media file storage solution (click to expand) </summary>

Another media file storage solution is to use a cloud storage service such as Amazon Web Services’ S3. After uploading the necessary files to an S3 bucket and the necessary url links filled in the spreadsheet, any user with access to the platform can then play the files without needing a local copy or a local drive streaming solution. This makes public dissemination easier. However, it is slightly more technically difficult to set up and is not as secure. (If you choose this option, make sure that, in the Platform config sheet, 'Source of media files' is set to 'url'.)
</details>

If you already have a spreadsheet with UARs and links, we recommend using Amnesty Citizen Evidence Lab's [Online Video Wrangler](https://docs.google.com/document/d/e/2PACX-1vQd9v5U2doMwskQtkqBlwpUL0jM9Jua6I6tylan4slngL27cuX3h1ogv54u1IxCV8wjrmaltDFk2DQ_/pub) to automatically download all the media files.

### 2. A googlesheets document

Next you will need a properly set up googlesheet. A template is available [here](https://docs.google.com/spreadsheets/d/1gUMlUpOvRWUkG10lkWk8zebtmkzK9R0Azv6inve94h4/edit?usp=sharing) - feel free to duplicate and fill it with your own information. The template includes data validation on important cells to verify that the manually inputted value's format matches the expected format (e.g. time in HH-MM-SS format). More on the expected format below.

Importantly, make sure that your googlesheets document is shared with the google service account you create in the next step. In step [4](#4-a-deployed-version-of-codec), you will need your googlesheet document id, which is in the url `https://docs.google.com/spreadsheets/d/YOUR SPREADSHEET ID IS HERE/edit#gid=0` as per this [documentation](https://developers.google.com/sheets/api/guides/concepts)



<details>

<summary>
Detailed googlesheet format requirements (click to expand)
</summary>

Codec expects a googlesheet with the following characteristics:


<details>

<summary>
- A tab named 'Platform config' with the following rows:
</summary>

- **Map start latitude**: the center latitude where the map loads, in decimal format e.g. 40.806
- **Map start longitude**: the center longitude where the map loads, in decimal format e.g. -73.920
- **Map start zoom**: the initial zoom level where the map loads, in decimal format e.g. 16
- **Timeline begin datetime**: the date and time when the timeline begins, in `YYYY-MM-DDTHH:mm:ss.SSS` format e.g. `2020-06-04T19:56:00.000`
- **Timeline end datetime**: the date and time when the timeline ends, in `YYYY-MM-DDTHH:mm:ss.SSS` format e.g. `2020-06-04T20:06:00.000`
- **Source of media files**: where to load the media files from, either 'local' to prompt the user to select them from their machine or 'url' to indicate the files should be loaded from their link
- **Title of tab with media assets**: the name of the tab containing information about the media assets, e.g. 'media assets'
- **Title of tab with events**: the name of the tab containing information about the events, e.g. 'events'
- **Title of column used for chronolocation**: within the media assets tab, name of the column used to locate assets on the timeline, e.g. 'Start'. Use `YYYY-MM-DDTHH:mm:ss.SSS` values such as `2001-09-11T09:00:00.125`; the final three digits are milliseconds
- **Duration**: derived from video metadata and displayed as `HH:mm:ss.SSS`; no duration column is required in the media data.
- **Title of column used for latitude**: within the media assets tab, name of the column with latitude used to locate assets on the map, e.g. 'Latitude (decimal)'
- **Title of column used for longitude**: within the media assets tab, name of the column with longitude used to locate assets on the map, e.g. 'Longitude (decimal)'
- **Title of column used for url**: within the media assets tab, if 'Source of media files' set to 'url, name of the column with the link to the media file
- **Rank of assets row with column names**: within the media assets tab, which row contains the column names, e.g. if it's in the second row from the top, write '2'
- **Rank of events row with column names**: within the events tab, which row contains the column names, e.g. if it's in the first row from the top, write '1'
</details>

<details>

<summary>
- A tab with details on the media assets, with the following characteristics:
</summary>

- the first column should be the UAR (Unique Asset Reference) an alphanumeric code that is unique to each media asset, e.g. 'bx010'
- to the right of all the column, there should be a column with some content such that Codec can read all the data, e.g. in cell AH 1 in the template: 'END'
- a column to indicate asset chronolocation
- a column to indicate asset latitude
- a column to indicate asset longitude
- if using cloud hosted media files, a column to indicate asset file link
- columns with boolean (i.e. true/false) values will be automatically filterable in the Codec user interface. We recommend using checkboxes to avoid typos (select whole column below column name, Insert > Checkbox)
</details>


<details>

<summary>
- A tab with details on the events to mark vertical lines on the timeline (can be empty), with the following characteristics:
</summary>

- a column titled 'Datetime (YYYY-MM-DD HH:MM:SS)': to indicate where to draw the event on the timeline, e.g. '2020-06-04 20:00:00'
- a column titled 'Event': text describing the event, e.g. 'Curfew goes into effect'
</details>


</details>



### 3. A google service account

You will need to enable the Google Sheets API and create a Google service account to authorize Codec to read your googlesheet. This process is slightly more technical but relatively straightforward for non-coders. The instruction below are paraphrased from the [documentation](https://theoephraim.github.io/node-google-spreadsheet/#/getting-started/authentication) of the [google-spreadsheet library](https://theoephraim.github.io/node-google-spreadsheet/) used in this project:


<details>

<summary>
1. Enabling the Sheets API (click to expand)
</summary>

1. Go to the [Google Developers Console](https://console.cloud.google.com/)
2. Select your project or create a new one (and then select it)
3. In the sidebar on the left, select APIs & Services > Library
4. Search for "sheets"
5. Click on "Google Sheets API"
6. Click the blue "Enable" button

</details>



    
<details>

<summary>
2. Creating the Google service account (click to expand)
</summary>

1. Select your project in the [Google Developers Console](https://console.cloud.google.com/)
2. In the sidebar on the left, select APIs & Services > Credentials
3. Click blue "+ CREATE CREDENTIALS" and select "Service account" option
4. Enter name, description, click "CREATE"
5. You can skip permissions, click "CONTINUE"
6. Click "+ CREATE KEY" button
7. Select the "JSON" key type option
8. Click "Create" button > your JSON key file is generated and downloaded to your machine. Make sure to keep this file, it is the only copy and you will need it to deploy the platform to Netlify.
9. Click "DONE"

</details>

Once you have a Google service account, share the googlesheets document you created above with the Google service account email shown in the JSON file (which you can open with any text editor).

You will also need the information in the JSON file in the following step.


### 4. A deployed version of Codec

Finally, you will need to deploy a customized Codec instance. For this you will need the JSON file you created in step [3](#3-a-google-service-account), a (free) Github account, a (free) Netlify account, and a (free) Mapbox account to get your public access token (visible in your [account page](https://account.mapbox.com/)). With these in hand, you can deploy Codec without any coding with the button below. It will prompt you to create a free Netlify account if you don't already have one.

When prompted, fill in the following environment variables:
- GOOGLE_SHEET_ID: your googlesheet document id
- GOOGLE_SERVICE_ACCOUNT_EMAIL: your google service account email address
- GOOGLE_CLIENT_PRIVATE_KEY: your google service account private key
- MAPBOX_ACCESS_TOKEN: your mapbox access token

[![Deploy to netlify button](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/SITU-Research/codec)



***

## Instructions for developers

For development, clone or fork the repository and make sure to use the Netlify CLI to run the app, in order to simulate the Netlify function that fetches the googlesheet document data. By default, the Netlify CLI will look for an .env file with the same environment variables as above.

```
git clone https://github.com/SITU-Research/codec
cd codec
npm i
touch .env
netlify dev
```


***

## Troubleshooting 

If your deployed Codec tool is not displaying properly, here is a short list of potential symptoms and solutions.


#### Symptom: The tool displays an error message on load.
#### Potential solutions:
- Ensure the googlesheet document id is correctly inputted into Netlify. You can change it by navigating to [Netlify](https://app.netlify.com/), selecting your site > Site Settings > Build & deploy > Environment > Edit variables and changing the value of GOOGLE_SHEET_ID.
- Ensure the google service account email is correctly inputted into Netlify. You can change it as above.
- Ensure the google service account email is shared with the googlesheets document.


<br>

#### Symptom: The tool loads without error but no media appears on the timeline and/or map
#### Potential solutions:
- Ensure you have correctly formatted the fields in the googlesheet.
- Ensure timeline/map are correctly centered and zoomed to your media files chrono- and geo-location.

<br>

#### Symptom: The map is not loading correctly
#### Potential solutions:
- Ensure the Mapbox access token is correctly inputted into Netlify. You can change it by navigating to [Netlify](https://app.netlify.com/), selecting your site > Site Settings > Build & deploy > Environment > Edit variables and changing the value of MAPBOX_ACCESS_TOKEN

<br>

#### Symptom: The media are not displaying correctly
#### Potential solutions:
- Ensure the media files are named by their UAR


Disclaimer: We won't be able to troubleshoot with all Codec users directly. We encourage researchers who come up against hurdles to create an issue on this repository, tag it with the **'user help needed'** label, and help one another out.

***

## Contributing

If you are interested in contributing, thank you! Please take a look at the issues for bugs, enhancements etc to see what would be most helpful. Then fork the repo, create a pull request and we will integrate as soon as possible. Examples of useful contributions include: synced media playback, display of images and other media types, flexibility to use other spreadsheet sources such as Excel or OneDrive.

### Millisecond precision

Use `YYYY-MM-DDTHH:mm:ss.SSS` for timeline bounds, media `Start` values, and event timestamps. Keep timestamps without a timezone suffix to preserve the platform?s existing clock-time convention. Whole-second timestamps remain supported. The event timestamp header is `Datetime (yyyy-mm-dd hh:mm:ss.sss)`; the older header without `.sss` also works. Video durations are rounded to the nearest millisecond for display and timeline placement.

### Synchronized feeds

Open feeds by selecting their timeline items, then use **Play feeds / Pause feeds** above the videos. All open videos follow a shared clock using their `Start` timestamps: a feed starting at `09:00:00.125` seeks to `5.000` seconds when the shared time is `09:00:05.125`. Drag or zoom the timeline to seek to the center of its window, or drag the red time marker. The marker follows the shared clock during playback.

Feeds show ?No footage at this time? outside their recording window. Newly opened feeds join the current time. Playback stops at the configured timeline end or when all feeds are closed. Videos stay muted and use the shared controls. A buffering feed catches up to the shared time when it can; other feeds continue. Drift correction is approximate (150 ms tolerance), not frame-accurate synchronization.

The red marker moves freely by default. Hold **Shift** while dragging the marker or timeline to snap to whole seconds. Playback updates on browser animation frames for smoother marker motion.

### Editing timeline alignment

Run `npm run dev` and open **http://localhost:8080**. The development build starts the local Node server; after a build, `npm start` serves the same editor. Restart an already-running development server after updating this version.

- Click **Edit timeline** to pause playback and enable dragging.
- Drag a video horizontally to move its start and end together, preserving its file duration. Drag an event marker to change its timestamp. Hold **Shift** to snap to whole seconds.
- Choose a record in the editor to enter a timestamp with milliseconds or nudge it by 1, 10, or 100 ms.
- **Undo / Redo** tracks each completed drag or applied timestamp change. Up to 100 changes are retained.
- **Finish editing** lets you preview synchronized playback using the draft without saving it.
- **Save** writes timestamps directly to `public/data/media.json` and `public/data/events.json`. No export is needed.
- **Discard** reloads the current files from disk and clears draft history.

Unsaved drafts and their history are stored in this browser's local storage and restored after reload. Automatic refresh does not replace an active draft. Keep the same browser profile and localhost address to recover your draft. If browser storage is unavailable, the editor shows a warning and the draft remains in memory.

Save checks the file revision and refuses to overwrite external changes. Failed saves keep the draft. The local server validates the JSON table structure and timestamps, stages file replacements, and uses a recovery journal to roll back incomplete two-file saves. It listens on all IPv4 interfaces, matching the original development server, so you can also use `http://<your-Tailscale-IP>:8080`. Host validation accepts localhost and the interface IP used for the connection; saves retain same-origin checks. Devices that can reach this server can edit project media and events data. Set `HOST=127.0.0.1` to restrict it to localhost. Static/Netlify deployments can display data and hold drafts, but writing project files requires this local server.

Run `npm test` for the editor persistence, save endpoint, and playback tests. The Node server and tests require a modern Node version (Node 18 or later) and add no runtime dependencies.

### Playback inspection

The shared controls offer 0.25x, 0.5x, 1x, 1.5x, 2x, and 4x playback, plus **-1 sec / +1 sec** seeking. Speed changes preserve the current position and apply to every open video.

Each video shows its presented frame's source-relative timecode when the browser supports video frame callbacks; otherwise it shows an approximate playback time. Enter that source's **FPS for stepping** to enable **Previous frame / Next frame** and a one-based approximate frame number. An optional `FPS` column in `media.json` supplies the initial value; changing the FPS input only affects the open player and is not saved to the file.

Frame stepping pauses the shared clock and aligns all feeds to a point inside the neighboring frame of the chosen source. This is FPS-based time seeking, not guaranteed frame-accurate decoding; variable-frame-rate files or incorrect FPS values may repeat or skip frames. No frame rate is assumed when it is unknown.

### JSON text editor

Click **Edit JSON** in the timeline controls and choose `media.json` or `events.json`. The plain text area supports changing fields and adding or removing records. Keep the existing array-of-rows structure, with column names in the first row and unique media UAR values.

**Apply JSON** validates both pending text buffers and updates the browser draft as one undoable change. **Save** also applies pending text before writing the files. Invalid JSON is never applied or saved; the editor displays an error and retains your text. **Reset text** removes only unapplied text; **Discard** reloads saved files and clears both text and draft changes. Incomplete text also survives refresh and reload in browser storage. Timeline dragging and draft Undo/Redo are disabled while text is unapplied; use the text area's normal undo while typing.
