# Final merged QA

Captured from the merged `main` build served locally on July 28, 2026 at 1280×720.

## Captures

- `arc-run-racks.png` — fresh Arc Run at 0:59, Left Corner rack 1/5 and ball 1/5. All five physical racks are present; each rack contains four classic balls and a tricolor final money ball. The HUD exposes all 25 accessible rack slots and labels every fifth slot as a money ball.
- `shoe-style-locker.png` — saved player profile with `NOVA Court Classic` selected in the new shoe-style control alongside the compatible `NOVA Flight` default.

The accepted Court Classic close-up and mounted-player views live under
`reports/basketball-shoes/court-classic/screenshots/`.

## Reproduction

1. Run `npm run serve`.
2. Open `http://127.0.0.1:4174/?qa`.
3. Create or load a player and choose **Arc Run**.
4. Enter through the Ball Locker. At the start of the run, confirm five visible racks and the HUD state `Left Corner 1/5 · BALL 1/5`.
5. Return to the menu, open **My Player**, and select **NOVA Court Classic** under **Shoes**.

Browser diagnostics reported no console warnings or errors. The merged verification suite passed
221 tests, `npm run check`, and `npm run build`.
