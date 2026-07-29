# CLAUDE.md — LINE Bot AI Project

## What we're building

LINE Official Account bot for **EA TURBO HUNTING** (ธุรกิจ EA เทรดทองคำ ขายผ่านเพจ +
ไลน์กลุ่ม) — ตอบลูกค้า 24 ชม. โดยใช้ Gemini (`gemini-3.5-flash`) อ่าน FAQ จาก Google
Sheet แล้วส่ง reply กลับ LINE ผ่าน `@line/bot-sdk`

## Stack — locked

- Next.js 14 App Router + TypeScript
- `@line/bot-sdk` for LINE Messaging API
- `@google/genai` for Gemini (`gemini-3.5-flash`, `thinkingConfig.thinkingLevel = LOW`)
- Google Sheet CSV public URL for FAQ
- Vercel for hosting
- npm (มี `package-lock.json` — ไม่ใช้ pnpm/yarn)

## Repo conventions

- `app/api/line-webhook/route.ts` — POST handler (verify signature → Smart Handoff check → FAQ + Gemini → reply)
- `lib/sheet.ts` — fetch + parse + cache FAQ CSV (60s TTL), `formatFaqText()` แปลงเป็นข้อความอ่านง่ายให้ AI
- `lib/gemini.ts` — call Gemini ด้วย `systemInstruction` (จาก `lib/prompt.ts`) + timeout + finishReason
- `lib/prompt.ts` — `buildSystemPrompt()` (guardrails + reasoning protocol) + `sanitizeUserMessage()`
- `lib/handoff.ts` — Smart Handoff trigger detection + แจ้งเตือนแอดมินกลุ่ม LINE
- `lib/line.ts` — verify signature, reply/push message helpers
- `lib/log.ts` — structured logging helper
- `.env.local` — env vars จริง (ห้าม commit จริง ใช้ `.env.example` แทน)

## Env vars (Vercel)

- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `GEMINI_API_KEY`
- `SHEET_CSV_URL`
- `ADMIN_GROUP_ID` (Smart Handoff target · optional — ถ้าไม่ตั้งจะ log warning แล้วข้าม ไม่ throw)

## Don'ts

- ❌ Hardcode any token/key — use env vars
- ❌ Skip signature verification — security risk
- ❌ Skip timeout on Gemini calls — webhook must reply within LINE's `replyToken` lifetime
- ❌ Cache FAQ for >60s — owner edits Sheet should reflect quickly
- ❌ Log full LINE message content — PII risk · log only metadata (length, flags, masked userId)
- ❌ ให้คำแนะนำการลงทุน หรือการันตีผลกำไร/ขาดทุน — ธุรกิจนี้คือ EA เทรดทองคำ ต้องระวังเรื่อง compliance
