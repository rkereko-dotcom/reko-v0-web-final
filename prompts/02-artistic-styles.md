# Artistic Style Transformation Prompts

**Prompt Version**: v1.1  
**Prompt Hash**: {{PROMPT_HASH}}

**Model**: Gemini 3 Pro Image (or any image-to-image LLM)  
**Input**: Original poster image + transformation prompt  
**Output**: Transformed poster image  
**When to Use**: Analysis score >= 60 (good poster, restyle it)

---

## Core Principle

These prompts are **MOOD-AWARE**. Preserve the original emotional atmosphere and elevate it.

**Rule**: Keep **text content identical** and **face/identity unchanged** (if a person exists).

Add at the end of any prompt:
```
Follow CORE RULES from 00-core-rules.md strictly.
```

Use any AUTO MOODBOARD CUES or REFERENCE CUES provided:
- Use them only for mood, palette, typography.
- Do NOT copy layout or assets.
- Gradients only if a Gradient cue is provided.
- Logo/icon geometry and orientation must remain identical. Do NOT stack/unstack, reflow, or rotate the logo. You may recolor, add texture, or subtle 3D/emboss, but do NOT replace or redraw the symbol. You may reposition the logo block in the composition as needed while keeping vertical/horizontal orientation unchanged.

---

## Style 1: Painterly Touch

```
PAINTERLY ARTISTIC STYLE - MOOD-AWARE

First, FEEL the mood (soft / bold / serene / playful). Keep it.

Apply painterly texture that matches the mood:
- Soft -> watercolor, gentle strokes, muted colors
- Bold -> expressive strokes, vibrant paint, dynamic movement
- Serene -> calm blends, smooth gradients
- Playful -> paint splatters, cheerful colors

Keep text readable and identical. Keep face identical.
Logo/icon geometry and orientation must remain identical. Do NOT stack/unstack or reflow. You may move logo position if needed, while keeping orientation unchanged. Apply painterly texture only to the fill, not the shape.
```

---

## Style 2: Hand-Drawn Heart

```
HAND-DRAWN ARTISTIC STYLE - MOOD-AWARE

Match the mood with line quality:
- Soft -> light pencil, gentle shading
- Bold -> strong lines, high contrast
- Delicate -> fine lines, careful hatching

Paper texture allowed. Keep text identical and readable.
```

---

## Style 3: Elevated Essence

```
ELEVATED ESSENCE - PREMIUM UPGRADE

Take the SAME mood and make it premium:
- Softer light, richer contrast
- Refined details, elegant spacing
- Luxury finish without changing layout

Keep text identical. Keep identity intact.
```

---

## Style 4: Mood Amplified

```
MOOD AMPLIFIED

Amplify the existing emotion (do not change it).
Color, light, and composition should intensify the SAME feeling.

Keep text identical and readable.
```

---

## Extra Styles (Optional)

### Risograph Print
```
RISOGRAPH - 2-3 inks, slight misregistration, paper grain, flat colors.
```

### Paper Cut Collage
```
PAPER CUT - layered paper shapes, soft shadows, tactile depth.
```

### Ink Wash
```
INK WASH - flowing ink gradients, elegant negative space.
```

### Halftone Screenprint
```
HALFTONE - clean dots, bold contrast, 2-3 ink colors.
```

---

## Contemporary Styles (2026)

REKO V1 CLUSTER MAPPING (use exactly one per output):
- Cluster A `NT` = Neo-Tech Glow
- Cluster B `WE` = Warm Editorial
- Cluster C `BM` = Bold Minimal

Cluster selection rule:
- If source has dark/tech/crypto/software mood -> pick `NT`.
- If source has corporate/premium/calm mood -> pick `WE`.
- If source needs maximum clarity and conversion -> pick `BM`.
- Do not mix clusters in one generation.

### Bold Minimal
```
BOLD MINIMAL

Scale typography up and simplify the layout.
- Preserve source ratio and layout shell.
- Max 2 colors + 1 accent.
- 60-75% whitespace.
- Strong grid, crisp alignment.
- No heavy texture; gradient only if source already uses it softly.
- One focal point only; remove competing decorations.
- CTA/offer area should be clearer, not louder.

Keep text identical and readable.
Keep logo icon + wordmark geometry unchanged.
Keep logo orientation and placement unchanged.
```

### Warm Editorial
```
WARM EDITORIAL

Warm palette (sand, terracotta, cream), premium editorial feel.
- Preserve source ratio and layout shell.
- Elegant serif headline, light sans for support.
- Subtle paper texture (very light), soft gradient depth allowed.
- Calm, refined composition with premium spacing rhythm.
- Keep contrast high enough for mobile readability.

Keep text identical and readable.
Keep logo icon + wordmark geometry unchanged.
Keep logo orientation and placement unchanged.
```

### Handcrafted Type
```
HANDCRAFTED TYPE

Human, imperfect letterforms and tactile finish.
- Slight ink/press texture
- Warm, friendly tone
- Layout stays the same

Keep text identical and readable. Keep identity intact.
```

### Textured Grain
```
TEXTURED GRAIN

Subtle film grain / paper texture without noise.
- Muted colors, soft contrast
- Preserve layout and spacing

Keep text identical and readable. Keep identity intact.
```

### Neo-Tech Glow
```
NEO-TECH GLOW

Dark base, neon accent, soft glow edges.
- Preserve source ratio and layout shell.
- Futuristic high-tech mood with controlled glow.
- Clean sharp alignment; avoid noisy sci-fi clutter.
- Limit palette to dark base + 1 neon accent + optional neutral.
- Keep hero object dominant and message hierarchy clear.

Keep text identical and readable.
Keep logo icon + wordmark geometry unchanged.
Keep logo orientation and placement unchanged.
```

### Window Light Depth
```
WINDOW LIGHT DEPTH

Soft natural light with window-shadow overlay.
- Gentle depth, premium calm
- Subtle contrast only

Keep text identical and readable. Keep identity intact.
```

### Retro Serif Metallic
```
RETRO SERIF METALLIC

Classic serif with metallic accent (gold/silver).
- Subtle foil sheen, not noisy
- Elegant retro premium

Keep text identical and readable. Keep identity intact.
```

### Abstract Botanicals
```
ABSTRACT BOTANICALS

Organic shapes and botanical motifs, soft color harmony.
- Fresh, optimistic mood
- Keep layout clean

Keep text identical and readable. Keep identity intact.
```

--- 

## REKO DNA Presets (Primary)

### DNA 1: Layout/Ratio First
```
REKO DNA - LAYOUT/RATIO FIRST

Recompose into a vertical poster ratio (2:3 or 4:5).
Use 60-75% whitespace and an asymmetric grid.
Hero object is large but not centered; anchor it to one side.
Headline dominates with dramatic scale; secondary copy is quiet.
Crop/overlap allowed if it increases impact.

Keep text identical and fully readable. Keep logo geometry and orientation identical (no stacking/unstacking). Logo may be repositioned but not flipped to another axis.
```

### DNA 2: Iconic Hero Object
```
REKO DNA - ICONIC HERO OBJECT

Use one dominant hero object/figure. No collage, no clutter.
Scale the object up; allow bold cropping for impact.
Typography wraps or overlaps subtly, but hero stays the focal point.
Keep identity intact; no changes to faces, products, or logos (except allowed 3D/lighting/texture effects and position change).

Text content unchanged and fully readable.
```

### DNA 3: Gradient Atmosphere
```
REKO DNA - GRADIENT ATMOSPHERE

Background is a soft mesh/duotone gradient with subtle grain.
High contrast between text and background; avoid rainbow chaos.
Use 2-3 colors max; one accent.
Keep layout clean and spacious; one hero object.

Text unchanged and readable; logo geometry and orientation unchanged (position may change).
```

--- 

## Quality Checklist

- [ ] Original mood preserved  
- [ ] Text identical and readable  
- [ ] Face/identity preserved  
- [ ] Style applied consistently  
- [ ] Clean, professional output
