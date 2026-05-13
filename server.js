const http = require("http");
const fs = require("fs");
const path = require("path");

const OWNER = "majidmohamed@microsoft.com";
const PUBLIC = path.join(__dirname, "public");
const PUBLIC_RESOLVED = path.resolve(PUBLIC);
const ACL_PATH = path.join(__dirname, "acl.json");
const HOST = process.env.HOST || "0.0.0.0";
const PORT = process.env.PORT || 8080;

function loadAcl() {
  try { return JSON.parse(fs.readFileSync(ACL_PATH, "utf8")); }
  catch { return {}; }
}

function getEmail(req) {
  const header = req.headers["x-ms-client-principal"];
  if (!header) return null;
  try {
    const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    const claim = decoded.claims?.find(
      (e) => e.typ === "preferred_username"
        || e.typ === "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
        || e.typ === "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"
    );
    return (claim?.val || decoded.name_typ || "").toLowerCase();
  } catch { return null; }
}

function mimeType(ext) {
  return ({
    ".html":"text/html",".css":"text/css",".js":"application/javascript",
    ".json":"application/json",".png":"image/png",".jpg":"image/jpeg",
    ".svg":"image/svg+xml",".ico":"image/x-icon",
  })[ext] || "application/octet-stream";
}

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
  "Vary": "Cookie, Authorization, x-ms-client-principal",
  "X-Content-Type-Options": "nosniff",
};
const CLEAR_SENSITIVE_CLIENT_STATE_HEADERS = {
  ...PRIVATE_NO_STORE_HEADERS,
  "Clear-Site-Data": '"cache", "storage"',
};

function serveFile(res, filePath, status = 200, extra = {}) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(status, { "Content-Type": mimeType(path.extname(filePath)), ...extra });
    res.end(data);
  });
}

function isPathInside(base, candidate) {
  const b = path.resolve(base), c = path.resolve(candidate);
  return c === b || c.startsWith(b + path.sep);
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === "/") {
    const email = getEmail(req);
    if (!email) {
      serveFile(res, path.join(PUBLIC, "unauthorized.html"), 403, CLEAR_SENSITIVE_CLIENT_STATE_HEADERS);
      return;
    }
    if (email === OWNER) {
      serveFile(res, path.join(PUBLIC, "index.html"), 200, PRIVATE_NO_STORE_HEADERS);
      return;
    }
    res.writeHead(302, { Location: "https://microsoft.com" });
    res.end();
    return;
  }

  const fileName = pathname.slice(1);
  const filePath = path.join(PUBLIC, fileName);

  if (!isPathInside(PUBLIC_RESOLVED, filePath)) { res.writeHead(400); res.end(); return; }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404); res.end("Not found"); return;
  }

  const email = getEmail(req);
  if (!email) {
    serveFile(res, path.join(PUBLIC, "unauthorized.html"), 403, CLEAR_SENSITIVE_CLIENT_STATE_HEADERS);
    return;
  }

  if (email === OWNER) {
    serveFile(res, filePath, 200, PRIVATE_NO_STORE_HEADERS);
    return;
  }

  const acl = loadAcl();
  const allowed = Array.isArray(acl[fileName])
    ? acl[fileName].map((e) => String(e).toLowerCase())
    : [];

  if (allowed.includes(email) ||
      allowed.some(p => p.startsWith("*@") && email.endsWith(p.slice(1)))) {
    serveFile(res, filePath, 200, PRIVATE_NO_STORE_HEADERS);
    return;
  }

  serveFile(res, path.join(PUBLIC, "unauthorized.html"), 403, CLEAR_SENSITIVE_CLIENT_STATE_HEADERS);
}).listen(PORT, HOST, () => console.log(`Listening on ${HOST}:${PORT}`));
