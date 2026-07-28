# Team modes, AI, crowd and announcer validation

## Implemented contracts

- Half-court 2v2 with checks, live possession, clears, assists, shot clock,
  target score, win-by-two, restart and rematch.
- Existing half-court 3v3 preserved through the same event-driven rules base.
- Full-court 5v5 with a 15 m by 28 m surface, two attack baskets, direction-
  aware inbounds, 2/3 point scoring, 24-second clock, regulation clock,
  next-score overtime, win/loss result and rematch.
- Ten original players across PG, SG, SF, PF and C.
- Same-team pass control handoff contract for app integration.
- Direction-aware AI baskets, five-player spacing, transition, shot selection,
  defense, contesting and rebound recovery.
- Original announcer copy with event cooldowns, accessible captions, optional
  built-in browser speech, code-native crowd audio intensity and graceful
  no-voice fallback.
- Code-native full-court surface, markings, two basket assemblies and animated
  nets; no downloaded visual asset is required.

## Automated checks

The following focused suites passed locally using the bundled Node runtime:

- `team_formats.test.mjs`: 5/5
- `half_court_duos_mode.test.mjs`: 2/2
- `full_court_mode.test.mjs`: 6/6
- `court_runtime.test.mjs`: 4/4
- `announcer_director.test.mjs`: 4/4
- `announcer_runtime.test.mjs`: 2/2
- `team_ai_direction.test.mjs`: 3/3
- Regression `ai_shooting.test.mjs`: 3/3

Total focused assertions: 29 passing.

## Defect found and fixed

The AI update order classified any ball without a holder as a loose ball before
checking for an unresolved airborne shot. That made the rebound state
unreachable during real misses. Airborne unresolved shots now take priority;
the loose-ball pursuit path still handles deflections and floor balls.

## Asset and originality audit

All names, commentary, colors, court geometry, crowd cues and rendered objects
in this workstream are original/code-native. No NBA, NBA 2K, Roblox, athlete
likeness, team mark, recorded announcer, external model, texture or sound was
introduced.

