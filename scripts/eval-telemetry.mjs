import fs from "fs";
import path from "path";

const root = process.cwd();
const logFile = path.join(root, "telemetry", "events.jsonl");
const outFile = path.join(root, "telemetry", "report.json");

if (!fs.existsSync(logFile)) {
  console.error("No telemetry log found:", logFile);
  process.exit(1);
}

const lines = fs.readFileSync(logFile, "utf8").trim().split("\n");
const events = lines.map((line) => {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}).filter(Boolean);

const generateByRequest = new Map();
const stats = new Map();

function getKey(meta) {
  const file = meta.prompt_file || "unknown";
  const hash = meta.prompt_hash || "unknown";
  return `${file}::${hash}`;
}

for (const ev of events) {
  if (ev.type === "generate") {
    const requestId = ev.sessionId || ev.payload?.request_id || ev.payload?.requestId;
    if (!requestId) continue;
    const meta = {
      prompt_file: ev.payload?.prompt_file,
      prompt_hash: ev.payload?.prompt_hash,
      mode: ev.payload?.mode,
      provider: ev.payload?.provider,
    };
    generateByRequest.set(requestId, meta);
    const key = getKey(meta);
    const row = stats.get(key) || { generates: 0, selects: 0, downloads: 0 };
    row.generates += 1;
    stats.set(key, row);
  }

  if (ev.type === "feedback") {
    const reqId = ev.payload?.request_id || ev.payload?.requestId || ev.sessionId;
    if (!reqId) continue;
    const meta = generateByRequest.get(reqId);
    if (!meta) continue;
    const key = getKey(meta);
    const row = stats.get(key) || { generates: 0, selects: 0, downloads: 0 };
    if (ev.payload?.action === "select") row.selects += 1;
    if (ev.payload?.action === "download") row.downloads += 1;
    stats.set(key, row);
  }
}

const report = Array.from(stats.entries()).map(([key, row]) => {
  const [file, hash] = key.split("::");
  const selectRate = row.generates > 0 ? row.selects / row.generates : 0;
  const downloadRate = row.generates > 0 ? row.downloads / row.generates : 0;
  return { prompt_file: file, prompt_hash: hash, ...row, selectRate, downloadRate };
}).sort((a, b) => b.selectRate - a.selectRate);

fs.writeFileSync(outFile, JSON.stringify({ totalEvents: events.length, report }, null, 2));
console.log("Wrote telemetry report to", outFile);
