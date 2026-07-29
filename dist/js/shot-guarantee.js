import { RIM_RESULTS } from "./shot-coverage.js";

const finite = (value, fallback = 0) => (
  Number.isFinite(Number(value)) ? Number(value) : fallback
);

/**
 * Returns a deterministic hoop-crossing correction for a guaranteed make.
 * This runs only after active block collision checks, so a real block still wins.
 */
export function resolveGuaranteedHoopCrossing({
  state,
  guaranteedMake,
  bankShot,
  plannedRimResult,
  velocityY,
  previousY,
  currentY,
  currentX,
  basketX,
  basketY,
  basketZ,
} = {}) {
  const crossing = state === "shot"
    && Boolean(guaranteedMake)
    && !bankShot
    && finite(velocityY) < 0
    && finite(previousY) >= finite(basketY)
    && finite(currentY) < finite(basketY) + 0.22;
  if (!crossing) return Object.freeze({ corrected: false });

  const softRimIn = plannedRimResult === RIM_RESULTS.SOFT_RIM_IN;
  const side = Math.sign(finite(currentX) - finite(basketX)) || 1;
  return Object.freeze({
    corrected: true,
    previousY: Math.max(finite(previousY), finite(basketY) + 0.02),
    position: Object.freeze({
      x: finite(basketX) + (softRimIn ? side * 0.09 : 0),
      y: finite(basketY) - 0.02,
      z: finite(basketZ),
    }),
    minimumRimContacts: softRimIn ? 1 : 0,
  });
}
