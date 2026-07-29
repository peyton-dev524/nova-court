# Arc Run countdown and grab QA

All captures are deterministic 1280×720 production-game routes. The
`arcRunCapture` query selects a named state, disables input/audio captions,
freezes simulation without opening the pause menu, snaps the existing
behind-player camera, and leaves the normal HUD/rack renderer visible.

| Capture | Route | Deterministic state |
| --- | --- | --- |
| `countdown-3.png` | `/index.html?qa=1&arcRunCapture=countdown-3` | countdown 3, clock 60.0, controls locked |
| `countdown-2.png` | `/index.html?qa=1&arcRunCapture=countdown-2` | countdown 2, clock 60.0, controls locked |
| `countdown-1.png` | `/index.html?qa=1&arcRunCapture=countdown-1` | countdown 1, clock 60.0, controls locked |
| `grab-contact.png` | `/index.html?qa=1&arcRunCapture=grab-contact` | top rack, money ball slot 5, grab progress 0.60/contact |
| `grab-gather.png` | `/index.html?qa=1&arcRunCapture=grab-gather` | top rack, money ball slot 5, grab progress 0.76/gather |
| `rack-money-ball.png` | `/index.html?qa=1&arcRunCapture=rack-money-ball` | top rack ball 4/5; tricolor money ball remains physically last |

## Reproduction hooks

Start Arc Run from `/index.html?qa=1`, then use:

```js
window.__NOVA_QA__.setArcRunCountdown(3); // also 2 or 1
window.__NOVA_QA__.setArcRunGrab(0.60, 2, 4);
window.__NOVA_QA__.setArcRunGrab(0.76, 2, 4);
window.__NOVA_QA__.jumpThreePointContest(2, 3, false);
window.__NOVA_QA__.threePointContest();
```

The snapshot reports contest state, current rack, all rack presentation
vectors, actual/planned camera values, grab phase/progress/ball position, and
countdown-overlay visibility.

## Metrics and review

- Viewport: 1280×720.
- Production setup: one player, five racks, 25 ball slots.
- Rack renderer: 11 instanced draw calls; no added textures or external model
  loads.
- Grab duration: 0.64 seconds, with deterministic reach/contact/gather samples.
- Countdown proof: clock remains exactly 60.0 and shot events are rejected
  until the transition to live.
- Money-ball proof: all five racks are `[normal, normal, normal, normal, money]`
  both initially and after restart.

The six PNGs were visually inspected. Countdown hierarchy is readable, contact
and gather are visibly different, the game ball moves continuously off the rack
toward the body, and the top-rack proof leaves the red/white/blue ball in the
fifth slot. The procedural hands approximate contact rather than finger-cupping
the sphere, and the left-corner countdown camera can place the player's shoulder
in the foreground; both are presentation limitations, not sequence/state
errors.
