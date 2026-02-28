# Product-to-Poster Prompts

**Prompt Version**: v1.1  
**Prompt Hash**: {{PROMPT_HASH}}

Model: Gemini 3 Pro Image (image-to-image)
Input: Product photo + marketing prompt
Output: Premium marketing poster
When to Use: is_product: true

---

## Overview

Transform raw product photography into premium, conversion-focused posters. The output must feel curated, not templated.

Add at the end of any prompt:
```
Follow CORE RULES from 00-core-rules.md strictly.
```

If AUTO MOODBOARD CUES or REFERENCE CUES are present, use them only for palette/typography/mood. Do NOT copy layout or assets.

## KPI Focus (Conversion)

- One **primary offer** only (price/discount)  
- One **CTA**  
- Benefit is explicit and easy to scan  
- Keep margins clean (no clutter)

---

## Global Rules (Always)

- ONE product only, always
- 2-3 colors max, 1 accent max
- 1-2 font families, 2 weights max
- 60-70% negative space
- Use grid, 8-12% margins
- No generic gradients, no clipart, no decorative noise
- Text must be exact; do not invent new copy
- Keep CTA visible and dominant
- Keep price/discount visible if provided
- Gradients only if a Gradient cue is provided
- Logo/icon geometry and orientation must remain identical. Do NOT stack/unstack or reflow the logo. You may recolor, add texture, or subtle 3D/emboss, but do NOT replace or redraw the logo symbol. You may reposition the logo block in the composition, but do not change vertical/horizontal direction.

---

## Style Options

### Fun Style
- Bright palette (pink, yellow, orange, cyan)
- Playful rounded fonts
- Confetti/sparkles only if it does not add clutter
- Light 3D cartoon accents
- Energetic, youthful

### Premium Style
- Dark background (black, navy, deep gray)
- Gold/silver/copper accent
- Elegant serif or thin sans-serif
- Soft, dramatic lighting
- Subtle reflections and shadows
- Luxury feel

### Athletic Style
- High energy colors (orange, red, electric blue)
- Bold dynamic typography
- Motion hints (speed lines, splashes)
- Strong diagonals

### Eco Style
- Earth tones (green, brown, cream)
- Organic textures (wood, leaves, linen)
- Natural lighting
- Sustainable, clean aesthetic

### Minimal Style
- Clean white or light gray background
- Maximum 2-3 colors
- Modern sans-serif
- 70%+ white space
- Apple-inspired simplicity

### Bold Style
- High contrast (black/yellow, red/white)
- Extra-large typography
- Geometric shapes only
- Impact over subtlety

---

## Campaign Types

### Brand Awareness
- Focus on product beauty and brand identity
- Emotional connection
- Brand name prominent but calm

### Product Launch
- "NEW" / "INTRODUCING" energy
- Clean reveal moment
- Spotlight on product

### Sale / Discount
- Price/discount very visible
- Urgency and excitement
- Accent colors for urgency

### Seasonal
- Seasonal mood and palette
- Timely, relevant feeling

---

## Anti-Canva Rules (Critical)

NEVER:
- Show multiple products
- Use generic gradients
- Use floating products like stock template
- Add random shapes/confetti everywhere
- Use lens flares/sparkles
- Center everything (use asymmetric balance)
- Use more than 2 font families
- Use more than 3 colors total
- Fill all the space
- Make it feel like a template

---

## The 4 Premium Variations

### 1) Apple Minimal
REFERENCE: Apple product photography, Bang & Olufsen, Leica

- Single product, slight offset center
- Pure black or deep charcoal background
- Dramatic rim light + subtle shadow
- 75% empty space
- Text in one corner only

Typography:
- Thin sans-serif, wide tracking
- White or soft gold text

Feeling: "$500 product in an Apple Store."

### 2) Editorial Magazine
REFERENCE: Vogue, Kinfolk, Cereal

- Product on left or right third
- Opposite side: elegant vertical or angled typography
- Solid muted background (cream, sage, dusty rose)
- 65% negative space

Typography:
- Elegant serif (Playfair, Cormorant)
- Vertical or slightly angled

Feeling: "Coffee table magazine spread."

### 3) Cinematic Drama
REFERENCE: Apple "Shot on iPhone", film posters

- Product as HERO, dramatic angle
- Strong key light, deep shadows, rim light
- Dark atmospheric background (subtle haze only)
- 60% negative space

Typography:
- Bold cinematic font
- Lower third or top

Feeling: "Product origin story poster."

### 4) Organic Premium
REFERENCE: Aesop, Le Labo

- Product on natural surface (wood, stone, linen)
- Warm neutral background (cream, beige, sage)
- One subtle natural prop only
- 60% negative space

Typography:
- Classic serif (Garamond, Caslon)
- Deep brown or charcoal

Feeling: "Premium, tactile, calm."

---

## Variables

${headline}  Main headline
${subheadline} Secondary line
${price} Optional price
${cta} Call-to-action
${brand} Brand name
${style} Selected style
${campaign} Campaign type

---

## Usage Example

Generate a prompt using the selected style and campaign, then feed it with the original product image.
