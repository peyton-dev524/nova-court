import { runQuickShootingQA } from "../js/shooting-quick-qa.js";

const report = runQuickShootingQA();
console.log("NOVA COURT · 20-SPOT GREEN WINDOW QUICK QA");
console.table(report.rows.map((row) => ({
  id: row.id,
  spot: row.label,
  distance_m: row.distance.toFixed(2),
  meter: row.meter.charge.toFixed(4),
  window: `${row.meter.start.toFixed(4)}–${row.meter.end.toFixed(4)}`,
  assist: row.assistLabel,
  coverage: `${Math.round(row.coverage.coverage * 100)}%`,
  contest: row.coverage.id,
  rim: row.attempt.rim.result,
  result: row.passed ? "GREEN → MAKE" : "FAIL",
})));
console.log(
  `${report.summary.passed}/${report.summary.total} green auto-makes · `
  + `${report.summary.cleanSwishes} swishes · `
  + `${report.summary.softRimIns} soft rim-ins · `
  + `${report.summary.jumpingContests} active jump-window cases`,
);

if (!report.summary.allGreenAutoMakes) process.exitCode = 1;
