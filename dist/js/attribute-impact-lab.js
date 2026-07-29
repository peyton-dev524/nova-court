import { calculateShotMakePercentage } from "./shot-coverage.js";
import { calculateStealMatchupBands } from "./live-ball-duels.js";
import { rankReboundCandidates } from "./contact-rules.js";

const params = new URLSearchParams(location.search);
const validPanels = ["shooting", "steals", "rebound"];
const state = { panel: validPanels.includes(params.get("panel")) ? params.get("panel") : "shooting" };

const shotZones = [
  { label: "CLOSE", context: "jumper", distance: 1.3, key: "closeShot" },
  { label: "LAYUP", context: "layup", distance: 1.1, movementSpeed: 2.4, key: "drivingLayup" },
  { label: "MID", context: "jumper", distance: 4.7, key: "midRange" },
  { label: "THREE", context: "jumper", distance: 6.6, key: "threePoint" },
  { label: "DUNK", context: "dunk", distance: 1.0, key: "drivingDunk" },
];
const shotResults = shotZones.map((zone) => {
  const base = {
    coverage: 0.28,
    releaseQuality: 0.72,
    distance: zone.distance,
    shotContext: zone.context,
    movementSpeed: zone.movementSpeed || 0,
    stamina: 0.82,
  };
  return {
    ...zone,
    low: calculateShotMakePercentage({ ...base, ratings: { [zone.key]: 40 } }),
    high: calculateShotMakePercentage({ ...base, ratings: { [zone.key]: 92 } }),
  };
});

document.querySelector("#zones").innerHTML = shotResults.map((result) => `
  <div class="zone">
    <div class="compare"><i class="bar low" style="height:${result.low.makePercent}%"></i><i class="bar high" style="height:${result.high.makePercent}%"></i></div>
    <b>${result.low.makePercent}% → ${result.high.makePercent}%</b>
    <span class="delta">+${result.high.makePercent - result.low.makePercent} PTS</span>
    <small>${result.label}<br>${result.key}</small>
  </div>`).join("");
document.querySelector("#shooting-notes").innerHTML = `
  <div class="legend"><div class="build low"><strong>40 OVR ATTRIBUTE</strong><p>Profile values normalize from 0–100 before entering the probability model.</p></div><div class="build high"><strong>92 OVR ATTRIBUTE</strong><p>Same release, stamina, coverage, range, and difficulty. Only the selected rating changes.</p></div></div>
  <div class="formula">P(make) = range base + (rating − .50) × context weight<br>+ timing − stamina − distance − coverage<br><br>Perfect user green = 100%; a live hand-on-ball block can still reject it.<br>CPU greens remain probabilistic. User-only assist changes meter width, not ratings.</div>
  <div class="build high"><strong>FREE THROW</strong><p>freeThrow is resolved by the timing flow; closeShot, drivingLayup, drivingDunk, midRange, and threePoint are selected explicitly by live shot context.</p></div>`;

const commonSteal = { distance: 0.9, alignment: 0.72, reachTiming: 0.72, ballExposure: 0.65, ballFirst: true };
const stealResults = [
  {
    id: "lock",
    title: "ELITE LOCK vs LOOSE HANDLE",
    detail: "94 STL · 92 PER D · 90 REACT / 45 HANDLE · 48 SECURITY · 52 STR",
    bands: calculateStealMatchupBands({ ...commonSteal, steal: 94, perimeterDefense: 92, reaction: 90, ballHandle: 45, ballSecurity: 48, handlerStrength: 52 }),
  },
  {
    id: "handler",
    title: "LOW REACH vs SECURE HANDLER",
    detail: "42 STL · 45 PER D · 48 REACT / 94 HANDLE · 92 SECURITY · 88 STR",
    bands: calculateStealMatchupBands({ ...commonSteal, steal: 42, perimeterDefense: 45, reaction: 48, ballHandle: 94, ballSecurity: 92, handlerStrength: 88 }),
  },
];
const bandColor = (bands) => `conic-gradient(#5ff2df 0 ${bands.cleanProbability * 100}%,#ffb353 0 ${(bands.cleanProbability + bands.foulProbability) * 100}%,#637786 0)`;
document.querySelector("#steal-bands").innerHTML = stealResults.map(({ title, detail, bands }) => `
  <div class="band-card">
    <div class="band-title"><strong>${title}</strong><span>EDGE ${bands.matchupEdge >= 0 ? "+" : ""}${bands.matchupEdge.toFixed(2)}</span></div>
    <div class="donut" style="background:${bandColor(bands)}"><b>${Math.round(bands.cleanProbability * 100)}%</b></div>
    ${[["CLEAN", "clean", bands.cleanProbability], ["FOUL", "foul", bands.foulProbability], ["WHIFF", "whiff", bands.whiffProbability]].map(([label, cls, value]) => `<div class="band-row"><span>${label}</span><div class="track"><i class="${cls}" style="width:${value * 100}%"></i></div><b>${Math.round(value * 100)}%</b></div>`).join("")}
    <p class="subtitle">${detail}</p>
  </div>`).join("");
document.querySelector("#steal-notes").innerHTML = `
  <div class="formula">DEF = .52 steal + .28 perimeterDefense + .20 reaction<br>SEC = .42 ballHandle + .40 ballSecurity + .18 strength<br>EDGE = DEF − SEC<br><br>Geometry then applies distance, angle, timing, exposure, contact, and ball-first adjustments.</div>
  <div class="build high"><strong>CLEAN ≠ POSSESSION</strong><p>A successful band releases a rolling loose ball. The former owner and defense both enter the same live pickup/rebound race.</p></div>
  <div class="build low"><strong>BOUNDED OUTCOMES</strong><p>Clean stays within 3.5–78%; fouls stay within 2.5–58%. The remaining probability is always a whiff.</p></div>`;

const reboundCandidates = [
  { id: "inside", teamId: "away", position: { x: 0, z: -4.65 }, velocity: { x: 0, z: -0.5 }, facing: { x: 0, z: 1 }, defensiveRebound: 88, strength: 92, height: 2.06, vertical: 84 },
  { id: "boxed", teamId: "home", position: { x: 0, z: -3.8 }, velocity: { x: 0, z: -1 }, facing: { x: 0, z: -1 }, offensiveRebound: 90, strength: 62, height: 2.03, vertical: 86 },
  { id: "far-elite", teamId: "home", position: { x: 1.15, z: -3.9 }, velocity: { x: -1.7, z: -1.5 }, facing: { x: -0.5, z: -0.8 }, offensiveRebound: 99, strength: 96, height: 2.14, vertical: 96 },
];
const reboundResults = rankReboundCandidates(reboundCandidates, {
  landingPoint: { x: 0, z: -4.9 },
  rim: { x: 0, z: -5.7 },
  offenseTeamId: "home",
  maxPursuitDistance: 3,
  predictedLandingSeconds: 0.55,
});
document.querySelector("#rebound-notes").innerHTML = `
  <table><thead><tr><th>CANDIDATE</th><th>RATING</th><th>ARRIVE</th><th>BOX</th><th>PENALTY</th><th>SCORE</th></tr></thead><tbody>
    ${reboundResults.map((entry, index) => `<tr class="${index === 0 ? "winner" : ""}"><td>#${entry.rank} ${entry.playerId}</td><td>${entry.breakdown.ratingKey === "offensiveRebound" ? "OREB" : "DREB"} ${Math.round(entry.breakdown.rebounding * 100)}</td><td>${Math.round(entry.breakdown.arrival * 100)}</td><td>${Math.round(entry.breakdown.boxOutLeverage * 100)}</td><td>−${Math.round(entry.breakdown.boxedOutPenalty * 100)}</td><td>${entry.score.toFixed(1)}</td></tr>`).join("")}
  </tbody></table>
  <div class="formula">34 arrival + 24 OREB/DREB + 8 vertical + 8 reach<br>+ 6 strength + 6 momentum + 8 inside position<br>+ 16 box-out leverage − 24 boxed-out penalty + role/defense<br><br>Arrival blends landing distance with travel-time error. Equal scores tie-break by stable player id.</div>
  <div class="build high"><strong>ACTUAL BOX-OUT PAIRS</strong><p>The nearest opponent is evaluated from both directions using inside position, facing alignment, body proximity, and strength—not a pre-authored flag.</p></div>`;

function render() {
  for (const panel of validPanels) {
    document.querySelector(`#${panel}`).classList.toggle("active", panel === state.panel);
    const button = document.querySelector(`[data-panel="${panel}"]`);
    button.setAttribute("aria-selected", String(panel === state.panel));
  }
}
function setPanel(panel) {
  if (!validPanels.includes(panel)) return false;
  state.panel = panel;
  history.replaceState(null, "", `?panel=${panel}`);
  render();
  return true;
}
for (const button of document.querySelectorAll("[data-panel]")) button.addEventListener("click", () => setPanel(button.dataset.panel));
addEventListener("keydown", (event) => {
  if (event.key >= "1" && event.key <= "3") setPanel(validPanels[Number(event.key) - 1]);
});
render();

globalThis.__NOVA_ATTRIBUTE_LAB__ = Object.freeze({
  setPanel,
  snapshot: () => Object.freeze({
    panel: state.panel,
    shooting: shotResults.map(({ label, key, low, high }) => ({ label, ratingKey: key, low: low.makePercent, high: high.makePercent })),
    steals: stealResults.map(({ id, bands }) => ({ id, clean: bands.cleanProbability, foul: bands.foulProbability, whiff: bands.whiffProbability })),
    rebound: reboundResults.map((entry) => ({ playerId: entry.playerId, rank: entry.rank, score: entry.score, breakdown: entry.breakdown })),
  }),
});
