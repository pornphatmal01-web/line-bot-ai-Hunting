import { NextRequest, NextResponse } from "next/server";
import type { WebhookEvent } from "@line/bot-sdk";
import { verifySignature, replyText } from "@/lib/line";
import { getFaqCsv } from "@/lib/sheet";
import { buildPrompt, DEFAULT_REPLY } from "@/lib/prompt";
import { callGemini } from "@/lib/gemini";

export const runtime = "nodejs";

function maskUserId(userId: string | undefined): string {
  if (!userId) return "unknown";
  if (userId.length <= 8) return "****";
  return `${userId.slice(0, 4)}****${userId.slice(-4)}`;
}

async function handleEvent(event: WebhookEvent): Promise<void> {
  if (event.type !== "message" || event.message.type !== "text") return;

  const { replyToken, message, source } = event;
  const userMessage = message.text;

  const log: Record<string, unknown> = {
    userId: maskUserId(source?.userId),
    timestamp: new Date().toISOString(),
  };

  let replyMessage: string;

  try {
    const { csvRaw } = await getFaqCsv();
    const prompt = buildPrompt(csvRaw, userMessage);
    const result = await callGemini(prompt);

    log.finishReason = result.finishReason;
    log.thoughtsTokenCount = result.thoughtsTokenCount;
    log.candidatesTokenCount = result.candidatesTokenCount;

    replyMessage =
      result.finishReason === "MAX_TOKENS" || !result.text.trim()
        ? DEFAULT_REPLY
        : result.text.trim();
  } catch (error) {
    log.error = error instanceof Error ? error.message : String(error);
    replyMessage = DEFAULT_REPLY;
  }

  console.log("[line-webhook]", JSON.stringify(log));

  try {
    await replyText(replyToken, replyMessage);
  } catch (error) {
    console.error("[line-webhook] reply failed:", error);
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let events: WebhookEvent[] = [];
  try {
    events = JSON.parse(rawBody).events ?? [];
  } catch (error) {
    console.error("[line-webhook] failed to parse body:", error);
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  await Promise.all(events.map(handleEvent));

  return NextResponse.json({ ok: true }, { status: 200 });
}
