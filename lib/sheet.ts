import { FaqRow } from "@/types";
import { log } from "@/lib/log";

const CACHE_TTL_MS = 60_000;

interface SheetCache {
  csvRaw: string;
  rows: FaqRow[];
  fetchedAt: number;
}

let cache: SheetCache | null = null;

function parseCsv(csvRaw: string): FaqRow[] {
  const lines = csvRaw.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());

  return lines
    .slice(1)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const values = splitCsvLine(line);
      const row: Record<string, string> = {};
      headers.forEach((header, i) => {
        row[header] = (values[i] ?? "").trim();
      });
      return row as unknown as FaqRow;
    });
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
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
