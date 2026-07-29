import { NextRequest, NextResponse } from "next/server";
import type { WebhookEvent } from "@line/bot-sdk";
import { verifySignature, replyText } from "@/lib/line";
import { getFaqCsv, formatFaqText } from "@/lib/sheet";
import { DEFAULT_REPLY } from "@/lib/prompt";
import { callGemini } from "@/lib/gemini";
import { shouldHandoff, notifyAdmin, HANDOFF_REPLY } from "@/lib/handoff";
import { extractApprovalRequest, submitAccountApproval, notifyAdminNewApproval } from "@/lib/license";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 30;

function maskUserId(userId: string | undefined): string {
  if (!userId) return "unknown";
  if (userId.length <= 8) return "****";
  return `${userId.slice(0, 4)}****${userId.slice(-4)}`;
}

async function replyWithRetry(
  replyToken: string,
  text: string,
  attempts: number
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      await replyText(replyToken, text);
      return;
    } catch (error) {
      if (i === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1)));
    }
  }
}

async function handleEvent(event: WebhookEvent): Promise<void> {
  // ช่วยหา groupId/roomId จริง — ไม่ใช่ PII ของลูกค้า เป็นแค่ ID ของห้องแชท
  // ใช้ค่านี้ไปตั้ง ADMIN_GROUP_ID ได้เลยเมื่อบอทถูกเชิญเข้ากลุ่มแอดมินแล้ว
  if (event.source?.type === "group" || event.source?.type === "room") {
    log.info("webhook.source_id", {
      sourceType: event.source.type,
      groupId: event.source.type === "group" ? event.source.groupId : undefined,
      roomId: event.source.type === "room" ? event.source.roomId : undefined,
    });
  }

  if (event.type !== "message" || event.message.type !== "text") return;

  const { replyToken, message, source } = event;
  const userMessage = message.text;
  const userId = source?.userId;
  const maskedUserId = maskUserId(userId);

  const accountNumber = extractApprovalRequest(userMessage);
  if (accountNumber) {
    const result = await submitAccountApproval(accountNumber);
    log.info("license.approval_requested", { userId: maskedUserId, accountNumber, result });

    let approvalReply: string;
    if (result === "already_active") {
      approvalReply = `บัญชี ${accountNumber} ได้รับอนุมัติสิทธิ์ใช้งานแล้วครับ ใช้งาน EA ได้เลยครับ`;
    } else if (result === "already_pending") {
      approvalReply = `บัญชี ${accountNumber} อยู่ระหว่างรอแอดมินตรวจสอบและอนุมัติครับ รบกวนรอสักครู่นะครับ`;
    } else if (result === "submitted") {
      approvalReply = `รับเลขบัญชี ${accountNumber} แล้วครับ ส่งให้แอดมินตรวจสอบและอนุมัติสิทธิ์ให้แล้ว รอการยืนยันอีกครั้งนะครับ`;
      if (userId) await notifyAdminNewApproval(userId, accountNumber);
    } else {
      approvalReply = DEFAULT_REPLY;
    }

    try {
      await replyWithRetry(replyToken, approvalReply, 3);
    } catch (error) {
      log.error("license.reply_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (shouldHandoff(userMessage)) {
    if (userId) await notifyAdmin(userId, userMessage);
    log.info("handoff.routed", { userId: maskedUserId });

    try {
      await replyWithRetry(replyToken, HANDOFF_REPLY, 3);
    } catch (error) {
      log.error("handoff.reply_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  const startTime = Date.now();
  let replyMessage: string;

  try {
    const { rows } = await getFaqCsv();
    const faqText = formatFaqText(rows);
    const result = await callGemini(userMessage, faqText);

    log.info("reply.generated", {
      userId: maskedUserId,
      latencyMs: Date.now() - startTime,
      finishReason: result.finishReason,
      thoughtsTokenCount: result.thoughtsTokenCount,
      candidatesTokenCount: result.candidatesTokenCount,
    });

    replyMessage =
      result.finishReason === "MAX_TOKENS" || !result.text.trim()
        ? DEFAULT_REPLY
        : result.text.trim();
  } catch (error) {
    log.error("gemini.failed", {
      userId: maskedUserId,
      error: error instanceof Error ? error.message : String(error),
    });
    replyMessage = DEFAULT_REPLY;
  }

  try {
    await replyWithRetry(replyToken, replyMessage, 3);
  } catch (error) {
    log.error("webhook.reply_failed", {
      userId: maskedUserId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");

  if (!verifySignature(rawBody, signature)) {
    log.warn("webhook.invalid_signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let events: WebhookEvent[] = [];
  try {
    events = JSON.parse(rawBody).events ?? [];
  } catch (error) {
    log.error("webhook.parse_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  await Promise.all(events.map(handleEvent));

  return NextResponse.json({ ok: true }, { status: 200 });
}
