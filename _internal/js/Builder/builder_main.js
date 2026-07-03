// =====================================================================
//   BLOCK BUILDER
// =====================================================================

// The model: matches what Rio2Json + ThreeBuilder consume.
//   wall.sections is an ordered list of {depth, EI} entries.  depth is the
//   z at the BOTTOM of that section.  Total wall length L = depth of the
//   last (deepest) section.  Single-section walls are just sections.length=1.
const model = {
  // L is the horizontal extent of the wall in the 3D scene (the
  // excavation pit is rendered as a square pit of side L).  It also
  // feeds the auto-k formula for BUT/ANC presets.  Edited via the
  // "L (m)" input on the viewer panel; updates trigger a scene rebuild
  // and recompute k_s for every non-Custom strut/anchor.
  wall:   { sections: [{ depth: 9.0, EI: 5674 }], max_le: 0.5, w_depth: 1.0,
            opt_A: false, opt_F: false,
            opt_CW: false, cw_ratio: 2 / 3,
            // 3D scene horizontal extents (square by default).  L is
            // along the x-axis, W along the z-axis.
            L: 10.0, W: 10.0,
            // Which direction is being analysed.  Affects:
            //   - the strut length used for kFromStrutType (W when
            //     'L' is analysed, L when 'W' is analysed);
            //   - the orientation of cross struts in the 3D viz
            //     (only struts perpendicular to the analysed wall).
            direction: 'L',
            directionMode: 'L',
            // L&W mode: when true, only stagesByDir.L is the source of
            // truth; stagesByDir.W is auto-derived from it on every
            // mutation via reDeriveSharedW(), applying per-action W
            // overrides (act.per_dir.W = { dz, S }) to BUT/ANC.  When
            // false, L and W are independent lists (legacy forked
            // behaviour; preserved for imports and the manual escape
            // hatch).  New models start shared.
            lwSharedStages: true,
            // Human-readable case identifier.  Written to the exported
            // .rio as a `*Case: ???second-line comment, propagated
            // through the FEM run, and shown in the results window.
            case_name: '' },
  layers: [],
  stages: [],
  stagesByDir: { L: [], W: [] },
  stageTargetDir: 'L'
};

let modelRevision = 0;
const reportState = {
  stabilityRev: -1,
  femRev: -1,
};
let currentStageIdx = -1;

// =====================================================================
//   MODEL STATUS / DIRTY STATE / FRACTION INPUTS
// =====================================================================
function isReportCurrent(kind) {
  if (kind === 'stability') return reportState.stabilityRev === modelRevision;
  if (kind === 'fem') return reportState.femRev === modelRevision && !!window.__lastFEMPayload;
  return true;
}

function refreshReportStatus() {
  const input = document.getElementById('reportLightInput');
  const stable = document.getElementById('reportLightStable');
  const fem = document.getElementById('reportLightFem');
  const stableHint = document.getElementById('reportStableHint');
  const femHint = document.getElementById('reportFemHint');
  if (input) input.classList.add('on');
  const stableOn = isReportCurrent('stability');
  const femOn = isReportCurrent('fem');
  if (stable) stable.classList.toggle('on', stableOn);
  if (fem) fem.classList.toggle('on', femOn);
  if (stableHint) stableHint.textContent = stableOn ? 'Current for this model.' : 'Not current. Open Stability and recalculate after edits.';
  if (femHint) femHint.textContent = femOn ? 'Current for this model.' : 'Not current. Run FEM after edits.';
}

function markModelDirty() {
  modelRevision += 1;
  reportState.stabilityRev = -1;
  reportState.femRev = -1;
  refreshReportStatus();
}

function setReportReady(kind) {
  if (kind === 'stability') reportState.stabilityRev = modelRevision;
  else if (kind === 'fem') reportState.femRev = modelRevision;
  refreshReportStatus();
}

// Shared numeric parser for inputs marked with `.fraction-input`.
// It accepts plain numbers ("0.667") and simple fractions ("2/3")
// without using eval, so future fields can opt in by adding the class.
function parseFractionValue(value) {
  const text = String(value ?? '').trim().replace(/[嚗?]/g, '/');
  if (!text) return NaN;
  const fraction = text.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*\/\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    return denominator !== 0 ? numerator / denominator : NaN;
  }
  return Number(text);
}

function fractionInputNumber(input, fallback = NaN) {
  const value = parseFractionValue(input && input.value);
  return Number.isFinite(value) ? value : fallback;
}

function installFractionInputs(root = document) {
  root.querySelectorAll('input.fraction-input').forEach(input => {
    const sync = () => {
      const value = parseFractionValue(input.value);
      const ok = Number.isFinite(value);
      input.classList.toggle('is-invalid', input.value.trim() !== '' && !ok);
      if (ok) input.dataset.numberValue = String(value);
      else delete input.dataset.numberValue;
    };
    input.addEventListener('input', sync);
    input.addEventListener('change', sync);
    sync();
  });
}

window.parseFractionValue = parseFractionValue;
window.fractionInputNumber = fractionInputNumber;
installFractionInputs();
document.addEventListener('input', (event) => {
  const target = event.target;
  if (target && target.closest && target.closest('#builder')) markModelDirty();
}, true);
document.addEventListener('change', (event) => {
  const target = event.target;
  if (target && target.closest && target.closest('#builder')) markModelDirty();
}, true);

// =====================================================================
//   STAGE TARGET / DIRECTION STATE
// =====================================================================
const projectPanel = window.installBuilderProjectPanel({
  model,
  rerenderStages: () => rerenderStages(),
  showStage: (idx) => showStage(idx),
  playInit: () => playInit(),
  getCurrentStageIdx: () => currentStageIdx,
});
const {
  syncActiveStagesRef,
  updateStageTargetButtons,
  setStageTargetDir,
  wallTotalLength,
  getStrutLength,
  defaultStrutCalcLength,
  autoStrutK,
  setSiteWaterLevel,
  syncCwOptionUI,
  applyGeometry,
} = projectPanel;
syncActiveStagesRef();

// =====================================================================
//   DOM HELPERS
// =====================================================================
// ---- DOM helpers
function el(tag, attrs={}, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
    else e.setAttribute(k, attrs[k]);
  }
  for (const c of kids.flat()) {
    if (c == null) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}
function num(value, step=0.1, width=null) {
  // Plain text inputs only ??keep the same signature so existing call
  // sites (which still pass `step`) continue to work, but the field
  // never grows browser-native up/down spinners and the user can type
  // any value (parseFloat is applied on commit).
  const i = el('input', { type: 'text', value });
  if (width) i.style.width = width;
  return i;
}
function bindNumberInput(record, key, step=0.1, width=null) {
  const input = num(record[key], step, width);
  input.addEventListener('input', () => { record[key] = parseFloat(input.value); });
  return input;
}
function bindTextInput(record, key, fallback='') {
  const value = record[key] != null && record[key] !== '' ? record[key] : fallback;
  const input = num(value, 0);
  input.addEventListener('input', () => { record[key] = input.value; });
  return input;
}

// =====================================================================
//   SOIL LAYERS
// =====================================================================
const sitePanel = window.installBuilderSitePanel({
  model,
  markModelDirty,
  el,
  bindNumberInput,
  bindTextInput,
  syncStagePreviewAfterStageChange: () => syncStagePreviewAfterStageChange(),
});
const {
  defaultLayer,
  addLayer,
  rerenderLayers,
  removeLayer,
  moveLayer,
  defaultWallSection,
  addWallSection,
  removeWallSection,
  moveWallSection,
  rerenderWallSections,
} = sitePanel;
window.addLayer = addLayer;
window.addWallSection = addWallSection;

// =====================================================================
//   STAGE ACTIONS / STAGE EDITOR
// =====================================================================
// ---- Action block (one inside a stage)
const ACTION_DEFS = window.ACTION_DEFS;
const STRUT_TYPES    = window.STRUT_TYPES;
const kFromStrutType = window.kFromStrutType;
let analysisPanels = null;
const stagesPanel = window.installBuilderStagesPanel({
  model,
  markModelDirty,
  el,
  num,
  autoStrutK,
  defaultStrutCalcLength,
  ACTION_DEFS,
  STRUT_TYPES,
  getCurrentStageIdx: () => currentStageIdx,
  updateStageTargetButtons,
  onStageChanged: () => syncStagePreviewAfterStageChange(),
  renderProfile: () => {
    if (typeof renderProfile2D === 'function') renderProfile2D();
  },
});
const {
  defaultAction,
  addStage,
  removeStage,
  moveStage,
  addAction,
  removeAction,
  moveAction,
  moveActionTo,
  rerenderStages,
  deriveWFromL,
  reDeriveSharedW,
  playbackStagesForDirection,
  DEFAULT_W_DZ,
} = stagesPanel;

window.installSimpleStageMaker({
  model,
  rerenderStages: () => rerenderStages(),
  wallTotalLength,
  getStrutLength,
  kFromStrutType,
  strutTypes: STRUT_TYPES,
});

const _watDesigner = window.installSimpleWatDesigner({
  model,
  rerenderStages: () => rerenderStages(),
  refreshProfile: () => {
    if (typeof renderProfile2D === 'function') renderProfile2D();
  },
  wallTotalLength,
  getPyBridge: () => analysisPanels ? analysisPanels.getPyBridge() : (window.pyBridge || null),
  setSiteWaterLevel,
});
window.openSimpleWatDesigner = () => _watDesigner.openModal();

// Quick Build ??Simple Wall Builder: opens a modal where the user picks
// wall length, family (soldier pile / sheet pile / diaphragm wall), a
// section preset, and (for soldier pile) the pile spacing.  On generate,
// the Site pane's wall sections list is replaced with a single segment.
const _swb = window.installSimpleWallBuilder({
  model,
  rerenderWallSections: () => rerenderWallSections(),
});
window.openSimpleWallBuilder = () => _swb.openModal();

const _qsoil = window.installSimpleSoilInput({
  model,
  rerenderLayers: () => rerenderLayers(),
});
window.openSimpleSoilInput = () => _qsoil.openModal();

// Public bridge for the trial shell and popup Quick Build windows.  The
// original Quick Build modules close over this builder page's model, so a
// detached QWebEngine popup can still safely mutate the live model and ask
// this page to rerender the affected panels.
window.B1BuilderAPI = {
  model,
  rerenderWallSections: () => rerenderWallSections(),
  rerenderLayers: () => rerenderLayers(),
  rerenderStages: () => rerenderStages(),
  refreshProfile: () => {
    if (typeof renderProfile2D === 'function') renderProfile2D();
  },
  setSiteWaterLevel,
  wallTotalLength,
  getStrutLength,
  kFromStrutType,
  strutTypes: STRUT_TYPES,
  getPyBridge: () => analysisPanels ? analysisPanels.getPyBridge() : (window.pyBridge || null),
};

// =====================================================================
//   WALL SECTIONS / PROJECT WALL INPUTS
// =====================================================================
// Project / Site panel logic moved to:
//   - js/Builder/builder_project_panel.js
//   - js/Builder/builder_site_panel.js

// =====================================================================
//   PREVIEW / PLAYBACK / PROFILE SYNC
// =====================================================================
function playInit() {
  if (window.setWallHeight) window.setWallHeight(wallTotalLength());
  if (window.resetModel) window.resetModel();
  // map model.layers (top-to-bottom by row order) to {depth, phi}
  const layerView = model.layers
    .filter(L => L.depth != null && !isNaN(L.depth))
    .map(L => ({ depth: Number(L.depth), phi: Number(L.phi) }));
  if (window.setLayerSoils) window.setLayerSoils(layerView);
  // refresh the 2D profile too (no-op if it hasn't been created yet)
  if (typeof renderProfile2D === 'function') renderProfile2D();
}

function syncStagePreviewAfterStageChange() {
  const total = Array.isArray(model.stages) ? model.stages.length : 0;
  if (!Number.isFinite(currentStageIdx)) currentStageIdx = -1;
  if (total <= 0) {
    currentStageIdx = -1;
    playInit();
    const status = 'Stage: -';
    document.getElementById('stageStatusText').textContent = status;
    if (window.updateStageInfo) window.updateStageInfo(status);
    return;
  }
  if (currentStageIdx < 0) currentStageIdx = 0;
  if (currentStageIdx >= total) currentStageIdx = total - 1;
  showStage(currentStageIdx);
}

function playActionsUpTo(stageIdx) {
  const stageLists = (model.wall.directionMode === 'LW')
    ? [{ dir: 'L', stages: playbackStagesForDirection('L') }, { dir: 'W', stages: playbackStagesForDirection('W') }]
    : [{
        dir: (model.wall.direction === 'W') ? 'W' : 'L',
        stages: model.stages || []
      }];
  for (const source of stageLists) {
    const applySoil = (model.wall.directionMode !== 'LW') || source.dir === 'L';
    const stages = source.stages || [];
    for (let i = 0; i <= stageIdx && i < stages.length; i++) {
      for (const act of stages[i].actions) {
        if (!applySoil && act.type !== 'BUT' && act.type !== 'ANC') continue;
        switch (act.type) {
          case 'EXC':
            if (act.Z1 != null && window.setExcavation) window.setExcavation(Number(act.Z1));
            break;
          case 'BUT':
          case 'ANC': {
            const idx = Number(act.index);
            // Namespace setIds by direction in LW mode so an L-side
            // BUT(1) and a W-side BUT(1) live as two distinct sets in
            // the scene and a BUT_REMOVE in one direction doesn't
            // remove the other direction's strut.  Single-direction
            // modes keep the bare numeric id for back-compat.
            const isLW   = (model.wall.directionMode === 'LW');
            const setKey = id => isLW ? `${source.dir}:${id}` : Number(id);
            // 3D-only display flags:
            //   minimal       : in LW mode, the W direction is the upper
            //                   layer (per_dir.W.dz defaults to +0.3 so
            //                   W sits shallower) ??skip its waler ring
            //                   and corner braces so we don't double them
            //                   on top of the L (lower) ring.
            //   sideWalerLift : single-direction mode lifts the two
            //                   walers parallel to the bar by 0.3 m so
            //                   they look stacked on the primary ones,
            //                   matching real cross-bracing.  In LW
            //                   mode, L's side walers ARE the W struts'
            //                   primary walers, so lift them by exactly
            //                   the W ?Z (per_dir.W.dz, default 0.3) ??            //                   that puts them at the W bar elevation.
            const dzW = (act.per_dir && act.per_dir.W
                         && Number.isFinite(Number(act.per_dir.W.dz)))
                        ? Number(act.per_dir.W.dz)
                        : DEFAULT_W_DZ;
            // Per-direction 3D framing in LW mode:
            //   L pass : full waler ring + corner braces.  Side walers
            //            are lifted by dzW so they sit at the W bar
            //            elevation (they ARE the W struts' primary
            //            walers on the perpendicular walls).
            //   W pass : only the two primary walers along the
            //            W-analysed walls.  Side walers are skipped
            //            (already drawn by L).  Corner braces skipped
            //            (L's ring already carries them).
            // Single-direction modes keep the existing 0.3 m stacked-
            // perpendicular-waler look on both side walers.
            const isLWL = isLW && source.dir === 'L';
            const isLWW = isLW && source.dir === 'W';
            const renderOpts = {
              noSideWalers:   isLWW,
              noCornerBraces: isLWW,
              sideWalerLift:  isLWL ? dzW : (isLW ? 0 : 0.3),
            };
            if (idx === 0) {
              if (act.sub_index != null && window.removeStrutSet)
                window.removeStrutSet(setKey(act.sub_index));
            } else {
              if (act.Z != null && act.S != null && window.addStrutsAt) {
                window.addStrutsAt(Number(act.Z), Number(act.S), setKey(idx), source.dir,
                                   act.type, Number(act.I) || 0, renderOpts);
              }
            }
            break;
          }
          case 'BAC':
          case 'SOI': {
            if (act.Z1 != null && act.Z2 != null && window.addRemSoil)
              window.addRemSoil(Number(act.Z1), Number(act.Z2));
            break;
          }
          default: break;
        }
      }
    }
  }
}

function showStage(idx) {
  if (idx < 0 || idx >= model.stages.length) return;
  playInit();
  playActionsUpTo(idx);
  currentStageIdx = idx;
  const status = `Stage: ${idx+1} / ${model.stages.length}`;
  document.getElementById('stageStatusText').textContent = status;
  if (window.updateStageInfo) window.updateStageInfo(status);
  renderProfile2D();
}

function showInitialStage() {
  currentStageIdx = -1;
  playInit();
  const status = 'Stage: -';
  const txt = document.getElementById('stageStatusText');
  if (txt) txt.textContent = status;
  if (window.updateStageInfo) window.updateStageInfo(status);
  if (typeof renderProfile2D === 'function') renderProfile2D();
}

// =====================================================================
//   2D PROFILE  (cross-section preview in the bottom strip)
// =====================================================================
// The full implementation lives in ./js/Builder/profile2d.js as a factory
// (window.installProfile2D).  We call it once here, after `model`,
// `wallTotalLength`, `getLayerColor`, and `currentStageIdx` are all
// defined, and bind the returned functions to the names the rest of
// the script (showStage, rerenderStages, removeLayer, the resize
// listener, bootstrap, ?? already calls.
const _p2d = window.installProfile2D({
  model:              model,
  getCurrentStageIdx: () => currentStageIdx,
  wallTotalLength:    wallTotalLength,
  getLayerColor:      getLayerColor,
});
const computeStageState = _p2d.computeStageState;
const renderProfile2D   = _p2d.renderProfile2D;
window.renderProfile2D  = renderProfile2D;

// --- everything below this point (the long inline computeStageState +
// --- renderProfile2D body) was moved to ./js/Builder/profile2d.js.

document.getElementById('btnPrev').onclick = () => {
  if (model.stages.length && currentStageIdx > 0) showStage(currentStageIdx - 1);
};
document.getElementById('btnNext').onclick = () => {
  if (!model.stages.length) return;
  if (currentStageIdx < 0) { showStage(0); return; }
  if (currentStageIdx < model.stages.length - 1) showStage(currentStageIdx + 1);
};

// =====================================================================
//   RIO EXPORT / REPORT EXPORT
// =====================================================================
const ioPanels = window.installBuilderIOPanels({
  model,
  reportState,
  isReportCurrent,
  refreshReportStatus,
  getCurrentStageIdx: () => currentStageIdx,
  defaultWallSection,
  syncCwOptionUI,
  applyGeometry,
  rerenderWallSections: () => rerenderWallSections(),
  rerenderLayers: () => rerenderLayers(),
  rerenderStages: () => rerenderStages(),
  syncActiveStagesRef,
  markModelDirty,
  getPyBridge: () => analysisPanels ? analysisPanels.getPyBridge() : (window.pyBridge || null),
  getActivateTab: () => analysisPanels ? analysisPanels.activateTab : window.activateB1BuilderTab,
  showStage: (idx) => showStage(idx),
  showInitialStage: () => showInitialStage(),
});
const {
  buildRioText,
  exportRio,
  loadRioViaBridge,
  applyCfgToModel,
} = ioPanels;

// =====================================================================
//   TAB ROUTING / ANALYSIS PANEL
// =====================================================================
analysisPanels = window.installBuilderAnalysisPanels({
  model,
  reportState,
  refreshReportStatus,
  setReportReady,
  syncActiveStagesRef,
  rerenderStages: () => rerenderStages(),
  reDeriveSharedW: () => reDeriveSharedW(),
  showStage: (idx) => showStage(idx),
  getCurrentStageIdx: () => currentStageIdx,
  getBuildRioText: () => buildRioText,
  wallTotalLength,
});
const {
  activateTab,
  refreshAnalysisPanel,
  getPyBridge,
} = analysisPanels;

// Preview Stage: drop the scene back to its pre-stage initial state.
// Mirrors what showStage(-1)/playInit() do under the hood ??useful when
// the 3D view or 2D profile gets out of sync with the model after a
// deep edit (e.g. switching directions, importing a .rio, large stage
// rearrangements) and the user wants a known-good starting point
// without having to reload the page.
document.getElementById('btnPreview').onclick = () => {
  showInitialStage();
};

// =====================================================================
//   BOOTSTRAP
// =====================================================================
// ---- seed: render the default single wall section, one empty soil
//      layer, and an empty stages list.
rerenderWallSections();
addLayer();
rerenderStages();   // ensure stage host renders empty state
// One more profile render after layout has settled ??SVG clientWidth/Height
// can be 0 on first script run, before the browser has done layout.
requestAnimationFrame(() => renderProfile2D());
