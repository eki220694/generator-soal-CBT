import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import * as XLSX from "xlsx";

interface GenerateRequestBody {
  topic: string;
  count: number;
  gradeLevel: string;
  bloomLevel: string;
}

interface Question {
  no: number;
  question: string;
  a: string;
  b: string;
  c: string;
  d: string;
  e: string;
  answer: string;
}

interface RawQuestion {
  no?: number;
  question?: string;
  a?: string;
  b?: string;
  c?: string;
  d?: string;
  e?: string;
  answer?: string;
}

const BOCOR_THRESHOLD = 0.75;
const DISTRACTOR_SIMILARITY_THRESHOLD = 0.9;

// Rate limiter in-memory — sliding window per IP
const RL_WINDOW = 60_000; // 1 menit
const RL_MAX = 10; // 10 request per menit (50 guru ÷ 5 menit = cukup)
const rlMap = new Map<string, { n: number; t: number }>();
function rateLimit(ip: string): { ok: boolean; wait: number } {
  const now = Date.now();
  const e = rlMap.get(ip);
  if (!e || now - e.t > RL_WINDOW) { rlMap.set(ip, { n: 1, t: now }); return { ok: true, wait: 0 }; }
  if (e.n >= RL_MAX) return { ok: false, wait: Math.ceil((RL_WINDOW - (now - e.t)) / 1000) };
  e.n++; return { ok: true, wait: 0 };
}

// model yg pasti kerja hari ini (free opensource)
const OR_MODELS = ["openrouter/owl-alpha", "nvidia/nemotron-3-ultra-550b-a55b:free"];

const BLOOM_LABELS: Record<string, string> = {
  C1: "C1 - Mengingat", C2: "C2 - Memahami", C3: "C3 - Mengaplikasikan",
  C4: "C4 - Menganalisis", C5: "C5 - Mengevaluasi", C6: "C6 - Mencipta",
};
const GRADE_INST: Record<string, string> = {
  SD: "Gunakan bahasa sangat sederhana, kalimat pendek, contoh konkret sehari-hari.",
  SMP: "Gunakan bahasa Indonesia baku tingkat menengah. Analisis sederhana diperbolehkan.",
  SMA: "Gunakan bahasa Indonesia baku formal. Analisis multidimensi diperbolehkan.",
  PT: "Gunakan terminologi ilmiah. Soal setara ujian perguruan tinggi.",
};
const GRADE_LABEL: Record<string, string> = { SD: "SD/MI", SMP: "SMP/MTs", SMA: "SMA/MA/SMK", PT: "Perguruan Tinggi" };

function buildPrompt(topic: string, count: number, gradeLevel: string, bloomLabel: string): string {
  return `Kamu adalah pembuat soal ujian profesional Indonesia. Buat tepat ${count} soal pilihan ganda (5 pilihan A-E).

Topik: "${topic.trim()}"
Jenjang: ${GRADE_LABEL[gradeLevel] ?? gradeLevel}
Tingkat Kognitif Bloom: ${bloomLabel}

${GRADE_INST[gradeLevel] ?? ""}

ATURAN:
- Semua dalam Bahasa Indonesia.
- Soal singkat, langsung ke inti.
- "answer" hanya A/B/C/D/E.
- Semua 5 pilihan harus plausible. Dilarang "semua jawaban benar" / "tidak ada jawaban benar".
- Buat tepat ${count} soal, jangan kurang.

OUTPUT HANYA JSON:
{"questions":[{"no":1,"question":"...","a":"...","b":"...","c":"...","d":"...","e":"...","answer":"A"}]}`;
}

function validateQuestions(questions: Question[], expected: number): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (questions.length === 0) return { valid: false, errors: ["kosong"] };
  if (questions.length !== expected) errors.push(`jumlah: expected ${expected}, got ${questions.length}`);

  const seen = new Set<string>();
  for (const q of questions) {
    if (!q?.question?.trim()) { errors.push(`#${q.no}: soal kosong`); continue; }
    const t = q.question.trim().toLowerCase();
    if (seen.has(t)) errors.push(`#${q.no}: duplikat`);
    seen.add(t);

    const opts = [q.a, q.b, q.c, q.d, q.e];
    const ei = opts.findIndex((o) => !o?.trim());
    if (ei >= 0) errors.push(`#${q.no}: ${String.fromCharCode(97 + ei).toUpperCase()} kosong`);
    if (!"ABCDE".includes(q.answer)) errors.push(`#${q.no}: jawaban ${q.answer} invalid`);

    for (const o of opts) {
      const l = o.toLowerCase().trim();
      if (["semua jawaban benar", "tidak ada jawaban benar", "semua benar", "tidak ada yang benar", "semua jawaban di atas benar", "tidak ada jawaban di atas yang benar"].includes(l)) {
        errors.push(`#${q.no}: distractor '${o}' tidak boleh`);
      }
    }
  }

  const fatal = errors.filter((e) => !e.startsWith("jumlah:"));
  return { valid: fatal.length === 0, errors };
}

function stringSimilarity(a: string, b: string): number {
  const s1 = a.toLowerCase().trim(), s2 = b.toLowerCase().trim();
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;
  const bg = new Map<string, number>();
  for (let i = 0; i < s1.length - 1; i++) bg.set(s1.substring(i, i + 2), (bg.get(s1.substring(i, i + 2)) ?? 0) + 1);
  let is = 0;
  for (let i = 0; i < s2.length - 1; i++) { const c = bg.get(s2.substring(i, i + 2)) ?? 0; if (c > 0) { bg.set(s2.substring(i, i + 2), c - 1); is++; } }
  return (2 * is) / (s1.length - 1 + s2.length - 1);
}

/** Panggil model, parse JSON, return questions atau throw */
async function callModel(client: OpenAI, model: string, topic: string, count: number, gradeLevel: string, bloomLabel: string, signal: AbortSignal): Promise<Question[]> {
  const budget = Math.min(6000, Math.max(2000, count * 600));

  const completion = await client.chat.completions.create(
    { model, messages: [{ role: "user", content: buildPrompt(topic, count, gradeLevel, bloomLabel) }], temperature: 0.7, max_tokens: budget },
    { signal },
  );

  const content = completion.choices[0]?.message?.content;
  if (completion.choices[0]?.finish_reason === "length") throw new Error("terpotong");
  if (!content?.trim()) throw new Error("kosong");

  let s = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```[\s\S]*$/, "").trim();
  const data = JSON.parse(s);
  const items = Array.isArray(data) ? data : data.questions;
  if (!Array.isArray(items) || items.length === 0) throw new Error("tidak ada questions");

  return items.map((q: RawQuestion, i: number) => ({
    no: typeof q.no === "number" ? q.no : i + 1,
    question: q.question ?? "Soal tidak tersedia",
    a: q.a ?? "", b: q.b ?? "", c: q.c ?? "", d: q.d ?? "", e: q.e ?? "",
    answer: (q.answer ?? "A").toUpperCase().trim().charAt(0) || "A",
  }));
}

/** Coba model satu per satu, return pertama yg valid. Partial fallback. */
async function tryModels(client: OpenAI, models: string[], topic: string, count: number, gradeLevel: string, bloomLabel: string): Promise<Question[] | null> {
  let best: Question[] = [];

  for (const model of models) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);
    try {
      const result = await callModel(client, model, topic, count, gradeLevel, bloomLabel, controller.signal);
      clearTimeout(timeoutId);
      const val = validateQuestions(result, count);
      if (val.valid) { console.log(`  OK ${model}: ${result.length} soal`); return result; }
      if (result.length > best.length) best = result;
      console.warn(`  ${model}: ${val.errors.slice(0, 2).join("; ")}`);
      continue;
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (String(e?.message ?? "").includes("429")) continue;
      console.warn(`  ${model} gagal: ${e?.message?.slice(0, 60) ?? "unknown"}`);
    }
  }
  return best.length > 0 ? best : null;
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequestBody = await request.json();
    const { topic, count, gradeLevel, bloomLevel } = body;

    if (!topic?.trim()) return NextResponse.json({ error: "Topik wajib diisi" }, { status: 400 });
    if (!Number.isInteger(count) || count < 1 || count > 100) return NextResponse.json({ error: "Jumlah 1-100" }, { status: 400 });
    if (!["SD", "SMP", "SMA", "PT"].includes(gradeLevel ?? "")) return NextResponse.json({ error: "Jenjang: SD/SMP/SMA/PT" }, { status: 400 });
    if (!["C1", "C2", "C3", "C4", "C5", "C6"].includes(bloomLevel ?? "")) return NextResponse.json({ error: "Bloom C1-C6" }, { status: 400 });

    // Rate limit by IP — 10 req/min/guru
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = rateLimit(ip);
    if (!rl.ok) return NextResponse.json({ error: `Terlalu banyak permintaan. Coba ${rl.wait} detik lagi.`, retryAfter: rl.wait }, { status: 429, headers: { "Retry-After": String(rl.wait) } });

    const bloomLabel = BLOOM_LABELS[bloomLevel] ?? bloomLevel;
    console.log(`[Generate] ${count} soal ${gradeLevel} ${bloomLabel}`);

    const groqKey = process.env.GROQ_API_KEY;
    const groq = groqKey ? new OpenAI({ apiKey: groqKey, baseURL: "https://api.groq.com/openai/v1", maxRetries: 2 }) : null;
    const cfId = process.env.CF_ACCOUNT_ID;
    const cfKey = process.env.CF_API_TOKEN;
    const cf = cfId && cfKey ? new OpenAI({ apiKey: cfKey, baseURL: `https://api.cloudflare.com/client/v4/accounts/${cfId}/ai/v1`, maxRetries: 1 }) : null;
    const or = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      maxRetries: 0,
      defaultHeaders: { "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000", "X-Title": "Generator Soal CBT" },
    });

    // Provider list: Groq → CF → OR. Fallback ke yg available.
    const providers: { client: OpenAI; models: string[]; name: string }[] = [
      ...(groq ? [{ client: groq, models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it"], name: "Groq" }] : []),
      ...(cf ? [{ client: cf, models: ["@cf/qwen/qwen3-30b-a3b-fp8", "@cf/meta/llama-4-scout-17b-16e-instruct", "@cf/moonshotai/kimi-k2.6"], name: "CF" }] : []),
      { client: or, models: OR_MODELS, name: "OR" },
    ];

    async function genChunk(c: number, label: string): Promise<Question[] | null> {
      for (const p of providers) {
        const r = await tryModels(p.client, p.models, topic, c, gradeLevel, bloomLabel);
        if (r) { console.log(`  [${label}] via ${p.name}: ${r.length}`); return r; }
      }
      return null;
    }

    let questions: Question[] = [];
    let successModel = "";

    if (count <= 5) {
      const r = await genChunk(count, "single");
      if (!r) return NextResponse.json({ error: "Semua model gagal. Coba lagi." }, { status: 502 });
      questions = r;
    } else {
      // Split jadi chunk 5, paralel concurrency 3
      const chunks: number[] = [];
      for (let r = count; r > 0; r -= Math.min(r, 5)) chunks.push(Math.min(r, 5));
      console.log(`[Split] ${chunks.length} chunk: ${chunks.join(",")}`);

      const results: (Question[] | null)[] = new Array(chunks.length).fill(null);
      for (let off = 0; off < chunks.length; off += 3) {
        const batch = chunks.slice(off, off + 3);
        const batchResults = await Promise.allSettled(batch.map((c, i) => genChunk(c, `chunk${off + i + 1}`)));
        for (let i = 0; i < batchResults.length; i++) {
          const r = batchResults[i];
          if (r.status === "fulfilled" && r.value) results[off + i] = r.value;
        }
      }

      let noOff = 0;
      for (const r of results) {
        if (r) { questions.push(...r.map((q) => ({ ...q, no: q.no + noOff }))); noOff += r.length; }
      }
      const ok = results.filter(Boolean).length;
      console.log(`[Merge] ${ok}/${chunks.length} chunk ok — ${questions.length} soal`);
      if (questions.length === 0) return NextResponse.json({ error: "Gagal. Coba lagi nanti." }, { status: 502 });
    }

    const val = validateQuestions(questions, count);
    if (!val.valid) console.warn(`[Validasi] ${val.errors.filter(e => !e.startsWith("jumlah:")).slice(0, 3).join("; ")}`);

    const headers = ["No Soal", "Soal", "PilA", "PilB", "PilC", "PilD", "PilE", "jawab", "Jenis", "file1", "file2", "fileA", "fileB", "fileC", "fileD", "fileE"];
    const rows = questions.map((q) => [q.no, q.question, q.a, q.b, q.c, q.d, q.e, q.answer, 1.0, "", "", "", "", "", "", ""]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "biff8" });

    console.log(`[Done] ${questions.length}/${count} soal`);
    return new NextResponse(buf, {
      status: 200,
      headers: { "Content-Type": "application/vnd.ms-excel", "Content-Disposition": 'attachment; filename="importdatasoal.xls"', "X-Count": String(questions.length) },
    });
  } catch (e) {
    console.error("[Fatal]", e);
    return NextResponse.json({ error: "Sistem error. Coba lagi." }, { status: 500 });
  }
}
