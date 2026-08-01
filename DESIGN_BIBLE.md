# NOVA COURT Design Bible

Version 1.0 · identity lock for production and future expansion

## Creative north star

NOVA COURT is basketball after sundown: a fast, legible, slightly futuristic celebration of neighborhood competition. The world is fictional, optimistic, and earned through play. Presentation can feel premium without pretending to be a real league broadcast or copying another basketball game's interface, terminology, teams, likenesses, animation signatures, economy, or trade dress.

Every decision should pass three tests:

1. A player understands the basketball state in one glance.
2. The screen belongs unmistakably to the NOVA COURT / NCN world.
3. Style never obscures timing, ball position, possession, boundaries, or score.

## Color system

| Token | Hex | Role |
| --- | --- | --- |
| Void | `#080B14` | Primary canvas and nighttime depth |
| Midnight | `#11182A` | Panels and court-side structures |
| Slate | `#26344D` | Secondary surfaces and inactive controls |
| Ice | `#F4FBFF` | Primary copy and gameplay-critical marks |
| Mist | `#A9B8CC` | Secondary copy; never for critical timing text |
| Nova Cyan | `#38E8FF` | Player focus, navigation, positive system state |
| Solar Amber | `#FFC857` | Game point, rewards, attention without alarm |
| Ember | `#FF6438` | Rival pressure and destructive actions |
| Aurora | `#5AF29B` | Perfect release and confirmed success |
| Fault Red | `#FF496C` | Errors, unsafe state, failed validation |

Void, Midnight, Ice, and Nova Cyan form the default identity. Solar Amber appears sparingly at stakes and rewards. Aurora is reserved for confirmed success, especially perfect releases. Do not communicate status with color alone: pair color with a label, icon, shape, or motion cue. Competitive court lines, the ball silhouette, player indicators, shot feedback, and score remain visible on every quality and color-vision setting.

## Typography

Use a broad, condensed display face only for short all-caps titles, scores, clocks, and NCN identifiers. Use a highly legible system sans-serif stack for body copy, settings, statistics, subtitles, and translated content. Tabular numerals are required for score, clock, percentages, credits, and XP.

Interface containers must accommodate at least 40% label expansion. Controls may wrap to two lines and grow vertically; do not truncate an actionable label merely to preserve English proportions. Arabic and Hebrew layouts mirror reading order, navigation direction, and directional icons while leaving basketball spatial diagrams and controller glyphs physically accurate. Font fallback must cover the language's full character set before that locale ships.

## Shapes, spacing, and icons

Panels use clipped corners on one or two opposing edges, not beveled boxes on every edge. A 2 px luminous rule and a restrained inner shadow create depth. Gameplay HUD panels are flatter and quieter than menu cards. Radii, where needed, are small and functional.

Base spacing is an 8 px rhythm. Minimum pointer target is 44 × 44 CSS px; focused keyboard controls use an unbroken Ice/Cyan outline with at least 3:1 adjacent contrast. Icons are original monoline geometry with squared terminals and a consistent optical weight. Filled icons indicate current state; outlines indicate available actions. Never reproduce real league marks, console trademarks, commercial team logos, or another game's badge silhouettes.

## Motion language

| Moment | Duration | Curve / rule |
| --- | --- | --- |
| Input acknowledgement | 60–90 ms | Immediate, ease-out |
| Button/card transition | 140–180 ms | Ease-out; no bounce by default |
| Tab/page transition | 220–280 ms | Short directional wipe plus fade |
| NCN broadcast sting | 350–550 ms | Cyan line build, title lock, clean exit |
| Major reward reveal | 650–900 ms | Two-stage anticipation and settle; skippable |

Input response must begin in the same presented frame whenever possible. Motion never delays basketball commands. Reduced-motion mode replaces translation, parallax, camera shake, and repeated pulses with short opacity changes. Loading graphics remain active and honest; they do not imply progress the loader has not reported.

## Audio language

NOVA COURT sounds percussive, spatial, and nocturnal. UI confirmations use short synthetic ticks, muted ball-like taps, and rising two-note stings. Errors use a dry descending pulse, never a harsh alarm. Game audio prioritizes ball contact, shoes, rim, teammate calls, and the shot/game clock above crowd and music. Outdoor spaces feel open; indoor rooms have distinct early reflections without muddying timing cues.

NCN commentary consists of fictional play-by-play, color, arena, sideline, and postgame voices. Calls describe the action and NOVA COURT fiction; they do not imitate recognizable broadcasters or use real league catchphrases. Captions identify speaker and essential sound direction. Stream-safe music is a first-class mode, and silent mode preserves all competitive information through visuals and captions.

## NCN broadcast rules

NCN means Nova Court Network. Its package uses the `NCN` bug, horizontal Cyan telemetry lines, clean statistic cards, and venue-specific establishing shots. It never adopts a real network's score bug, music, language, or animation cadence.

- Show score, opponent, mode rules, and stakes before spectacle.
- Advanced statistics live in pause, postgame, history, spectator, and scouting views—not the live gameplay HUD.
- Replays identify the triggering play and never hide that live play is paused.
- Competitive spectator feeds apply delay and privacy filtering at the service layer.
- Commentary never claims live online rankings, matchmaking, crews, or tournament services when they are unavailable.
- Sponsored-looking marks are fictional brands from the approved registry below.

## Character proportions and movement

Athletes are stylized, readable humans: approximately 7.25–7.75 heads tall, with sport-appropriate shoulder, hand, foot, and limb proportions. Silhouettes vary by height, position, build, hair, uniform, and stance without caricaturing ethnicity or body type. Feet stay planted through grounded motion, hands maintain believable ball contact, and the visual root may correct sole height without moving the physics root.

Animation emphasizes anticipation, weight transfer, recovery, and control handoff. Avoid signature motion traced from a real athlete. Responsiveness wins over long uninterruptible showcases. Competitive actions retain consistent timing across cosmetics and quality tiers.

## Venue architecture

Venues combine recognizable regulation geometry with original fictional architecture:

- **Nova Park:** compact neighborhood court, skyline layers, chain-link edges, cyan wayfinding, asymmetric spectator pockets.
- **Eclipse Arena:** intimate two-basket venue, steep dark seating, a narrow NCN ribbon, warm court pool against a cool shell.
- **Open Gym:** practical training hall, exposed structure, scoreboards and equipment placed for use rather than spectacle.

Future venues need a silhouette, local material story, distinct acoustic profile, readable court boundary, spawn/camera plan, low-quality fallback, and code-native or fully licensed asset provenance. Weather may alter atmosphere but never competitive traction, ball flight, visibility, or fairness.

## Fictional brand registry

Approved master brands are `NOVA COURT` (game/world), `NCN` (broadcast), `NOVA PARK` (park venue), and `ECLIPSE` (arena/presentation family). Product families may use short astronomical, light, motion, or court-craft language such as Nova Flight, Aurora Grid, Ember Circuit, Solar Flare, Void Runner, and Prism Rush.

New names must be easy to pronounce, localizable, searchable within the project, and checked before release for conflicts. Avoid names, abbreviations, colorways, typography, or numbering schemes likely to imply a real league, player, team, broadcaster, or commercial shoe line.

## Naming conventions

- Player-facing mode and venue names use title case: “Park Duel,” “Nova Park.”
- NCN identifiers and short states use uppercase: “NCN,” “GAME POINT,” “READY.”
- Code identifiers use lower camel case; stable external IDs use lowercase kebab case.
- Event IDs use namespace, subject, and outcome: `match.shot.perfect`, `save.recovery.backup`.
- Storage and schema versions are explicit. Never silently repurpose a shipped key.
- Error copy states what happened, what was preserved, and the safe next action.

## Deliberate differences from NBA 2K and other commercial basketball games

NOVA COURT must remain independently recognizable:

- No real league, franchise, athlete, arena, broadcaster, signature animation, roster, logo, uniform, shoe trade dress, or licensed presentation mimicry.
- No city simulation, casino framing, card-pack economy, paid attribute shortcuts, randomized paid rewards, or manipulative daily-pressure loops.
- Progress rewards play and mastery. Credit/XP receipts are idempotent, transparent, and recoverable.
- Menus use compact NCN telemetry, clipped panels, horizontal stat stories, and direct mode access—not copied tile maps, attribute towers, badge layouts, or broadcast overlays.
- Shot feedback is a clear timing arc/window with accessibility support, not a recreated commercial meter.
- Fictional crews require moderation and reporting before user-generated names or art ship.
- Online buttons display a clear unavailable state until authenticated, authoritative services actually exist.
- Local play, practice, and offline progression remain valuable rather than serving as funnels into monetized online systems.

## Platform presentation rules

Safe-area margins default to 3.5% of each screen dimension and may be increased for television overscan. The bottom-left player panel uses the resolved safe inset, never a hard-coded screen-edge offset. HUD and menu scales are independent. Ultrawide HUD content is centered within a 2:1 gameplay frame while the world may fill the full viewport. Validate 16:9, 16:10, 21:9, 1024 × 576, 1280 × 720, and high-DPI desktop layouts.

Quality settings independently control models, textures, shadows, reflections, crowds, lighting, effects, anti-aliasing, render distance, and resolution scale. Low quality may simplify decoration but must preserve court lines, ball contrast, player indicators, shot feedback, score, and clocks.

## Loading, failure, and online truthfulness

Ball Locker begins venue preload after selection; My Player begins the selected model/uniform preload. Required court, hoop, player, ball, controls, and HUD assets gate match interaction. Optional crowd, architecture, and broadcast decoration may arrive later. Progress reflects completed byte estimates or item counts, cancellation disposes stale results, and the cache obeys an explicit budget.

Missing venues and models fall back to inspected code-native assets. Corrupt saves try the newest valid recovery or backup before a default profile. Focus loss and controller loss pause and clear held inputs. Audio failure enables silent captions. WebGL loss attempts one controlled restore and otherwise returns to the main menu. Network failure cancels an unverified competitive result without penalizing the player. Invalid customization values normalize to safe defaults. No failure may leave a blank or interactive frozen screen.

The shipped project is offline/device-local unless a documented service adapter says otherwise. Client validation is preflight only; authoritative servers must validate identity, sequence, time, movement, ratings, collisions, possession, score, and rewards. Server failure attribution precedes penalties. Reporting, replay review, privacy filtering, moderation, and appeal workflows are prerequisites—not future-facing marketing copy—for competitive and social features.

## Review checklist

Before a new screen or feature is accepted, verify identity, translation expansion, RTL, keyboard focus, safe area, compact laptop layout, high-DPI scale, reduced motion, color-independent state, silent captions, low-quality gameplay readability, honest loading, deterministic recovery, original terminology/assets, and explicit online availability. Record any intentional exception in the feature's design review.
