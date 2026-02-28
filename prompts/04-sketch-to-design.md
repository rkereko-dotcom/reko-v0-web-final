# Sketch-to-Design Prompts

**Prompt Version**: v1.1  
**Prompt Hash**: {{PROMPT_HASH}}

**Model**: Gemini 3 Pro Image (or any image-to-image LLM)  
**Input**: Hand-drawn sketch + design prompt  
**Output**: Professional poster design  
**When to Use**: `is_sketch: true`

---

## Overview

Transform hand-drawn sketches and wireframes into professional poster designs.  
Respect the original layout, but upgrade styling and hierarchy.

Add at the end of any prompt:
```
Follow CORE RULES from 00-core-rules.md strictly.
```

If AUTO MOODBOARD CUES or REFERENCE CUES are present, use them only for palette/typography/mood. Do NOT copy layout or assets.

Hard constraints:
- Keep the sketch layout structure (zones and proportions).
- Do not invent extra text.
- Gradients only if a Gradient cue is provided.
- Logo/icon geometry and orientation must remain identical. Do NOT stack/unstack or reflow the logo. You may recolor, add texture, or subtle 3D/emboss, but do NOT replace the logo symbol. You may move logo position to better composition while keeping its vertical/horizontal orientation unchanged.

---

## Style Options

### Minimal
- Clean white or light gray background
- 2 colors max (black + 1 accent)
- Sans-serif (Inter / Helvetica)
- Large white space, no gradients

### Bold
- High contrast colors (black/yellow, red/white)
- Massive headline
- Strong geometric shapes

### Playful
- Bright colors, rounded fonts
- Organic shapes, fun energy
- Subtle patterns allowed

### Premium
- Dark background, subtle highlights
- Elegant serif or refined sans
- Luxury spacing and alignment

### Dark / Tech
- Deep black base + neon accent
- Modern tech typography
- Sharp, angular shapes

---

## Prompt Template

```
SKETCH-TO-DESIGN

Detected layout:
- Header: ${sketchLayout.header_area}
- Main: ${sketchLayout.main_area}
- Footer: ${sketchLayout.footer_area}
- Elements: ${sketchLayout.elements.join(", ")}
- Hierarchy: ${sketchLayout.hierarchy}

Text to include:
- Headline: "${headline}"
- Subheadline: "${subheadline}"
- Price/Discount: "${price}"
- CTA: "${cta}"
- Brand: "${brand}"
- Additional: "${additionalText}"

Style: ${sketchStyle}
Category: ${sketchCategory}

Instruction:
Recreate the sketch as a polished poster. Keep layout logic, improve spacing, typography, and contrast.
```

---

## Quality Checklist

- Layout matches sketch structure  
- All text included  
- Clear hierarchy  
- Readable at small size  
- Clean, professional finish
