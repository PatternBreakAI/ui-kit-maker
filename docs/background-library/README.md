# Game Background Library

This library contains **82 PNG game backgrounds** prepared at exact Full HD dimensions:

- **Landscape:** 1920x1080
- **Portrait:** 1080x1920

## Organization

Images are grouped first by orientation and then by likely game-use category, including Adventure & Platformer, Fantasy & Medieval, Strategy & Battle, Cooking & Food, Kids & Casual, Nature & Scenic, City & Traffic, and Simulation & Lifestyle.

## Search metadata

Every PNG contains embedded searchable metadata in three forms:

1. PNG international text fields
2. Embedded XMP metadata
3. A compact EXIF block

Metadata includes title, description, keywords, category, likely game types, environment, mood, visual style, dominant color, dominant hex value, palette colors, orientation, dimensions, and UI-cleanup status.

The `background-catalog.csv` and `background-catalog.json` files provide the same metadata for DAM ingestion, spreadsheet filtering, scripting, or website search.

## UI cleanup

Baked-in HUD elements were removed through deliberate reframing crops on affected images. Letterbox bars were also removed where detected. All output files were visually normalized to their final aspect ratio and exported as PNG.
