const express = require("express");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");

const app = express();

const allowedOrigins = [
  "https://www.gunaku.fun",
  "https://gunaku.fun"
];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (!origin || allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json({ limit: "100kb" }));

const PORT = Number(process.env.PORT || 10000);
const VERSION = "2.5.0";

const MAX_DOWNLOAD_MB = Number(process.env.MAX_DOWNLOAD_MB || 300);
const MAX_DOWNLOAD_BYTES = MAX_DOWNLOAD_MB * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = Number(process.env.DOWNLOAD_TIMEOUT_MS || 180000);

/*
 * Optional YouTube PO Token Provider.
 * IMPORTANT: no internal Railway hostname is assumed by default.
 * Configure YTDL_POT_PROVIDER_URL only when the provider service really exists.
 */
const YTDL_POT_PROVIDER_URL =
  typeof process.env.YTDL_POT_PROVIDER_URL === "string"
    ? process.env.YTDL_POT_PROVIDER_URL.trim()
    : "";

/*
 * Current yt-dlp guidance recommends the mweb client for YouTube GVS
 * requests when a PO Token Provider is available.
 */
const YTDL_YOUTUBE_PLAYER_CLIENT =
  typeof process.env.YTDL_YOUTUBE_PLAYER_CLIENT === "string" &&
  process.env.YTDL_YOUTUBE_PLAYER_CLIENT.trim()
    ? process.env.YTDL_YOUTUBE_PLAYER_CLIENT.trim()
    : (YTDL_POT_PROVIDER_URL ? "mweb" : "");

const YTDL_JS_RUNTIME =
  typeof process.env.YTDL_JS_RUNTIME === "string" && process.env.YTDL_JS_RUNTIME.trim()
    ? process.env.YTDL_JS_RUNTIME.trim()
    : "node";

/*
 * TikTok mobile API fallback.
 * Current yt-dlp supports mobile API extraction when app_info is supplied.
 * This lets TikTok try the mobile API before its webpage challenge path.
 */
const TIKTOK_API_HOSTNAME =
  typeof process.env.YTDL_TIKTOK_API_HOSTNAME === "string" &&
  process.env.YTDL_TIKTOK_API_HOSTNAME.trim()
    ? process.env.YTDL_TIKTOK_API_HOSTNAME.trim()
    : "api16-normal-c-useast1a.tiktokv.com";

function generateTikTokInstallId() {
  const min = 7250000000000000000n;
  const max = 7325099899999994577n;
  const span = max - min + 1n;
  const random = BigInt("0x" + crypto.randomBytes(8).toString("hex")) % span;
  return String(min + random);
}

const TIKTOK_APP_INFO =
  typeof process.env.YTDL_TIKTOK_APP_INFO === "string" &&
  process.env.YTDL_TIKTOK_APP_INFO.trim()
    ? process.env.YTDL_TIKTOK_APP_INFO.trim()
    : generateTikTokInstallId();

const TMP_DIR = path.join(os.tmpdir(), "gunaku-media");
fs.mkdirSync(TMP_DIR, { recursive: true });

const ALLOWED_HOSTS = [
  "youtube.com",
  "youtu.be",
  "tiktok.com",
  "facebook.com",
  "fb.watch"
];

const DIRECT_EXTENSIONS = new Set([
  "mp4","webm","mov","m4v","mkv","avi",
  "mp3","m4a","wav","ogg","oga","aac","flac"
]);

const RESULT_EXTENSIONS = new Set([
  "mp4","webm","mov","m4v","mkv","avi",
  "mp3","m4a","wav","ogg","oga","aac","flac"
]);

function detectPlatform(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");

    if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")) {
      return u.pathname.toLowerCase().startsWith("/shorts/")
        ? "YouTube Shorts"
        : "YouTube";
    }

    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "TikTok";
    if (host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.watch") {
      return "Facebook";
    }

    const ext = path.posix.extname(u.pathname).slice(1).toLowerCase();
    if (DIRECT_EXTENSIONS.has(ext)) return "Direct Media URL";

    return "Other URL";
  } catch {
    return "Invalid URL";
  }
}

function isDirectMediaUrl(rawUrl) {
  try {
    const ext = path.posix.extname(new URL(rawUrl).pathname).slice(1).toLowerCase();
    return DIRECT_EXTENSIONS.has(ext);
  } catch {
    return false;
  }
}

function isAllowedPlatformUrl(rawUrl) {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
    return ALLOWED_HOSTS.some(h => host === h || host.endsWith("." + h));
  } catch {
    return false;
  }
}

function safeFilename(name) {
  return String(name || "gunaku-media")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160) || "gunaku-media";
}

function sanitizeError(message, rawUrl) {
  let msg = String(message || "Unknown backend error").trim();

  if (rawUrl) {
    msg = msg.split(rawUrl).join("[URL]");
  }

  if (YTDL_POT_PROVIDER_URL) {
    msg = msg.split(YTDL_POT_PROVIDER_URL).join("[PO_TOKEN_PROVIDER]");
  }

  if (/ENOENT|spawn yt-dlp/i.test(msg)) {
    return "yt-dlp tidak tersedia pada server backend.";
  }

  if (/ffmpeg.*not found|ffprobe.*not found|postprocessor.*ffmpeg/i.test(msg)) {
    return "FFmpeg tidak tersedia atau tidak dapat dijalankan pada server backend.";
  }

  if (/no supported javascript runtime|javascript runtime/i.test(msg)) {
    return "Runtime JavaScript yt-dlp tidak siap. Backend harus menggunakan runtime yang didukung.";
  }

  if (/po token|pot provider|bgutil/i.test(msg) && /connect|connection|refused|resolve|unreachable|failed/i.test(msg)) {
    return "PO Token Provider YouTube tidak dapat dihubungi. Periksa konfigurasi YTDL_POT_PROVIDER_URL atau nonaktifkan bila provider memang tidak digunakan.";
  }

  if (/timed? ?out|timeout|exceeded.*time/i.test(msg)) {
    return "Proses download melebihi batas waktu. Coba lagi dengan media yang lebih singkat.";
  }

  if (/403|forbidden/i.test(msg)) {
    return "Sumber media menolak permintaan download (HTTP 403).";
  }

  if (/429|too many requests/i.test(msg)) {
    return "Sumber media membatasi terlalu banyak permintaan. Silakan coba lagi nanti.";
  }

  return msg.slice(0, 800);
}

function runProcess(command, args, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 10000);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finishReject = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    };

    const finishResolve = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      try { child.kill("SIGKILL"); } catch {}
      finishReject(new Error("Proses melebihi batas waktu."));
    }, timeoutMs);

    child.stdout.on("data", d => { stdout += d.toString(); });
    child.stderr.on("data", d => { stderr += d.toString(); });

    child.on("error", finishReject);

    child.on("close", (code, signal) => {
      if (settled) return;

      if (code === 0) {
        finishResolve({ code, signal, stdout, stderr });
        return;
      }

      finishReject(new Error(
        (stderr || stdout || `Perintah keluar dengan kode ${code}${signal ? ` (${signal})` : ""}`).trim()
      ));
    });
  });
}

async function runYtDlp(args, outputDir) {
  return runProcess("yt-dlp", args, {
    cwd: outputDir,
    timeoutMs: DOWNLOAD_TIMEOUT_MS
  });
}

async function getCommandVersion(command, args) {
  try {
    const result = await runProcess(command, args, { timeoutMs: 10000 });
    return (result.stdout || result.stderr || "").trim().split(/\r?\n/)[0] || "unknown";
  } catch (err) {
    return { error: sanitizeError(err.message) };
  }
}

async function checkPotProvider() {
  if (!YTDL_POT_PROVIDER_URL) {
    return {
      configured: false,
      reachable: false,
      httpStatus: null,
      response: null,
      error: null
    };
  }

  const base = YTDL_POT_PROVIDER_URL.replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(base + "/ping", {
      method: "GET",
      headers: {
        "Accept": "text/plain, application/json"
      },
      signal: controller.signal
    });

    let body = "";
    try {
      body = (await response.text()).slice(0, 240);
    } catch {}

    return {
      configured: true,
      reachable: response.ok,
      httpStatus: response.status,
      response: body || null,
      error: null
    };
  } catch (err) {
    return {
      configured: true,
      reachable: false,
      httpStatus: null,
      response: null,
      error: err?.name === "AbortError"
        ? "timeout"
        : String(err?.message || err).slice(0, 240)
    };
  } finally {
    clearTimeout(timer);
  }
}

async function findDownloadedFile(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const e of entries) {
    if (!e.isFile()) continue;

    const ext = path.extname(e.name).slice(1).toLowerCase();
    if (!RESULT_EXTENSIONS.has(ext)) continue;

    const p = path.join(dir, e.name);
    const st = await fsp.stat(p);

    if (st.size > 0) {
      files.push({ path: p, size: st.size, name: e.name, ext });
    }
  }

  files.sort((a, b) => b.size - a.size);
  return files[0] || null;
}

async function cleanupDir(dir) {
  try {
    await fsp.rm(dir, { recursive: true, force: true });
  } catch {}
}

function buildCommonArgs() {
  const args = [
    "--no-playlist",
    "--restrict-filenames",
    "--max-filesize",
    `${MAX_DOWNLOAD_MB}M`,
    "--no-warnings",
    "--newline"
  ];

  /*
   * yt-dlp requires a supported external JS runtime for full YouTube support.
   */
  if (YTDL_JS_RUNTIME) {
    args.push("--js-runtimes", YTDL_JS_RUNTIME);
  }

  /*
   * YouTube: use mweb when the PO Token Provider is configured.
   */
  if (YTDL_YOUTUBE_PLAYER_CLIENT) {
    args.push(
      "--extractor-args",
      `youtube:player_client=${YTDL_YOUTUBE_PLAYER_CLIENT}`
    );
  }

  /*
   * TikTok: prioritize mobile API extraction. Current yt-dlp exposes
   * app_info/api_hostname specifically for this path.
   */
  if (TIKTOK_APP_INFO) {
    args.push(
      "--extractor-args",
      `tiktok:app_info=${TIKTOK_APP_INFO};api_hostname=${TIKTOK_API_HOSTNAME}`
    );
  }

  /*
   * PO Token Provider remains optional for YouTube.
   */
  if (YTDL_POT_PROVIDER_URL) {
    args.push(
      "--extractor-args",
      `youtubepot-bgutilhttp:base_url=${YTDL_POT_PROVIDER_URL}`
    );
  }

  return args;
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
    version: VERSION,
    downloader: "yt-dlp + ffmpeg",
    jsRuntime: YTDL_JS_RUNTIME,
    youtubePlayerClient: YTDL_YOUTUBE_PLAYER_CLIENT || "yt-dlp-default",
    tiktokMobileApiConfigured: Boolean(TIKTOK_APP_INFO),
    tiktokApiHostname: TIKTOK_API_HOSTNAME,
    potProviderConfigured: Boolean(YTDL_POT_PROVIDER_URL)
  });
});

/*
 * Diagnostic endpoint used for deployment verification.
 * It does not expose secrets or the actual PO Token Provider URL.
 */
app.get("/api/diagnostics", async (_req, res) => {
  const [ytDlp, ffmpeg, potProvider] = await Promise.all([
    getCommandVersion("yt-dlp", ["--version"]),
    getCommandVersion("ffmpeg", ["-version"]),
    checkPotProvider()
  ]);

  const healthy =
    typeof ytDlp === "string" &&
    !String(ytDlp).startsWith("{") &&
    typeof ffmpeg === "string" &&
    !String(ffmpeg).startsWith("{");

  res.status(healthy ? 200 : 503).json({
    ok: healthy,
    service: "GUNAKU Media Backend",
    version: VERSION,
    node: process.version,
    jsRuntime: YTDL_JS_RUNTIME,
    youtubePlayerClient: YTDL_YOUTUBE_PLAYER_CLIENT || "yt-dlp-default",
    tiktokMobileApiConfigured: Boolean(TIKTOK_APP_INFO),
    tiktokApiHostname: TIKTOK_API_HOSTNAME,
    ytDlp,
    ffmpeg,
    potProviderConfigured: Boolean(YTDL_POT_PROVIDER_URL),
    potProviderReachable: Boolean(potProvider.reachable),
    potProviderHttpStatus: potProvider.httpStatus,
    potProviderResponse: potProvider.response,
    potProviderError: potProvider.error
  });
});

app.post("/api/check", (req, res) => {
  const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";

  if (!url) {
    return res.status(400).json({ ok: false, error: "URL wajib diisi." });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ ok: false, error: "URL tidak valid." });
  }

  const platform = detectPlatform(url);
  const direct = isDirectMediaUrl(url);
  const allowed = isAllowedPlatformUrl(url);

  res.json({
    ok: true,
    platform,
    directMedia: direct,
    downloadAvailable: direct || allowed,
    message: direct
      ? "Direct media URL terdeteksi."
      : allowed
        ? "URL platform didukung untuk percobaan pengambilan media."
        : "URL ini tidak termasuk platform yang didukung."
  });
});

app.post("/api/download", async (req, res) => {
  const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  const format = req.body?.format === "mp3" ? "mp3" : "mp4";

  if (!url) {
    return res.status(400).json({ ok: false, error: "URL wajib diisi." });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ ok: false, error: "URL tidak valid." });
  }

  const direct = isDirectMediaUrl(url);
  const allowed = isAllowedPlatformUrl(url);

  if (!direct && !allowed) {
    return res.status(400).json({
      ok: false,
      error: "URL tidak didukung. Gunakan YouTube, Shorts, TikTok, Facebook, atau URL file media langsung."
    });
  }

  /*
   * Direct-media source:
   * return the source URL; frontend handles the browser download/open flow.
   */
  if (direct) {
    return res.json({
      ok: true,
      type: "direct",
      url,
      format: path.posix.extname(new URL(url).pathname).slice(1).toLowerCase()
    });
  }

  const jobDir = path.join(TMP_DIR, crypto.randomUUID());
  await fsp.mkdir(jobDir, { recursive: true });

  try {
    const outputTemplate = path.join(jobDir, "%(title).120B [GUNAKU].%(ext)s");
    const common = buildCommonArgs();
    const args = [...common];

    if (format === "mp3") {
      args.push(
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "192K",
        "-o", outputTemplate,
        url
      );
    } else {
      args.push(
        "-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best",
        "--merge-output-format", "mp4",
        "-o", outputTemplate,
        url
      );
    }

    await runYtDlp(args, jobDir);

    const file = await findDownloadedFile(jobDir);

    if (!file) {
      throw new Error("File hasil download tidak ditemukan.");
    }

    if (file.size > MAX_DOWNLOAD_BYTES) {
      throw new Error(`Ukuran file melebihi batas ${MAX_DOWNLOAD_MB} MB.`);
    }

    const contentType =
      format === "mp3"
        ? "audio/mpeg"
        : file.ext === "webm"
          ? "video/webm"
          : "video/mp4";

    const downloadName =
      safeFilename(path.basename(file.name, path.extname(file.name))) +
      path.extname(file.name);

    res.status(200);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", file.size);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${downloadName}"`
    );
    res.setHeader("X-GUNAKU-Version", VERSION);

    const stream = fs.createReadStream(file.path);

    stream.on("error", async () => {
      await cleanupDir(jobDir);
      if (!res.headersSent) {
        res.status(500).json({
          ok: false,
          error: "Gagal membaca file hasil."
        });
      } else {
        res.destroy();
      }
    });

    stream.on("close", () => cleanupDir(jobDir));
    stream.pipe(res);
  } catch (err) {
    await cleanupDir(jobDir);

    const safeError = sanitizeError(err?.message, url);
    console.error("Download error:", err?.message || err);

    return res.status(500).json({
      ok: false,
      error: safeError,
      detail: safeError,
      version: VERSION
    });
  }
});

app.use((_req, res) => {
  res.status(404).json({
    ok: false,
    error: "Endpoint tidak ditemukan."
  });
});

app.listen(PORT, () => {
  console.log(`GUNAKU API ONLINE pada port ${PORT}`);
  console.log(`GUNAKU Media Backend ${VERSION}`);
  console.log(`JS runtime: ${YTDL_JS_RUNTIME}`);
  console.log(`YouTube player client: ${YTDL_YOUTUBE_PLAYER_CLIENT || "yt-dlp-default"}`);
  console.log(`PO Token Provider: ${YTDL_POT_PROVIDER_URL ? "configured" : "not configured"}`);
});
