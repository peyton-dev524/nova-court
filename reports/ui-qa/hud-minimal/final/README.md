# Minimal gameplay HUD — final QA

All screenshots are real production-game renders captured at **1280×720** on
2026-07-29. The capture routes use the normal Three.js scene, gameplay HUD,
venue loader, players, and cameras.

## Reproducible captures

| Screenshot | Route | Named state |
| --- | --- | --- |
| `competitive-hud-1280x720.png` | `/index.html?qa=1&captureHeight=720&gameplayHudCapture=street` | Frozen 1v1 competitive HUD |
| `arc-run-hud-1280x720.png` | `/index.html?qa=1&captureHeight=720&arcRunCapture=rack-top` | Top-of-arc rack, ball 1 |

## Deterministic layout proof

At 1280×720:

- Competitive scoreboard: x **415–863**, y **30–79.33**, width **448 px**,
  height **49.33 px**.
- Arc Run tracker: x **18–144**, y **96–203**, width **126 px**, height
  **107 px**.
- The tracker does not intersect the scoreboard.
- The tracker is wholly outside the central hoop/play lane used for QA
  (**x=384–896**).
- The persistent `#control-hints` element and NCN broadcast bug do not exist
  in the rendered DOM.
- Arc Run's player lower-third has `hidden=true` and `display:none` during rack
  handoffs. No visible element contains `LOOSE BALL`.
- The Arc Run tracker remains a semantic `aria-label="Three-point rack
  progress"` region with five rows of five balls. Each rack's fifth slot keeps
  its money-ball label.
- Both screenshots produced **zero browser console warnings and zero errors**.

## Visual inspection

`competitive-hud-1280x720.png` shows the essential score, mode, possession/
objective, and shot-clock information in a compact top-center card. The pause
button remains available at the top-right; controls remain accessible from
pause/settings/How to Play rather than occupying the court view.

`arc-run-hud-1280x720.png` shows the full hoop, backboard, player, active rack,
and opposite rack unobstructed. The rack ledger reads as a quiet top-left
progress element and does not cover the rim or shooting lane. No loose-ball
player card appears during the automated rack pickup.

## Automated proof

`tests/hud_presentation.test.mjs` verifies:

1. competitive modes preserve essential score/clock presentation;
2. persistent controls are disabled by policy and absent from gameplay markup;
3. Arc Run alone activates the rack tracker and suppresses player-card
   loose-ball copy;
4. true loose-ball presentation remains available in non-Arc-Run modes;
5. the production DOM/CSS exposes the `data-game-mode` and `left-rail` layout
   hooks used by the screenshots.

## Limitations

The screenshots validate desktop 1280×720 composition. Responsive rules keep
the same information hierarchy on narrow screens, but these two artifacts do
not serve as a complete mobile visual-regression set.
