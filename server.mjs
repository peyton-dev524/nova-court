import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createServer } from "node:http";

const root = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const port = Number(process.env.PORT || 4174);
const mime = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".mp3": "audio/mpeg", ".woff2": "font/woff2"
};

createServer((req, res) => {
  const clean = decodeURIComponent((req.url || "/").split("?")[0]);
  const relative = clean === "/" ? "index.html" : clean.replace(/^\/+/, "");
  const file = normalize(join(root, relative));
  if (!file.startsWith(normalize(root))) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const finalPath = statSync(file).isDirectory() ? join(file, "index.html") : file;
    res.writeHead(200, {
      "Content-Type": mime[extname(finalPath)] || "application/octet-stream",
      "Cache-Control": [".html", ".js", ".css"].includes(extname(finalPath)) ? "no-cache" : "public, max-age=3600"
    });
    createReadStream(finalPath).pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`NOVA COURT ready at http://127.0.0.1:${port}/`);
});
