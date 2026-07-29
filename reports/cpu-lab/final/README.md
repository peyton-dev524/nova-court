# CPU Decision Lab — deterministic visual QA

Captured at `1280×720` from the production `NovaCourtEngine` arena, player
rigs, basketball, lights, and renderer. The cyan lines are facing vectors and
the gold lines are movement targets. All captures use difficulty `pro` and
seed `41`.

## Reproduction

Start the local server and open:

```text
http://127.0.0.1:4174/cpu-lab.html?scenario=open-jumper&seed=41&difficulty=pro
```

Stable browser hook:

```js
__NOVA_CPU_LAB__.setScenario("hard-contest-pass");
__NOVA_CPU_LAB__.step();
__NOVA_CPU_LAB__.getState();
__NOVA_CPU_LAB__.getTrace("cpu-handler");
```

Production gameplay exposes the same bounded trace only when explicitly
enabled:

```text
http://127.0.0.1:4174/?qa&aiDebug
__NOVA_QA__.ai()
```

Normal gameplay does not allocate trace entries. Debug traces are copied out
of the director and capped at 48 entries, preventing callers from mutating AI
memory or growing an unbounded history.

## Named captures

| Screenshot | Scenario / clock | Chosen action | Decision score / reason |
| --- | --- | --- | --- |
| `cpu-open-jumper.png` | open jumper / 14.0 | shoot | `0.958`; take high-value open jumper |
| `cpu-hard-contest-pass.png` | hard contest / 10.0 | pass | `0.665`; teammate has better expected value (`cpu-wing`) |
| `cpu-late-clock-shot.png` | late clock / 1.7 | shoot | `1.361`; forced legal attempt before expiry |
| `cpu-corner-recovery.png` | corner trap / 9.0 | pass | `0.575`; escape corner with outlet pass |
| `cpu-transition.png` | transition / 18.0 | drive | commit to open driving lane |
| `cpu-help-defense.png` | help defense / 8.0 | show help | tag the drive; trace selector is `cpu-wing` |
| `cpu-rebound.png` | rebound / 14.0 | rebound | track projected rebound landing |

Candidate score bars are utilities, not make probabilities. Production shot,
pass, dribble, steal, and rebound APIs still resolve collisions, timing,
physics, possession, and rules.

## Renderer and debug cost

The reference Chrome capture reported 48–60 FPS after warm-up, 930 draw calls,
196,282 triangles, and no console warnings or errors. This is the complete
balanced production arena rather than a lightweight mock. The lab intentionally
keeps a fixed one-device-pixel render ratio for stable screenshots.

With debugging disabled, the scoring pass retains only the active per-player
decision memory and accumulates zero trace records. With debugging enabled,
the trace ring is 48 records and stores rounded scalar diagnostics plus plain
target/facing coordinates.

## Limitations

- Candidate scores compare action value; they do not predict the engine's
  final make/miss result.
- The lab advances deterministic high-level intents in discrete steps and
  moves preview actors toward targets, but it does not execute a full game or
  bypass authoritative rules.
- Renderer counts include the complete arena crowd and are deliberately
  higher than a minimal diagnostic scene.
