# Regulation court QA

Captured from the production renderer on July 29, 2026.

- `fiba-full-court-15x28.png` — full 15 × 28 m court used by 5v5.
- `fiba-half-court-15x14.png` — 15 × 14 m half court used by the half-court modes and Open Gym.

The deterministic routes are:

- `/?courtWideCapture=fives&captureHeight=720`
- `/?courtWideCapture=practice&captureHeight=720`

The geometry follows the current [FIBA Official Basketball Rules 2024](https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2024-v10a.pdf): 50 mm lines, 6.75 m three-point radius, 1.80 m centre/free-throw circles, 5.80 m free-throw-line offset, and a basket centre 1.575 m from the endline.

The QA route hides optional venue shells and players only for the overhead proof image, preventing roofs and character models from obscuring the measured court surface.
