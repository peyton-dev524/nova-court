# Player progression and customization

The My Player system is code-native and independent from gameplay simulation. It
stores five separate builds (PG, SG, SF, PF, and C), so changing position never
erases upgrades on another build. Each position has original archetype copy,
attribute emphasis, physique, initial ratings, and hard caps.

## Economy and integrity

- A versioned `nova-court-my-player-v2` localStorage record is normalized at
  every read and write.
- Malformed JSON, unavailable storage, old single-build data, invalid cosmetics,
  impossible ratings, negative currency, and wins above games safely fall back
  or clamp.
- Completed runs receive a unique match identifier. The last 80 identifiers are
  retained so a result screen cannot award the same match twice.
- Upgrade prices scale with rating. Purchases and upgrades are immutable
  transactions that verify balance, ownership, and position caps before charging.
- Level is derived from XP and capped at 99; overall is a position-weighted
  attribute score and is also capped at 99.

## Runtime application

`getEnginePlayerConfig()` converts the active build into the existing engine's
role, height, speed, shooting, finishing, vertical, rebounding, strength, ball
security, passing, defensive ratings, stamina, full rating map, and procedural
palette fields. The controlled player receives those values when each roster is
created, making upgrades and customization gameplay-visible on the next run.

All six palettes are original numeric colors rendered by existing procedural
geometry. No image, texture, logo, garment design, or external asset is used.
