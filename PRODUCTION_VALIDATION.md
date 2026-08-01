# Nova Court production validation

Validated on 2026-08-01 from remote-main baseline `abea2a31de76c8285337f0a4a7dace9e07dd7917` on local branch `codex/park-duel-production-slice`. No commit, push, deployment, or remote mutation was performed.

## Park Duel vertical slice

The browser-validated route is:

`Main Menu -> Park Duel -> Ball Locker -> Venue Select -> NCN Introduction -> Live 1v1 -> Pause/Replay/Photo -> Postgame Highlights/Rewards -> Saved Progression -> Quick Rematch`.

Two complete browser flows were validated at `http://127.0.0.1:4175/?qa`: one allowed the 7.2-second introduction to finish, and one explicitly skipped it after a quick rematch. Both reached an 11-3 postgame, produced a game-winner highlight, displayed advanced statistics, reported `PROGRESSION SAVED / BACKUP VERIFIED`, and returned to the same ball and venue for rematch. The scoring tail used the query-gated deterministic QA settle control after live gameplay/input checks; it did not pretend that eleven user-made baskets were manually played.

The introduction exposed only public scouting fields: scoring area, dominant hand, public strength, defensive read, favorite move, recent form, and archetype. It also showed the selected ball, venue, rule preset, target/win-by condition, ratings/records, and first-possession method. Intro, Ball Locker, venue preview, pause, replay, Photo Mode, and postgame were visually inspected for contained lifecycle state. A browser-found postgame/pause layer leak was fixed and revalidated.

## Automated gates

| Gate | Result |
| --- | --- |
| `npm test` | 281 passed, 0 failed across 55 test files |
| `npm run check` | 70 source files syntax-checked |
| `npm run build` | Static production bundle generated in `dist/` |
| Browser console | 0 errors and 0 warnings after the full flows |
| Page asset inventory | 75 observed resources: 61 scripts, 9 stylesheets, 5 other, 1 inline SVG; every URL local |

The deterministic additions cover scouting redaction; adaptation rate, decay, difficulty, and mistake bounds; foul presets; rotations, chemistry, and tendencies; tactics; off-ball grades; defense; triple-threat/post legality; input buffering; controller transitions; vibration; replay freeze/restoration/frame step; highlight selection; Photo Mode gating; NCN roles; soundtrack/acoustic/crowd contracts; advanced stats/history; save migration, backup and reward idempotency; localization/RTL; safe areas; graphics tiers; preload cancellation; error recovery; and honest online service boundaries.

## Viewport and safe-area evidence

Postgame and responsive layout were measured after resize settled. No required viewport produced horizontal overflow.

| Viewport | Layout | Safe inset (x,y px) | Postgame card |
| --- | --- | --- | --- |
| 1280x720 | standard | 45,25 | 920x670, centered |
| 1920x1080 | standard | 67,38 | 920x1004, centered |
| 1920x1200 | standard | 67,42 | 920x1116, centered |
| 2560x1080 | large/ultrawide | 90,38 | 920x1004, centered |
| 2560x1440 | large | 90,50 | 920x1310, centered |
| 1100x650 | standard | 39,23 | 920x604, centered |

The 1280x720 introduction and postgame intentionally use internal vertical scrolling so all information remains readable without horizontal clipping. The small-desktop and 2560x1080 menu layouts were additionally inspected as rendered screenshots.

## Performance and lifecycle evidence

At 1280x720 in the in-app automated browser:

| Preset/state | Draw calls | Triangles | Textures | Geometries | Shadows |
| --- | ---: | ---: | ---: | ---: | --- |
| High/balanced start | 425 | 80,632 | 11 | 226 | enabled |
| Performance start | 425 | 79,624 | 10 | 226 | disabled |

The automated browser measured a settled 31.7 FPS / 50.00 ms p95 under its instrumented environment and the adaptive governor correctly moved to Performance. This is evidence that fallback works, not a claim of 60 FPS on that host.

Three consecutive quick-rematch samples kept calls, triangles, textures, and geometries exactly stable at 425 / 80,632 / 11 / 226. Reported JS heap samples were 43,374,168; 42,816,119; and 42,684,503 bytes, showing no monotonic growth after settling.

Input prompts switched `keyboard -> xbox -> keyboard` through the input manager. A query-gated focus-loss event paused the live game and exposed the recovery menu. Replay returned to the frozen/restored pause state; postgame replay returned to postgame.

## Requirement status (61-100)

- Runtime-integrated and browser-evidenced: 61, 62, 80, 84, 93, 95, 99, and the end-to-end flow portion of 100.
- Runtime-partial with deterministic foundations: 68, 77, 79, 81, 83, 85, 96, 97, and 98.
- Deterministic domain foundations not yet bound to full live controls/render/audio: 63-67, 69-76, 78, 82, and 94.
- Explicitly unavailable without authorized backend or a separately validated local-multiplayer implementation: 86-92. The shipped contracts reject availability rather than fabricating rankings, matchmaking, synchronization, crews, spectating, reporting, or anti-cheat.

## Honest remaining limitations

- Replay transport, markers, frozen-state restoration, and camera/zoom contracts are live, while the new director does not yet render arbitrary frame-cursor poses back into the Three.js world. Existing made-shot replays remain the true animated replay path.
- Photo Mode is correctly restricted to replay/postgame and exposes the requested controls, but FOV, depth of field, filters, poses, and Nova frames are not yet wired to the renderer.
- Tactical, off-ball, expanded defense, triple-threat, post, substitution, chemistry, and tendency systems are tested domain modules; the full command-to-animation/control bindings remain future integration.
- NCN roles, reactive soundtrack states, spatial acoustics, crowd staggering, and venue-condition rules are deterministic foundations. The existing audio/render pipelines do not yet consume every new role/state/profile.
- Match history persists and filters in the domain layer, but there is no complete player-facing history browser yet.
- Graphics contracts independently model all requested dimensions; the current settings screen exposes the consolidated visual preset rather than every dimension separately.
- Localization, RTL, preload cancellation, WebGL/network recovery, and online integrity have tested contracts, but only selected runtime paths are currently wired.
- Browser-local highlight save stores honest JSON metadata, not encoded video.
- Performance quality reduced shadows, triangles, and texture count, but draw calls remained 425 and the automated host did not sustain 60 FPS.

These limitations are why this phase should be treated as a polished vertical-slice integration plus reusable foundations, not a claim that every item 61-100 is production-complete.
