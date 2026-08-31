const express = require("express");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");

const app = express();
app.use((req, res, next) => {
  const origin = req.headers.origin;

  const allowedOrigins = [
    "https://www.gunaku.fun",
    "https://gunaku.fun"
  ];

  if (!origin || allowedOrigins.includes(origin)) {
    res.setHeader(
      "Access-Control-Allow-Origin",
      origin || "*"
    );
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  res.setHeader(
    "Access-Control-Max-Age",
    "86400"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});
app.use(express.json({ limit: "100kb" }));

const PORT = process.env.PORT || 10000;
const VERSION = "2.0.0";
const MAX_DOWNLOAD_MB = Number(process.env.MAX_DOWNLOAD_MB || 300);
const MAX_DOWNLOAD_BYTES = MAX_DOWNLOAD_MB * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = Number(process.env.DOWNLOAD_TIMEOUT_MS || 180000);
const TMP_DIR = path.join(os.tmpdir(), "gunaku-media");
fs.mkdirSync(TMP_DIR, { recursive: true });

const ALLOWED_HOSTS = ["youtube.com", "youtu.be", "tiktok.com", "facebook.com", "fb.watch"];
const DIRECT_EXTENSIONS = new Set(["mp4","webm","mov","m4v","mkv","avi","mp3","m4a","wav","ogg","oga","aac","flac"]);

function detectPlatform(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com"))
      return u.pathname.toLowerCase().startsWith("/shorts/") ? "YouTube Shorts" : "YouTube";
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "TikTok";
    if (host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.watch") return "Facebook";
    const ext = path.posix.extname(u.pathname).slice(1).toLowerCase();
    if (DIRECT_EXTENSIONS.has(ext)) return "Direct Media URL";
    return "Other URL";
  } catch { return "Invalid URL"; }
}

function isDirectMediaUrl(rawUrl) {
  try {
    const ext = path.posix.extname(new URL(rawUrl).pathname).slice(1).toLowerCase();
    return DIRECT_EXTENSIONS.has(ext);
  } catch { return false; }
}

function isAllowedPlatformUrl(rawUrl) {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
    return ALLOWED_HOSTS.some(h => host === h || host.endsWith("." + h));
  } catch { return false; }
}

function safeFilename(name) {
  return String(name || "gunaku-media")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ").trim().slice(0, 160) || "gunaku-media";
}

function runYtDlp(args, outputDir) {
  return new Promise((resolve, reject) => {
    const child = spawn("yt-dlp", args, { cwd: outputDir, stdio: ["ignore","pipe","pipe"] });
    let stdout = "", stderr = "", finished = false;
    const timer = setTimeout(() => {
      if (!finished) { child.kill("SIGKILL"); reject(new Error("Proses download melebihi batas waktu.")); }
    }, DOWNLOAD_TIMEOUT_MS);
    child.stdout.on("data", d => stdout += d.toString());
    child.stderr.on("data", d => stderr += d.toString());
    child.on("error", err => { clearTimeout(timer); if (!finished) { finished = true; reject(err); } });
    child.on("close", code => {
      clearTimeout(timer);
      if (finished) return;
      finished = true;
      if (code === 0) resolve({stdout, stderr});
      else reject(new Error((stderr || stdout || `yt-dlp keluar dengan kode ${code}`).trim()));
    });
  });
}

async function findDownloadedFile(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const p = path.join(dir, e.name);
    const st = await fsp.stat(p);
    if (st.size > 0) files.push({path:p, size:st.size, name:e.name});
  }
  files.sort((a,b) => b.size - a.size);
  return files[0] || null;
}

async function cleanupDir(dir) {
  try { await fsp.rm(dir, {recursive:true, force:true}); } catch {}
}

app.get("/", (_req,res) => res.json({
  service:"GUNAKU Media Backend", status:"OK", version:VERSION, message:"GUNAKU API ONLINE"
}));

app.get("/api/status", (_req,res) => res.json({
  service:"GUNAKU Media Backend", status:"OK", version:VERSION, downloader:"yt-dlp + ffmpeg"
}));

app.post("/api/check", (req,res) => {
  const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  if (!url) return res.status(400).json({ok:false,error:"URL wajib diisi."});
  try { new URL(url); } catch { return res.status(400).json({ok:false,error:"URL tidak valid."}); }
  const platform = detectPlatform(url);
  const direct = isDirectMediaUrl(url);
  const allowed = isAllowedPlatformUrl(url);
  res.json({
    ok:true, platform, directMedia:direct, downloadAvailable:direct || allowed,
    message: direct ? "Direct media URL terdeteksi."
      : allowed ? "URL platform didukung untuk percobaan pengambilan media."
      : "URL ini tidak termasuk platform yang didukung."
  });
});

app.post("/api/download", async (req,res) => {
  const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  const format = req.body?.format === "mp3" ? "mp3" : "mp4";
  if (!url) return res.status(400).json({ok:false,error:"URL wajib diisi."});
  try { new URL(url); } catch { return res.status(400).json({ok:false,error:"URL tidak valid."}); }

  const direct = isDirectMediaUrl(url);
  const allowed = isAllowedPlatformUrl(url);
  if (!direct && !allowed) return res.status(400).json({
    ok:false,error:"URL tidak didukung. Gunakan YouTube, Shorts, TikTok, Facebook, atau URL file media langsung."
  });

  if (direct) return res.json({
    ok:true, type:"direct", url,
    format:path.posix.extname(new URL(url).pathname).slice(1).toLowerCase()
  });

  const jobDir = path.join(TMP_DIR, crypto.randomUUID());
  await fsp.mkdir(jobDir, {recursive:true});
  try {
    const outputTemplate = path.join(jobDir, "%(title).120B [GUNAKU].%(ext)s");
    const common = ["--no-playlist","--restrict-filenames","--max-filesize",`${MAX_DOWNLOAD_MB}M`,"--no-warnings","--newline"];
    const args = [...common];

    if (format === "mp3") {
      args.push("-x","--audio-format","mp3","--audio-quality","192K","-o",outputTemplate,url);
    } else {
      args.push("-f","bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best","--merge-output-format","mp4","-o",outputTemplate,url);
    }

    await runYtDlp(args, jobDir);
    const file = await findDownloadedFile(jobDir);
    if (!file) throw new Error("File hasil download tidak ditemukan.");
    if (file.size > MAX_DOWNLOAD_BYTES) throw new Error(`Ukuran file melebihi batas ${MAX_DOWNLOAD_MB} MB.`);

    const ext = path.extname(file.name).toLowerCase();
    const contentType = format === "mp3" ? "audio/mpeg" : (ext === ".webm" ? "video/webm" : "video/mp4");
    const downloadName = safeFilename(path.basename(file.name,ext)) + ext;

    res.status(200);
    res.setHeader("Content-Type",contentType);
    res.setHeader("Content-Length",file.size);
    res.setHeader("Content-Disposition",`attachment; filename="${downloadName}"`);
    res.setHeader("X-GUNAKU-Version",VERSION);

    const stream = fs.createReadStream(file.path);
    stream.on("error", async () => { await cleanupDir(jobDir); if (!res.headersSent) res.status(500).json({ok:false,error:"Gagal membaca file hasil."}); });
    stream.on("close", () => cleanupDir(jobDir));
    stream.pipe(res);
  } catch (err) {
    await cleanupDir(jobDir);
    console.error("Download error:",err.message);
    return res.status(500).json({ok:false,error:"Download gagal diproses.",detail:err.message.slice(0,500)});
  }
});

app.use((_req,res) => res.status(404).json({ok:false,error:"Endpoint tidak ditemukan."}));
app.listen(PORT, () => console.log(`GUNAKU API ONLINE pada port ${PORT}`));
