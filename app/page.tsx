"use client";

import React, { useState } from "react";

export default function GeneratePage() {
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(5);
  const [bloomLevel, setBloomLevel] = useState("C3");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, count: Number(count), bloomLevel }),
      });

      if (!response.ok) {
        // Membaca pesan error kustom dari payload cascade backend
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error ||
            `Server merespons dengan status ${response.status}`,
        );
      }

      // Memproses unduhan binary file Excel (.xls)
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "importdatasoal.xls");
      document.body.appendChild(link);
      link.click();

      // Pembersihan node dokumen
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan sistem yang tidak diketahui.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between p-4 sm:p-6 md:p-8">
      {/* Container Utama Konten */}
      <main className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-sm border border-slate-100 p-5 sm:p-6 mt-2 mb-8">
        {/* Header Aplikasi */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-50 text-blue-600 mb-3">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">
            CBT Question Generator
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Buat file excel bank soal otomatis berbasis AI Cascade
          </p>
        </div>

        {/* Notifikasi Status Masalah (Error Alert) */}
        {error && (
          <div className="mb-4 p-3.5 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2.5 text-red-700 text-sm animate-fade-in">
            <svg
              className="w-5 h-5 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="leading-relaxed font-medium">{error}</span>
          </div>
        )}

        {/* Notifikasi Sukses (Success Alert) */}
        {success && (
          <div className="mb-4 p-3.5 bg-emerald-50 border border-emerald-100 rounded-xl flex items-start gap-2.5 text-emerald-700 text-sm">
            <svg
              className="w-5 h-5 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="leading-relaxed font-medium">
              Berhasil! Berkas kuesioner otomatis diunduh ke penyimpanan
              perangkat Anda.
            </span>
          </div>
        )}

        {/* Formulir Utama */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Input Topik Materi */}
          <div>
            <label
              htmlFor="topic"
              className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
            >
              Topik Materi / Silabus
            </label>
            <input
              id="topic"
              type="text"
              required
              disabled={loading}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Contoh: Fotosintesis Tumbuhan Kelas 8"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-base text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-60"
            />
          </div>

          {/* Input Grid Kombinasi */}
          <div className="grid grid-cols-2 gap-3.5">
            {/* Input Jumlah Soal */}
            <div>
              <label
                htmlFor="count"
                className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
              >
                Jumlah Soal
              </label>
              <input
                id="count"
                type="number"
                min="1"
                max="100"
                required
                disabled={loading}
                value={count}
                onChange={(e) =>
                  setCount(Math.max(1, parseInt(e.target.value) || 0))
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-60"
              />
            </div>

            {/* Pilihan Taksonomi Bloom */}
            <div>
              <label
                htmlFor="bloom"
                className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
              >
                Kognitif Bloom
              </label>
              <div className="relative">
                <select
                  id="bloom"
                  disabled={loading}
                  value={bloomLevel}
                  onChange={(e) => setBloomLevel(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-base text-slate-800 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-60"
                >
                  <option value="C1">C1 - Mengingat</option>
                  <option value="C2">C2 - Memahami</option>
                  <option value="C3">C3 - Menerapkan</option>
                  <option value="C4">C4 - Menganalisis</option>
                  <option value="C5">C5 - Evaluasi</option>
                  <option value="C6">C6 - Kreasi</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-slate-500">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Tombol Eksekusi Pintar */}
          <button
            type="submit"
            disabled={loading || !topic}
            className={`w-full relative flex items-center justify-center font-semibold rounded-xl text-white transition-all transform active:scale-[0.98] mt-2 h-12 text-base ${
              loading
                ? "bg-blue-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/10"
            }`}
          >
            {loading ? (
              <div className="flex items-center gap-2">
                {/* Spinner Loading Animasi */}
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>Memproses AI Cascade...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span>Generate & Download Excel</span>
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
              </div>
            )}
          </button>
        </form>
      </main>

      {/* Footer Hak Cipta Ringkas */}
      <footer className="w-full text-center py-2">
        <p className="text-[10px] text-slate-400 font-medium tracking-wide uppercase">
          Template CBT Engine v1.0 • Ready for Production
        </p>
      </footer>
    </div>
  );
}
