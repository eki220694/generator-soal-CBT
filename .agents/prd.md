# PRD: Generator Soal CBT — Improvement Kualitas Soal

## Latar Belakang

Aplikasi Generator Soal CBT sudah live dan fungsional: user input topik, AI cascade menghasilkan soal pilihan ganda, langsung download file .xls siap impor ke sistem CBT. Namun kualitas soal masih bergantung sepenuhnya pada sekali panggil AI — tidak ada validasi, tidak ada kontrol distraktor, dan field jenjang pendidikan tidak terpakai. Grade level dropdown di UI mati — tidak dikirim ke API.

## Tujuan

Meningkatkan kualitas output soal secara signifikan tanpa mengubah arsitektur dasar (tetap single-page, tanpa database/auth). Fokus pada: prompt engineering yang lebih presisi, validasi soal sebelum dikirim ke user, kontrol distraktor, dan memanfaatkan input jenjang yang sudah ada di form.

## Yang Dikerjakan (In-Scope)

1. **Prompt engineering upgrade**
   - Prompt lebih detail: aturan distraktor (semua pilihan harus plausible, tidak boleh lucu/asalan), petunjuk tingkat kedalaman sesuai jenjang (SD sederhana, SMA kompleks)
   - Contoh output per tingkat Bloom untuk guiding model
   - Validasi lintas soal: tidak boleh ada soal duplikat atau pilihan saling membocorkan jawaban

2. **Grade level benar-benar dipakai**
   - Dropdown SD/SMP/SMA/PT dikirim ke API
   - Prompt menyesuaikan tingkat kesulitan bahasa dan kompleksitas soal berdasarkan jenjang

3. **Validasi hasil AI sebelum dikirim ke user**
   - Setelah AI return JSON, validasi:
     - Setiap soal punya 5 pilihan (A-E)
     - Jawaban benar benar-benar salah satu A-E
     - Tidak ada soal dengan teks kosong
     - Tidak ada teks markdown/HTML di soal
   - Kalau validasi gagal → cascade ke model berikutnya atau minta retry dengan pesan error spesifik
   - Kalau lolos semua → kirim file

4. **Distractor quality check**
   - Periksa panjang pilihan jangan terlalu timpang
   - Pastikan pilihan jawaban tidak saling mengandung kata kunci yang membocorkan jawaban benar
   - Hindari pola "semua jawaban benar" / "tidak ada jawaban benar" sebagai pilihan

5. **Penanganan kasus tepi (edge cases)**
   - Count besar (80-100 soal) riskan timeout atau token limit
   - Alternatif: split ke beberapa panggil AI paralel atau sequential dengan concurrency terbatas, lalu gabung hasilnya

## Yang Tidak Dikerjakan (Out-Scope)

- Database, auth, login, riwayat — tidak ada penyimpanan persistent
- Multi-user atau shared bank soal
- Preview/edit soal sebelum download (masih langsung jadi file)
- Modul soal uraian/essay
- Ekspor format selain .xls (PDF, JSON, dll)
- Dashboard atau statistik

## Kriteria Selesai

- [ ] Jenjang (SD/SMP/SMA/PT) terkirim ke API dan memengaruhi prompt
- [ ] Semua hasil AI melewati validasi 5 pilar (5 pilihan, jawaban valid, tidak kosong, tidak markdown/HTML, tidak duplikat)
- [ ] Validasi gagal → cascade ke model berikutnya, bukan kirim file cacat
- [ ] Distraktor lebih realistis: tidak ada pilihan bonus/asalan, panjang seimbang
- [ ] Generate 100 soal berhasil tanpa timeout, tanpa soal terpotong
- [ ] UI tetap responsif, loading state informatif
- [ ] Tidak ada error yang sampai ke user tanpa pesan yang jelas
