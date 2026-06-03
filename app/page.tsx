"use client";

import { useState } from "react";

export default function QuestionGeneratorPage() {
  const [topic, setTopic] = useState<string>("");
  const [count, setCount] = useState<number>(10);
  const [bloomLevel, setBloomLevel] = useState<string>("C1");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setError("");

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic,
          count,
          bloomLevel,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || "Gagal menghubungi server. Silakan coba lagi.",
        );
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const anchorElement = document.createElement("a");
      anchorElement.href = url;
      anchorElement.download = "importdatasoal.xls";
      document.body.appendChild(anchorElement);
      anchorElement.click();

      anchorElement.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan yang tidak diketahui.",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-50 via-slate-50 to-slate-100 flex items-center justify-center p-4 antialiased">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl shadow-slate-200/80 border border-slate-200/60 overflow-hidden transition-all duration-300 hover:shadow-slate-300/90">
        {/* Header Section dengan Aksen Gradien */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-8 sm:px-8 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-black/5 mix-blend-overlay"></div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight drop-shadow-sm">
            Excel Question Generator
          </h1>
          <p className="text-blue-100 text-sm mt-2 max-w-sm mx-auto font-medium">
            Hasilkan bank soal CBT otomatis berformat standar langsung ke file{" "}
            <span className="underline decoration-wavy decoration-indigo-300 font-bold">
              importdatasoal.xls
            </span>
          </p>
        </div>

        {/* Form Section */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6 bg-white">
          {/* Input Topik / Materi */}
          <div className="space-y-2">
            <label
              htmlFor="topic"
              className="text-sm font-semibold text-slate-800 block"
            >
              Topik / Materi Pembelajaran
            </label>
            <input
              id="topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Contoh: Jaringan LAN, Struktur Atom, SPLDV"
              required
              className="w-full px-4 py-3 border border-slate-300 rounded-xl text-slate-950 bg-slate-50/50 font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all duration-200 shadow-sm"
            />
          </div>

          {/* Grid untuk Jumlah Soal dan Tingkat Bloom */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Input Jumlah Soal */}
            <div className="space-y-2">
              <label
                htmlFor="count"
                className="text-sm font-semibold text-slate-800 block"
              >
                Jumlah Soal
              </label>
              <input
                id="count"
                type="number"
                min="1"
                max="100"
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                required
                className="w-full px-4 py-3 border border-slate-300 rounded-xl text-slate-950 bg-slate-50/50 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all duration-200 shadow-sm"
              />
            </div>

            {/* Select Tingkat Taksonomi Bloom */}
            <div className="space-y-2">
              <label
                htmlFor="bloomLevel"
                className="text-sm font-semibold text-slate-800 block"
              >
                Tingkat Kognitif
              </label>
              <select
                id="bloomLevel"
                value={bloomLevel}
                onChange={(e) => setBloomLevel(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl text-slate-950 bg-slate-50/50 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all duration-200 shadow-sm cursor-pointer"
              >
                <option value="C1">C1 - Mengingat (Remembering)</option>
                <option value="C2">C2 - Memahami (Understanding)</option>
                <option value="C3">C3 - Menerapkan (Applying)</option>
                <option value="C4">C4 - Menganalisis (Analyzing)</option>
                <option value="C5">C5 - Mengevaluasi (Evaluating)</option>
                <option value="C6">C6 - Mencipta (Creating)</option>
              </select>
            </div>
          </div>

          {/* Banner Pesan Error */}
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl animate-fade-in">
              <div className="flex gap-2 items-center text-rose-700">
                <svg
                  className="h-5 w-5 shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="text-sm font-semibold leading-tight">{error}</p>
              </div>
            </div>
          )}

          {/* Tombol Submit Eksklusif */}
          <button
            type="submit"
            disabled={isGenerating || !topic}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed text-white font-bold py-3.5 px-6 rounded-xl transition-all duration-300 shadow-lg shadow-blue-500/20 active:scale-[0.99]"
          >
            {isGenerating ? (
              <>
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
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
                <span className="tracking-wide">
                  Sedang Menyusun Soal AI...
                </span>
              </>
            ) : (
              <span className="tracking-wide">Generate & Download Excel</span>
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
