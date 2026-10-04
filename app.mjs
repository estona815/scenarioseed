import { generate, presets } from "./engine.mjs";

const $ = id => document.getElementById(id);
const editor = $("schema");
let preset = "order";
let cases = [];
let selected = 0;

function loadPreset(key) {
  preset = key;
  editor.value = JSON.stringify(presets[key], null, 2);
  document.querySelectorAll(".preset").forEach(button => button.classList.toggle("active", button.dataset.preset === key));
  $("edit-status").textContent = "Preset loaded";
  run();
}

function run() {
  try {
    const schema = JSON.parse(editor.value);
    cases = generate(schema);
    selected = 0;
    $("edit-status").textContent = `${cases.length} cases generated`;
    render();
  } catch (error) {
    $("edit-status").textContent = `Fix contract: ${error.message}`;
    cases = [];
    render();
  }
}

function render() {
  const pass = cases.filter(item => item.expected === "Pass").length;
  $("total-count").textContent = `${cases.length} cases`;
  $("pass-count").textContent = `${pass} passing`;
  $("fail-count").textContent = `${cases.length - pass} failing`;
  $("footer-summary").textContent = cases.length ? `${cases.length} synthetic cases generated from one contract` : "No cases generated yet";
  $("download-json").disabled = $("download-csv").disabled = !cases.length;
  const tbody = $("cases");
  tbody.replaceChildren();
  cases.forEach((item, index) => {
    const row = document.createElement("tr");
    row.className = index === selected ? "selected" : "";
    row.tabIndex = 0;
    row.setAttribute("aria-selected", String(index === selected));
    row.setAttribute("aria-label", `Case ${item.id}: ${item.name}, expected ${item.expected}`);
    [item.id, item.name, item.expected, item.rule].forEach((value, column) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (column === 2) cell.className = value === "Pass" ? "pass" : "fail";
      row.append(cell);
    });
    row.addEventListener("click", () => select(index));
    row.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(index); } });
    tbody.append(row);
  });
  showDetails();
}

function select(index) {
  selected = index;
  document.querySelectorAll("#cases tr").forEach((row, i) => {
    row.classList.toggle("selected", i === selected);
    row.setAttribute("aria-selected", String(i === selected));
  });
  showDetails();
}

function showDetails() {
  const item = cases[selected];
  $("case-position").textContent = item ? `Case ${item.id} of ${cases.length}` : "Select a case";
  $("detail-name").textContent = item?.name ?? "—";
  $("detail-expect").textContent = item?.expected ?? "—";
  $("detail-expect").className = item?.expected === "Pass" ? "pass" : "fail";
  $("detail-rule").textContent = item?.rule ?? "—";
  $("payload").textContent = item ? JSON.stringify(item.payload, null, 2) : "Choose a generated case to inspect its payload.";
  $("rationale").textContent = item ? item.errors.length ? item.errors.join("\n") : "This payload passes the supported contract rules. Review it before using it in your own tests." : "Cases are checked against the same contract used to generate them.";
  $("copy").disabled = !item;
}

function download(name, content, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csv = value => `"${String(value).replaceAll('"', '""')}"`;
document.querySelectorAll(".preset").forEach(button => button.addEventListener("click", () => loadPreset(button.dataset.preset)));
$("reset").addEventListener("click", () => loadPreset(preset));
$("generate").addEventListener("click", run);
editor.addEventListener("input", () => { $("edit-status").textContent = "Unsaved changes · generate again"; });
$("copy").addEventListener("click", async () => {
  if (!cases[selected]) return;
  try { await navigator.clipboard.writeText(JSON.stringify(cases[selected].payload, null, 2)); $("copy").textContent = "Copied"; }
  catch { $("copy").textContent = "Copy unavailable"; }
  setTimeout(() => { $("copy").textContent = "Copy"; }, 2000);
});
$("download-json").addEventListener("click", () => download("scenarioseed-cases.json", JSON.stringify({ generator: "ScenarioSeed", createdAt: new Date().toISOString(), cases }, null, 2), "application/json"));
$("download-csv").addEventListener("click", () => {
  const lines = [["id", "name", "expected", "rule", "errors", "payload"].map(csv).join(","), ...cases.map(item => [item.id, item.name, item.expected, item.rule, item.errors.join("; "), JSON.stringify(item.payload)].map(csv).join(","))];
  download("scenarioseed-cases.csv", lines.join("\r\n"), "text/csv;charset=utf-8");
});

loadPreset("order");
