// app/api/generate/route.ts
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

/** Raw form from AI — all optional because AI output shape is unpredictable. */
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

// ponytail: tune thresholds if false-positive/negative rates surface in practice
const BOCOR_THRESHOLD = 0.75;
const DISTRACTOR_SIMILARITY_THRESHOLD = 0.9;
const LENGTH_RATIO_MIN = 0.3;

// Model free tier OpenRouter yang aktif per Juni 2026
// Referensi: https://openrouter.ai/collections/free-models
const CASCADE_MODELS = [
  "openrouter/owl-alpha",
  "z-ai/glm-4.5-air:free",
  "openai/gpt-oss-120b:free",
  "openrouter/auto", // Fallback stabil
];

// Peta nama tingkat Bloom dari kode ke label lengkap Indonesia
const BLOOM_LABELS: Record<string, string> = {
  C1: "C1 - Mengingat (Remember)",
  C2: "C2 - Memahami (Understand)",
  C3: "C3 - Mengaplikasikan (Apply)",
  C4: "C4 - Menganalisis (Analyze)",
  C5: "C5 - Mengevaluasi (Evaluate)",
  C6: "C6 - Mencipta (Create)",
};

const GRADE_INSTRUCTIONS: Record<string, string> = {
  SD: "Gunakan bahasa yang sangat sederhana, kalimat pendek (maks 15 kata per kalimat), dan contoh konkret dari kehidupan sehari-hari anak SD. Hindari istilah teknis yang rumit.",
  SMP: "Gunakan bahasa Indonesia baku tingkat menengah. Soal boleh mengandung analisis sederhana dan penerapan konsep dalam situasi yang dikenal siswa SMP.",
  SMA: "Gunakan bahasa Indonesia baku formal. Soal boleh mengandung analisis multidimensi, hubungan antar-konsep, dan penerapan dalam konteks yang lebih luas setara ujian sekolah.",
  PT: "Gunakan terminologi ilmiah yang tepat. Soal setara ujian perguruan tinggi, boleh analisis multidimensi, sintesis, dan evaluasi dengan kasus kompleks.",
};

const GRADE_LABELS: Record<string, string> = {
  SD: "SD / MI",
  SMP: "SMP / MTs",
  SMA: "SMA / MA / SMK",
  PT: "Perguruan Tinggi",
};

function buildPrompt(topic: string, count: number, gradeLevel: string, bloomLabel: string, lastError?: string): string {
  const gradeInstruction = GRADE_INSTRUCTIONS[gradeLevel] ?? "";
  return `Kamu adalah pembuat soal ujian profesional untuk pendidikan di Indonesia.

Buatlah tepat ${count} soal pilihan ganda dalam Bahasa Indonesia yang baik dan benar.
Topik: "${topic.trim()}"
Jenjang: ${GRADE_LABELS[gradeLevel] ?? gradeLevel}
Tingkat Kognitif Taksonomi Bloom: ${bloomLabel}

INSTRUKSI JENJANG:
${gradeInstruction}

${lastError ? `CATATAN PERBAIKAN DARI PERCOBAAN SEBELUMNYA:
${lastError}

Harap perhatikan kesalahan di atas dan jangan ulangi.
` : ""}

ATURAN WAJIB:
- Seluruh soal dan semua pilihan jawaban HARUS menggunakan Bahasa Indonesia. Dilarang menggunakan bahasa Inggris.
- Setiap soal harus sesuai dengan tingkat kognitif Bloom yang diminta.
- Hanya ada SATU jawaban yang benar untuk setiap soal.
- Kolom "answer" hanya berisi satu huruf kapital: A, B, C, D, atau E.
- Semua 5 pilihan jawaban harus plausible (masuk akal). Dilarang menggunakan "Semua jawaban benar", "Tidak ada jawaban benar", atau pilihan yang jelas-jelas salah agar jawaban benar mudah ditebak.
- Usahakan panjang kelima pilihan relatif seimbang. Jangan ada pilihan yang jauh lebih pendek atau lebih panjang dari yang lain.
- Jangan ulang kata kunci yang sama persis di soal dan di pilihan jawaban.
- Buat tepat ${count} soal. HARUS tepat ${count}, jangan kurang.

FORMAT OUTPUT:
Kembalikan hanya objek JSON yang valid. Dilarang menggunakan markdown, backtick, atau teks lain di luar JSON.

Struktur JSON yang harus dikembalikan:
{
  "questions": [
    {
      "no": 1,
      "question": "Teks soal di sini",
      "a": "Teks pilihan A",
      "b": "Teks pilihan B",
      "c": "Teks pilihan C",
      "d": "Teks pilihan D",
      "e": "Teks pilihan E",
      "answer": "A"
    }
  ]
}`;
}

function validateQuestions(questions: Question[], expectedCount: number): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 1. Jumlah soal persis count
  if (questions.length !== expectedCount) {
    errors.push(`Jumlah soal ${questions.length} tidak sesuai yang diminta (${expectedCount}).`);
  }

  // 2. Field wajib lengkap
  const requiredFields: (keyof Question)[] = ["question", "a", "b", "c", "d", "e", "answer"];
  for (const q of questions) {
    for (const field of requiredFields) {
      const val = q[field];
      if (!val || (typeof val === "string" && val.trim().length === 0)) {
        errors.push(`Soal #${q.no}: field "${field}" kosong.`);
      }
    }
  }

  // 3. Answer valid A/B/C/D/E
  for (const q of questions) {
    if (!["A", "B", "C", "D", "E"].includes(q.answer)) {
      errors.push(`Soal #${q.no}: jawaban "${q.answer}" tidak valid (harus A/B/C/D/E).`);
    }
  }

  // 4. Bebas markdown/HTML
  const reTag = /[<`]/;
  for (const q of questions) {
    if (reTag.test(q.question)) {
      errors.push(`Soal #${q.no}: teks soal mengandung markdown/HTML.`);
    }
    for (const f of ["a", "b", "c", "d", "e"] as const) {
      if (reTag.test(q[f])) {
        errors.push(`Soal #${q.no}: pilihan ${f.toUpperCase()} mengandung markdown/HTML.`);
      }
    }
  }

  // 5. No duplicate question text (setelah trim + lowercase)
  const seen = new Set<string>();
  for (const q of questions) {
    const key = q.question.trim().toLowerCase();
    if (seen.has(key)) {
      errors.push(`Soal #${q.no}: teks soal duplikat.`);
    }
    seen.add(key);
  }

  // 6. No bocor pattern — kata kunci soal tidak muncul verbatim di pilihan
  for (const q of questions) {
    const qLower = q.question.toLowerCase().trim();
    for (const f of ["a", "b", "c", "d", "e"] as const) {
      const optLower = q[f].toLowerCase().trim();
      if (qLower.length > 10 && (optLower.includes(qLower) || qLower.includes(optLower))) {
        errors.push(`Soal #${q.no}: pilihan ${f.toUpperCase()} bocor — mengandung teks soal verbatim.`);
      } else if (qLower.length > 10 && stringSimilarity(qLower, optLower) > BOCOR_THRESHOLD) {
        errors.push(`Soal #${q.no}: pilihan ${f.toUpperCase()} terlalu mirip dengan teks soal.`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function checkDistractors(questions: Question[]): { warnings: string[] } {
  const warnings: string[] = [];
  const FORBIDDEN_PHRASES = [
    "Semua jawaban benar",
    "Tidak ada jawaban benar",
    "Semua benar",
    "Tidak ada yang benar",
  ];

  for (const q of questions) {
    const options: string[] = [q.a, q.b, q.c, q.d, q.e];

    // CEK 1: Frasa terlarang → REJECT
    for (let i = 0; i < options.length; i++) {
      for (const phrase of FORBIDDEN_PHRASES) {
        if (options[i].toLowerCase().includes(phrase.toLowerCase())) {
          throw new Error(
            `Soal #${q.no}: pilihan ${String.fromCharCode(97 + i).toUpperCase()} mengandung frasa terlarang "${phrase}".`,
          );
        }
      }
    }

    // CEK 2: Duplikat semantik — string similarity > 90% → REJECT
    for (let i = 0; i < options.length; i++) {
      for (let j = i + 1; j < options.length; j++) {
        const sim = stringSimilarity(options[i], options[j]);
        if (sim > DISTRACTOR_SIMILARITY_THRESHOLD) {
          throw new Error(
            `Soal #${q.no}: pilihan ${String.fromCharCode(97 + i).toUpperCase()} dan ${String.fromCharCode(97 + j).toUpperCase()} terlalu mirip (${(sim * 100).toFixed(0)}%).`,
          );
        }
      }
    }

    // CEK 3: Panjang pilihan tidak proporsional → WARNING
    const lengths = options.map((o) => o.length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    for (let i = 0; i < lengths.length; i++) {
      if (lengths[i] < avg * LENGTH_RATIO_MIN) {
        warnings.push(
          `Soal #${q.no}: pilihan ${String.fromCharCode(97 + i).toUpperCase()} terlalu pendek (${lengths[i]} vs rerata ${avg.toFixed(0)} karakter).`,
        );
      }
    }
  }

  return { warnings };
}

/** Bigram-based string similarity (0–1). */
function stringSimilarity(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.substring(i, i + 2);
    bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
  }
  let intersectionSize = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.substring(i, i + 2);
    const count = bigrams.get(bg) ?? 0;
    if (count > 0) {
      bigrams.set(bg, count - 1);
      intersectionSize++;
    }
  }
  return (2 * intersectionSize) / (s1.length - 1 + s2.length - 1);
}

/** Split total count into chunks of max chunkSize (default 20). */
function splitCount(total: number, chunkSize = 20): number[] {
  const chunks: number[] = [];
  let remaining = total;
  while (remaining > 0) {
    chunks.push(Math.min(remaining, chunkSize));
    remaining -= Math.min(remaining, chunkSize);
  }
  return chunks;
}

/**
 * Call AI model once, parse & normalize. Returns questions or throws.
 * Overrides based on `chunkInfo` when splitting.
 */
async function callModelOnce(
  openai: OpenAI,
  modelName: string,
  topic: string,
  chunkCount: number,
  gradeLevel: string,
  bloomLabel: string,
  lastError: string | undefined,
  signal: AbortSignal,
  chunkInfo?: { index: number; of: number },
): Promise<Question[]> {
  let prompt: string;

  if (chunkInfo) {
    // Chunked mode: override total count + add chunk context
    prompt = buildPrompt(topic, chunkCount, gradeLevel, bloomLabel, lastError);
    // Append chunk context so AI knows it's part N
    prompt += `\n\nCATATAN: Ini adalah bagian ${chunkInfo.index}/${chunkInfo.of} dari total soal. Buat tepat ${chunkCount} soal.`;
  } else {
    prompt = buildPrompt(topic, chunkCount, gradeLevel, bloomLabel, lastError);
  }

  // ponytail: fixed cap keeps free-tier models happy; raise when switching to paid
  const maxTokens = Math.min(12000, Math.max(2000, chunkCount * 500));
  const buffer = Math.ceil(maxTokens * 0.1);
  const budget = maxTokens + Math.min(buffer, 2000);

  const completion = await openai.chat.completions.create(
    {
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      response_format: { type: "json_object" },
      max_tokens: budget,
    },
    { signal },
  );

  const contentResult = completion.choices[0]?.message?.content;
  const finishReason = completion.choices[0]?.finish_reason;
  if (finishReason === "length") {
    throw new Error(`Model ${modelName}: respons terpotong (finish_reason=length). Coba model dengan output lebih besar.`);
  }
  if (!contentResult || contentResult.trim().length === 0) {
    throw new Error("Model mengembalikan respons teks kosong.");
  }

  // Bersihkan fence markdown jika ada
  let cleanedContent = contentResult.trim();
  if (cleanedContent.startsWith("```")) {
    cleanedContent = cleanedContent.slice(3);
    if (cleanedContent.toLowerCase().startsWith("json")) {
      cleanedContent = cleanedContent.slice(4);
    }
  }
  if (cleanedContent.endsWith("```")) {
    cleanedContent = cleanedContent.slice(0, -3);
  }
  cleanedContent = cleanedContent.trim();

  const parsedData = JSON.parse(cleanedContent);
  const targetQuestions = parsedData.questions ?? parsedData;

  if (!Array.isArray(targetQuestions) || targetQuestions.length === 0) {
    throw new Error('Respons JSON valid tetapi tidak mengandung array "questions".');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- normalize unknown API JSON
  const result: Question[] = targetQuestions.map((q: RawQuestion, index: number) => ({
    no: typeof q.no === "number" ? q.no : index + 1,
    question: q.question ?? "Soal tidak tersedia.",
    a: q.a ?? "",
    b: q.b ?? "",
    c: q.c ?? "",
    d: q.d ?? "",
    e: q.e ?? "",
    answer:
      typeof q.answer === "string"
        ? q.answer.toUpperCase().trim().charAt(0)
        : "A",
  }));

  return result;
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequestBody = await request.json();
    const { topic, count, gradeLevel, bloomLevel } = body;

    // 1. Validasi Input Awal
    if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
      return NextResponse.json(
        { error: "Topik materi wajib diisi." },
        { status: 400 },
      );
    }
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      return NextResponse.json(
        { error: "Jumlah soal harus antara 1 sampai 100." },
        { status: 400 },
      );
    }
    if (!gradeLevel || !["SD", "SMP", "SMA", "PT"].includes(gradeLevel)) {
      return NextResponse.json(
        { error: "Jenjang/gradeLevel wajib diisi: SD, SMP, SMA, atau PT." },
        { status: 400 },
      );
    }
    if (!bloomLevel || !["C1", "C2", "C3", "C4", "C5", "C6"].includes(bloomLevel)) {
      return NextResponse.json(
        { error: "Tingkat kognitif Bloom wajib dipilih dan harus antara C1 sampai C6." },
        { status: 400 },
      );
    }

    // Gunakan label lengkap jika tersedia, fallback ke nilai aslinya
    const bloomLabel = BLOOM_LABELS[bloomLevel] ?? bloomLevel;
    console.log(`[Generate] Jenjang: ${gradeLevel} (${GRADE_LABELS[gradeLevel] ?? gradeLevel})`);
    console.log(`[Generate] Bloom: ${bloomLabel}`);

    // 2. Inisialisasi OpenRouter Client
    const openai = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer":
          process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
        "X-Title": "Generator Soal CBT Indonesia",
      },
    });

    let questions: Question[] = [];
    let successModel = "";

    // 3. Pilih mode: single untuk ≤50, split-chunk untuk >50
    if (count <= 50) {
      // --- MODE SINGLE CASCADE ---
      console.log(`[Generate] Mode single — ${count} soal`);
      questions = await singleCascade(openai, topic, count, gradeLevel, bloomLabel);
      if (questions.length === 0) {
        return NextResponse.json(
          { error: "Gagal membuat soal — tidak ada model yang berhasil merespons. Coba lagi nanti atau kurangi jumlah soal." },
          { status: 502 },
        );
      }
      successModel = "single-call";
    } else {
      // --- MODE SPLIT-CHUNK ---
      console.log(`[Generate] Mode split-chunk — ${count} soal`);
      const chunks = splitCount(count);
      console.log(`[Generate] Split jadi ${chunks.length} chunk:`, chunks);

      const allChunks: (Question[] | null)[] = new Array(chunks.length).fill(null);
      let globalLastError = "Tidak ada model yang berhasil dieksekusi";

      // Sequential per-chunk to avoid free-tier rate limits.
      // ponytail: upgrade to Promise.allSettled(2 at a time) when switching to paid models
      for (let ci = 0; ci < chunks.length; ci++) {
        const result = await chunkCascade(
          openai,
          topic,
          chunks[ci],
          gradeLevel,
          bloomLabel,
          ci + 1,
          chunks.length,
          globalLastError,
        );

        if (result) {
          allChunks[ci] = result.questions;
          if (!successModel) successModel = result.model;
          globalLastError = ""; // reset — ada yang berhasil
        } else {
          globalLastError = `Chunk ${ci + 1}/${chunks.length} gagal di semua model`;
        }
      }

      // Filter null (chunk yg gagal total), merge, urutkan
      const succeeded = allChunks.filter(Boolean) as Question[][];
      if (succeeded.length === 0) {
        return NextResponse.json(
          {
            error: `Gagal membuat soal. Semua chunk gagal. Error terakhir: ${globalLastError}`,
          },
          { status: 502 },
        );
      }

      // Merge chunks — offset no soal
      questions = [];
      let noOffset = 0;
      for (const chunk of succeeded) {
        questions.push(
          ...chunk.map((q) => ({ ...q, no: q.no + noOffset })),
        );
        noOffset += chunk.length;
      }

      if (!successModel) successModel = "chunked-merge";
      console.log(`[Generate] Chunk merge: ${succeeded.length}/${chunks.length} chunk sukses — ${questions.length} soal`);
    }

    // 4. Validasi final hasil merge (untuk split-chunk) atau hasil single
    const validation = validateQuestions(questions, count);
    if (!validation.valid) {
      console.warn(`[Generate] Validasi final gagal: ${validation.errors.slice(0, 5).join("; ")}`);
      return NextResponse.json(
        {
          error: `Beberapa soal tidak lolos validasi: ${validation.errors.slice(0, 3).join("; ")}`,
        },
        { status: 502 },
      );
    }

    const distractorCheck = checkDistractors(questions);
    if (distractorCheck.warnings.length > 0) {
      console.log(`[Generate] Distractor warnings: ${distractorCheck.warnings.join(" | ")}`);
    }

    // 5. Header 16 kolom sesuai template CBT
    const headers = [
      "No Soal", "Soal", "PilA", "PilB", "PilC", "PilD", "PilE",
      "jawab", "Jenis", "file1", "file2", "fileA", "fileB", "fileC", "fileD", "fileE",
    ];

    const rows = questions.map((q) => [
      q.no, q.question, q.a, q.b, q.c, q.d, q.e, q.answer,
      1.0, "", "", "", "", "", "", "",
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

    const excelBuffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "biff8",
    });

    console.log(
      `[Generate] Sukses: ${questions.length} soal — topik "${topic}" — mode: ${successModel}`,
    );

    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.ms-excel",
        "Content-Disposition": 'attachment; filename="importdatasoal.xls"',
        "X-Model-Used": successModel,
        "X-Questions-Count": String(questions.length),
        "X-Grade-Level": gradeLevel,
      },
    });
  } catch (globalError) {
    console.error("[Global API Error]:", globalError);
    return NextResponse.json(
      { error: "Terjadi kegagalan sistem pada server. Silakan coba lagi." },
      { status: 500 },
    );
  }
}

/**
 * Single cascade: try models in order, first success wins.
 */
async function singleCascade(
  openai: OpenAI,
  topic: string,
  count: number,
  gradeLevel: string,
  bloomLabel: string,
): Promise<Question[]> {
  let lastError: string | undefined;

  for (const modelName of CASCADE_MODELS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000);

    try {
      console.log(`[AI Cascade] Mencoba model: ${modelName}`);
      const result = await callModelOnce(
        openai, modelName, topic, count, gradeLevel, bloomLabel, lastError, controller.signal,
      );

      clearTimeout(timeoutId);

      const validation = validateQuestions(result, count);
      if (!validation.valid) {
        const msg = `Model ${modelName}: ${validation.errors.slice(0, 5).join("; ")}`;
        console.warn(`[AI Cascade] ${msg}`);
        throw new Error(msg);
      }

      const distractorCheck = checkDistractors(result);
      if (distractorCheck.warnings.length > 0) {
        console.log(`[AI Cascade] Distractor warnings (${modelName}):`, distractorCheck.warnings.join(" | "));
      }

      console.log(`[AI Cascade] ✅ ${modelName} — ${result.length} soal lolos`);
      return result;
    } catch (modelError: any) {
      clearTimeout(timeoutId);
      lastError = modelError.name === "AbortError"
        ? `Timeout — ${modelName} tidak merespons dalam 55 detik`
        : (modelError?.message ?? "Unknown error");
      console.warn(`[AI Cascade] ${modelName} gagal: ${lastError}. Beralih...`);
    }
  }

  return []; // All models failed — caller handles
}

/**
 * Chunk cascade: for a single chunk, try models in order.
 * Returns { questions, model } or null if all models fail.
 */
async function chunkCascade(
  openai: OpenAI,
  topic: string,
  chunkCount: number,
  gradeLevel: string,
  bloomLabel: string,
  chunkIndex: number,
  totalChunks: number,
  lastError: string | undefined,
): Promise<{ questions: Question[]; model: string } | null> {
  let err: string | undefined = lastError;

  for (const modelName of CASCADE_MODELS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000);

    try {
      console.log(`[Chunk ${chunkIndex}/${totalChunks}] Mencoba model: ${modelName}`);

      const prompt = buildPrompt(topic, chunkCount, gradeLevel, bloomLabel, err);
      const fullPrompt = prompt + `\n\nCATATAN: Ini adalah bagian ${chunkIndex}/${totalChunks} dari total soal. Buat tepat ${chunkCount} soal bagian ini.`;

      const maxTokens = Math.min(12000, Math.max(2000, chunkCount * 500));
      const buffer = Math.ceil(maxTokens * 0.1);
      const budget = maxTokens + Math.min(buffer, 2000);

      const completion = await openai.chat.completions.create(
        {
          model: modelName,
          messages: [{ role: "user", content: fullPrompt }],
          temperature: 0.7,
          response_format: { type: "json_object" },
          max_tokens: budget,
        },
        { signal: controller.signal },
      );

      clearTimeout(timeoutId);

      const contentResult = completion.choices[0]?.message?.content;
      const finishReason = completion.choices[0]?.finish_reason;
      if (finishReason === "length") {
        throw new Error(`Model ${modelName}: respons terpotong (finish_reason=length). Coba model dengan output lebih besar.`);
      }
      if (!contentResult || contentResult.trim().length === 0) {
        throw new Error("Model mengembalikan respons teks kosong.");
      }

      let cleanedContent = contentResult.trim();
      if (cleanedContent.startsWith("```")) {
        cleanedContent = cleanedContent.slice(3);
        if (cleanedContent.toLowerCase().startsWith("json")) {
          cleanedContent = cleanedContent.slice(4);
        }
      }
      if (cleanedContent.endsWith("```")) {
        cleanedContent = cleanedContent.slice(0, -3);
      }
      cleanedContent = cleanedContent.trim();

      const parsedData = JSON.parse(cleanedContent);
      const targetQuestions = parsedData.questions ?? parsedData;

      if (!Array.isArray(targetQuestions) || targetQuestions.length === 0) {
        throw new Error('Respons JSON valid tetapi tidak mengandung array "questions".');
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const questions = targetQuestions.map((q: RawQuestion, index: number) => ({
        no: typeof q.no === "number" ? q.no : index + 1,
        question: q.question ?? "Soal tidak tersedia.",
        a: q.a ?? "", b: q.b ?? "", c: q.c ?? "", d: q.d ?? "", e: q.e ?? "",
        answer: typeof q.answer === "string" ? q.answer.toUpperCase().trim().charAt(0) : "A",
      }));

      // Validasi per chunk
      const validation = validateQuestions(questions, chunkCount);
      if (!validation.valid) {
        const msg = `Model ${modelName}: ${validation.errors.slice(0, 5).join("; ")}`;
        console.warn(`[Chunk ${chunkIndex}/${totalChunks}] ${msg}`);
        throw new Error(msg);
      }

      const distractorCheck = checkDistractors(questions);
      if (distractorCheck.warnings.length > 0) {
        console.log(`[Chunk ${chunkIndex}/${totalChunks}] Warnings:`, distractorCheck.warnings.join(" | "));
      }

      console.log(`[Chunk ${chunkIndex}/${totalChunks}] ✅ ${modelName} — ${questions.length} soal`);
      return { questions, model: modelName };
    } catch (modelError: any) {
      clearTimeout(timeoutId);
      err = modelError.name === "AbortError"
        ? `Timeout — ${modelName} tidak merespons dalam 55 detik`
        : (modelError?.message ?? "Unknown error");
      console.warn(`[Chunk ${chunkIndex}/${totalChunks}] ${modelName} gagal: ${err}. Beralih...`);
    }
  }

  return null; // All models failed for this chunk
}
