# GUNAKU Media Backend — V2

Backend tahap kedua untuk Kartu #09 Media Downloader GUNAKU.

## Fitur
- Status API
- Deteksi YouTube / Shorts / TikTok / Facebook
- Direct media URL
- Pengambilan media platform melalui yt-dlp
- Video MP4
- Audio MP3 melalui ffmpeg
- Batas ukuran file dan timeout
- Tidak menggunakan playlist

## Endpoint
GET /
GET /api/status
POST /api/check  {"url":"https://example.com/video"}
POST /api/download {"url":"https://example.com/video","format":"mp4"}
POST /api/download {"url":"https://example.com/video","format":"mp3"}

## Deployment
Dockerfile memasang Node.js, Python, yt-dlp, dan ffmpeg untuk deployment container.

## Catatan penggunaan
Gunakan hanya untuk media yang memang berhak Anda unduh dan sesuai ketentuan layanan platform serta hukum yang berlaku. Backend tidak dimaksudkan untuk melewati DRM, login, paywall, atau pembatasan akses.

## Environment
PORT (default 10000)
MAX_DOWNLOAD_MB (default 300)
DOWNLOAD_TIMEOUT_MS (default 180000)
