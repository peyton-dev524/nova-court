# Open Gym minimal HUD — final QA

## Capture

- `open-gym-gameplay-1280x720.png`
- Route: `/index.html?qa=1&captureHeight=720&openGymCapture=gameplay`
- Viewport: 1280 × 720
- Scene: genuine in-game Open Gym controller, player, hoop, base court, and HUD.
- Console result: zero warnings and zero errors.

The capture route intentionally uses the engine's genuine base court without
optional venue groups. Browser QA found that the currently integrated
production-venue loader can occlude the settled Open Gym camera. This report
does not hide that limitation or present a venue-lab render as gameplay.

## Minimal HUD proof

The browser DOM inspection returned `hidden=true` for:

- `.scoreboard` (therefore no makes/attempts)
- `#broadcast-bug` (therefore no `LIVE` label)
- `#player-card-hud`
- `#takeover` (momentum)
- `#control-hints`

The pause control remains visible. Energy remains available as the only
persistent player-state bar. Shot meter and transient feedback are unchanged
and appear only when their gameplay events require them.

## Court-coordinate decision

The half-court runtime is 15 m wide × 14 m long:

- attacking baseline: `z = -7 m`
- open half-court boundary / authentic midcourt line: `z = +7 m`
- legacy logo center: `z = +1.6 m` (not authentic midcourt)
- logo diameter: `3.5 m`, half extent: `1.75 m`

Centering the 3.5 m logo on authentic half court would put its center at
`z = +7 m` and extend it to `z = +8.75 m`, outside the modeled playing
surface. Open Gym and every other half-court mode therefore omit it. The
full-court runtime keeps the logo at `(x, z) = (0, 0)`, exactly where its
midcourt line and center circle cross.

Deterministic tests cover this decision in
`tests/open_gym_minimal_ui.test.mjs`, including reversible DOM visibility for
Open Gym versus competitive modes.

