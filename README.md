# GUNAKU Media Backend — V2.3

Backend production untuk Kartu #09 Media Downloader GUNAKU.

## Perubahan utama V2.3
- Node 22+ untuk runtime JavaScript yt-dlp yang saat ini didukung.
- Instalasi `yt-dlp[default]` agar paket `yt-dlp-ejs` ikut terpasang.
- `YTDL_POT_PROVIDER_URL` sekarang benar-benar opsional.
- Tidak lagi memaksa hostname Railway internal yang belum tentu ada.
- `/api/diagnostics` untuk memeriksa `yt-dlp` dan `ffmpeg`.
- Error yt-dlp diringkas agar mudah dibaca dari frontend.
- Streaming hasil MP4/MP3 tetap menggunakan response binary.
- Direct media URL tetap dikembalikan sebagai JSON URL.
- Tidak memakai playlist.
- Batas ukuran file dan timeout tetap tersedia.

## Endpoint
GET /
GET /api/status
GET /api/diagnostics
POST /api/check {"url":"https://example.com/video"}
POST /api/download {"url":"https://example.com/video","format":"mp4"}
POST /api/download {"url":"https://example.com/video","format":"mp3"}

## Environment
PORT=10000
MAX_DOWNLOAD_MB=300
DOWNLOAD_TIMEOUT_MS=180000
YTDL_JS_RUNTIME=node
YTDL_POT_PROVIDER_URL=(opsional)

## Deployment
Railway dapat menjalankan project ini menggunakan Dockerfile.

## Verifikasi setelah deploy
Buka:
GET /api/status
GET /api/diagnostics

`/api/diagnostics` harus mengembalikan `ok: true`, serta versi `yt-dlp` dan `ffmpeg`.

## Catatan penggunaan
Gunakan hanya untuk media yang memang berhak Anda unduh dan sesuai ketentuan layanan platform serta hukum yang berlaku. Backend tidak dimaksudkan untuk melewati DRM, login, paywall, atau pembatasan akses.
