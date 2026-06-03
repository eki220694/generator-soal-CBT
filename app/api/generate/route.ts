// app/api/generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import * as XLSX from "xlsx";

interface GenerateRequestBody {
  topic: string;
  count: number;
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

// Model free tier OpenRouter yang aktif per Juni 2026
// Referensi: https://openrouter.ai/collections/free-models
const CASCADE_MODELS = [
  "openrouter/auto", // Auto-route ke model free terbaik yang tersedia
  "meta-llama/llama-4-scout:free", // Cepat, 128K context, bagus untuk structured output
  "meta-llama/llama-4-maverick:free", // Lebih powerful dari Scout
  "deepseek/deepseek-r1-0528:free", // Reasoning kuat, cocok untuk soal Bloom HOTS
  "meta-llama/llama-3.3-70b-instruct:free", // Fallback stabil
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

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequestBody = await request.json();
    const { topic, count, bloomLevel } = body;

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
    if (!bloomLevel || typeof bloomLevel !== "string") {
      return NextResponse.json(
        { error: "Tingkat kognitif Bloom wajib dipilih." },
        { status: 400 },
      );
    }

    // Gunakan label lengkap jika tersedia, fallback ke nilai aslinya
    const bloomLabel = BLOOM_LABELS[bloomLevel] ?? bloomLevel;

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

    // 3. Prompt dalam Bahasa Indonesia
    const prompt = `Kamu adalah pembuat soal ujian profesional untuk pendidikan di Indonesia.

Buatlah tepat ${count} soal pilihan ganda dalam Bahasa Indonesia yang baik dan benar.
Topik: "${topic.trim()}"
Tingkat Kognitif Taksonomi Bloom: ${bloomLabel}

ATURAN WAJIB:
- Seluruh soal dan semua pilihan jawaban HARUS menggunakan Bahasa Indonesia. Dilarang menggunakan bahasa Inggris.
- Setiap soal harus sesuai dengan tingkat kognitif Bloom yang diminta.
- Pilihan jawaban harus masuk akal dan tidak terlalu mudah ditebak.
- Hanya ada SATU jawaban yang benar untuk setiap soal.
- Kolom "answer" hanya berisi satu huruf kapital: A, B, C, D, atau E.

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

    let questions: Question[] = [];
    let lastHandledError = "Tidak ada model yang berhasil dieksekusi";
    let successModel = "";

    // 4. Loop Cascade dengan timeout yang cukup untuk generate banyak soal
    for (const modelName of CASCADE_MODELS) {
      const controller = new AbortController();

      // Timeout dinaikkan ke 55 detik — cukup untuk generate 50-100 soal di free tier
      // Catatan: Vercel Hobby max 60 detik, Vercel Pro max 300 detik
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 55000);

      try {
        console.log(`[AI Cascade] Mencoba model: ${modelName}`);

        const completion = await openai.chat.completions.create(
          {
            model: modelName,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            response_format: { type: "json_object" },
          },
          {
            signal: controller.signal,
          },
        );

        clearTimeout(timeoutId);

        const contentResult = completion.choices[0]?.message?.content;
        if (!contentResult || contentResult.trim().length === 0) {
          throw new Error("Model mengembalikan respons teks kosong.");
        }

        // Bersihkan fence markdown jika ada (tanpa regex literal)
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
          throw new Error(
            'Respons JSON valid tetapi tidak mengandung array "questions".',
          );
        }

        // Normalisasi data
        questions = targetQuestions.map((q: any, index: number) => ({
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

        successModel = modelName;
        console.log(
          `[AI Cascade] Berhasil dengan model: ${modelName} (${questions.length} soal)`,
        );
        break;
      } catch (modelError: any) {
        clearTimeout(timeoutId);

        if (modelError.name === "AbortError") {
          lastHandledError = `Timeout — model ${modelName} tidak merespons dalam 55 detik`;
        } else {
          lastHandledError = modelError?.message ?? "Unknown Model Error";
        }

        console.warn(
          `[AI Cascade Warning] Model ${modelName} gagal: ${lastHandledError}. Beralih...`,
        );
      }
    }

    // 5. Semua model gagal
    if (questions.length === 0) {
      return NextResponse.json(
        {
          error: `Gagal membuat soal. Semua model AI gagal atau timeout. Error terakhir: ${lastHandledError}`,
        },
        { status: 502 },
      );
    }

    // 6. Header 16 kolom sesuai template CBT
    const headers = [
      "No Soal",
      "Soal",
      "PilA",
      "PilB",
      "PilC",
      "PilD",
      "PilE",
      "jawab",
      "Jenis",
      "file1",
      "file2",
      "fileA",
      "fileB",
      "fileC",
      "fileD",
      "fileE",
    ];

    // 7. Mapping baris data
    const rows = questions.map((q) => [
      q.no,
      q.question,
      q.a,
      q.b,
      q.c,
      q.d,
      q.e,
      q.answer,
      1.0,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);

    // 8. Generate file Excel .xls (biff8)
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

    const excelBuffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "biff8",
    });

    console.log(
      `[Generate] Sukses: ${questions.length} soal — topik "${topic}" — model: ${successModel}`,
    );

    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.ms-excel",
        "Content-Disposition": 'attachment; filename="importdatasoal.xls"',
        "X-Model-Used": successModel,
        "X-Questions-Count": String(questions.length),
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
