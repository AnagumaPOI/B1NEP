(function () {
"use strict";

function num(value, fallback = 0) {
const n = Number(value);
return Number.isFinite(n) ? n : fallback;
}

function fmt(value, digits = 3) {
const n = num(value, NaN);
if (!Number.isFinite(n)) return "-";
return n.toFixed(digits);
}

function get(id) {
return document.getElementById(id);
}

const embeddedStable = (() => {
try {
return window.parent !== window || new URLSearchParams(window.location.search).get("embedded") === "1";
} catch (err) {
return window.parent !== window;
}
})();

let pyBridge = null;
let stableSourceModel = null;
let lastStableResult = null;
let lastPumpingPromptKey = "";

if (typeof QWebChannel !== "undefined" && window.qt && window.qt.webChannelTransport) {
new QWebChannel(window.qt.webChannelTransport, (channel) => {
pyBridge = channel.objects.pyBridge;
});
}

function stableBridge(requireExport = false) {
const methodName = requireExport ? "exportStableReport" : "analyzeStability";
if (pyBridge && pyBridge[methodName]) return pyBridge;
try {
const parentBridge = window.parent && window.parent.pyBridge;
if (parentBridge && parentBridge[methodName]) return parentBridge;
} catch (err) {
return null;
}
return null;
}

function fsValue(id, fallback) {
return Math.max(1e-9, num(get(id).value, fallback));
}

function readLayerInputs() {
return Array.from(document.querySelectorAll("#layerBody tr")).map((tr) => ({
type: tr.querySelector("[data-field='type']").value,
analysis: tr.dataset.analysis || "",
depth: num(tr.querySelector("[data-field='depth']").value, 0),
gamma: num(tr.querySelector("[data-field='gamma']").value, 0),
gamma_sub: num(tr.querySelector("[data-field='gammaSub']").value, 0),
c: num(tr.querySelector("[data-field='c']").value, 0),
phi: num(tr.querySelector("[data-field='phi']").value, 0),
su: num(tr.querySelector("[data-field='su']").value, 0),
Ka: num(tr.querySelector("[data-field='Ka']").value, 0),
Kp: num(tr.querySelector("[data-field='Kp']").value, 0),
Da: num(tr.dataset.da, 0),
Dp: num(tr.dataset.dp, 0),
}));
}

function currentModelFromInputs() {
const model = JSON.parse(JSON.stringify(stableSourceModel || {}));
if (!model.wall) model.wall = {};
model.wall.L = num(get("excavationWidth").value, num(model.wall.L, 10));
model.wall.sections = [{ depth: num(get("wallDepth").value, 0) }];
const layers = readLayerInputs();
if (layers.length) model.layers = layers;
model.stability = Object.assign({}, model.stability || {}, {
fs_lateral: fsValue("fsLateral", 1.2),
fs_basal: fsValue("fsBasal", 1.2),
fs_sand1: fsValue("fsSand1", 1.5),
fs_sand2: fsValue("fsSand2", 2.0),
fs_uplift: fsValue("fsUplift", 1.2),
basal_radius: num(get("basalRadius").value, 0),
basal_surcharge: num(get("globalSurcharge").value, 0),
sand_D: num(get("sandD").value, 0),
sand_gamma_sub: num(get("sandGammaSub").value, 0),
sand_gamma_w: num(get("sandGammaW").value, 1),
sand_delta_hw: num(get("sandDeltaHw").value, 0),
uplift_impermeable_top: num(get("upliftImpermeableTop").value, 0),
uplift_uw: num(get("upliftUw").value, 0),
uplift_surcharge: 0,
});
return model;
}

function buildStablePayload(includeOverrides = true) {
const model = includeOverrides ? currentModelFromInputs() : JSON.parse(JSON.stringify(stableSourceModel || {}));
const payload = {
model,
fs: {
lateral: fsValue("fsLateral", 1.2),
basal: fsValue("fsBasal", 1.2),
sand1: fsValue("fsSand1", 1.5),
sand2: fsValue("fsSand2", 2.0),
uplift: fsValue("fsUplift", 1.2),
},
};
if (includeOverrides) {
payload.overrides = {
wallDepth: num(get("wallDepth").value, 0),
excavationDepth: num(get("excavationDepth").value, 0),
supportDepth: num(get("supportDepth").value, 0),
waterOutside: num(get("waterOutside").value, 0),
waterInside: num(get("waterInside").value, 0),
excavationWidth: num(get("excavationWidth").value, 10),
globalSurcharge: num(get("globalSurcharge").value, 0),
basalRadius: num(get("basalRadius").value, 0),
sandD: num(get("sandD").value, 0),
sandGammaSub: num(get("sandGammaSub").value, 0),
sandGammaW: num(get("sandGammaW").value, 1),
sandDeltaHw: num(get("sandDeltaHw").value, 0),
upliftImpermeableTop: num(get("upliftImpermeableTop").value, 0),
upliftUw: num(get("upliftUw").value, 0),
};
}
return payload;
}

window.getB1StableReportPayload = () => buildStablePayload(true);

function addLayer(layer = {}) {
const tr = document.createElement("tr");
tr.dataset.da = String(layer.Da ?? 0);
tr.dataset.dp = String(layer.Dp ?? 0);
tr.dataset.analysis = layer.analysis === "total" ? "total" : "effective";
tr.innerHTML = `
<td><input data-field="type" value="${layer.type || `Soil Layer ${document.querySelectorAll("#layerBody tr").length + 1}`}"></td>
<td><input data-field="depth" value="${fmt(layer.bot ?? layer.depth ?? 1, 2)}"></td>
<td><input data-field="gamma" value="${fmt(layer.gamma ?? 1.9, 2)}"></td>
<td><input data-field="gammaSub" value="${fmt(layer.gammaSub ?? layer.gamma_sub ?? Math.max(0, (layer.gamma ?? 1.9) - 1), 2)}"></td>
<td><input data-field="c" value="${fmt(layer.c ?? 0, 2)}"></td>
<td><input data-field="phi" value="${fmt(layer.phi ?? 30, 2)}"></td>
<td><input data-field="su" value="${fmt(layer.su ?? layer.c ?? 0, 2)}"></td>
<td><input data-field="Ka" value="${fmt(layer.Ka ?? 0.33, 3)}"></td>
<td><input data-field="Kp" value="${fmt(layer.Kp ?? 3.0, 3)}"></td>
<td><button class="tiny remove-layer">x</button></td>
`;
tr.querySelector(".remove-layer").onclick = () => tr.remove();
document.getElementById("layerBody").appendChild(tr);
}

function renderInputs(result) {
const inputs = result.inputs || {};
get("wallDepth").value = fmt(inputs.wallDepth ?? inputs.wall_depth, 2);
get("excavationDepth").value = fmt(inputs.excavationDepth ?? inputs.excavation_depth, 2);
get("supportDepth").value = fmt(inputs.supportDepth ?? inputs.lowest_support_depth, 2);
get("waterOutside").value = fmt(inputs.waterOutside ?? inputs.water_outside, 2);
get("waterInside").value = fmt(inputs.waterInside ?? inputs.water_inside, 2);
get("excavationWidth").value = fmt(inputs.excavationWidth ?? inputs.excavation_width, 2);
get("globalSurcharge").value = fmt(inputs.globalSurcharge, 2);
get("basalRadius").value = fmt(inputs.basalRadius, 2);
get("sandD").value = fmt(inputs.sandD, 2);
get("sandDeltaHw").value = fmt(inputs.sandDeltaHw, 2);
get("sandGammaSub").value = fmt(inputs.sandGammaSub, 3);
get("sandGammaW").value = fmt(inputs.sandGammaW ?? 1, 2);
get("upliftImpermeableTop").value = fmt(inputs.upliftImpermeableTop, 2);
get("upliftUw").value = fmt(inputs.upliftUw, 2);
get("waterSource").textContent = inputs.waterSource || "-";
}

function renderLayerInputs(layers) {
get("layerBody").innerHTML = "";
(layers || []).forEach(addLayer);
if (!layers || !layers.length) addLayer();
}

function renderRows(targetId, rows, label) {
const body = get(targetId);
body.innerHTML = "";
(rows || []).forEach((row) => {
const tr = document.createElement("tr");
tr.innerHTML = `
<td>${row.layerNo ?? row.layer_no}</td>
<td>${fmt(row.top, 2)}-${fmt(row.bot, 2)}</td>
<td>${row.type}</td>
<td>${fmt(row.K, 3)}</td>
<td>${fmt(row.svBot ?? row.sv_bot, 3)}</td>
<td>${fmt(row.uBot ?? row.u_bot, 3)}</td>
<td>${fmt(row.pTop ?? row.p_top, 3)}</td>
<td>${fmt(row.pBot ?? row.p_bot, 3)}</td>
<td>${fmt(row.force, 3)}</td>
<td>${fmt(row.arm, 3)}</td>
<td>${fmt(row.moment, 3)}</td>
`;
tr.dataset.pressure = label;
body.appendChild(tr);
});
const sumMoment = (rows || []).reduce((s, row) => s + num(row.moment, 0), 0);
const tr = document.createElement("tr");
tr.innerHTML = `<td colspan="10"><strong>Sum M</strong></td><td><strong>${fmt(sumMoment, 3)}</strong></td>`;
body.appendChild(tr);
}

function renderWaterRows(targetId, rows) {
const body = get(targetId);
if (!body) return;
body.innerHTML = "";
(rows || []).forEach((row) => {
const tr = document.createElement("tr");
tr.innerHTML = `
<td>${row.side}</td>
<td>${fmt(row.top, 2)}-${fmt(row.bot, 2)}</td>
<td>${fmt(row.uRetTop, 3)}</td>
<td>${fmt(row.uRetBot, 3)}</td>
<td>${fmt(row.uExcTop, 3)}</td>
<td>${fmt(row.uExcBot, 3)}</td>
<td>${fmt(row.uNetTop, 3)}</td>
<td>${fmt(row.uNetBot, 3)}</td>
<td>${fmt(row.force, 3)}</td>
<td>${fmt(row.arm, 3)}</td>
<td>${fmt(row.moment, 3)}</td>
`;
body.appendChild(tr);
});
const sumMoment = (rows || []).reduce((s, row) => s + num(row.moment, 0), 0);
const tr = document.createElement("tr");
tr.innerHTML = `<td colspan="10"><strong>Sum M</strong></td><td><strong>${fmt(sumMoment, 3)}</strong></td>`;
body.appendChild(tr);
}

function renderBasalRows(targetId, rows) {
const body = get(targetId);
body.innerHTML = "";
(rows || []).forEach((row) => {
const tr = document.createElement("tr");
tr.innerHTML = `
<td>${row.layerNo ?? row.layer_no}</td>
<td>${fmt(row.top, 2)}</td>
<td>${fmt(row.bot, 2)}</td>
<td>${row.type}</td>
<td>${fmt(row.K, 3)}</td>
<td>${fmt(row.thetaCenterDeg ?? row.theta_center_deg, 3)}</td>
<td>${fmt(row.dthetaDeg ?? row.dtheta_deg, 3)}</td>
<td>${fmt(row.dL, 3)}</td>
<td>${fmt(row.tau, 3)}</td>
<td>${fmt(row.shear, 3)}</td>
<td>${fmt(row.moment, 3)}</td>
`;
body.appendChild(tr);
});
const sumMoment = (rows || []).reduce((s, row) => s + num(row.moment, 0), 0);
const tr = document.createElement("tr");
tr.innerHTML = `<td colspan="10"><strong>Sum M</strong></td><td><strong>${fmt(sumMoment, 3)}</strong></td>`;
body.appendChild(tr);
}

function setOverviewCard(baseId, ok) {
const card = get(baseId);
if (!card) return;
card.classList.remove("ok", "ng");
card.classList.add(ok ? "ok" : "ng");
}

function renderUpliftCases(uplift) {
const body = get("upliftCaseBody");
if (!body) return;
body.innerHTML = "";
if (!uplift.cases || !uplift.cases.length) {
const tr = document.createElement("tr");
tr.innerHTML = `<td colspan="10">Skipped: no impermeable-over-permeable interface remains below the excavation to check.</td>`;
body.appendChild(tr);
return;
}
uplift.cases.forEach((row) => {
const tr = document.createElement("tr");
tr.innerHTML = `
<td>${row.stageNo}</td>
<td>${fmt(row.impermeableTop ?? row.impermeable_top, 2)}</td>
<td>${row.layerPair ?? row.layer_pair}</td>
<td>${fmt(row.excavationDepth ?? row.excavation_depth, 2)}</td>
<td>${fmt(row.waterInside ?? row.water_inside, 2)}</td>
<td>${fmt(row.resisting, 3)}</td>
<td>${fmt(row.uw, 3)}</td>
<td>${fmt(row.fs, 3)}</td>
<td><span class="${row.ok ? "pill ok" : "pill ng"}">${row.ok ? "OK" : "NG"}</span></td>
<td>${row.ok ? "-" : fmt(row.requiredUw ?? row.required_uw, 2)}</td>
`;
body.appendChild(tr);
});
}

function maybeAskApplyPumping(uplift) {
if (!uplift || uplift.skipped || uplift.ok || !Array.isArray(uplift.cases)) return;
const failed = uplift.cases.filter((row) => !row.ok && Number.isFinite(num(row.requiredUw ?? row.required_uw, NaN)));
if (!failed.length) return;
const key = failed.map((row) => `${row.stageNo}:${fmt(row.impermeableTop ?? row.impermeable_top, 3)}:${fmt(row.requiredUw ?? row.required_uw, 3)}`).join("|");
if (key === lastPumpingPromptKey) return;
lastPumpingPromptKey = key;
const lines = failed.map((row) => (
`Stage ${row.stageNo}, interface ${fmt(row.impermeableTop ?? row.impermeable_top, 2)} m: set WAT(2) ${fmt(row.impermeableTop ?? row.impermeable_top, 2)} ${fmt(row.requiredUw ?? row.required_uw, 2)}`
));
const ok = window.confirm(
"Hydraulic uplift check is NG.\n\n"
+ "Apply pumping water-pressure controls to the failing stage(s)?\n\n"
+ lines.join("\n")
);
if (!ok) return;
const payload = failed.map((row) => ({
stageNo: row.stageNo,
side: 2,
z: row.impermeableTop ?? row.impermeable_top,
u: row.requiredUw ?? row.required_uw,
}));
try {
window.parent.postMessage({ type: "b1nep:apply-uplift-pumping", cases: payload }, "*");
} catch (err) {
alert("Cannot apply pumping controls from this window.");
}
}

function renderResult(result, options = {}) {
lastStableResult = result;
if (options.renderInputs) {
renderInputs(result);
renderLayerInputs(result.layers || []);
}
const summary = result.summary || {};
const basal = result.basal_heave || result.basal || {};
const sand = result.sand_boiling || result.sand || {};
const uplift = result.hydraulic_uplift || result.uplift || {};
renderRows("activeBody", result.active || [], "Pa");
renderRows("passiveBody", result.passive || [], "Pp");
renderWaterRows("waterBody", result.water || []);
get("activeForce").textContent = fmt(summary.activeForce, 3);
get("activeArm").textContent = fmt(summary.activeArm, 3);
get("activeMoment").textContent = fmt(summary.activeMoment, 3);
get("passiveForce").textContent = fmt(summary.passiveForce, 3);
get("passiveArm").textContent = fmt(summary.passiveArm, 3);
get("passiveMoment").textContent = fmt(summary.passiveMoment, 3);
const waterSide = num(summary.waterNetMoment, 0) >= 0 ? "active" : "passive";
get("waterForce").textContent = `${fmt(Math.abs(num(summary.waterNetForce, 0)), 3)} (${waterSide})`;
get("waterArm").textContent = fmt(summary.waterNetArm, 3);
get("waterMoment").textContent = `${fmt(Math.abs(num(summary.waterNetMoment, 0)), 3)} (${waterSide})`;
get("activeCheckMoment").textContent = fmt(summary.totalActiveMoment, 3);
get("passiveCheckMoment").textContent = fmt(summary.totalPassiveMoment, 3);
get("resultValue").textContent = summary.ok ? "OK" : "NG";
get("resultValue").className = summary.ok ? "pill ok" : "pill ng";
get("cardLateralStatus").textContent = summary.ok ? "OK" : "NG";
get("cardPassiveMoment").textContent = `${fmt(summary.totalPassiveMoment, 3)} tf-m/m`;
get("cardActiveMoment").textContent = `${fmt(summary.totalActiveMoment, 3)} tf-m/m`;
setOverviewCard("cardLateral", summary.ok);
get("basalMr").textContent = fmt(basal.resistingMoment ?? basal.resisting_moment, 3);
get("basalMd").textContent = fmt(basal.drivingMoment ?? basal.driving_moment, 3);
get("basalFsValue").textContent = fmt(basal.fs, 3);
get("basalFsRequired").textContent = fmt(basal.fsReq ?? basal.fs_required, 2);
get("basalResult").textContent = basal.ok ? "OK" : "NG";
get("basalResult").className = basal.ok ? "pill ok" : "pill ng";
get("cardBasalStatus").textContent = basal.ok ? "OK" : "NG";
get("cardBasalMain").innerHTML = `FS = ${fmt(basal.fs, 3)} ${basal.ok ? "&ge;" : "<"} ${fmt(basal.fsReq ?? basal.fs_required, 2)}`;
setOverviewCard("cardBasal", basal.ok);
get("basalOutsideShear").textContent = fmt(basal.outsideShear ?? basal.outside_shear, 3);
get("basalInsideShear").textContent = fmt(basal.insideShear ?? basal.inside_shear, 3);
get("basalArcShear").textContent = fmt(basal.arcShearSum ?? basal.arc_shear_sum, 3);
get("basalDrivingWeight").textContent = fmt(basal.drivingWeight ?? basal.driving_weight, 3);
get("basalRadiusOut").textContent = fmt(basal.radius, 3);
renderBasalRows("basalOutsideBody", basal.outsideRows || basal.outside_rows || []);
renderBasalRows("basalInsideBody", basal.insideRows || basal.inside_rows || []);
get("sandFs1Value").textContent = fmt(sand.fs1, 3);
get("sandFs1Req").textContent = fmt(sand.fs1Req ?? sand.fs1_required, 2);
get("sandFs1Result").textContent = (sand.fs1Ok ?? sand.fs1_ok) ? "OK" : "NG";
get("sandFs1Result").className = (sand.fs1Ok ?? sand.fs1_ok) ? "pill ok" : "pill ng";
get("sandFs2Value").textContent = fmt(sand.fs2, 3);
get("sandFs2Req").textContent = fmt(sand.fs2Req ?? sand.fs2_required, 2);
get("sandFs2Result").textContent = (sand.fs2Ok ?? sand.fs2_ok) ? "OK" : "NG";
get("sandFs2Result").className = (sand.fs2Ok ?? sand.fs2_ok) ? "pill ok" : "pill ng";
const sandOk = (sand.fs1Ok ?? sand.fs1_ok) && (sand.fs2Ok ?? sand.fs2_ok);
get("cardSandStatus").textContent = sandOk ? "OK" : "NG";
get("cardSandMain").innerHTML = `FS<sub>1</sub> = ${fmt(sand.fs1, 3)} ${sandOk || (sand.fs1Ok ?? sand.fs1_ok) ? "&ge;" : "<"} ${fmt(sand.fs1Req ?? sand.fs1_required, 2)}`;
get("cardSandSub").innerHTML = `FS<sub>2</sub> = ${fmt(sand.fs2, 3)} ${(sand.fs2Ok ?? sand.fs2_ok) ? "&ge;" : "<"} ${fmt(sand.fs2Req ?? sand.fs2_required, 2)}`;
setOverviewCard("cardSand", sandOk);
get("upliftResisting").textContent = fmt(uplift.resisting, 3);
get("upliftRequired").textContent = fmt(uplift.required, 3);
get("upliftFsValue").textContent = fmt(uplift.fs, 3);
get("upliftFsRequired").textContent = fmt(uplift.fsReq ?? uplift.fs_required, 2);
get("upliftResult").textContent = uplift.skipped ? "N/A" : (uplift.ok ? "OK" : "NG");
get("upliftResult").className = uplift.skipped ? "pill" : (uplift.ok ? "pill ok" : "pill ng");
get("cardUpliftStatus").textContent = uplift.skipped ? "N/A" : (uplift.ok ? "OK" : "NG");
get("cardUpliftMain").innerHTML = uplift.skipped ? "Skipped" : `FS = ${fmt(uplift.fs, 3)} ${uplift.ok ? "&ge;" : "<"} ${fmt(uplift.fsReq ?? uplift.fs_required, 2)}`;
setOverviewCard("cardUplift", uplift.ok);
get("upliftImpermeableTopOut").textContent = fmt(uplift.impermeableTop ?? uplift.impermeable_top, 3);
get("upliftUwOut").textContent = fmt(uplift.uw, 3);
renderUpliftCases(uplift);
maybeAskApplyPumping(uplift);
}

function runPythonStability(payload, options = {}) {
const status = get("status");
const bridge = stableBridge(false);
if (!bridge) {
status.textContent = "Python bridge is required for stability calculation.";
status.className = "status ng";
return;
}
status.textContent = "Calculating in Python...";
status.className = "status";
bridge.analyzeStability(JSON.stringify(payload), (reply) => {
try {
const result = JSON.parse(reply);
if (result.error || result.ok === false) {
throw new Error(result.error || "Python stability solver failed.");
}
renderResult(result, options);
status.textContent = "Calculated by Python.";
status.className = "status ok";
try {
window.parent && window.parent.postMessage({ type: "b1nep:stable-calculated" }, "*");
} catch (postErr) {}
} catch (err) {
status.textContent = err.message || String(err);
status.className = "status ng";
}
});
}

function recalc() {
runPythonStability(buildStablePayload(true), { renderInputs: false });
}

function loadStableModel(payload) {
stableSourceModel = (payload && payload.model) || payload || {};
runPythonStability(buildStablePayload(false), { renderInputs: true });
}

window.loadStableModel = loadStableModel;

document.addEventListener("DOMContentLoaded", () => {
if (embeddedStable) document.body.classList.add("embedded-stable");
document.addEventListener("input", () => {
try {
window.parent && window.parent.postMessage({ type: "b1nep:stable-dirty" }, "*");
} catch (postErr) {}
}, true);
document.addEventListener("change", () => {
try {
window.parent && window.parent.postMessage({ type: "b1nep:stable-dirty" }, "*");
} catch (postErr) {}
}, true);
get("addLayer").onclick = () => addLayer();
get("recalc").onclick = recalc;
document.querySelectorAll(".stable-tab").forEach((btn) => {
btn.onclick = () => {
document.querySelectorAll(".stable-tab").forEach((b) => b.classList.remove("active"));
document.querySelectorAll(".tab-pane").forEach((pane) => pane.classList.remove("active"));
btn.classList.add("active");
get(btn.dataset.target).classList.add("active");
};
});
if (!embeddedStable && !window.__stableLoadedFromBuilder) {
loadStableModel({
wall: { w_depth: 0, sections: [{ depth: 13 }] },
layers: [
{ type: "CL", analysis: "total", depth: 1.5, gamma: 2.05, gamma_sub: 1.05, c: 20, su: 20, phi: 0, Ka: 1, Kp: 1 },
{ type: "ML", analysis: "effective", depth: 8.5, gamma: 1.98, gamma_sub: 0.98, c: 0, su: 0, phi: 25.69, Ka: 0.395, Kp: 3.62 },
{ type: "SM", analysis: "effective", depth: 12, gamma: 1.95, gamma_sub: 0.95, c: 0, su: 0, phi: 25.69, Ka: 0.395, Kp: 3.62 },
{ type: "SS", analysis: "effective", depth: 30, gamma: 1.60, gamma_sub: 0.60, c: 0, su: 0, phi: 33, Ka: 0.355, Kp: 4.316 },
],
stages: [{ actions: [
{ type: "BUT", index: 1, Z: 0.66 },
{ type: "EXC", Z1: 5.16 },
{ type: "WAT", side: 1, Z1: 0, U: 0 },
{ type: "WAT", side: 2, Z1: 6.16, U: 0 },
] }],
});
}
});
}());
