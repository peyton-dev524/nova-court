export function allowsRestart(modeKey) {
  return modeKey === "street";
}

export function cameraPresetForTeamMode(modeKey) {
  if (modeKey === "fives") {
    return Object.freeze({ mode: "broadcast", rosterSize: 10, fullCourt: true });
  }
  const rosterSize = { duos: 4, team: 6, quads: 8 }[modeKey] || 0;
  return Object.freeze({
    mode: rosterSize ? "broadcast" : "follow",
    rosterSize,
    fullCourt: false,
  });
}
