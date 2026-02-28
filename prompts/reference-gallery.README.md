# Reference Gallery

This file powers "similar poster" matching.

Location:
- prompts/reference-gallery.json

Schema:
```
{
  "version": "v1",
  "items": [
    {
      "id": "ref_001",
      "title": "Short title",
      "intents": ["awareness", "conversion", "event", "hiring", "announcement"],
      "styles": ["bold-minimal", "editorial", "swiss", "retro", "premium"],
      "moods": ["calm", "premium", "energetic", "warm"],
      "palette": ["#0b0b0b", "#f5f5f5", "#5ca0ff"],
      "tags": ["saas", "poster", "typography"],
      "layout": "asym-left",
      "notes": "Optional short description"
    }
  ]
}
```

Notes:
- Keep `palette` to 2-5 hex colors.
- Use lowercase tags for consistency.
- This gallery can be expanded anytime without code changes.
