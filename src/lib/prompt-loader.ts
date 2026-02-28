import fs from "fs";
import path from "path";
import crypto from "crypto";

type PromptFile = {
  raw: string;
  content: string;
  hash: string;
};

const PROMPT_DIR = path.join(process.cwd(), "prompts");
const cache = new Map<string, PromptFile>();

export function loadPromptFile(filename: string): PromptFile {
  const cached = cache.get(filename);
  if (cached) return cached;

  const filePath = path.join(PROMPT_DIR, filename);
  const raw = fs.readFileSync(filePath, "utf8");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const content = raw.replace(/\{\{PROMPT_HASH\}\}/g, hash);
  const record = { raw, content, hash };
  cache.set(filename, record);
  return record;
}

export function extractFirstCodeBlock(markdown: string): string {
  const fence = markdown.indexOf("```");
  if (fence === -1) return markdown;
  const next = markdown.indexOf("```", fence + 3);
  if (next === -1) return markdown;
  return markdown.slice(fence + 3, next).trim();
}

export function extractCodeBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const regex = /```[\s\S]*?```/g;
  const matches = markdown.match(regex) || [];
  for (const match of matches) {
    const inner = match.replace(/^```/, "").replace(/```$/, "").trim();
    blocks.push(inner);
  }
  return blocks;
}
