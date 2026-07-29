import { FaqRow } from "@/types";
import { log } from "@/lib/log";

const CACHE_TTL_MS = 60_000;

interface SheetCache {
  csvRaw: string;
  rows: FaqRow[];
  fetchedAt: number;
}

let cache: SheetCache | null = null;

// Parser เดียวไล่ทั้งไฟล์ ไม่ split เป็นบรรทัดก่อน — เพราะ cell ในชีตอาจมีการ
// ขึ้นบรรทัดใหม่ในตัวเอง (multi-line answer ที่ครอบด้วย quote) การ split ด้วย
// \n ก่อนจะตัด quoted field ที่มีหลายบรรทัดให้ขาดครึ่งกลางทาง
function parseCsvRows(csvRaw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < csvRaw.length; i++) {
    const char = csvRaw[i];
    if (char === "\r") continue; // ส่วนหนึ่งของ \r\n เสมอ ไม่ต้องเก็บไว้ในค่า

    if (inQuotes) {
      if (char === '"' && csvRaw[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function parseCsv(csvRaw: string): FaqRow[] {
  const rows = parseCsvRows(csvRaw.trim());
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim().toLowerCase());

  return rows
    .slice(1)
    .filter((values) => values.some((v) => v.trim().length > 0))
    .map((values) => {
      const row: Record<string, string> = {};
      headers.forEach((header, i) => {
        row[header] = (values[i] ?? "").trim();
      });
      return row as unknown as FaqRow;
    });
}

export function formatFaqText(rows: FaqRow[]): string {
  return rows
    .filter((row) => row.question && row.answer)
    .map((row) => {
      const label = row.category ? `[${row.category}] ` : "";
      const keywords = row.keywords ? ` (คำที่เกี่ยวข้อง: ${row.keywords})` : "";
      return `${label}${row.question}${keywords}\n→ ${row.answer}`;
    })
    .join("\n\n");
}

export async function getFaqCsv(): Promise<{ csvRaw: string; rows: FaqRow[] }> {
  const now = Date.now();

  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return { csvRaw: cache.csvRaw, rows: cache.rows };
  }

  const sheetUrl = process.env.SHEET_CSV_URL;
  if (!sheetUrl) {
    if (cache) return { csvRaw: cache.csvRaw, rows: cache.rows };
    throw new Error("SHEET_CSV_URL is not configured");
  }

  try {
    const res = await fetch(sheetUrl, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Sheet fetch failed with status ${res.status}`);
    }
    const csvRaw = await res.text();
    const rows = parseCsv(csvRaw);

    cache = { csvRaw, rows, fetchedAt: now };
    return { csvRaw, rows };
  } catch (error) {
    if (cache) {
      log.warn("sheet.fetch_failed_stale_cache", {
        error: error instanceof Error ? error.message : String(error),
      });
      return { csvRaw: cache.csvRaw, rows: cache.rows };
    }
    throw error;
  }
}
