import fs from "fs";
import path from "path";
import crypto from "crypto";

const root = process.cwd();
const promptDir = path.join(root, "prompts");
const outFile = path.join(promptDir, "prompt-hashes.json");

const files = fs.readdirSync(promptDir).filter((name) => name.endsWith(".md"));
const hashes = {};

for (const name of files) {
  const full = path.join(promptDir, name);
  const raw = fs.readFileSync(full, "utf8");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  hashes[name] = hash;
}

fs.writeFileSync(outFile, JSON.stringify(hashes, null, 2));
console.log("Wrote prompt hashes to", outFile);
