const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function allowed_host(host, address, port) {
  // Accept the interface used for this connection, including Tailscale.
  address = address.replace(/^::ffff:/, "");
  const interface_host = address.includes(":") ? `[${address}]` : address;
  return [`localhost:${port}`, `127.0.0.1:${port}`, `${interface_host}:${port}`].includes(host);
}

function create_editor_server(root = path.resolve(__dirname, "..")) {
  const public_dir = path.join(root, "public");
  const data_dir = path.join(public_dir, "data");
  const journal = path.join(root, ".codec-save-journal.json");
  const names = ["media", "events"];
  const file = (name) => path.join(data_dir, `${name}.json`);
  const fail = (status, message) => Object.assign(new Error(message), { status });

  function replace(name, text) {
    const temporary = `${file(name)}.tmp`;
    fs.writeFileSync(temporary, text, { flag: "w" });
    fs.renameSync(temporary, file(name));
  }

  // An interrupted two-file save is rolled back before serving data again.
  function recover() {
    if (!fs.existsSync(journal)) return;
    const original = JSON.parse(fs.readFileSync(journal, "utf8"));
    for (const name of names) replace(name, original[name]);
    fs.unlinkSync(journal);
  }
  recover();

  function snapshot() {
    const original = Object.fromEntries(names.map((name) => [name, fs.readFileSync(file(name), "utf8")]));
    const config = fs.readFileSync(path.join(data_dir, "platformconfig.json"), "utf8");
    const revision = crypto.createHash("sha256").update(JSON.stringify([original, config])).digest("hex");
    return {
      original, config: JSON.parse(config),
      data: { revision, files: Object.fromEntries(names.map((name) => [name, JSON.parse(original[name])])) },
    };
  }

  function valid_timestamp(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/.test(value)) return false;
    const time = new Date(`${value}Z`);
    return Number.isFinite(+time) && time.toISOString() === `${value}Z`;
  }

  function save(body) {
    const current = snapshot();
    if (body.revision !== current.data.revision) throw fail(409, "Files changed on disk. Your draft is intact. Discard it to load the latest files before editing again.");
    if (!body.files || Object.keys(body.files).sort().join() !== "events,media") throw fail(400, "Expected media and events data.");
    for (const name of names) {
      const before = current.data.files[name];
      const after = body.files[name];
      const column = name === "media"
        ? before[0].indexOf(current.config["Title of column used for chronolocation"])
        : before[0].findIndex((title) => /^datetime \(yyyy-mm-dd hh:mm:ss(?:\.sss)?\)$/i.test(title));
      if (column < 0 || !Array.isArray(after) || after.length !== before.length || JSON.stringify(after[0]) !== JSON.stringify(before[0])) throw fail(400, "The editor can only change existing timestamps.");
      for (let row = 1; row < before.length; row++) {
        if (!Array.isArray(after[row]) || after[row].length !== before[row].length) throw fail(400, "Invalid row.");
        for (let cell = 0; cell < before[row].length; cell++) {
          if (JSON.stringify(after[row][cell]) === JSON.stringify(before[row][cell])) continue;
          if (cell !== column || !valid_timestamp(after[row][cell])) throw fail(400, "Only valid timestamp changes are allowed.");
        }
      }
    }
    fs.writeFileSync(journal, JSON.stringify(current.original), { flag: "wx" });
    try {
      for (const name of names) {
        if (JSON.stringify(body.files[name]) !== JSON.stringify(current.data.files[name])) {
          replace(name, `${JSON.stringify(body.files[name], null, 2)}\n`);
        }
      }
      const result = snapshot().data;
      fs.unlinkSync(journal);
      return result;
    } catch (error) {
      recover();
      throw error;
    }
  }

  const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon" };
  return http.createServer(async (req, res) => {
    const started = performance.now();
    res.once("finish", () => {
      const elapsed = (performance.now() - started).toFixed(1);
      console.log(`${req.method} ${req.url} ${res.statusCode} ${elapsed} ms`);
    });

    const json = (status, value) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(value));
    };
    try {
      const port = req.socket.localPort;
      if (!allowed_host(req.headers.host, req.socket.localAddress, port)) throw fail(403, "Use localhost or this machine?s interface IP to access the editor.");
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === "/api/data") {
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) throw fail(403, "Cross-origin requests are not allowed.");
        if (req.method === "GET") return json(200, snapshot().data);
        if (req.method !== "PUT") throw fail(405, "Method not allowed.");
        if (req.headers["content-type"]?.split(";")[0] !== "application/json") throw fail(415, "Send JSON data.");
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 5 * 1024 * 1024) throw fail(413, "Draft is too large.");
          chunks.push(chunk);
        }
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
        catch { throw fail(400, "Invalid JSON."); }
        if (!body || typeof body !== "object") throw fail(400, "Invalid draft.");
        return json(200, save(body));
      }
      if (!["GET", "HEAD"].includes(req.method)) throw fail(405, "Method not allowed.");
      const pathname = decodeURIComponent(url.pathname);
      const target = path.resolve(public_dir, `.${pathname === "/" ? "/index.html" : pathname}`);
      const relative = path.relative(public_dir, target);
      if (relative.startsWith("..") || path.isAbsolute(relative) || relative.split(/[\\/]/).some((part) => part.startsWith(".")) || target.endsWith(".tmp")) throw fail(403, "Forbidden path.");
      const content = fs.readFileSync(target);
      res.writeHead(200, { "Content-Type": mime[path.extname(target)] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch (error) {
      json(error.status || (error.code === "ENOENT" ? 404 : 500), { error: error.status ? error.message : "Could not read or save project files." });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || "0.0.0.0";
  create_editor_server().listen(port, host, () => console.log(`Codec: http://localhost:${port} (listening on ${host})`));
}
module.exports = { create_editor_server, allowed_host };
