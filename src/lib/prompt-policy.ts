import fs from "fs";
import path from "path";

type Variant = { file: string; weight?: number };
type Policy = {
  core_rules?: { variants: Variant[] };
};

const DEFAULT_POLICY_FILE = process.env.PROMPT_POLICY_FILE
  ? path.join(process.cwd(), process.env.PROMPT_POLICY_FILE)
  : path.join(process.cwd(), "prompts", "prompt-policy.json");

function loadPolicy(): Policy | null {
  try {
    if (!fs.existsSync(DEFAULT_POLICY_FILE)) return null;
    const raw = fs.readFileSync(DEFAULT_POLICY_FILE, "utf8");
    return JSON.parse(raw) as Policy;
  } catch {
    return null;
  }
}

function pickWeighted(variants: Variant[]): Variant {
  const total = variants.reduce((sum, v) => sum + (v.weight ?? 1), 0);
  const roll = Math.random() * total;
  let acc = 0;
  for (const v of variants) {
    acc += v.weight ?? 1;
    if (roll <= acc) return v;
  }
  return variants[0];
}

export function pickCoreRulesPrompt(defaultFile = "00-core-rules.md") {
  const policy = loadPolicy();
  const variants = policy?.core_rules?.variants;
  if (!variants || variants.length === 0) return defaultFile;
  return pickWeighted(variants).file;
}
