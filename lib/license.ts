import { pushText } from "@/lib/line";
import { log } from "@/lib/log";

const LICENSE_SHEET_EDIT_URL =
  "https://docs.google.com/spreadsheets/d/1Wr17xYzMfUFQ1WF4S7qW0D9IKUpTWTUPuthzLXhmvQ4/edit";

// คำที่ลูกค้ามักพิมพ์ตอนแจ้งเลขบัญชีขออนุมัติสิทธิ์ (กันสะกดผิด/สลับพยางค์)
const APPROVAL_TRIGGERS = [
  "อนุมัติ",
  "อนมุัติ",
  "ขอสิทธิ",
  "แจ้งเลขบัญชี",
  "แจ้งบัญชี",
];
const ACCOUNT_NUMBER_PATTERN = /\b\d{6,9}\b/;

export function extractApprovalRequest(message: string): string | null {
  const hasTrigger = APPROVAL_TRIGGERS.some((trigger) => message.includes(trigger));
  if (!hasTrigger) return null;

  const match = message.match(ACCOUNT_NUMBER_PATTERN);
  return match ? match[0] : null;
}

export type ApprovalResult = "already_active" | "already_pending" | "submitted" | "error";

export async function submitAccountApproval(accountNumber: string): Promise<ApprovalResult> {
  const scriptUrl = process.env.IB_APPROVAL_SCRIPT_URL;
  if (!scriptUrl) {
    log.warn("license.script_url_not_configured");
    return "error";
  }

  try {
    const res = await fetch(scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `accountNumber=${encodeURIComponent(accountNumber)}`,
    });
    const text = (await res.text()).trim();

    if (text.startsWith("active")) return "already_active";
    if (text.startsWith("added")) return "submitted";
    if (text.startsWith("pending")) return "already_pending";

    log.error("license.submit_unexpected_response", { response: text });
    return "error";
  } catch (error) {
    log.error("license.submit_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return "error";
  }
}

export async function notifyAdminNewApproval(
  userId: string,
  accountNumber: string
): Promise<void> {
  const adminGroupId = process.env.ADMIN_GROUP_ID;
  if (!adminGroupId) {
    log.warn("license.admin_group_not_configured");
    return;
  }

  try {
    await pushText(
      adminGroupId,
      `🔔 คำขออนุมัติสิทธิ์ EA ใหม่ (Status=pending)\n\nเลขบัญชี: ${accountNumber}\nUserID: ${userId}\n\nเข้าไปตรวจสอบ/อนุมัติได้ที่: ${LICENSE_SHEET_EDIT_URL}`
    );
  } catch (error) {
    log.error("license.notify_admin_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
