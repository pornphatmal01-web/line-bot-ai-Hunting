import { pushText } from "@/lib/line";
import { log } from "@/lib/log";
import { HANDOFF_REPLY } from "@/lib/prompt";

export { HANDOFF_REPLY };

// หมายเหตุ: "สมัคร" "ทดลองใช้" "สนใจ" ไม่อยู่ในลิสต์นี้โดยตั้งใจ — คำถามสมัคร/ทดลองใช้ EA
// ต้องผ่าน FAQ ก่อนเสมอ ถ้า FAQ ไม่มีคำตอบจริงๆ จะตกไปที่ default_reply ตามปกติ ไม่ตัดผ่าน handoff
const HANDOFF_TRIGGERS = [
  "คุยกับคน",
  "ขอแอดมิน",
  "ขอเจ้าของ",
  "ฟ้อง",
  "ร้องเรียน",
  "ไม่พอใจ",
  "โดนโกง",
  "หลอกลวง",
  "เป็นตัวแทน",
  "รีเซลเลอร์",
  "ขายส่ง",
  "wholesale",
  "ติดต่อสื่อ",
  "สัมภาษณ์",
];

export function shouldHandoff(message: string): boolean {
  const lower = message.toLowerCase();
  return HANDOFF_TRIGGERS.some((trigger) => lower.includes(trigger.toLowerCase()));
}

export async function notifyAdmin(userId: string, userMessage: string): Promise<void> {
  const adminGroupId = process.env.ADMIN_GROUP_ID;
  if (!adminGroupId) {
    log.warn("handoff.admin_group_not_configured");
    return;
  }

  try {
    await pushText(
      adminGroupId,
      `🔔 ลูกค้าต้องการคุยกับแอดมิน (EA TURBO HUNTING)\n\nUserID: ${userId}\nข้อความ: ${userMessage}`
    );
  } catch (error) {
    log.error("handoff.notify_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
