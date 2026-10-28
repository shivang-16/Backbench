const http = require("http");
const fs = require("fs");
const path = require("path");
const { handle } = require("./lib/app");

const PORT = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, "public");
const pages = {
  "/": "index.html",
  "/index.html": "index.html",
  "/admin": "admin.html",
  "/admin.html": "admin.html",
};

const server = http.createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];
  if (req.method === "GET" && pages[url]) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(fs.readFileSync(path.join(publicDir, pages[url])));
    return;
  }
  return handle(req, res);
});

server.listen(PORT, () => {
  console.log(`Backbench listening on http://localhost:${PORT}`);
});
