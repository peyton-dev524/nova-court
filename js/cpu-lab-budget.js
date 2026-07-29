export const CPU_LAB_RENDER_BUDGET = Object.freeze({
  calls: 180,
  triangles: 100000,
});

export function cpuLabWithinRenderBudget(metrics = {}) {
  const calls = Number(metrics.calls ?? metrics.draws);
  const triangles = Number(metrics.triangles);
  return Number.isFinite(calls)
    && Number.isFinite(triangles)
    && calls <= CPU_LAB_RENDER_BUDGET.calls
    && triangles <= CPU_LAB_RENDER_BUDGET.triangles;
}
