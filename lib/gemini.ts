import { GoogleGenAI } from "@google/genai";
import { GeminiFinishReason, GeminiResult } from "@/types";
import { buildSystemPrompt, sanitizeUserMessage } from "@/lib/prompt";

// ชั่วคราว: สลับจาก gemini-3.5-flash มา 2.5-flash เพราะ API key ชนโควต้า 429 ของ 3.5
// (ดู error ใน Vercel logs) — สลับกลับได้เมื่อเปิด billing/โควต้าเพิ่มแล้ว
const MODEL = "gemini-2.5-flash";
const TEMPERATURE = 1.0;
const MAX_OUTPUT_TOKENS = 1024;
const TIMEOUT_MS = 8000;

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Gemini call timed out after ${ms}ms`)),
      ms
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function normalizeFinishReason(reason: string | undefined): GeminiFinishReason {
  switch (reason) {
    case "STOP":
    case "MAX_TOKENS":
    case "SAFETY":
    case "RECITATION":
      return reason;
    default:
      return reason ? "OTHER" : "UNKNOWN";
  }
}

export async function callGemini(
  userMessage: string,
  faqText: string
): Promise<GeminiResult> {
  const ai = getClient();

  const response = await withTimeout(
    ai.models.generateContent({
      model: MODEL,
      contents: sanitizeUserMessage(userMessage),
      config: {
        systemInstruction: buildSystemPrompt(faqText),
        temperature: TEMPERATURE,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        // งาน FAQ lookup สั้นๆ ไม่ต้อง reasoning ลึก — ปิด thinking ไปเลย กัน
        // thoughtsTokenCount กินโควต้า maxOutputTokens จนตอบไม่จบ (MAX_TOKENS) แบบที่เจอมาแล้ว
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    }),
    TIMEOUT_MS
  );

  const candidate = response.candidates?.[0];
  const finishReason = normalizeFinishReason(candidate?.finishReason);
  const text = response.text ?? "";
  const thoughtsTokenCount = response.usageMetadata?.thoughtsTokenCount ?? 0;
  const candidatesTokenCount = response.usageMetadata?.candidatesTokenCount ?? 0;

  return { text, finishReason, thoughtsTokenCount, candidatesTokenCount };
}
