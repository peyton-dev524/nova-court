# Gym selection and production venue QA

All captures are inspected 1280 × 720 PNGs.

## Venue selector

- `venue-selector-montgomery.png`
  - Route: `/index.html?qa=1&venueSelectCapture=montgomery&mode=threePoint`
  - Verified identity: `VENUE / 01`, Montgomery Fieldhouse, Arc Run + Classic Orange summary.
- `venue-selector-crimson-840.png`
  - Route: `/index.html?qa=1&venueSelectCapture=arena840&mode=threePoint`
  - Verified identity: `VENUE / 02`, Crimson 840, full CTA/arrows/details visible without scrolling.

## Crimson 840 named Gym Lab views

- `crimson-840-baseline.png`
  - Route: `/gym-lab.html?venue=arena840&quality=high&view=baseline&guides=0`
- `crimson-840-sideline.png`
  - Route: `/gym-lab.html?venue=arena840&quality=high&view=sideline&guides=0`
- `crimson-840-bleachers.png`
  - Route: `/gym-lab.html?venue=arena840&quality=high&view=bleachers&guides=0`
- `crimson-840-rafters.png`
  - Route: `/gym-lab.html?venue=arena840&quality=high&view=rafters&guides=0`
- `crimson-840-scoreboard.png`
  - Route: `/gym-lab.html?venue=arena840&quality=high&view=scoreboard&guides=0`
- `crimson-840-court-wide.png`
  - Route: `/gym-lab.html?venue=arena840&quality=high&view=court-wide&guides=0`

Measured high-tier range across the six named cameras:

- 23–34 renderer calls
- 19,346–20,106 triangles
- 23–33 geometries
- 1 texture
- `READY` phase with no browser console warnings/errors

The declared high ceiling is 138 calls, 58,000 triangles, 210 geometries, and 9 textures.

## Production integration

- `gameplay-montgomery.png`
  - Route: `/index.html?qa=1&captureHeight=720&gameplayVenueCapture=montgomery&mode=practice`
- `gameplay-crimson-840.png`
  - Route: `/index.html?qa=1&captureHeight=720&gameplayVenueCapture=arena840&mode=practice`

Both production captures show the selected procedural venue behind the same live player/court/HUD. The production route constructs the court, hoop, and players synchronously, then attaches optional venue groups through `SceneGroupLoader`.

Three consecutive Crimson 840 high-tier reloads were browser-tested. Every cycle returned exactly 23 calls, 19,346 triangles, 23 geometries, and 1 texture, with phase `READY`; no count growth was observed.

## Honest approximation notes

- The Crimson 840 is an original procedural study informed by all three CC0 angles, not an architectural or photogrammetric reproduction.
- The reference's 840-seat capacity is represented by 840 high-tier instanced seat blocks. Low and medium tiers intentionally sample fewer seats.
- Arched windows, balcony fascia, railings, dark upper bowl, crimson paint, pale maple, and compact two-level seating are preserved as the primary visual cues.
- Sponsor marks, individual folding-chair detail, spectators, exact masonry, and engineering structure are intentionally omitted.
- All venue geometry is generated in code; there are no GLB files or downloaded runtime scene dependencies.
