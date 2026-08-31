# GUNAKU Media Backend — v1

Backend tahap pertama untuk Kartu #09 Media Downloader GUNAKU.

## Fungsi v1

- `GET /` — status sederhana.
- `GET /api/status` — status API.
- `POST /api/check` — memeriksa URL dan mendeteksi:
  - YouTube
  - YouTube Shorts
  - TikTok
  - Facebook
  - Direct Media URL
- `GET /api/download?url=...` — meneruskan Direct Media URL ke browser.

## Batasan penting

Versi ini **tidak** mengambil, mengekstrak, memisahkan audio, atau membypass pembatasan dari YouTube, YouTube Shorts, TikTok, atau Facebook.

Endpoint download hanya menerima URL file media langsung yang memang dapat diakses dan diunduh, misalnya file yang berakhiran `.mp4`, `.webm`, `.mp3`, `.m4a`, `.wav`, `.ogg`, atau format media yang didukung.

Gunakan hanya media yang Anda miliki atau yang memang Anda berhak unduh.

## Jalankan lokal

```bash
npm install
npm start
```

Default:
`http://localhost:10000`

Tes:
`http://localhost:10000/api/status`

## Deploy ke Render

1. Buat repository GitHub baru.
2. Upload semua isi folder ini.
3. Di Render pilih **New → Web Service**.
4. Hubungkan repository GitHub.
5. Build Command:
   `npm install`
6. Start Command:
   `npm start`
7. Setelah deploy, buka:
   `https://DOMAIN-RENDER-KAMU/api/status`

Jika berhasil, respons kira-kira:

```json
{
  "service": "GUNAKU Media Backend",
  "status": "OK",
  "version": "1.0.0"
}
```

## Tahap berikutnya

Setelah `/api/status` berhasil, kita akan:
1. Tes `/api/check`.
2. Hubungkan Kartu #09 Blogger ke URL backend.
3. Tes Direct Media URL dari HP.
4. Baru evaluasi kebutuhan backend lanjutan untuk media yang memang memiliki jalur resmi/berizin.
