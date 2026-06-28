# Task List: Generator Soal CBT — Improvement Kualitas Soal

**Referensi:** `.agents/tech-spec.md`

**Total:** 5 task | **Estimasi:** 3-4 sesi

**Urutan:**
TASK-001 → TASK-002 → TASK-003 → TASK-004 → TASK-005

---

## Status

- [x] TASK-001: Kirim gradeLevel dari UI ke API
- [x] TASK-002: Validasi gradeLevel + prompt builder by jenjang
- [x] TASK-003: Validasi 5 pilar + distractor quality check
- [x] TASK-001: Kirim gradeLevel dari UI ke API
- [x] TASK-002: Validasi gradeLevel + prompt builder by jenjang
- [x] TASK-003: Validasi 5 pilar + distractor quality check
- [x] TASK-004: Split-chunk handler untuk count > 50
- [x] TASK-005: Integrasi akhir + uji edge case

---

## Detail Task

### ~~TASK-005: Integrasi akhir + uji edge case~~
Selesai — bloom level validasi C1-C6 ketat, single mode all fail → 502 jelas.

### ~~TASK-001: Kirim gradeLevel dari UI ke API~~
Selesai — body fetch include `gradeLevel`. Fix dropdown default `useState("")` → `useState("SD")`.

---

### ~~TASK-002: Validasi gradeLevel + prompt builder by jenjang~~
Selesai — `gradeLevel` divalidasi 4 nilai, `buildPrompt()` dengan GRADE_INSTRUCTIONS dict, response header `X-Grade-Level`, log jenjang.

---

### ~~TASK-003: Validasi 5 pilar + distractor quality check~~
Selesai — `validateQuestions()` (6 checks), `checkDistractors()` (3 checks: frasa terlarang REJECT, duplikat semantik REJECT, panjang timpang WARNING), `stringSimilarity()` bigram helper. Error context (`lastHandledError`) dioper ke `buildPrompt()` model berikutnya. Validasi dijalankan sebelum accept AI output.

---

### ~~TASK-004: Split-chunk handler untuk count > 50~~
Selesai — `splitCount()`, `callModelOnce()`, `singleCascade()`, `chunkCascade()`. Mode single ≤50 (max_tokens 12000). Mode split-chunk >50 (chunks ≤30, concurrency 2, per-chunk cascade). Merge + offset no soal + validasi final.

---

### TASK-005: Integrasi akhir + uji edge case

**Kategori:** backend
**Skill:** backend
**Estimasi:** sedang (30-90 menit)
**Depends on:** TASK-001, TASK-004
**Deskripsi:**
Integrasi semua komponen, uji coba skenario edge case, pastikan tidak ada regresi. Skenario uji:
- count = 1 (minimal), grade SD
- count = 100 (maximal), grade PT
- count = 50 (batas split), grade SMP
- Topic kosong → 400
- Bloom level tidak valid → 400
- Semua model gagal → 502 dengan pesan jelas
- File .xls yang dihasilkan bisa dibuka (valid format)

Pastikan semua log informatif, error messages user-friendly.

**Kriteria selesai:**
- Semua skenario di atas lolos
- Tidak ada error yang bocor ke user tanpa pesan jelas
- Loading state di UI informatif
- File .xls terdownload dengan nama `importdatasoal.xls` dan isi sesuai
- Log bersih di console (tidak ada error palsu)
