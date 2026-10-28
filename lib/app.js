require("dotenv").config();
const crypto = require("crypto");
const { MongoClient, ObjectId } = require("mongodb");

const COLLECTION = "backbench_stories";
const ADMIN_PASSWORD = "backbench";
const TOPICS = [
  "Relationships, crushes and breakups",
  "Friendships and social life",
  "Studies and personal struggles",
  "Family pressure and expectations",
  "Something else",
];
const WHOS = [
  "JEE aspirant",
  "NEET aspirant",
  "College student",
  "School student",
  "Board exams",
  "Other competitive exam",
];

let clientPromise;

function getStories() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is missing");
  if (!clientPromise) {
    clientPromise = new MongoClient(process.env.MONGO_URI, { maxPoolSize: 1 }).connect();
  }
  return clientPromise.then((client) => client.db().collection(COLLECTION));
}

function send(res, status, body, extraHeaders) {
  const headers = { "Content-Type": "application/json; charset=utf-8", ...extraHeaders };
  if (typeof res.status === "function" && typeof res.json === "function") {
    Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
    res.status(status).json(body);
    return;
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key) out[key] = decodeURIComponent(rest.join("="));
  }
  return out;
}

function adminToken() {
  return crypto.createHmac("sha256", ADMIN_PASSWORD).update("backbench-admin").digest("hex");
}

function passwordOk(input) {
  const given = Buffer.from(String(input));
  const expected = Buffer.from(ADMIN_PASSWORD);
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(given, expected);
}

function isAdmin(req) {
  const given = Buffer.from(cookies(req).admin || "");
  const expected = Buffer.from(adminToken());
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(given, expected);
}

function requestPath(req) {
  const fromUrl = (req.url || "").split("?")[0];
  if (fromUrl.startsWith("/api/")) return fromUrl;
  const raw = req.query && req.query.path;
  if (Array.isArray(raw) && raw.length) return "/api/" + raw.join("/");
  if (typeof raw === "string" && raw) return "/api/" + raw;
  return fromUrl || "/";
}

function readJson(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === "string") {
    try {
      return Promise.resolve(JSON.parse(req.body || "{}"));
    } catch {
      return Promise.reject(Object.assign(new Error("invalid json"), { status: 400 }));
    }
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 20_000) {
        reject(Object.assign(new Error("too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(Object.assign(new Error("invalid json"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

async function handle(req, res) {
  const url = requestPath(req);

  try {
    if (req.method === "POST" && url === "/api/stories") {
      const body = await readJson(req);
      const topic = typeof body.topic === "string" ? body.topic.trim() : "";
      const story = typeof body.story === "string" ? body.story.trim() : "";
      const who = typeof body.who === "string" ? body.who.trim() : "";
      if (!TOPICS.includes(topic) || !WHOS.includes(who) || story.length < 30 || story.length > 3000 || body.followed !== true) {
        return send(res, 400, { ok: false, error: "Check the story and try again." });
      }
      const now = new Date();
      const stories = await getStories();
      const result = await stories.insertOne({
        topic,
        story,
        who,
        followed: true,
        read: false,
        createdAt: now,
        updatedAt: now,
      });
      return send(res, 201, { ok: true, id: result.insertedId });
    }

    if (req.method === "POST" && url === "/api/admin/login") {
      const body = await readJson(req);
      if (!passwordOk(body.password || "")) return send(res, 401, { ok: false, error: "Wrong password." });
      const secure = process.env.VERCEL ? "; Secure" : "";
      return send(res, 200, { ok: true }, {
        "Set-Cookie": `admin=${adminToken()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure}`,
      });
    }

    if (url.startsWith("/api/admin/") && !isAdmin(req)) {
      return send(res, 401, { ok: false, error: "Sign in required." });
    }

    if (req.method === "GET" && url === "/api/admin/stories") {
      const stories = await getStories();
      const docs = await stories.find().sort({ createdAt: -1 }).toArray();
      return send(res, 200, {
        ok: true,
        stories: docs.map((doc) => ({
          id: String(doc._id),
          topic: doc.topic,
          story: doc.story,
          who: doc.who,
          read: doc.read === true,
          createdAt: doc.createdAt,
        })),
      });
    }

    const storyRoute = url.match(/^\/api\/admin\/stories\/([a-f0-9]{24})$/);
    if (req.method === "POST" && storyRoute) {
      const body = await readJson(req);
      if (typeof body.read !== "boolean") return send(res, 400, { ok: false, error: "read must be true or false." });
      const stories = await getStories();
      const result = await stories.updateOne(
        { _id: new ObjectId(storyRoute[1]) },
        { $set: { read: body.read, updatedAt: new Date() } }
      );
      if (!result.matchedCount) return send(res, 404, { ok: false, error: "Story not found." });
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { ok: false, error: "Not found" });
  } catch (err) {
    const status = err.status || 500;
    return send(res, status, { ok: false, error: status === 500 ? "Something went wrong." : err.message });
  }
}

module.exports = { handle };
