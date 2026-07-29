# NOVA COURT

NOVA COURT is an original, full-featured Three.js basketball game for desktop browsers. It combines deliberate ball handling, coverage-aware timing shots, contextual layups and dunks, live steals and blocks, capable team AI, persistent player progression, and seven complete modes across a neon street park, half court, and full-court arena.

No NBA/2K trademarks, teams, logos, player likenesses, signature animations, music, models, or other unlicensed sports assets are used.

## Run locally

Requirements: a current desktop browser and Node.js 20 or newer.

```powershell
cd path\to\nova-court
npm run serve
```

Open `http://127.0.0.1:4174/`. The game must be served over HTTP; opening `index.html` directly will not reliably load ES modules.

```powershell
npm test
npm run check
npm run build
```

The build task writes the deployable static game to `dist/`.

## Modes

- **Park Duel (1v1):** first to 11, win by two, live street possession and a reactive crowd.
- **NOVA Duos (2v2):** first to 13 with teammate spacing, passing, control handoff, help defense, and live rebounds.
- **Night Threes (3v3):** first to 15, win by two, with off-ball cuts, rotations, shot selection, and teammate control switching.
- **NOVA Fours (4v4):** first to 19 with four-out spacing, pass-gated inbound restarts, and a 21-second possession clock.
- **NOVA Five (5v5):** a true two-basket full court with ten players, transition offense/defense, a game clock, 2/3-point scoring, and both backcourts.
- **Arc Run:** a timed five-rack three-point contest with automatic rack progression and a two-point tricolor money ball closing each rack.
- **Open Gym:** unlimited practice reps, automatic ball return, make/attempt and streak tracking, every dribble move, finishes, camera testing, and no loss condition.

Every mode has its own rules, HUD/objective, difficulty tuning where applicable, restart/rematch or return flow, and a complete finish state. Replay playback pauses live game flow until the replay and camera restoration are finished.

### Reproducible Arc Run QA

Start Arc Run with `?qa` in the URL. After the game screen opens, run this in
the browser console:

```js
__NOVA_QA__.advanceThreePointContest(4)
```

That deterministically settles the first four balls as misses and stops on rack
1, ball 5: the two-point red/white/blue money ball. Inspect the current rack,
slot, HUD state, ball style, and rack-render budget with:

```js
__NOVA_QA__.threePointContest()
```

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Move / aim | `W A S D` or arrows | Left stick |
| Sprint | `Shift` | Right trigger |
| Protect ball / defensive stance | `Ctrl` | Left trigger |
| Shoot / layup; contest / block | Hold and release `Space` or `K`; `Space` or `L` on defense | Hold and release `X` |
| Contextual dunk / steal | Hold and release `I` near the rim; tap `I` on defense | `Y` / `A` |
| Pass and switch to receiving teammate | `E` or `J` | `A` |
| Signature dribble | `Q` plus direction; double-tap or `Shift+Q` variants | Left trigger plus left stick |
| Cycle follow / broadcast / cinematic camera | `C` | View / Share |
| Pause | `Escape` or `P` | Start |
| Restart current run (1v1 only) | `R` | — |

The nine code-native moves are hesitation, crossover, behind-the-back, between-the-legs, in-and-out, double crossover, spin, snatch-back, and shamgod-style push cross. They use continuous hand paths, transition blending, grounded footwork, slower possession cadence, combo timing, ball trails, and contextual defender reactions.

For jump shots, hold to gather and rise, then release while the moving tip is inside the curved green window on the right side of the screen. Green releases are true perfects and trigger a short pooled trail. The player automatically squares to the active basket, so backward-facing jump shots are not possible. Near the basket, layups are contact-capable bank finishes and `I` becomes a hold-and-release dunk input; misses can settle naturally through rim and backboard contacts. Reach attempts knock the ball loose onto the court, mistimed steals can foul, and a defender reaching into a well-timed move can be ankle-broken and stunned for 1.5 seconds.

## My Player and progression

My Player stores progress locally in the browser. First launch creates a named player with a jersey number and appearance. Choose PG, SG, SF, PF, or C; each position has a distinct archetype, base ratings, attribute weights, and caps. Every win adds exactly 10 bonus credits on top of normal match rewards, while duplicate match rewards are rejected. Spend credits on applied attribute upgrades or original colorway cosmetics. Titles unlock every five overall levels, with entitlement-based Developer, Tester, and Owner titles and a Legend title at 99 overall. Overall and level are capped at 99.

Progress is device/browser-local rather than account-synced. Clearing site data resets it.

## Settings and accessibility

Six original ElevenLabs-generated instrumental loops are routed across the seven modes, while basketball, interface, and crowd effects remain procedural Web Audio. Thirty synchronized ElevenLabs announcer and arena-PA clips replace browser speech synthesis when local assets are available; browser speech remains a graceful development fallback. All audio is decoded into one Web Audio graph, so music/effects volume, master mute, compression, and sound captions remain consistent. Settings also include a user-only shooting-assist slider that widens or narrows the green release window without changing CPU shooting, plus reduced motion, camera-shake strength, high contrast, color-vision palettes, quality scaling, keyboard focus states, screen-reader announcements, and scalable desktop layouts. Browsers unlock audio only after user interaction.

## Architecture

- `js/app.js` — application lifecycle, seven-mode integration, HUD, profile UI, rewards, pass/control handoff, and announcer orchestration.
- `js/engine.js` — Three.js scene, bounded 60 Hz simulation, players, animation, dribbles, coverage shots, rim/backboard/net contacts, finishes, live-ball defense, cameras, VFX, and replay state restoration.
- `js/shot-coverage.js` and `js/live-ball-duels.js` — deterministic coverage/make-odds and steal/block/foul/ankle-break resolution.
- `js/ai.js` — perception-driven opponents and teammates with spacing, help, transition, shot, pass, contest, and rebound decisions.
- `js/team-formats.js`, `js/half-court-duos-mode.js`, `js/half-court-quads-mode.js`, `js/full-court-mode.js`, and `js/court-runtime.js` — rosters, team rules, possession, clocks, full-court direction, and two-basket runtime data.
- `js/player-progression.js` — five builds, applied ratings, rewards, upgrades, cosmetics, normalization, and persistence.
- `js/full-court-visuals.js` and `js/park-visuals.js` — original code-native arena, full court, park, crowd, lighting, and signage.
- `js/announcer-runtime.js`, `js/audio.js`, `assets/audio/`, and `js/ui.js` — synchronized recorded announcer/PA calls, per-mode music, procedural SFX, captions, menus, HUD, settings, and accessibility.
- `tests/` — deterministic gameplay, rules, integration, persistence, animation, replay, performance, and interface tests.

The exact production athlete rig can also be inspected at `/player-lab.html` while the local server is running. The visual harness provides repeatable full-body poses and camera angles, roster comparison, wireframe and scale guides, live renderer metrics, and stable PNG capture names. Its pose-coordinate editor exposes shoulder/hip and elbow/knee rotation controls, live joint and hand/foot positions in meters, per-pose saved drafts, and copyable JSON reports.

The procedural compact venue and its staged loading lifecycle can be inspected at
`/gym-lab.html`. The Stadium / Gym Lab provides regulation court measurements,
named baseline/sideline/bleacher/rafter/scoreboard/court-wide views, three quality
tiers, optional-group load/unload controls, renderer budgets, and deterministic
PNG capture names.

## Performance

The renderer targets 60 FPS with a bounded 60 Hz simulation, three-step catch-up cap, throttled AI/HUD work, instanced crowds, pooled VFX, capped pixel ratio, shadow/character tiers, and an adaptive quality governor. Team modes reduce distant-player detail, while 1v1 and solo modes keep the highest character tier. All runtime assets are local and no media is hotlinked. Actual frame rate depends on GPU, browser throttling, display and viewport; use **Performance** quality or reduce camera shake on slower devices.

## Validation

The complete test suite contains 179 tests covering all seven mode flows, scoring, 21-second clocks, progression/persistence, exact win bonuses and titles, applied position ratings, green-window timing, basket-facing shot alignment, all nine dribbles, live loose balls, blocks/fouls, rim/bank/swish outcomes, contextual layups/dunks, free throws, AI decisions, team formats, pass-gated inbounds, full-court direction, tutorial/attract presentation, replay freeze/restoration, controls, UI/audio, the player-model harness, responsive behavior, and performance budgets. `npm run check` syntax-checks every runtime/build module and `npm run build` creates the static distribution.

Final browser QA results are recorded in the completion handoff after exercising the integrated mode selection, My Player navigation/persistence, tutorial/attract presentation, representative team and practice modes, local resource loading, console output, and performance telemetry.

## Honest limitations

- Players and motion are intentionally stylized and procedural; they are not scanned humans or commercial motion capture.
- Physics is purpose-built for responsive basketball and deterministic testing, not a general rigid-body solver.
- Announcer and music media add about 5 MB to the first-use asset budget; clips and mode tracks are cached lazily after audio unlock.
- Progress is local-only and has no account/cloud sync or online multiplayer.
- Desktop keyboard/gamepad is the target; touch-only play is not fully supported.
- Browser gamepad labels vary by controller and OS, and final performance depends on the local GPU/browser.

See [ASSET_LICENSES.md](./ASSET_LICENSES.md) for the complete provenance, inspection, and license record.
