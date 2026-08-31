const express = require("express");

const app = express();
app.use(express.json({ limit: "100kb" }));

const PORT = process.env.PORT || 10000;
const VERSION = "1.0.0";

function detectPlatform(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");

    if (host === "youtu.be" || host.endsWith("youtube.com")) {
      return u.pathname.toLowerCase().startsWith("/shorts/")
        ? "YouTube Shorts"
        : "YouTube";
    }
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "TikTok";
    if (host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.watch") return "Facebook";

    const path = u.pathname.toLowerCase();
    const match = path.match(/\.([a-z0-9]{2,5})$/);
    if (match) {
      const ext = match[1];
      const video = ["mp4", "webm", "mov", "m4v", "mkv", "avi"].includes(ext);
      const audio = ["mp3", "m4a", "wav", "ogg", "oga", "aac", "flac"].includes(ext);
      if (video || audio) return "Direct Media URL";
    }
    return "Other URL";
  } catch {
    return "Invalid URL";
  }
}

function isDirectMediaUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const path = u.pathname.toLowerCase();
    return /\.(mp4|webm|mov|m4v|mkv|avi|mp3|m4a|wav|ogg|oga|aac|flac)$/.test(path);
  } catch {
    return false;
  }
}

app.get("/", (_req, res) => {
  res.json({
    service: "GUNAKU Media Backend",
    status: "OK",
    version: VERSION,
    message: "GUNAKU API ONLINE"
  });
});

app.get("/api/status", (_req, res) => {
  res.json({
    service: "GUNAKU Media Backend",
    status: "OK",
    version: VERSION
  });
});

app.post("/api/check", (req, res) => {
  const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";

  if (!url) {
    return res.status(400).json({
      ok: false,
      error: "URL wajib diisi."
    });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({
      ok: false,
      error: "URL tidak valid."
    });
  }

  const platform = detectPlatform(url);
  const direct = isDirectMediaUrl(url);

  res.json({
    ok: true,
    platform,
    directMedia: direct,
    downloadAvailable: direct,
    message: direct
      ? "Direct media URL terdeteksi. File dapat dicoba diunduh jika server sumber mengizinkannya."
      : "URL platform terdeteksi. Backend awal ini tidak mengambil atau membypass media publik dari platform sosial."
  });
});

app.get("/api/download", (req, res) => {
  const url = typeof req.query.url === "string" ? req.query.url.trim() : "";

  if (!url || !isDirectMediaUrl(url)) {
    return res.status(400).json({
      ok: false,
      error: "Endpoint download tahap awal hanya menerima Direct Media URL yang berakhiran format media yang didukung."
    });
  }

  // Redirect to the original media URL. The browser/server source decides
  // whether the resource is actually downloadable.
  return res.redirect(302, url);
});

app.use((_req, res) => {
  res.status(404).json({
    ok: false,
    error: "Endpoint tidak ditemukan."
  });
});

app.listen(PORT, () => {
  console.log(`GUNAKU API ONLINE pada port ${PORT}`);
});