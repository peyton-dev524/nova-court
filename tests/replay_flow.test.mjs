import nodeTest from "node:test";
import assert from "node:assert/strict";
import { collectContractScenarios } from "./helpers/contract-scenarios.mjs";
import {
  REPLAY_FLOW_EVENTS,
  REPLAY_FLOW_PHASES,
  createReplayFlow,
  replayRestoreEase,
} from "../js/replay-flow.js";

const { scenario: test, register } = collectContractScenarios();

function readyAndStart(flow, token) {
  flow.advance(0.36);
  assert.equal(flow.startPlayback(token), true);
  assert.equal(flow.phase, REPLAY_FLOW_PHASES.PLAYING);
}

test("a scored highlight freezes immediately, including its queued pre-roll", () => {
  const flow = createReplayFlow({ queueDelay: 0.36 });
  const token = flow.requestHighlight({ id: "score-1" });
  assert.equal(flow.phase, REPLAY_FLOW_PHASES.QUEUED);
  assert.equal(flow.frozen, true);
  assert.equal(flow.playbackReady, false);
  assert.equal(flow.startPlayback(token), false);
  const types = flow.drainEvents().map((event) => event.type);
  assert.deepEqual(types, [REPLAY_FLOW_EVENTS.FREEZE, REPLAY_FLOW_EVENTS.HIGHLIGHT_QUEUED]);
});

test("playback start and midpoint never release the replay freeze", () => {
  const flow = createReplayFlow();
  const token = flow.requestHighlight({ id: "score-1" });
  readyAndStart(flow, token);
  flow.advance(30);
  assert.equal(flow.phase, REPLAY_FLOW_PHASES.PLAYING);
  assert.equal(flow.frozen, true);
  assert.equal(flow.getSnapshot().restorationProgress, 0);
  assert.equal(flow.drainEvents().some((event) => event.type === REPLAY_FLOW_EVENTS.RESUME), false);
});

test("completed playback must pass through restoration and explicit acknowledgement", () => {
  const flow = createReplayFlow({ restoreDuration: 0.2 });
  const token = flow.requestHighlight({ id: "score-1" });
  readyAndStart(flow, token);
  assert.equal(flow.completePlayback(token), true);
  assert.equal(flow.phase, REPLAY_FLOW_PHASES.RESTORING);
  assert.equal(flow.frozen, true);

  flow.advance(0.1, { restorationApplied: true });
  assert.equal(flow.phase, REPLAY_FLOW_PHASES.RESTORING, "mid-restore acknowledgement is ignored");
  assert.equal(flow.confirmRestoration(token), false);

  flow.advance(0.1);
  assert.equal(flow.restoreReady, true);
  assert.equal(flow.frozen, true, "100% time alone does not resume gameplay");
  assert.equal(flow.confirmRestoration(token), true);
  assert.equal(flow.phase, REPLAY_FLOW_PHASES.IDLE);
  assert.equal(flow.frozen, false);
  const types = flow.drainEvents().map((event) => event.type);
  assert.ok(types.indexOf(REPLAY_FLOW_EVENTS.RESTORE_STARTED) < types.indexOf(REPLAY_FLOW_EVENTS.RESTORE_COMPLETED));
  assert.ok(types.indexOf(REPLAY_FLOW_EVENTS.RESTORE_COMPLETED) < types.indexOf(REPLAY_FLOW_EVENTS.RESUME));
});

test("a skipped queued replay still restores before releasing gameplay", () => {
  const flow = createReplayFlow({ restoreDuration: 0.15 });
  const token = flow.requestHighlight({ id: "skip-me" });
  assert.equal(flow.skip("reduced-motion", token), true);
  assert.equal(flow.phase, REPLAY_FLOW_PHASES.RESTORING);
  assert.equal(flow.frozen, true);
  flow.advance(0.15, { restorationApplied: true });
  assert.equal(flow.phase, REPLAY_FLOW_PHASES.IDLE);
  const events = flow.drainEvents();
  assert.equal(events.find((event) => event.type === REPLAY_FLOW_EVENTS.RESTORE_STARTED)?.reason, "reduced-motion");
  assert.equal(events.at(-1).type, REPLAY_FLOW_EVENTS.RESUME);
});

test("an interruption drops stale highlights and follows the restore gate", () => {
  const flow = createReplayFlow({ queueDelay: 0, restoreDuration: 0.1 });
  const token = flow.requestHighlight({ id: "active" });
  flow.requestHighlight({ id: "stale-pending" });
  assert.equal(flow.startPlayback(token), true);
  assert.equal(flow.interrupt("lost-context"), true);
  assert.equal(flow.pending.length, 0);
  flow.advance(0.1);
  assert.equal(flow.frozen, true);
  assert.equal(flow.confirmRestoration(token), true);
  assert.equal(flow.frozen, false);
});

test("mode reset atomically invalidates active and pending tokens", () => {
  const flow = createReplayFlow({ queueDelay: 0 });
  const oldToken = flow.requestHighlight({ id: "old" });
  flow.requestHighlight({ id: "pending" });
  flow.startPlayback(oldToken);
  assert.equal(flow.reset("new-mode"), true);
  assert.equal(flow.phase, REPLAY_FLOW_PHASES.IDLE);
  assert.equal(flow.pending.length, 0);
  assert.equal(flow.startPlayback(oldToken), false);
  const reset = flow.drainEvents().find((event) => event.type === REPLAY_FLOW_EVENTS.RESET);
  assert.deepEqual(
    { reason: reset.reason, dropped: reset.dropped, wasFrozen: reset.wasFrozen },
    { reason: "new-mode", dropped: 2, wasFrozen: true },
  );
});

test("back-to-back scores remain continuously frozen between highlights", () => {
  const flow = createReplayFlow({ queueDelay: 0, restoreDuration: 0.1 });
  const first = flow.requestHighlight({ id: "first" });
  const second = flow.requestHighlight({ id: "second" });
  flow.startPlayback(first);
  flow.completePlayback(first);
  flow.advance(0.1);
  assert.equal(flow.confirmRestoration(first), true);
  assert.equal(flow.phase, REPLAY_FLOW_PHASES.QUEUED);
  assert.equal(flow.frozen, true);
  assert.equal(flow.current.token, second);
  assert.equal(flow.drainEvents().some((event) => event.type === REPLAY_FLOW_EVENTS.RESUME), false);

  assert.equal(flow.startPlayback(second), true);
  flow.completePlayback(second);
  flow.advance(0.1, { restorationApplied: true });
  assert.equal(flow.phase, REPLAY_FLOW_PHASES.IDLE);
  assert.equal(flow.frozen, false);
  assert.equal(flow.drainEvents().filter((event) => event.type === REPLAY_FLOW_EVENTS.RESUME).length, 1);
});

test("stale asynchronous tokens cannot start or finish a later replay", () => {
  const flow = createReplayFlow({ queueDelay: 0, restoreDuration: 0.01 });
  const first = flow.requestHighlight({ id: "first" });
  const second = flow.requestHighlight({ id: "second" });
  flow.startPlayback(first);
  flow.completePlayback(first);
  flow.advance(0.01, { restorationApplied: true });
  assert.equal(flow.current.token, second);
  assert.equal(flow.startPlayback(first), false);
  assert.equal(flow.startPlayback(second), true);
  assert.equal(flow.completePlayback(first), false);
  assert.equal(flow.phase, REPLAY_FLOW_PHASES.PLAYING);
});

test("restore easing is clamped, monotonic, and finishes exactly", () => {
  assert.equal(replayRestoreEase(-1), 0);
  assert.equal(replayRestoreEase(0), 0);
  assert.equal(replayRestoreEase(1), 1);
  assert.equal(replayRestoreEase(2), 1);
  let previous = 0;
  for (let step = 1; step <= 100; step++) {
    const value = replayRestoreEase(step / 100);
    assert.ok(value >= previous);
    previous = value;
  }
});

register(nodeTest, "replay freeze, restoration, interruption, and easing contracts");
