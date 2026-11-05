// files.klaska.net — serves the R2 bucket as a static file host with
// Apache-style directory listings. Object keys equal URL paths without the
// leading slash, so https://files.klaska.net/cvut/readme.txt -> "cvut/readme.txt".

const FILE_CACHE = "public, max-age=86400";
const LISTING_CACHE = "public, max-age=300";

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    const url = new URL(request.url);
    let key;
    try {
      key = decodeURIComponent(url.pathname).slice(1);
    } catch {
      // Not valid UTF-8: the old Apache host linked a few files whose names were
      // stored in Windows-1250. Their keys are UTF-8 now, so redirect old links.
      const legacy = decodeWindows1250(url.pathname);
      if (legacy === null || (await env.BUCKET.head(legacy.slice(1))) === null) return notFound();
      return Response.redirect(url.origin + encodePath(legacy) + url.search, 301);
    }
    if (key.split("/").some((seg) => seg === "." || seg === "..")) return notFound();

    if (key === "" || key.endsWith("/")) return listing(env, key, url.pathname, request.method);
    return file(env, key, url, request);
  },
};

async function file(env, key, url, request) {
  let object;
  try {
    object = await env.BUCKET.get(key, { onlyIf: request.headers, range: request.headers });
  } catch (err) {
    // R2 rejects ranges past the end of the object.
    if (request.headers.has("Range")) return new Response(null, { status: 416 });
    throw err;
  }

  if (object === null) {
    // "dir" without trailing slash -> redirect like Apache's mod_dir.
    const probe = await env.BUCKET.list({ prefix: key + "/", limit: 1 });
    if (probe.objects.length || probe.delimitedPrefixes.length) {
      return Response.redirect(url.origin + url.pathname + "/" + url.search, 301);
    }
    return notFound();
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Last-Modified", lastModified(object).toUTCString());
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", FILE_CACHE);
  headers.set("X-Content-Type-Options", "nosniff");
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/octet-stream");

  // Preconditions failed: R2 returns metadata without a body.
  if (!("body" in object)) {
    const status = request.headers.has("If-None-Match") || request.headers.has("If-Modified-Since") ? 304 : 412;
    return new Response(null, { status, headers });
  }

  let status = 200;
  const range = parseRange(request.headers.get("Range"), object.size);
  if (range && object.range) {
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${object.size}`);
    headers.set("Content-Length", String(range.end - range.start + 1));
    status = 206;
  } else {
    headers.set("Content-Length", String(object.size));
  }

  return new Response(request.method === "HEAD" ? null : object.body, { status, headers });
}

// Single byte range only ("bytes=a-b", "bytes=a-", "bytes=-n"), same subset R2 serves.
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "");
  if (!m || (m[1] === "" && m[2] === "")) return null;
  if (m[1] === "") {
    const n = Math.min(Number(m[2]), size);
    return { start: size - n, end: size - 1 };
  }
  const start = Number(m[1]);
  const end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  return start <= end ? { start, end } : null;
}

async function listing(env, prefix, path, method) {
  const dirs = [];
  const files = [];
  let cursor;
  do {
    const page = await env.BUCKET.list({ prefix, delimiter: "/", cursor, include: ["customMetadata"] });
    dirs.push(...page.delimitedPrefixes);
    files.push(...page.objects.filter((o) => o.key !== prefix));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  if (prefix !== "" && dirs.length === 0 && files.length === 0) return notFound();

  const rows = [];
  if (prefix !== "") rows.push(row("../", "Parent Directory", "", "-", true));
  for (const d of dirs) {
    const name = d.slice(prefix.length);
    rows.push(row(encodePath(name), name, "", "-", true));
  }
  for (const o of files) {
    const name = o.key.slice(prefix.length);
    rows.push(row(encodePath(name), name, formatDate(lastModified(o)), formatSize(o.size), false));
  }

  const title = `Index of ${escapeHtml(decodeURIComponent(path))}`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
:root { color-scheme: light dark; --fg:#1a1a1a; --bg:#fff; --muted:#666; --line:#ddd; --link:#0645ad; }
@media (prefers-color-scheme: dark) { :root { --fg:#e6e6e6; --bg:#141414; --muted:#999; --line:#333; --link:#8ab4f8; } }
body { font: 15px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--fg); background: var(--bg); margin: 0; padding: 16px; }
h1 { font-size: 1.25rem; font-weight: 600; margin: 0 0 12px; word-break: break-all; }
table { border-collapse: collapse; width: 100%; max-width: 960px; }
th, td { text-align: left; padding: 3px 12px 3px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-weight: 400; }
td.n { word-break: break-all; }
td.m, td.s, th.m, th.s { white-space: nowrap; }
td.s, th.s { text-align: right; padding-right: 0; }
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }
@media (max-width: 600px) { td.m, th.m { display: none; } }
</style>
</head>
<body>
<h1>${title}</h1>
<table>
<thead><tr><th class="n">Name</th><th class="m">Last modified</th><th class="s">Size</th></tr></thead>
<tbody>
${rows.join("\n")}
</tbody>
</table>
</body>
</html>`;

  return new Response(method === "HEAD" ? null : html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": LISTING_CACHE,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function row(href, name, date, size, isDir) {
  return `<tr><td class="n"><a href="${escapeHtml(href)}">${escapeHtml(name)}</a></td><td class="m">${date}</td><td class="s">${size}</td></tr>`;
}

// rclone stores the original file mtime as custom metadata "mtime" (unix seconds).
function lastModified(object) {
  const mtime = Number(object.customMetadata?.mtime);
  return Number.isFinite(mtime) && mtime > 0 ? new Date(mtime * 1000) : object.uploaded;
}

function decodeWindows1250(pathname) {
  const bytes = [];
  for (let i = 0; i < pathname.length; i++) {
    if (pathname[i] === "%" && /^[0-9a-fA-F]{2}$/.test(pathname.slice(i + 1, i + 3))) {
      bytes.push(parseInt(pathname.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(pathname.charCodeAt(i) & 0xff);
    }
  }
  try {
    return new TextDecoder("windows-1250", { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

function encodePath(name) {
  return name.split("/").map(encodeURIComponent).join("/");
}

// Same format and timezone as the old Apache listing: "2023-11-25 15:38", Prague time.
const DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function formatDate(d) {
  const p = Object.fromEntries(DATE_FORMAT.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

function formatSize(bytes) {
  if (bytes < 1024) return String(bytes);
  const units = ["K", "M", "G", "T"];
  let v = bytes;
  let i = -1;
  do {
    v /= 1024;
    i++;
  } while (v >= 1024 && i < units.length - 1);
  return (v < 10 ? v.toFixed(1) : Math.round(v)) + units[i];
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function notFound() {
  return new Response("404 Not Found\n", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
