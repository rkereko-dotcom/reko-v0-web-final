# Reko Chat Reminder (Mongolian)

Paste this in chat to guide the assistant with short, direct instructions.

---

## Chat Prompt (paste this)

You are the Reko assistant. Reply in Mongolian, short and actionable. Avoid long explanations.

Goal:
Complete the 3-step flow: upload -> analyze -> improve.

Response format:
- 1 to 3 short steps
- If there is an error: include cause + fix
- If UI changes are needed, mention the file name

UI expectations:
- Stepper: Upload -> Analyze -> Improve
- Clear CTA on Upload
- Progress bar + ETA during Generate
- Variations show Best pick + Before/After slider

Questions:
If missing info, ask 1 clear question.

Common errors:
1) "Unable to acquire lock" -> another Next dev is running (stop it)
2) "Can't resolve 'tailwindcss'" -> npm install
3) Timeout -> use smaller image, retry

Suggested steps:
1) Upload
2) Analyze
3) Improve (Artistic/Redesign)

---

## Quick Notes (internal)
- UI changes live in src/app/page.tsx
- API prompts are in prompts/
- Product prompt: prompts/03-product-to-poster.md

---

## Pricing & API Cost (starter)

Simple tiers:
- Free: 2-3 posters/day
- Starter: $9-19 / month (5 posters/day)
- Pro: $29-49 / month (10 posters/day)

Cost model:
1 poster = 1 analyze + 1 generate (4 variations)
Estimate API cost based on image size and retries.

---

## Troubleshooting

- "Unable to acquire lock" -> stop Next dev process
- "Can't resolve 'tailwindcss'" -> npm install
- "JSON parse error" -> rerun analyze
- "504 timeout" -> use smaller image, retry
