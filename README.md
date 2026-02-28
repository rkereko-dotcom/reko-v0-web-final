# REKO Poster Generator v1.0

**Сүүлийн хувилбар**: 2026-01-18
**Platform**: Next.js 16 + TypeScript + Tailwind CSS

## Overview

AI-powered poster analysis and generation platform using:
- **Gemini 1.5 Pro (Vision)** - Image analysis with "Steve Jobs" persona
- **Gemini 3 Pro Image** - Poster generation and transformation

## Folder Structure

```
reko-v0-web-final/
├── src/
│   └── app/
│       ├── page.tsx           # Main UI component
│       ├── layout.tsx         # App layout
│       ├── globals.css        # Global styles
│       └── api/
│           ├── analyze/       # Gemini analysis endpoint
│           │   └── route.ts
│           └── generate/      # Gemini generation endpoint
│               └── route.ts
├── prompts/                   # All AI prompts (LLM-readable)
│   ├── README.md
│   ├── 01-analyze-steve-jobs.md
│   ├── 02-artistic-styles.md
│   ├── 03-product-to-poster.md
│   ├── 04-sketch-to-design.md
│   └── 05-category-specific.md
├── public/                    # Static assets
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
└── eslint.config.mjs
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create `.env.local` file:

```env
GOOGLE_AI_API_KEY=AIzaSyxxxxx       # Google AI (Gemini) API key
GEMINI_TEXT_MODEL=gemini-1.5-pro-latest  # Optional: Gemini text model for analysis
HF_TOKEN=hf_xxxxx                   # HuggingFace token (optional)
REPLICATE_API_TOKEN=r8_xxxxx        # Replicate token (optional)
```

### 3. Run Development Server

```bash
npm run dev
```

Open http://localhost:3000

## Features

### 1. Image Analysis (Steve Jobs Persona)
- Upload any poster/image
- Get detailed analysis with score (0-100)
- Category detection (Gaming, Christmas, Product, etc.)
- 4 improvement variation suggestions

### 2. Poster Generation Modes

| Mode | Description |
|------|-------------|
| **Artistic Style** | For good posters (score >= 60) - artistic transformations |
| **Redesign** | For weak posters (score < 60) - fundamental redesign |
| **Product-to-Poster** | Product photography → Marketing poster |
| **Sketch-to-Design** | Hand-drawn sketch → Professional design |

### 3. Supported Categories
- 🎮 Gaming
- 🎄 Christmas
- 📚 Educational
- 💐 Greeting
- 📅 Event
- 🛒 Product
- 🧒 Kids

## API Endpoints

### POST /api/analyze
- Input: `{ image: "data:image/jpeg;base64,..." }`
- Output: Full analysis JSON with score, feedback, variations

### POST /api/generate
- Input: `{ prompts, originalImage, mode, aspectRatio, ... }`
- Output: `{ images: ["data:image/png;base64,..."], variationNames: [...] }`

## Prompts

All prompts are documented in `/prompts` folder:
- Can be used with any LLM (Claude, GPT-4, Gemini, etc.)
- Variables marked with `${variable}` should be replaced
- Follow the README.md in prompts folder for usage

## Tech Stack

- Next.js 16.1.1 (Turbopack)
- TypeScript 5.x
- Tailwind CSS 4.x
- Sharp (image processing)
- Playwright (testing)

## License

Proprietary - REKO Platform

---

*Generated: 2026-01-18*
