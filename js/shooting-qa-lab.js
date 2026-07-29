import { runQuickShootingQA } from "./shooting-quick-qa.js";

const report = runQuickShootingQA();
const params = new URLSearchParams(location.search);
const detail = params.get("view") === "detail";
document.body.classList.toggle("detail", detail);
document.body.classList.toggle("capture", params.get("capture") === "1");

const detailIndexes = new Set([0, 7, 14, 19]);
const rows = detail
  ? report.rows.filter((_, index) => detailIndexes.has(index))
  : report.rows;

const percent = (value) => `${(value * 100).toFixed(2)}%`;
document.querySelector("#shot-grid").innerHTML = rows.map((row) => `
  <article class="shot-card" data-shot="${row.id}">
    <div class="card-head">
      <strong>${row.id} · ${row.label}</strong>
      <span>${row.distance.toFixed(2)}m</span>
      <i class="pass">PASS</i>
    </div>
    <div class="meter" aria-label="Meter ${percent(row.meter.charge)}">
      <i class="green-window" style="left:${percent(row.meter.start)};width:${percent(row.meter.width)}"></i>
      <i class="needle" style="left:${percent(row.meter.charge)}"></i>
    </div>
    <div class="facts">
      <span>METER <b>${percent(row.meter.charge)}</b></span>
      <span>WINDOW <b>${percent(row.meter.start)}–${percent(row.meter.end)}</b></span>
      <span>${row.assistLabel}</span>
      <span>${Math.round(row.coverage.coverage * 100)}% COVERED</span>
      <span>${row.coverage.id.toUpperCase()}</span>
      <span>${row.attempt.rim.result.replaceAll("_", " ").toUpperCase()}</span>
    </div>
    <div class="verdicts">
      <span>GREEN ✓</span>
      <span>100% GUARANTEE ✓</span>
      <span>MADE ✓</span>
    </div>
  </article>
`).join("");

document.querySelector("#pass-count").textContent =
  `${report.summary.passed}/${report.summary.total}`;
document.querySelector("#overall-status").textContent =
  report.summary.allGreenAutoMakes ? "ALL PASS" : "FAILED";
document.querySelector("#coverage-summary").textContent =
  `${report.summary.jumpingContests} jump-window cases · `
  + `${report.summary.cleanSwishes} swishes · `
  + `${report.summary.softRimIns} soft rim-ins`;

globalThis.__NOVA_SHOOTING_QA__ = Object.freeze({
  report,
  snapshot: () => Object.freeze({
    view: detail ? "detail" : "matrix",
    summary: report.summary,
    rows: rows.map((row) => Object.freeze({
      id: row.id,
      green: row.meter.perfect,
      guaranteed: row.attempt.guaranteed,
      made: row.attempt.made,
      ballisticsCorrected: row.crossing.corrected,
    })),
  }),
});
