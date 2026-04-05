# App icon regeneration

`icon.svg` is the canonical source for the Stroom Command app icon. The
live PNG assets consumed by `app.json` are:

- `icon.png` — iOS/general app icon (1024 × 1024)
- `adaptive-icon.png` — Android adaptive foreground (1024 × 1024, centered
  on a full-bleed `#0E0F14` background)
- `splash-icon.png` — launch splash mark (1024 × 1024, same SVG)

## Regenerate PNGs

Any SVG → PNG rasterizer works. Examples:

```sh
# Using sharp-cli
npx sharp-cli -i apps/native/assets/icon.svg \
  -o apps/native/assets/icon.png \
  resize 1024 1024

# Using rsvg-convert (Homebrew: brew install librsvg)
rsvg-convert -w 1024 -h 1024 \
  apps/native/assets/icon.svg > apps/native/assets/icon.png
```

After regenerating, commit the updated PNGs alongside any SVG edit so the
EAS build picks up the new raster.

## Why a monogram

The "S" is intentionally the only visual element — matches the login
screen and brand splash, so the first mark the operator sees is the same
across boot, splash, login, and home-screen icon.
