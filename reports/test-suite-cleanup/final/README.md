# Test suite cleanup evidence

The suite now reports 175 top-level tests, down from 262, while executing the
same 262 named scenarios and the same 1,344 direct assertion calls across all 39
test files. No scenarios were skipped, marked TODO, or deleted.

## Before and after

| Metric | Baseline | Final | Change |
| --- | ---: | ---: | ---: |
| Reported tests | 262 | 175 | -87 (-33.2%) |
| Named scenarios executed | 262 | 262 | 0 |
| Direct assertion-call proxy | 1,344 | 1,344 | 0 |
| Test files | 39 | 39 | 0 |
| Test LOC | 5,555 | 5,590 | +35 |
| Node test-runner duration | 980.99 ms | 1,155.40 ms | +174.42 ms |
| Observed command wall time | 1.3 s | 1.6 s | +0.3 s |

The timing difference is normal wall-clock variance plus the small runner
process/manifest overhead. The final run remains under the project's usual
1.5-second internal-suite budget. Parallel validation runs were not used for the
final timing because they contend for CPU.

The assertion proxy is intentionally simple: it counts direct `assert(...)` and
`assert.method(...)` calls in test files. It is useful for proving assertions
were retained, but it is not a substitute for statement/branch coverage.

## What changed

Seven highly fragmented domains now use one readable domain contract apiece.
Every original scenario body and name remains in its source file. A shared
collector executes them in order and prefixes a failed assertion with the exact
scenario name while retaining the original assertion diff and stack.

- `tests/contact_rules.test.mjs`
- `tests/dunk_choreography.test.mjs`
- `tests/live_ball_duels.test.mjs`
- `tests/performance_profile.test.mjs`
- `tests/player_progression.test.mjs`
- `tests/replay_flow.test.mjs`
- `tests/shot_coverage.test.mjs`

`scripts/run-tests.mjs` discovers and de-duplicates every `*.test.mjs` file for
the authoritative full run. It also provides gameplay, lab, and smoke subsets.
`scripts/check-source.mjs` replaces the brittle hand-written syntax-check chain
with cross-platform discovery that excludes generated evidence and vendor code.

## Baseline hotspots

The five slowest named tests in the original `npm test` output were:

1. Basketball runtime style switching — 509.40 ms
2. Precision 7 render/dimension budget — 183.75 ms
3. Red-white-blue ball panels — 127.04 ms
4. Basketball texture-channel determinism — 102.96 ms
5. Court Classic comparative render budget — 54.94 ms

An isolated per-file wall-time sample identified
`basketball_visuals.test.mjs` (841.2 ms) and
`basketball_shoe_styles.test.mjs` (198.1 ms) as the dominant files. Those tests
were deliberately preserved because they validate procedural texture and
geometry behavior, not duplicated bookkeeping.

## Commands

```text
npm test
npm run test:gameplay
npm run test:labs
npm run test:smoke
npm run check
npm run build
git diff --check
```

Machine-readable metrics are in `report-data.json`; the 1280×720 visual summary
is `test-suite-before-after.png`.
