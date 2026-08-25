const INSTRUCTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions?/gi,
  /system\s+prompt/gi,
  /developer\s+message/gi,
  /you\s+are\s+chatgpt/gi,
  /tool\s*call/gi,
];

export type TextChunk = { index: number; heading?: string; content: string; tokenCount: number; metadata: Record<string, unknown> };

export function sanitizeUntrustedText(input: string) {
  const withoutMarkup = input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/javascript:/gi, "")
    .replace(/\u0000/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return INSTRUCTION_PATTERNS.reduce((text, pattern) => text.replace(pattern, "[untrusted instruction removed]"), withoutMarkup);
}

export function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.split(/\s+/).length / 0.75));
}

export function chunkDocument(input: string, targetTokens = 520, overlapTokens = 80): TextChunk[] {
  const text = sanitizeUntrustedText(input);
  if (!text) return [];
  const paragraphs = text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const targetWords = Math.floor(targetTokens * 0.75);
  const overlapWords = Math.floor(overlapTokens * 0.75);
  const chunks: TextChunk[] = [];
  let words: string[] = [];
  let heading: string | undefined;

  function flush() {
    if (!words.length) return;
    const content = words.join(" ").trim();
    chunks.push({ index: chunks.length, heading, content, tokenCount: Math.min(700, estimateTokens(content)), metadata: { untrusted: true } });
    words = words.slice(Math.max(0, words.length - overlapWords));
  }

  for (const paragraph of paragraphs) {
    const looksLikeHeading = paragraph.length <= 100 && !/[.!?]$/.test(paragraph);
    if (looksLikeHeading) heading = paragraph;
    const paragraphWords = paragraph.split(/\s+/);
    while (words.length + paragraphWords.length > targetWords) {
      const room = Math.max(1, targetWords - words.length);
      words.push(...paragraphWords.splice(0, room));
      flush();
    }
    words.push(...paragraphWords);
  }
  if (words.length > overlapWords || chunks.length === 0) flush();
  return chunks.slice(0, 500);
}
