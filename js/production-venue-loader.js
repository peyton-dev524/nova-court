import { createSceneGroupLoader } from "./scene-group-loader.js?v=1.0";
import {
  createVenueGroups,
  normalizeVenueId,
  productionVenueGroupIds,
  venueBudgetSnapshot,
} from "./venue-scenes.js?v=1.0";

function marker(T, id, value) {
  const root = new T.Group();
  root.name = id;
  root.userData.requiredObject = value;
  root.userData.isRequiredFallback = true;
  return root;
}

export function createProductionVenueLoader({
  T,
  engine,
  venueId,
  quality = "medium",
  onProgress = () => {},
} = {}) {
  if (!T || !engine) throw new TypeError("Production venue loader requires THREE and an engine.");
  const selectedVenue = normalizeVenueId(venueId);
  const sceneId = `${engine.mode}:${selectedVenue}`;
  const required = [
    { id: "production-court", phase: "shell", required: true, target: engine.worldRoot },
    { id: "production-hoops", phase: "required", required: true, target: [engine.backboard, engine.rim] },
    { id: "production-players", phase: "required", required: true, target: engine.playerRoot },
  ].map((definition) => {
    let fallback;
    return {
      id: definition.id,
      phase: definition.phase,
      required: true,
      createFallback: () => {
        fallback = marker(T, definition.id, definition.target);
        return fallback;
      },
      load: () => fallback || marker(T, definition.id, definition.target),
    };
  });

  const venueDefinitions = createVenueGroups(T, selectedVenue, quality)
    .filter((definition) => !definition.id.endsWith("-court") && !definition.id.endsWith("-hoops"))
    .map((definition) => ({
      ...definition,
      required: false,
      createFallback: undefined,
      load: () => {
        const value = definition.load?.();
        if (value) {
          value.userData.venueId = selectedVenue;
          value.userData.productionVenue = true;
          engine.worldRoot.add(value);
        }
        return value;
      },
    }));

  const loader = createSceneGroupLoader({
    groups: [...required, ...venueDefinitions],
    onProgress,
  });
  const ids = productionVenueGroupIds(selectedVenue);
  return Object.freeze({
    sceneId,
    venueId: selectedVenue,
    load: () => loader.loadScene(sceneId, ids),
    cancel: () => loader.cancel(),
    release({ dispose = true } = {}) {
      loader.cancel();
      loader.releaseScene(sceneId, { dispose });
    },
    setGroupVisible: (id, visible) => loader.setGroupVisible(id, visible),
    snapshot() {
      return {
        ...loader.snapshot(),
        venueId: selectedVenue,
        sceneId,
        budget: venueBudgetSnapshot(selectedVenue, quality),
      };
    },
  });
}

