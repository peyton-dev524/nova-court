const PHASE_ORDER = Object.freeze(["shell", "required", "optional"]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function disposeValue(value) {
  if (!value) return;
  value.parent?.remove?.(value);
  if (typeof value.dispose === "function") {
    value.dispose();
    return;
  }
  value.traverse?.((node) => {
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.filter(Boolean).forEach((material) => {
      Object.values(material).forEach((entry) => entry?.isTexture && entry.dispose?.());
      material.dispose?.();
    });
  });
}

export function createSceneGroupLoader({
  groups = [],
  onProgress = () => {},
} = {}) {
  const definitions = new Map(groups.map((group) => [group.id, group]));
  const loaded = new Map();
  const sceneGroups = new Map();
  const errors = [];
  let activeToken = 0;
  let activeSceneId = null;
  let phase = "idle";
  let progress = 0;

  function emit(nextPhase, nextProgress, detail = {}) {
    phase = nextPhase;
    progress = Math.max(progress, Math.min(1, Number(nextProgress) || 0));
    onProgress({ sceneId: activeSceneId, phase, progress, ...detail });
  }

  function requiredFallbacks(sceneId, ids) {
    const roots = [];
    for (const id of asArray(ids)) {
      const definition = definitions.get(id);
      if (!definition?.required || typeof definition.createFallback !== "function") continue;
      if (loaded.has(id)) {
        roots.push(loaded.get(id).value);
        continue;
      }
      const value = definition.createFallback();
      loaded.set(id, { id, value, fallback: true, owners: new Set([sceneId]) });
      roots.push(value);
    }
    return roots;
  }

  async function loadScene(sceneId, ids = [...definitions.keys()]) {
    const token = ++activeToken;
    activeSceneId = sceneId;
    progress = 0;
    const selected = asArray(ids).filter((id) => definitions.has(id));
    const owned = sceneGroups.get(sceneId) || new Set();
    sceneGroups.set(sceneId, owned);
    requiredFallbacks(sceneId, selected);
    emit("shell", 0, { token });

    let completed = 0;
    for (const phaseId of PHASE_ORDER) {
      const phaseGroups = selected.filter((id) => (definitions.get(id).phase || "optional") === phaseId);
      for (const id of phaseGroups) {
        if (token !== activeToken) return { cancelled: true, stale: true, token };
        const definition = definitions.get(id);
        const existing = loaded.get(id);
        if (existing && !existing.fallback) {
          existing.owners.add(sceneId);
          existing.value.visible = true;
          owned.add(id);
        } else {
          try {
            const value = await Promise.resolve(definition.load?.());
            if (token !== activeToken) {
              disposeValue(value);
              return { cancelled: true, stale: true, token };
            }
            if (existing?.fallback && existing.value !== value) disposeValue(existing.value);
            loaded.set(id, { id, value, fallback: false, owners: new Set([sceneId]) });
            owned.add(id);
          } catch (error) {
            errors.push({ id, message: error?.message || String(error) });
            if (!definition.required) owned.delete(id);
          }
        }
        completed += 1;
        emit(phaseId, selected.length ? completed / selected.length : 1, { token, groupId: id });
      }
    }
    emit("ready", 1, { token });
    return { cancelled: false, stale: false, token, sceneId, loadedIds: [...owned] };
  }

  function cancel() {
    activeToken += 1;
    emit("cancelled", progress, { token: activeToken });
  }

  function setGroupVisible(id, visible) {
    const entry = loaded.get(id);
    if (!entry) return false;
    entry.value.visible = Boolean(visible);
    return true;
  }

  function releaseScene(sceneId, { dispose = false } = {}) {
    const ids = sceneGroups.get(sceneId);
    if (!ids) return;
    for (const id of ids) {
      const entry = loaded.get(id);
      if (!entry) continue;
      entry.owners.delete(sceneId);
      if (dispose && entry.owners.size === 0) {
        disposeValue(entry.value);
        loaded.delete(id);
      } else if (entry.owners.size === 0) {
        entry.value.visible = false;
      }
    }
    sceneGroups.delete(sceneId);
    if (activeSceneId === sceneId) activeSceneId = null;
  }

  function snapshot() {
    return {
      sceneId: activeSceneId,
      phase,
      progress,
      loadedIds: [...loaded.keys()],
      visibleIds: [...loaded].filter(([, entry]) => entry.value?.visible !== false).map(([id]) => id),
      errors: errors.map((error) => ({ ...error })),
      token: activeToken,
    };
  }

  return {
    loadScene,
    requiredFallbacks,
    cancel,
    setGroupVisible,
    releaseScene,
    snapshot,
  };
}

export const SCENE_LOAD_PHASES = PHASE_ORDER;
