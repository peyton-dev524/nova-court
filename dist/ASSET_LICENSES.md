# NOVA COURT asset and license register

Last reviewed: 2026-07-28

NOVA COURT intentionally avoids downloaded art, real-player likenesses, team branding, commercial music, sampled sound libraries, motion capture, and copied interface art. Courts, athletes, props, lighting, effects, UI graphics, animations, announcer copy, and sound effects are generated from original project code and Three.js primitives. Original music and voice performances were generated specifically for this project through the project owner's ElevenLabs account; no third-party track, celebrity voice, or recognizable performer imitation was requested.

## Third-party software

| Asset | Author / canonical source | Version / integrity | License | Local file | Inspection and use |
| --- | --- | --- | --- | --- | --- |
| Three.js | Three.js authors, [official GitHub repository](https://github.com/mrdoob/three.js) | r147; SHA-256 `D552EA3C64A2C7319B1934A999157B120797AE6F2B9EB9BBB0F9C50D039F21C7` | MIT; notice preserved in `vendor/THREE-LICENSE.txt` | `vendor/three.min.js` | JavaScript runtime only; no models/textures. Vendored locally, scanned as text, never hotlinked, and compatible with the static no-bundler architecture. Its approximately 608 KB size is appropriate for one-time browser caching. |

## Supplied reference-image inspection

The following user-supplied files were inspected only as visual requirements. They are not copied, traced, transformed, bundled, or served by NOVA COURT.

| Reference | Observed content and technical inspection | Provenance / license finding | Decision and project response |
| --- | --- | --- | --- |
| `image-1.png` (488,985 bytes) | 550 × 550 PNG preview depicting an orange ball passing through a rim/net on a checkerboard-style backdrop, with “AI SVG EPS PNG” text. It appears to advertise stock vector formats rather than provide a clean game-ready texture. No author/source metadata, scale, attribution notice, or license was supplied. | Unknown author, canonical source, and reuse terms; the embedded preview text and stock-preview presentation create additional suitability concerns. | **Rejected.** Used only to understand the requested swish/net feel. NOVA COURT instead uses original Three.js rim, net deformation, ball contact, rim-bounce, bank, swish VFX, captions, and synthesized swish audio. |
| `image-2.png` (1,699,863 bytes) | 1600 × 900 PNG screenshot of a commercial-basketball-game-style attribute interface with vertical colored bars, rating caps, category groupings, and a visible creator/video watermark. It is a flattened screenshot, not an editable UI asset, and contains third-party trade dress/content. | Unknown rights holder and reuse license; likely copyrighted game UI plus third-party screenshot/watermark content. No permission or attribution terms were supplied. | **Rejected.** Used only to understand the functional request for grouped ratings, caps, and overall. NOVA COURT’s horizontal stat cards, typography, palette, layout, build calculations, five positions, and upgrade flow were independently designed and implemented in HTML/CSS/JS. |

Neither reference is present in `dist/`. Because the references were rejected, no external attribution is claimed or required by the shipped game.

## Original code-generated assets

| Asset family | Author / provenance | License | Generation / modifications | Inspection result |
| --- | --- | --- | --- | --- |
| Courts, hoops, backboards, animated nets, ball, arena, NOVA PARK, crowds, skyline, and athletes | NOVA COURT project | Project code | Three.js primitives, runtime geometry/materials, canvas-generated hardwood/signage/scoreboard/LED textures, and instanced crowds/skyline | No external geometry, likeness, trademark, rig, archive, or hidden payload. Code-native scale/orientation and quality tiers keep polygon/shadow budgets predictable across 1–10 athletes. |
| Dribbling, shot, layup, dunk, defense, rebound, stumble, rim-hang, and replay animation | NOVA COURT project | Project code | Procedural part transforms, stable shooting/guide hands, apex release clocks, wrist follow-through, continuous handle curves and crossfades, grounded gait, contextual finish curves, pose recording, and replay interpolation | Original parameterized motion only; no real-player signature, proprietary animation, or motion-capture data. Names describe generic basketball actions rather than a copied individual likeness. |
| Interface, progression presentation, and VFX | NOVA COURT project | Project code | Semantic HTML, CSS gradients/borders/type hierarchy, canvas/WebGL particles, shot/coverage feedback, original grouped attributes, and colorway swatches | No raster UI, copied logo, remote font, or hotlinked graphic. Responsive layouts avoid image-memory overhead. |
| Social preview card (`og.png`) | NOVA COURT project; generated once with OpenAI built-in image generation from a project-authored prompt | Project asset | Original 1730 x 909 PNG; SHA-256 `6670F98B8B75DFFD00FB36071C998E5C4BF4CE1F665F82B7F79560D5E484D115`. Prompt required the exact NOVA COURT title/tagline, cyan/orange night-court direction, an anonymous fictional athlete, and explicit exclusion of league marks, player likenesses, copied UI, watermarks, and third-party branding. | Visually inspected at full size: both text lines are spelled correctly, the athlete is anonymous, the hoop/court are generic, and no prohibited logo, watermark, or extra copy is present. Used only as link-preview metadata, not as an in-game texture. |
| Six mode-specific music loops | NOVA COURT project; generated through ElevenLabs Music | Project asset generated through project-owner account | Six original 40-second instrumental MP3 loops using `music_v1`: Park After Dark, Arc Pressure, Night Tactics, Two-Man Current, Full Court Voltage, and Open Gym Focus. Prompts prohibit vocals, recognizable samples, and artist imitation. Exact prompts, sizes, and SHA-256 hashes are in `assets/audio/manifest.json`. | Audition-oriented prompts match each mode's pace and visual language. All files were decoded successfully, are 128 kbps MP3, total about 3.84 MB, are served locally, and leave dynamic space for gameplay effects. |
| Announcer and arena-PA performances | NOVA COURT project; generated through ElevenLabs Text to Speech | Project asset generated through project-owner account | Thirty original caption-matched MP3 clips using `eleven_v3`. Tyler Cruz (`SA7eD52NRr8WAehitVt1`) performs fictional play-by-play; Sarah (`EXAVITQu4vr4xnSDxMaL`) performs neutral PA/game-state calls. Exact text, role, model, sizes, and SHA-256 hashes are in `assets/audio/manifest.json`. | No real broadcaster, celebrity, catchphrase, or voice clone was requested. Clips decode successfully, total about 1.14 MB, and are selected by the same deterministic cue index as visible captions. |
| Crowd bed and basketball/interface sound effects | NOVA COURT project | Project code | Web Audio oscillators, envelopes, filters, and generated noise buffers for bounce, rim, backboard, swish, whistle, UI, crowd reactions, and procedural fallback music | No downloaded samples. Short procedural nodes/buffers are independently mixed and released after playback. |

## Network, format, and security review

- Runtime assets are local; the game does not hotlink media, fonts, modules, or remote code. ElevenLabs is used only by the opt-in local generation script, never by shipped browser code.
- No external asset archive, executable, shader binary, model loader, codec, or user-supplied file is evaluated.
- No analytics, ads, account system, telemetry upload, or tracking pixel is included.
- Code-native assets avoid unclear provenance, polycount surprises, inconsistent scale/orientation, rig incompatibility, unsupported codecs, malicious payloads, and attribution failures.

## Trademark and identity review

“NOVA COURT,” “NOVA,” and “ECLIPSE” are original fictional presentation names. The game does not use NBA, NBA 2K, Roblox game branding, real league/team marks, player names or likenesses, signature shoes/jerseys, arena names, copied broadcast packages, or commercial music. Any resemblance to a real person or organization is coincidental.

## Adding assets later

Before adding an external asset, record its canonical source URL, author, exact license/version, required attribution, file hash, modifications, format, size/polycount, scale/orientation, rig/animation compatibility, visual/audio inspection notes, performance impact, and security review here. Do not integrate an asset whose license or provenance is ambiguous, and never hotlink production assets.
