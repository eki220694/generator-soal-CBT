"use client";

import React, { useState, useEffect } from "react";

export default function GeneratePage() {
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(5);
  const [bloomLevel, setBloomLevel] = useState("C3");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error ||
            `Server merespons dengan status ${response.status}`,
        );
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "importdatasoal.xls");
      document.body.appendChild(link);
      link.click();
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
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500&display=swap');

        :root {
          --ink: #0a0a12;
          --surface: #13131f;
          --card: #1a1a2e;
          --border: rgba(255,255,255,0.07);
          --accent: #f97316;
          --accent2: #fb923c;
          --teal: #2dd4bf;
          --muted: rgba(255,255,255,0.4);
          --text: rgba(255,255,255,0.92);
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .page-root {
          min-height: 100vh;
          background: var(--ink);
          font-family: 'DM Sans', sans-serif;
          color: var(--text);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2rem 1rem;
          position: relative;
          overflow: hidden;
        }

        /* Background blobs */
        .blob {
          position: fixed;
          border-radius: 50%;
          filter: blur(120px);
          pointer-events: none;
          z-index: 0;
        }
        .blob-1 {
          width: 500px; height: 500px;
          background: rgba(249,115,22,0.12);
          top: -150px; right: -100px;
        }
        .blob-2 {
          width: 400px; height: 400px;
          background: rgba(45,212,191,0.08);
          bottom: -100px; left: -80px;
        }
        .blob-3 {
          width: 300px; height: 300px;
          background: rgba(139,92,246,0.07);
          top: 40%; left: 50%;
          transform: translate(-50%,-50%);
        }

        /* Grid pattern overlay */
        .grid-overlay {
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px);
          background-size: 40px 40px;
          pointer-events: none;
          z-index: 0;
        }

        .card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 460px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 2rem 2rem 1.75rem;
          box-shadow:
            0 0 0 1px rgba(249,115,22,0.06),
            0 40px 80px rgba(0,0,0,0.5),
            inset 0 1px 0 rgba(255,255,255,0.05);
          opacity: 0;
          transform: translateY(24px);
          animation: fadeUp 0.6s ease 0.1s forwards;
        }

        @keyframes fadeUp {
          to { opacity: 1; transform: translateY(0); }
        }

        /* Badge */
        .badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(249,115,22,0.1);
          border: 1px solid rgba(249,115,22,0.2);
          border-radius: 100px;
          padding: 4px 12px 4px 8px;
          font-size: 11px;
          font-weight: 500;
          color: var(--accent2);
          letter-spacing: 0.03em;
          margin-bottom: 1.1rem;
        }
        .badge-dot {
          width: 6px; height: 6px;
          background: var(--accent);
          border-radius: 50%;
          animation: pulse 2s ease infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }

        /* Heading */
        .heading {
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: 1.75rem;
          line-height: 1.15;
          letter-spacing: -0.02em;
          color: #fff;
          margin-bottom: 0.35rem;
        }
        .heading span {
          background: linear-gradient(90deg, var(--accent) 0%, #fbbf24 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .subheading {
          font-size: 13px;
          color: var(--muted);
          line-height: 1.6;
          margin-bottom: 1.75rem;
        }

        /* Divider */
        .divider {
          height: 1px;
          background: var(--border);
          margin-bottom: 1.5rem;
        }

        /* Labels */
        label {
          display: block;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.45);
          margin-bottom: 7px;
        }

        /* Inputs */
        .input-wrap { margin-bottom: 1rem; }

        input[type="text"],
        input[type="number"],
        select {
          width: 100%;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 12px;
          padding: 11px 14px;
          font-size: 14px;
          font-family: 'DM Sans', sans-serif;
          color: var(--text);
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
          -webkit-appearance: none;
        }
        input[type="text"]::placeholder { color: rgba(255,255,255,0.2); }
        input[type="text"]:focus,
        input[type="number"]:focus,
        select:focus {
          border-color: rgba(249,115,22,0.5);
          box-shadow: 0 0 0 3px rgba(249,115,22,0.08);
          background: rgba(249,115,22,0.04);
        }
        input:disabled, select:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Grid row */
        .row-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 1rem;
        }

        /* Select wrapper */
        .select-wrap {
          position: relative;
        }
        .select-wrap select { padding-right: 36px; }
        .select-arrow {
          position: absolute;
          right: 12px; top: 50%;
          transform: translateY(-50%);
          pointer-events: none;
          color: rgba(255,255,255,0.35);
        }

        /* Bloom pills row */
        .bloom-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 6px;
          margin-bottom: 1.25rem;
        }
        .bloom-pill {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          padding: 7px 4px;
          text-align: center;
          font-size: 11px;
          font-weight: 500;
          color: rgba(255,255,255,0.45);
          cursor: pointer;
          transition: all 0.15s;
          user-select: none;
          line-height: 1.3;
        }
        .bloom-pill:hover { border-color: rgba(249,115,22,0.3); color: rgba(255,255,255,0.7); }
        .bloom-pill.active {
          background: rgba(249,115,22,0.12);
          border-color: rgba(249,115,22,0.4);
          color: var(--accent2);
          box-shadow: 0 0 12px rgba(249,115,22,0.1);
        }
        .bloom-pill .pill-code {
          display: block;
          font-family: 'Syne', sans-serif;
          font-weight: 700;
          font-size: 12px;
          color: inherit;
        }
        .bloom-pill .pill-label {
          display: block;
          font-size: 9px;
          opacity: 0.7;
          margin-top: 1px;
        }

        /* Submit button */
        .btn {
          width: 100%;
          height: 50px;
          border-radius: 14px;
          border: none;
          cursor: pointer;
          font-family: 'Syne', sans-serif;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.02em;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: all 0.2s;
          position: relative;
          overflow: hidden;
          margin-top: 0.25rem;
        }
        .btn-primary {
          background: linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fbbf24 100%);
          color: #0a0a12;
          box-shadow: 0 4px 20px rgba(249,115,22,0.3);
        }
        .btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 28px rgba(249,115,22,0.4);
        }
        .btn-primary:active:not(:disabled) { transform: scale(0.98); }
        .btn-primary:disabled {
          background: rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.25);
          cursor: not-allowed;
          box-shadow: none;
        }
        .btn-primary.loading {
          background: rgba(249,115,22,0.2);
          color: var(--accent2);
          border: 1px solid rgba(249,115,22,0.2);
        }

        /* Shimmer on button */
        .btn-primary:not(:disabled)::after {
          content: '';
          position: absolute;
          top: 0; left: -100%; width: 60%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
          animation: shimmer 3s ease infinite;
        }
        @keyframes shimmer {
          0% { left: -100%; }
          50%, 100% { left: 150%; }
        }

        /* Spinner */
        .spinner {
          width: 18px; height: 18px;
          border: 2px solid rgba(249,115,22,0.2);
          border-top-color: var(--accent2);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Alerts */
        .alert {
          border-radius: 12px;
          padding: 12px 14px;
          display: flex; align-items: flex-start; gap: 10px;
          font-size: 13px;
          line-height: 1.55;
          margin-bottom: 1rem;
          animation: fadeUp 0.3s ease forwards;
        }
        .alert-error {
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.15);
          color: #fca5a5;
        }
        .alert-success {
          background: rgba(45,212,191,0.07);
          border: 1px solid rgba(45,212,191,0.15);
          color: #5eead4;
        }
        .alert-icon { flex-shrink: 0; margin-top: 1px; }

        /* Footer */
        .footer {
          position: relative;
          z-index: 1;
          margin-top: 1.25rem;
          text-align: center;
          font-size: 10px;
          color: rgba(255,255,255,0.18);
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }

        /* Stat chips */
        .stat-row {
          display: flex;
          gap: 8px;
          margin-bottom: 1.5rem;
        }
        .stat-chip {
          flex: 1;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 10px;
          padding: 8px 10px;
          text-align: center;
        }
        .stat-chip .stat-val {
          font-family: 'Syne', sans-serif;
          font-size: 15px;
          font-weight: 700;
          color: var(--accent2);
        }
        .stat-chip .stat-desc {
          font-size: 10px;
          color: rgba(255,255,255,0.28);
          margin-top: 1px;
        }
      `}</style>

      <div className="page-root">
        {/* Background effects */}
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
        <div className="grid-overlay" />

        {/* Main card */}
        <div className="card">
          {/* Badge */}
          <div className="badge">
            <span className="badge-dot" />
            Bertenaga AI Cascade
          </div>

          {/* Heading */}
          <h1 className="heading">
            Generator <span>Soal CBT</span>
          </h1>
          <p className="subheading">
            Buat bank soal pilihan ganda siap impor ke sistem CBT secara
            otomatis, lengkap dengan tingkat kognitif Taksonomi Bloom.
          </p>

          {/* Stat chips */}
          <div className="stat-row">
            <div className="stat-chip">
              <div className="stat-val">100</div>
              <div className="stat-desc">Maks. Soal</div>
            </div>
            <div className="stat-chip">
              <div className="stat-val">C1–C6</div>
              <div className="stat-desc">Bloom</div>
            </div>
            <div className="stat-chip">
              <div className="stat-val">.xls</div>
              <div className="stat-desc">Format CBT</div>
            </div>
          </div>

          <div className="divider" />

          {/* Alerts */}
          {error && (
            <div className="alert alert-error">
              <svg
                className="alert-icon"
                width="16"
                height="16"
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
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="alert alert-success">
              <svg
                className="alert-icon"
                width="16"
                height="16"
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
              <span>
                Berhasil! File <strong>importdatasoal.xls</strong> sudah diunduh
                ke perangkat Anda.
              </span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit}>
            {/* Topik */}
            <div className="input-wrap">
              <label htmlFor="topic">Topik Materi / Silabus</label>
              <input
                id="topic"
                type="text"
                required
                disabled={loading}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Contoh: Fotosintesis Tumbuhan Kelas 8"
              />
            </div>

            {/* Jumlah soal */}
            <div className="row-2">
              <div>
                <label htmlFor="count">Jumlah Soal</label>
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
                />
              </div>
              <div>
                <label>Kelas / Jenjang</label>
                <div className="select-wrap">
                  <select disabled={loading} defaultValue="">
                    <option value="" disabled>
                      Pilih jenjang
                    </option>
                    <option>SD / MI</option>
                    <option>SMP / MTs</option>
                    <option>SMA / MA / SMK</option>
                    <option>Perguruan Tinggi</option>
                  </select>
                  <div className="select-arrow">
                    <svg
                      width="14"
                      height="14"
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

            {/* Bloom pills */}
            <label>Tingkat Kognitif Bloom</label>
            <div className="bloom-grid" style={{ marginTop: 7 }}>
              {[
                { code: "C1", label: "Mengingat" },
                { code: "C2", label: "Memahami" },
                { code: "C3", label: "Menerapkan" },
                { code: "C4", label: "Menganalisis" },
                { code: "C5", label: "Evaluasi" },
                { code: "C6", label: "Kreasi" },
              ].map((b) => (
                <div
                  key={b.code}
                  className={`bloom-pill ${bloomLevel === b.code ? "active" : ""}`}
                  onClick={() => !loading && setBloomLevel(b.code)}
                >
                  <span className="pill-code">{b.code}</span>
                  <span className="pill-label">{b.label}</span>
                </div>
              ))}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !topic.trim()}
              className={`btn btn-primary ${loading ? "loading" : ""}`}
            >
              {loading ? (
                <>
                  <div className="spinner" />
                  <span>Memproses AI Cascade...</span>
                </>
              ) : (
                <>
                  <span>Generate & Unduh Excel</span>
                  <svg
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.5"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="footer">
          Generator Soal CBT v1.0 &nbsp;·&nbsp; Siap Produksi
        </div>
      </div>
    </>
  );
}
