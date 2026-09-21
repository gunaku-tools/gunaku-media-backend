# GUNAKU Media Backend — V2.5.1

Backend production untuk Kartu #09 Media Downloader GUNAKU.

- Build fix: instalasi yt-dlp dan bgutil PO Token Provider digabung dalam satu perintah pip dengan `--break-system-packages` untuk Debian Bookworm.

## Perubahan utama V2.5.1
- Node 22+ untuk runtime JavaScript yt-dlp yang saat ini didukung.
- Instalasi `yt-dlp[default,curl-cffi]` untuk dukungan browser impersonation.
- Plugin `bgutil-ytdlp-pot-provider==2.0.0` dipasang agar PO Token Provider benar-benar tersedia di yt-dlp.
- Saat `YTDL_POT_PROVIDER_URL` terisi, client YouTube diarahkan ke `mweb` sesuai panduan PO Token yt-dlp.
- `/api/diagnostics` memeriksa keterjangkauan provider melalui `/ping`.
- TikTok mencoba mobile API extraction lebih dulu melalui `tiktok:app_info` + `api_hostname`.
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
YTDL_TIKTOK_APP_INFO=(opsional; 19-digit install ID, otomatis dibuat jika kosong)
YTDL_TIKTOK_API_HOSTNAME=(opsional; default api16-normal-c-useast1a.tiktokv.com)

## Deployment
Railway dapat menjalankan project ini menggunakan Dockerfile.

## Verifikasi setelah deploy
Buka:
GET /api/status
GET /api/diagnostics

`/api/diagnostics` harus mengembalikan `ok: true`, serta versi `yt-dlp` dan `ffmpeg`.

## Catatan penggunaan
Gunakan hanya untuk media yang memang berhak Anda unduh dan sesuai ketentuan layanan platform serta hukum yang berlaku. Backend tidak dimaksudkan untuk melewati DRM, login, paywall, atau pembatasan akses.


Environment tambahan V2.5:
YTDL_YOUTUBE_PLAYER_CLIENT=(opsional; default `mweb` saat POT Provider dikonfigurasi)
