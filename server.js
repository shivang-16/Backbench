const http = require("http");
const fs = require("fs");
const path = require("path");
const { handle } = require("./lib/app");

const PORT = Number(process.env.PORT) || 3000;
const indexHtml = fs.readFileSync(path.join(__dirname, "public", "index.html"));
const adminHtml = fs.readFileSync(path.join(__dirname, "public", "admin.html"));
const pages = {
  "/": indexHtml,
  "/index.html": indexHtml,
  "/admin": adminHtml,
  "/admin.html": adminHtml,
};

const server = http.createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];
  const page = pages[url];
  if (req.method === "GET" && page) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(page);
    return;
  }
  return handle(req, res);
});

server.listen(PORT);
