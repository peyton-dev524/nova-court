import test from "node:test";
import assert from "node:assert/strict";
import { createSceneGroupLoader } from "../js/scene-group-loader.js";

const value = (id) => ({
  id,
  visible: true,
  disposed: false,
  dispose() { this.disposed = true; },
});

test("scene loader emits monotonic staged progress and synchronous required fallbacks", async () => {
  const events = [];
  const loader = createSceneGroupLoader({
    groups: [
      { id: "shell", phase: "shell", required: true, createFallback: () => value("fallback"), load: () => value("shell") },
      { id: "court", phase: "required", required: true, createFallback: () => value("court-fallback"), load: () => value("court") },
      { id: "detail", phase: "optional", load: () => value("detail") },
    ],
    onProgress: (event) => events.push(event),
  });
  const fallbacks = loader.requiredFallbacks("gym", ["shell", "court"]);
  assert.deepEqual(fallbacks.map((entry) => entry.id), ["fallback", "court-fallback"]);
  const result = await loader.loadScene("gym", ["shell", "court", "detail"]);
  assert.equal(result.cancelled, false);
  assert.equal(loader.snapshot().phase, "ready");
  assert.deepEqual(loader.snapshot().loadedIds, ["shell", "court", "detail"]);
  assert.ok(events.every((event, index) => index === 0 || event.progress >= events[index - 1].progress));
});

test("stale asynchronous completion is rejected and disposed after cancellation", async () => {
  let resolve;
  const delayed = new Promise((done) => { resolve = done; });
  const staleValue = value("late");
  const loader = createSceneGroupLoader({
    groups: [{ id: "late", phase: "optional", load: () => delayed }],
  });
  const pending = loader.loadScene("gym", ["late"]);
  loader.cancel();
  resolve(staleValue);
  const result = await pending;
  assert.equal(result.stale, true);
  assert.equal(staleValue.disposed, true);
  assert.deepEqual(loader.snapshot().loadedIds, []);
});

test("loaded IDs reuse idempotently, hide on release, and dispose only when requested", async () => {
  let loadCount = 0;
  const shared = value("shared");
  const loader = createSceneGroupLoader({
    groups: [{ id: "shared", phase: "shell", load: () => { loadCount += 1; return shared; } }],
  });
  await loader.loadScene("one", ["shared"]);
  await loader.loadScene("two", ["shared"]);
  assert.equal(loadCount, 1);
  loader.releaseScene("one");
  assert.equal(shared.visible, true);
  loader.releaseScene("two");
  assert.equal(shared.visible, false);
  assert.equal(shared.disposed, false);
  await loader.loadScene("three", ["shared"]);
  assert.equal(shared.visible, true);
  loader.releaseScene("three", { dispose: true });
  assert.equal(shared.disposed, true);
  assert.deepEqual(loader.snapshot().loadedIds, []);
});

test("three full scene reset cycles return registry ownership to zero without growth", async () => {
  let created = 0;
  let disposed = 0;
  const loader = createSceneGroupLoader({
    groups: [{
      id: "venue",
      phase: "optional",
      load: () => {
        created += 1;
        return { visible: true, dispose() { disposed += 1; } };
      },
    }],
  });
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await loader.loadScene(`scene-${cycle}`, ["venue"]);
    assert.deepEqual(loader.snapshot().loadedIds, ["venue"]);
    loader.releaseScene(`scene-${cycle}`, { dispose: true });
    assert.deepEqual(loader.snapshot().loadedIds, []);
  }
  assert.equal(created, 3);
  assert.equal(disposed, 3);
});
