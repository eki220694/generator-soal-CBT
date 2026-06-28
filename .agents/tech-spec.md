# Tech Spec: Generator Soal CBT — Improvement Kualitas Soal

**Referensi:** `.agents/prd.md`
**Stack aktual:** Next.js 16 App Router + TypeScript + Tailwind v4 + OpenAI SDK + xlsx (SheetJS)
**Arsitektur:** Single-page, 2 file inti (`app/page.tsx` + `app/api/generate/route.ts`)

---

## 1. Database

Tidak ada. Sesuai PRD out-of-scope.

---

## 2. Backend (API Route)

Hanya memodifikasi file: `app/api/generate/route.ts`

### 2.1 Grade Level Masuk ke Request

**Sekarang:** Request body cuma `{ topic, count, bloomLevel }`.
**Menjadi:** `{ topic, count, gradeLevel, bloomLevel }`.

`gradeLevel` tipe string: `"SD" | "SMP" | "SMA" | "PT"`.

Validasi: wajib salah satu dari 4 nilai. Kalau tidak valid → 400.

### 2.2 Prompt Upgrade

Template prompt di-refactor jadi fungsi:

```
buildPrompt(topic, count, gradeLevel, bloomLabel) => string
```

Isi:
- **Jenjang dict** — mapping grade → instruksi tambahan (SD: "Gunakan bahasa sederhana, kalimat pendek, contoh konkret dari kehidupan sehari-hari." / SMA: "Soal boleh mengandung analisis multidimensi." / PT: "Soal setara ujian perguruan tinggi, boleh terminologi ilmiah.")
- **Aturan distraktor eksplisit:** "Semua 5 pilihan harus plausible. Dilarang menggunakan 'Semua jawaban benar', 'Tidak ada jawaban benar', atau pilihan yang jelas-jelas salah agar jawaban benar mudah ditebak."
- **Panjang pilihan:** "Usahakan panjang ke-5 pilihan relatif seimbang. Jangan ada pilihan yang jauh lebih pendek atau lebih panjang dari yang lain."
- **Larangan bocor:** "Jangan ulang kata kunci yang sama persis di soal dan di pilihan jawaban."
- **Instruksi jumlah:** "Buat tepat N soal. HARUS tepat N, jangan kurang."

Prompt tetap satu blok string, tidak perlu file terpisah.

### 2.3 Validasi 5 Pilar

Fungsi baru `validateQuestions(questions, count)`:

1. **Jumlah soal** — `questions.length` harus === `count`
2. **Setiap soal punya field lengkap** — `question`, `a`, `b`, `c`, `d`, `e`, `answer` ada dan bukan string kosong
3. **Answer valid** — `answer` salah satu `A/B/C/D/E`
4. **Bebas markdown/HTML** — cek tidak ada `<tag>` atau backtick di `question`/pilihan
5. **No duplicate question text** — setelah trim + lowercase, tidak ada 2 soal dengan teks sama
6. **No "bocor" pattern** — pilihan tidak mengandung kata kunci soal secara verbatim

Return `{ valid: boolean, errors: string[] }`.

Flow baru: setelah AI return JSON → `validateQuestions()` → kalau valid → proceed ke Excel → kalau tidak valid → throw error dengan pesan detail, lanjut ke model cascade berikutnya. Model berikutnya dapat pesan error sebagai context tambahan.

### 2.4 Distractor Quality Check

Fungsi `checkDistractors(questions)`:

- Hitung panjang (karakter) tiap pilihan. Kalau ada pilihan yang panjangnya < 30% rata-rata → flagged (tapi warn, bukan reject).
- Cek "Semua jawaban benar" / "Tidak ada jawaban benar" / "Semua benar" / "Tidak ada yang benar" di teks pilihan → reject dengan pesan.
- Cek apakah 2 pilihan identik secara semantik (string similarity > 90%) → reject.

Level: warning vs reject. Warning dicatat log, reject cascade ke model berikutnya.

### 2.5 Large Count Handler

**Masalah:** `max_tokens` dihitung `min(4096, max(2000, count * 350))`. Untuk 100 soal → 35.000 token, tapi dipotong 4096. Soal terpotong.

**Solusi split-chunk:**

```
count <= 50 → 1 call (max_tokens = min(12000, max(2000, count * 350)))
count > 50 → split jadi ceil(count / 30) chunk, call parallel (max concurrency: 2)
```

Contoh: 100 soal → 4 chunk (25, 25, 25, 25). Masing-masing ~8750 token. Dipanggil sequential 2 batch parallel (2 + 2). Setelah semua selesai, gabung, urutkan no, validasi gabungan.

Edge case: kalau salah satu chunk gagal → retry chunk itu saja, bukan ulang semua.

**Catatan:** `max_tokens` di free model OpenRouter mungkin tetap terbatas. Alternatif: naikkan limit ke 12000 (masih reasonable untuk free tier per response). Kalau masih terpotong, turunkan chunk size ke 20 soal.

### 2.6 Response Enhancements

Tidak ada perubahan format response. Excel tetap di-stream sebagai buffer. Header response tambahan: `X-Grade-Level`.

---

## 3. API Endpoint

**Method:** `POST /api/generate` (tidak berubah)

**Request body baru:**
```json
{
  "topic": "Fotosintesis Tumbuhan",
  "count": 10,
  "gradeLevel": "SMA",
  "bloomLevel": "C3"
}
```

**Response:** Sama — file .xls (biff8) dengan `Content-Type: application/vnd.ms-excel`.

**Error response:** Sama — `{ error: string }` dengan status 400/502/500.

---

## 4. Frontend

Satu file: `app/page.tsx`.

### 4.1 Kirim Grade Level

Sekarang `gradeLevel` state (`useState`) sudah ada di UI, dropdown sudah render — tapi tidak dikirim saat `fetch`. Perbaikan: tambahkan `gradeLevel` ke `JSON.stringify` body.

### 4.2 Status Loading

Tidak ada perubahan besar. Mungkin tambahkan teks tahapan ("Memvalidasi hasil...") kalau proses terasa lambat di count besar. Biarkan simple dulu.

### 4.3 Bloom Level

Tidak berubah. Tetap pill selector 6 level (C1-C6).

### 4.4 Responsive

Tidak berubah. Sisa mobile styling yang sudah ada.

---

## 5. Keputusan Teknis

| No | Keputusan | Alasan |
|----|-----------|--------|
| 1 | **Tetap di Next.js API route** | PRD explicit no database/auth. Tidak perlu backend terpisah. |
| 2 | **Validasi synchronous, inline di route** | Tidak perlu service layer — cukup pure function. Testable tanpa mock. |
| 3 | **Split-chunk untuk count > 50** | Solusi paling sederhana. Concurrency 2 agar tidak kena rate limit OpenRouter. |
| 4 | **Prompt tetap string literal di route** | Satu file, zero overhead. Kalau prompt jadi >10 baris baru pindah ke file terpisah (`lib/prompt.ts`). |
| 5 | **Tidak pakai JSON Schema validator eksternal** | Validasi 5 pilar cukup pakai logika JS sederhana. Zod/zod berlebihan untuk 6 check. |
| 6 | **Retry otomatis cascade** | Teknologi sudah ada. Hanya tambah context error ke retry. |

### Risiko

- **OpenRouter rate limit:** Split-chunk dengan concurrency 2 mungkin tetap kena 429. Tambah exponential backoff di tiap chunk call.
- **Free model quality:** Untuk 100 soal, model gratis mungkin hasilnya repetitive. Cascade ke model bayar (gratis dulu, baru bayar) dipertimbangkan untuk future.
- **Total waktu > 55 detik:** Dengan split 4 chunk di concurrency 2, worst-case ~2× response time per chunk (~20-30 detik per chunk) = 40-60 detik. Risiko timeout di Vercel Hobby (60 detik). Mitigasi: batasi chunk concurrency atau turunkan chunk size ke 20.

### File yang Berubah

- `app/api/generate/route.ts` — perubahan mayor (prompt, validasi, split-chunk, grade level)
- `app/page.tsx` — minor (kirim gradeLevel di body fetch)

### File Baru

Tidak ada. Semua logic inline di route.ts. Kalau `route.ts` melebihi 400 baris, refactor ke:
- `lib/prompt.ts` — builder prompt
- `lib/validate.ts` — validasi + distractor check
- `lib/splitter.ts` — logika split chunk
