# REKO Poster Generator - Prompts Collection

This folder contains all the AI prompts used in the REKO Poster Generator platform. These prompts are designed to work with various LLMs (Claude, Gemini, GPT-4, etc.) for poster analysis and generation.

## Overview

The system uses a two-phase approach:

1) ANALYSIS PHASE (Gemini 1.5 Pro Vision) - analyze uploaded images with the Steve Jobs persona
2) GENERATION PHASE (Gemini 3 Pro Image) - generate improved poster variations

## Prompt Files

| File | Purpose | Used With |
|------|---------|-----------|
| 00-core-rules.md | Shared core rules (hierarchy, spacing, readability) | All prompts |
| 01-analyze-steve-jobs.md | Main image analysis prompt | Gemini 1.5 Pro (Vision) |
| 02-artistic-styles.md | Artistic style transformations | Gemini 3 Pro Image |
| 03-product-to-poster.md | Product photography -> marketing poster | Gemini 3 Pro Image |
| 04-sketch-to-design.md | Hand-drawn sketch -> professional design | Gemini 3 Pro Image |
| 05-category-specific.md | Category-specific redesign prompts | Gemini 3 Pro Image |

## How It Works

Phase 1: Analysis (Steve Jobs persona)

User uploads image -> Gemini analyzes with Steve Jobs prompt -> returns JSON analysis

The analysis includes:
- Score (0-100)
- Vision understanding
- Category scores (typography, space, simplicity, emotion, craft)
- Style detection
- 4 variation suggestions

Phase 2: Generation

Based on the score:
- Score >= 60: uses Artistic Style prompts (watercolor, pencil, elevated, amplified)
- Score < 60: uses Redesign prompts (simplify, grid, breathing room)

Special modes:
- Product mode: uses 03-product-to-poster.md
- Sketch mode: uses 04-sketch-to-design.md
- Category detection: uses 05-category-specific.md

## Prompt Variables

| Variable | Description |
|----------|-------------|
| ${headline} | Main headline text |
| ${subheadline} | Secondary headline |
| ${price} | Price or discount text |
| ${cta} | Call-to-action text |
| ${brand} | Brand name |
| ${theirVision} | Analysis result vision field |
| ${coreFeeling} | Detected emotional feeling |

## Prompt Versioning

All prompts include:
- Prompt Version (e.g. v1.1)
- Prompt Hash placeholder ({{PROMPT_HASH}})

These should be logged with each generation to measure which prompt variant performs best.

## Quality Principles

1) RHYTHM - Size variation creates visual flow
2) FLAT DESIGN - Simple, geometric, clean
3) BREATHING ROOM - 60%+ empty space
4) ONE ACCENT - Maximum one highlight color
5) HIERARCHY - Clear reading order

---

Updated: 2026-02-14  
Platform: REKO Poster Generator v1.1
