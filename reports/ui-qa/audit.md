# NOVA COURT UI screenshot audit

Baseline captures were taken at 1280×720 on the local production-style server.

## Findings

- **[P1] Mode selection cannot complete in one viewport.** `menu-modes.jpg` shows the second row clipped below the fold, while difficulty, target, and the primary start action are not visible. The title and cards spend too much vertical space for a desktop game menu.
- **[P1] Gameplay HUD competes with the court.** `gameplay-park.jpg` shows a wide control ribbon, a low-contrast player card, a scoreboard pressed against the top edge, and very small supporting labels. Important state is readable, but the hierarchy is fragmented across every edge.
- **[P1] My Player loses usable vertical space.** `menu-my-player.jpg` shows the sticky status bar covering upgrade content, an oversized title region, and three equally dense columns. The identity controls and upgrades need clearer grouping and a non-obscuring status treatment.
- **[P2] Main menu lacks a decisive focal path.** `menu-main.jpg` has five equal-weight actions, tiny footer text, and an attract-mode character cluster partially hidden behind the featured card. The instant matchup and mode browser should read as the two primary choices.
- **[P2] Safe-area and compact-height behavior need explicit coverage.** The current desktop layout is width-responsive but does not sufficiently adapt to a 720px-tall play window.

## Assigned workstreams

1. **Menu and mode browser:** hierarchy, compact-height layout, visible setup/start action, and responsive card grid.
2. **Gameplay HUD:** scoreboard safe area, control-hint economy, player/status readability, and overlay hierarchy.
3. **My Player and settings:** denser profile layout, unobscured feedback, clearer panel grouping, and compact-height behavior.

Each workstream owns a separate final-loaded stylesheet under `js/` to minimize merge conflicts.
