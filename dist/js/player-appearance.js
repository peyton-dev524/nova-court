export const PLAYER_HEIGHT_RANGE = Object.freeze({
  minM: 1.68,
  maxM: 2.18,
  defaultM: 1.86,
  stepM: 0.01,
});

export const HAIR_STYLES = Object.freeze([
  Object.freeze({ id: "crop", name: "Close Crop" }),
  Object.freeze({ id: "fade", name: "Fade" }),
  Object.freeze({ id: "highTop", name: "High Top" }),
  Object.freeze({ id: "braids", name: "Twin Braids" }),
  Object.freeze({ id: "waves", name: "Waves" }),
  Object.freeze({ id: "afro", name: "Rounded Afro" }),
  Object.freeze({ id: "locs", name: "Short Locs" }),
  Object.freeze({ id: "bun", name: "Court Bun" }),
]);

export const SKIN_TONES = Object.freeze([
  Object.freeze({ id: "deep-espresso", name: "Deep Espresso", color: 0x3b241d }),
  Object.freeze({ id: "rich-umber", name: "Rich Umber", color: 0x543225 }),
  Object.freeze({ id: "deep-brown", name: "Deep Brown", color: 0x75442f }),
  Object.freeze({ id: "warm-brown", name: "Warm Brown", color: 0x9d6548 }),
  Object.freeze({ id: "golden-brown", name: "Golden Brown", color: 0xb97855 }),
  Object.freeze({ id: "warm-tan", name: "Warm Tan", color: 0xc88a68 }),
  Object.freeze({ id: "light-beige", name: "Light Beige", color: 0xddad8a }),
  Object.freeze({ id: "fair-rose", name: "Fair Rose", color: 0xf0c5aa }),
]);

export function normalizeHairStyle(value, fallback = "crop") {
  return HAIR_STYLES.some((style) => style.id === value) ? value : fallback;
}

export function normalizeSkinTone(value, fallback = "warm-brown") {
  return SKIN_TONES.some((tone) => tone.id === value) ? value : fallback;
}

export function normalizePlayerHeight(value, fallback = PLAYER_HEIGHT_RANGE.defaultM) {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : fallback;
  return Math.round(Math.max(
    PLAYER_HEIGHT_RANGE.minM,
    Math.min(PLAYER_HEIGHT_RANGE.maxM, safe),
  ) * 100) / 100;
}

export function formatPlayerHeight(heightM) {
  const metres = normalizePlayerHeight(heightM);
  const totalInches = metres / 0.0254;
  let feet = Math.floor(totalInches / 12);
  let inches = Math.round(totalInches - feet * 12);
  if (inches === 12) {
    feet += 1;
    inches = 0;
  }
  return `${feet}'${inches}" / ${metres.toFixed(2)} m`;
}

function mesh(T, geometry, material, name) {
  const node = new T.Mesh(geometry, material);
  node.name = name;
  node.castShadow = true;
  node.receiveShadow = true;
  return node;
}

export function createPlayerHair(T, styleId, material) {
  const style = normalizeHairStyle(styleId);
  const root = new T.Group();
  root.name = `hair-${style}`;
  const details = [];
  const add = (node) => {
    root.add(node);
    details.push(node);
    return node;
  };

  if (style === "highTop") {
    const top = add(mesh(T, new T.CylinderGeometry(0.15, 0.178, 0.24, 12), material, "high-top-volume"));
    top.position.y = 1.45;
  } else if (style === "afro") {
    const crown = add(mesh(T, new T.SphereGeometry(0.235, 16, 12), material, "afro-crown"));
    crown.position.y = 1.365;
    crown.scale.set(1.04, 0.92, 0.98);
  } else if (style === "braids") {
    const cap = add(mesh(T, new T.CapsuleGeometry(0.19, 0.1, 3, 9), material, "braid-cap"));
    cap.position.y = 1.35;
    cap.scale.set(0.96, 0.78, 0.94);
    for (const side of [-1, 1]) {
      const braid = add(mesh(T, new T.CapsuleGeometry(0.025, 0.22, 2, 5), material, `${side < 0 ? "right" : "left"}-braid`));
      braid.position.set(side * 0.145, 1.2, -0.1);
      braid.rotation.z = side * 0.12;
    }
  } else if (style === "locs") {
    const cap = add(mesh(
      T,
      new T.SphereGeometry(0.208, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.46),
      material,
      "loc-cap",
    ));
    cap.position.y = 1.29;
    cap.scale.set(0.96, 1.04, 0.94);
    for (let i = 0; i < 9; i += 1) {
      const angle = (i / 9) * Math.PI * 1.75 + 0.34;
      const lock = add(mesh(T, new T.CapsuleGeometry(0.018, 0.145, 2, 5), material, `loc-${i + 1}`));
      lock.position.set(Math.cos(angle) * 0.16, 1.22, Math.sin(angle) * 0.13 - 0.025);
      lock.rotation.z = Math.cos(angle) * 0.22;
      lock.rotation.x = Math.sin(angle) * 0.18;
    }
  } else if (style === "bun") {
    const cap = add(mesh(
      T,
      new T.SphereGeometry(0.208, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.46),
      material,
      "bun-cap",
    ));
    cap.position.y = 1.29;
    cap.scale.set(0.96, 1.04, 0.94);
    const bun = add(mesh(T, new T.SphereGeometry(0.115, 12, 9), material, "court-bun"));
    bun.position.set(0, 1.49, -0.075);
    bun.scale.set(1.05, 0.92, 0.9);
  } else {
    const capEnd = style === "fade" ? Math.PI * 0.36 : Math.PI * 0.48;
    const cap = add(mesh(
      T,
      new T.SphereGeometry(0.207, 16, 10, 0, Math.PI * 2, 0, capEnd),
      material,
      `${style}-cap`,
    ));
    cap.position.y = 1.29;
    cap.scale.set(0.96, 1.04, 0.94);
    if (style === "waves") {
      for (let ringIndex = 0; ringIndex < 3; ringIndex += 1) {
        const wave = add(mesh(
          T,
          new T.TorusGeometry(0.155 - ringIndex * 0.027, 0.006, 4, 24),
          material,
          `wave-ring-${ringIndex + 1}`,
        ));
        wave.position.set(0, 1.36 - ringIndex * 0.035, 0.055);
        wave.rotation.x = Math.PI / 2.7;
        wave.scale.y = 0.82;
      }
    }
  }

  return { root, details, styleId: style };
}
