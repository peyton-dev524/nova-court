# Team formats and announcer workstream

## Design

- `team-formats.js` is the authoritative, renderer-free contract for 2v2,
  3v3, and full-court 5v5.
- The 5v5 format uses a 15 by 28 metre court and two direction-aware baskets.
- Both 5v5 rosters contain PG, SG, SF, PF, and C roles with original NOVA
  COURT names and code-native colors.
- `announcer-director.js` maps gameplay events to original calls, accessible
  captions, priority, cooldown, and synthesized crowd intensity.

## Safety and licensing

No external audio, dialogue, logos, names, likenesses, or visual assets are
used by these modules. Announcer lines and roster identities are original.

## Verification

`tests/team_formats.test.mjs` validates format sizes, two-basket direction,
positions, bounds, and restart sides. `tests/announcer_director.test.mjs`
validates deterministic calls, cooldowns, accessibility captions, enablement,
and context-sensitive crowd reactions.
