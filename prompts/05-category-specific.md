# Category-Specific Redesign Prompts

**Prompt Version**: v1.1  
**Prompt Hash**: {{PROMPT_HASH}}

**Model**: Gemini 3 Pro Image (or any image-to-image LLM)  
**Input**: Original poster + category-specific prompt  
**Output**: Redesigned poster  
**When to Use**: Analysis score < 60 (redesign needed)

---

## How to Use

1) Detect category from OCR keywords  
2) Choose **Style Modifier** (Minimal / Premium / Bold)  
3) Apply category prompt  

Always append:
```
Follow CORE RULES from 00-core-rules.md strictly.
```

If AUTO MOODBOARD CUES or REFERENCE CUES are present, use them only for palette/typography/mood. Do NOT copy layout or assets.

Gradients only if a Gradient cue is provided.
Logo/icon geometry and orientation must remain identical. Do NOT stack/unstack or reflow the logo. You may recolor, add texture, or subtle 3D/emboss, but do NOT replace or redraw the logo symbol. You may reposition the logo block in the composition, but do not change vertical/horizontal orientation.

---

## Style Modifiers (apply to any category)

### Minimal
- White or light background, 60%+ whitespace  
- 2 colors max, no texture  
- One hero element, large headline  

### Premium
- Dark base, refined contrast  
- Elegant serif or clean sans  
- Subtle highlights, no noisy effects  

### Bold
- High contrast, oversized headline  
- Strong accent color  
- Dynamic layout, but clean hierarchy  

---

## Category Detection Keywords

### Christmas
```
christmas, xmas, зул сар, santa, snowflake, цас, reindeer,
december, 12-р сар, holiday, new year, шинэ жил, gift, бэлэг,
festive, merry, wreath, pine, гацуур, winter, өвөл
```

### Kids / Children
```
back to school, school, сургууль, children, хүүхэд, kids,
cartoon, colorful, playful, fun, adventure, rocket,
backpack, цүнх, pencil, харандаа, toy, тоглоом, learning, dream
```

### Gaming
```
game, gaming, counter-strike, play, level, score, battle,
тоглоом, тоглогч, winner, champion, esport, fps, shooter, gamer
```

### Greeting
```
thank, баярлалаа, flower, цэцэг, birthday, төрсөн өдөр,
баяр, greeting, congratulat, love, хайр, mother, father,
valentine, happy, wish, blessing, anniversary
```

### Educational
```
design thinking, process, learn, how to, steps, method,
tutorial, guide, principle, concept, empathy, define, ideate,
prototype, test, skill, technique, сургалт, арга, алхам
```

### Event
```
event, огноо, location, байршил, speaker, seminar,
workshop, conference, арга хэмжээ, зарлал, announcement, register
```

### Product
```
sale, price, үнэ, discount, хямдрал, %, product,
бүтээгдэхүүн, buy, худалдаа, shop, offer, deal
```

---

## Category Prompts

### Christmas
```
CHRISTMAS REDESIGN
Goal: warm, festive, joyful.
Layout: one hero (gift/tree), headline large, secondary info small.
Apply STYLE MODIFIER: Minimal / Premium / Bold.
```

### Kids / Children
```
KIDS REDESIGN
Goal: playful, friendly, colorful.
Layout: big hero visual, simple icons, short copy.
Apply STYLE MODIFIER: Minimal / Premium / Bold.
```

### Gaming
```
GAMING REDESIGN
Goal: bold, energetic, competitive.
Layout: massive title, strong contrast, 1-2 icons.
Apply STYLE MODIFIER: Minimal / Premium / Bold.
```

### Greeting
```
GREETING REDESIGN
Goal: warm, sincere, personal.
Layout: single elegant element + large gratitude headline.
Apply STYLE MODIFIER: Minimal / Premium / Bold.
```

### Educational
```
EDUCATIONAL REDESIGN
Goal: clarity, structured steps.
Layout: step flow or diagram, strong hierarchy.
Apply STYLE MODIFIER: Minimal / Premium / Bold.
```

### Event
```
EVENT REDESIGN
Goal: clear CTA and key info (date, time, location).
Layout: headline + date/time block + CTA.
Apply STYLE MODIFIER: Minimal / Premium / Bold.
```

### Product
```
PRODUCT REDESIGN
Goal: conversion - clear offer + CTA.
Layout: product hero, price/discount, CTA.
Apply STYLE MODIFIER: Minimal / Premium / Bold.
```
