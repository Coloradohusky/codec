function validate_files(files, config) {
  if (!files || Object.keys(files).sort().join() !== "events,media") throw new Error("Expected media and events data.");
  for (const name of ["media", "events"]) {
    const rows = files[name];
    if (!Array.isArray(rows) || !Array.isArray(rows[0]) || !rows[0].length) throw new Error(`${name}.json needs a header row.`);
    const headers = rows[0];
    if (headers.some((value) => typeof value !== "string" || !value.trim() || ["__proto__", "constructor", "prototype"].includes(value)) || new Set(headers.map((value) => value.toLowerCase())).size !== headers.length) throw new Error(`${name}.json needs unique, nonempty column names.`);
    const timestamp = name === "media"
      ? headers.indexOf(config["Title of column used for chronolocation"] || "Start")
      : headers.findIndex((title) => /^datetime \(yyyy-mm-dd hh:mm:ss(?:\.sss)?\)$/i.test(title));
    const id = headers.indexOf("UAR");
    if (timestamp < 0 || (name === "media" && (id < 0 || !headers.includes(config["Title of column used for url"] || "URL"))) || (name === "events" && !headers.some((title) => title.toLowerCase() === "event"))) throw new Error(`${name}.json is missing required columns.`);
    const ids = new Set();
    for (let index = 1; index < rows.length; index++) {
      const row = rows[index];
      if (!Array.isArray(row) || row.length !== headers.length || row.some((value) => value !== null && !["string", "number", "boolean"].includes(typeof value))) throw new Error(`${name}.json row ${index + 1} must match the header and contain simple values.`);
      if (name === "media") {
        if (typeof row[id] !== "string" || !row[id].trim() || ids.has(row[id]) || ["__proto__", "constructor", "prototype"].includes(row[id])) throw new Error("Media UAR values must be unique, nonempty strings.");
        ids.add(row[id]);
        const url = row[headers.indexOf(config["Title of column used for url"] || "URL")];
        if (typeof url !== "string") throw new Error("Media URLs must be strings.");
        if (row[timestamp] === "" || row[timestamp] === null) continue;
      }
      const value = row[timestamp];
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{3})?$/.test(value)) throw new Error(`${name}.json row ${index + 1} needs a timestamp such as 2001-09-11T09:00:00.125.`);
      const normalized = value.replace(" ", "T") + (value.includes(".") ? "" : ".000") + "Z";
      const date = new Date(normalized);
      if (!Number.isFinite(+date) || date.toISOString() !== normalized) throw new Error(`${name}.json row ${index + 1} has an invalid date.`);
    }
  }
}
module.exports = { validate_files };
