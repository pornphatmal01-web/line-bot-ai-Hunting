export interface FaqRow {
  question: string;
  answer: string;
  category?: string;
  keywords?: string;
}

export type GeminiFinishReason =
  | "STOP"
  | "MAX_TOKENS"
  | "SAFETY"
  | "RECITATION"
  | "OTHER"
  | "UNKNOWN";

export interface GeminiResult {
  text: string;
  finishReason: GeminiFinishReason;
  thoughtsTokenCount: number;
  candidatesTokenCount: number;
}
