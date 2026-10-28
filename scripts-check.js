const { Readable } = require("stream");
const { handle } = require("./lib/app");

function mock(method, url, body, cookie) {
  const req = new Readable({ read() {} });
  req.method = method;
  req.headers = cookie ? { cookie } : {};
  req.query = { path: url.replace(/^\/api\//, "").split("/") };
  req.url = "/";
  let status;
  let headers;
  let raw = "";
  const res = {
    writeHead(code, value) {
      status = code;
      headers = value;
    },
    end(chunk) {
      raw = chunk;
    },
  };
  const done = handle(req, res);
  if (body) req.push(JSON.stringify(body));
  req.push(null);
  return done.then(() => ({ status, headers, body: raw ? JSON.parse(raw) : null }));
}

(async () => {
  const bad = await mock("POST", "/api/admin/login", { password: "nope" });
  const good = await mock("POST", "/api/admin/login", { password: "backbench" });
  const cookie = good.headers["Set-Cookie"].split(";")[0];
  const denied = await mock("GET", "/api/admin/stories");
  const created = await mock("POST", "/api/stories", {
    topic: "Something else",
    who: "College student",
    story: "Vercel deploy check story. Please ignore this temporary row.",
    followed: true,
  });
  const list = await mock("GET", "/api/admin/stories", null, cookie);
  console.log(JSON.stringify({
    bad: bad.status,
    good: good.status,
    denied: denied.status,
    created: created.status,
    id: created.body.id,
    list: list.status,
    newest: list.body.stories[0] && list.body.stories[0].topic,
  }));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
