function getAnchorInputs() {
  const v = id => {
    const el = document.getElementById(id);
    return el ? el.value : '';
  };
  const numOrNull = id => {
    const raw = String(v(id) || '').trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const d = AnchorCheckModule.defaults;
  const num = (id, fallback) => {
    const n = numOrNull(id);
    return n == null ? fallback : n;
  };
  const diaEl = document.getElementById('selAnchorStrandDia');
  const spec = AnchorCheckModule.strandSpecByDiameter(diaEl ? diaEl.value : d.strand_diameter_cm);
  const anchors = resultData ? AnchorCheckModule.listAnchors(resultData) : [];
  const fallbackAnchorId = anchors.length ? String(anchors[0].id) : '';
  return {
    anchorId: v('selAnchorId') || activeAnchorSelectionId || fallbackAnchorId,
    manual_design_load_t: numOrNull('inpAnchorTw'),
    strand_count: num('inpAnchorStrandCount', d.strand_count),
    strand_diameter_cm: spec.diameter_cm,
    tendon_fs: num('inpAnchorTendonFs', d.tendon_fs),
    grout_fc_kg_cm2: num('inpAnchorFc', d.grout_fc_kg_cm2),
    tendon_grout_fs: num('inpAnchorTendonGroutFs', d.tendon_grout_fs),
    bond_length_m: num('inpAnchorBondLength', d.bond_length_m),
    borehole_diameter_cm: num('inpAnchorBoreDia', d.borehole_diameter_cm),
    ground_bond_tau_u_kg_cm2: num('inpAnchorTauU', d.ground_bond_tau_u_kg_cm2),
    ground_bond_fs: num('inpAnchorGroundFs', d.ground_bond_fs),
  };
}

function saveCurrentAnchorParamState(explicitId) {
  const key = explicitId || activeAnchorSelectionId || document.getElementById('selAnchorId')?.value || '';
  if (!key) return;
  const grab = id => {
    const el = document.getElementById(id);
    return el ? el.value : null;
  };
  anchorParamStateByAnchorId[String(key)] = {
    Tw: grab('inpAnchorTw'),
    N: grab('inpAnchorStrandCount'),
    Dp: grab('selAnchorStrandDia'),
    fc: grab('inpAnchorFc'),
    La: grab('inpAnchorBondLength'),
    D: grab('inpAnchorBoreDia'),
    tauU: grab('inpAnchorTauU'),
  };
}

function applyAnchorParamStateForAnchorId(explicitId) {
  const key = explicitId || activeAnchorSelectionId || '';
  const saved = anchorParamStateByAnchorId[String(key)];
  const set = (id, value) => {
    if (value == null) return;
    const el = document.getElementById(id);
    if (el) el.value = value;
  };
  const d = AnchorCheckModule.defaults;
  set('inpAnchorTw', saved ? saved.Tw : '');
  set('inpAnchorStrandCount', saved ? saved.N : d.strand_count);
  set('selAnchorStrandDia', saved ? saved.Dp : d.strand_diameter_cm);
  set('inpAnchorFc', saved ? saved.fc : d.grout_fc_kg_cm2);
  set('inpAnchorBondLength', saved ? saved.La : d.bond_length_m);
  set('inpAnchorBoreDia', saved ? saved.D : d.borehole_diameter_cm);
  set('inpAnchorTauU', saved ? saved.tauU : d.ground_bond_tau_u_kg_cm2);
  updateAnchorStrandReadonlyCells();
}

function updateAnchorStrandReadonlyCells(candidate) {
  const dia = document.getElementById('selAnchorStrandDia')?.value
    || (candidate && candidate.inputs && candidate.inputs.strand_diameter_cm)
    || AnchorCheckModule.defaults.strand_diameter_cm;
  const spec = AnchorCheckModule.strandSpecByDiameter(dia);
  const area = document.getElementById('anchorStrandAreaCell');
  const fs = document.getElementById('anchorFsCell');
  const fy = document.getElementById('anchorFyCell');
  if (area) area.textContent = fmtNum(spec.area_cm2, 4);
  if (fs) fs.textContent = fmtNum(spec.tensile_load_kgf, 1);
  if (fy) fy.textContent = fmtNum(spec.proof_load_kgf, 1);
}

function syncAnchorVisibility() {
  const hasAnchors = !!(resultData && AnchorCheckModule.listAnchors(resultData).length);
  const hasSupports = !!(resultData && AnchorCheckModule.listSupportInstalls(resultData).length);
  const supportTab = document.getElementById('subTabSupport');
  const supportSide = document.querySelector('.b1-side-button[data-result-page="checks"][data-sub-page="support"]');
  const tab = document.getElementById('subTabAnchor');
  const side = document.getElementById('sideAnchorCheck');
  if (supportTab) supportTab.style.display = hasSupports ? '' : 'none';
  if (supportSide) supportSide.style.display = hasSupports ? '' : 'none';
  if (tab) tab.style.display = hasAnchors ? '' : 'none';
  if (side) side.style.display = hasAnchors ? '' : 'none';
  if (!hasSupports && document.getElementById('subPageSupport')?.classList.contains('active')) {
    activateSubTab(hasAnchors ? 'anchor' : 'wall');
  }
  if (!hasAnchors && document.getElementById('subPageAnchor')?.classList.contains('active')) {
    activateSubTab(hasSupports ? 'support' : 'wall');
  }
}

function syncAnchorSelector(candidate) {
  const selectEl = document.getElementById('selAnchorId');
  if (!selectEl) return;
  const anchors = candidate ? candidate.anchors : [];
  if (!anchors.length) {
    fillSelect(selectEl, [''], () => '(none)');
    return;
  }
  const demands = new Map(anchors.map(a => [String(a.id), AnchorCheckModule.summarizeDemandById(resultData, a.id)]));
  fillSelect(selectEl, anchors.map(a => String(a.id)), id => {
    const anchor = anchors.find(a => String(a.id) === String(id));
    return AnchorCheckModule.anchorIdLabel(anchor, demands.get(String(id)));
  });
  const want = activeAnchorSelectionId || (candidate.anchor && String(candidate.anchor.id)) || String(anchors[0].id);
  if (Array.from(selectEl.options).some(o => String(o.value) === String(want))) {
    selectEl.value = String(want);
  }
  activeAnchorSelectionId = String(selectEl.value || '');
  selectEl.onchange = () => {
    saveCurrentAnchorParamState(activeAnchorSelectionId);
    activeAnchorSelectionId = String(selectEl.value || '');
    applyAnchorParamStateForAnchorId(activeAnchorSelectionId);
    refreshCheckView();
  };
}

function buildAnchorReportItems() {
  if (!resultData || !window.AnchorCheckModule) return [];
  const anchors = AnchorCheckModule.listAnchors(resultData);
  if (!anchors.length) return [];
  const selectEl = document.getElementById('selAnchorId');
  const originalId = selectEl ? String(selectEl.value || '') : activeAnchorSelectionId;
  if (originalId) saveCurrentAnchorParamState(originalId);
  const reports = [];
  for (const anchorItem of anchors) {
    const aid = String(anchorItem.id);
    if (selectEl) selectEl.value = aid;
    activeAnchorSelectionId = aid;
    applyAnchorParamStateForAnchorId(aid);
    const inputs = getAnchorInputs();
    inputs.anchorId = aid;
    const candidate = AnchorCheckModule.buildCandidate(resultData, aid, inputs);
    reports.push({
      anchorId: aid,
      anchorLabel: AnchorCheckModule.anchorIdLabel(anchorItem, AnchorCheckModule.summarizeDemandById(resultData, aid)),
      anchor: candidate.anchor,
      demand: candidate.demand,
      inputs: candidate.inputs,
      design_load_t: candidate.design_load_t,
      tendon: candidate.tendon,
      tendonGrout: candidate.tendonGrout,
      groutGround: candidate.groutGround,
      overall: candidate.overall,
      formulas: {
        tendon: htmlToReportLines(buildAnchorTendonFormulaHtml(candidate)),
        tendonGrout: htmlToReportLines(buildAnchorTendonGroutFormulaHtml(candidate)),
        groutGround: htmlToReportLines(buildAnchorGroundFormulaHtml(candidate)),
      },
    });
    saveCurrentAnchorParamState(aid);
  }
  if (selectEl && originalId) {
    selectEl.value = originalId;
    activeAnchorSelectionId = originalId;
    applyAnchorParamStateForAnchorId(originalId);
  }
  return reports;
}

function buildAnchorFsTableHtml(candidate) {
  const p = candidate ? candidate.inputs : AnchorCheckModule.defaults;
  return `<table class="tight-table">
    <thead><tr><th class="label">FS</th><th>Value</th></tr></thead>
    <tbody>
      <tr><td class="label">Tendon F.S.</td><td><input id="inpAnchorTendonFs" class="table-input" type="text" inputmode="decimal" value="${fmtNum(p.tendon_fs,3)}"></td></tr>
      <tr><td class="label">Tendon-to-grout F.S.</td><td><input id="inpAnchorTendonGroutFs" class="table-input" type="text" inputmode="decimal" value="${fmtNum(p.tendon_grout_fs,3)}"></td></tr>
      <tr><td class="label">Grout-to-ground F.S.</td><td><input id="inpAnchorGroundFs" class="table-input" type="text" inputmode="decimal" value="${fmtNum(p.ground_bond_fs,3)}"></td></tr>
    </tbody>
  </table>`;
}

function buildAnchorSummaryHtml(candidate) {
  if (!candidate || !candidate.anchors.length) {
    return '<div class="sanity-banner"><h3>Anchor check unavailable</h3><div>No ANC/TIR command was found in the analysed RIO input.</div></div>';
  }
  const a = candidate.anchor || {};
  const d = candidate.demand || {};
  return `<table class="tight-table">
    <thead><tr><th class="label">Parameter</th><th>Value</th></tr></thead>
    <tbody>
      <tr><td class="label">Ground anchor</td><td><select id="selAnchorId" class="table-input"></select></td></tr>
      <tr><td class="label">Spacing, S (m)</td><td>${fmtNum(a.spacing_m,3)}</td></tr>
      <tr><td class="label">Inclination, θ (deg)</td><td>${fmtNum(a.inclination_deg,2)}</td></tr>
      <tr><td class="label">Preload (tf)</td><td>${fmtNum(a.lockoff_load_t,3)}</td></tr>
      <tr><td class="label">Peak axial force, |N| (tf)</td><td>${fmtNum(d.max_force_t,3)}</td></tr>
      <tr><td class="label">Overall</td><td>${fmtStatus(candidate.overall)}</td></tr>
    </tbody>
  </table>`;
}

function buildAnchorResultTableHtml(title, result, capacityLabel, demand) {
  if (!result) return '';
  return `<table><thead><tr><th class="label">Item</th><th>Value</th><th>Check</th></tr></thead><tbody>
    <tr><td class="label">Demand, T<sub>w</sub></td><td>${fmtNum(demand,3)} tf</td><td></td></tr>
    <tr><td class="label">${capacityLabel}</td><td>${fmtNum(result.capacity_t,3)} tf</td><td></td></tr>
    <tr><td class="label">Utilization, T<sub>w</sub> / capacity</td><td>${fmtNum(result.ratio,3)}</td><td>${fmtStatus(result.status)}</td></tr>
    <tr><td class="label">Overall</td><td colspan="2">${fmtStatus(result.status)}</td></tr>
  </tbody></table>`;
}

function buildAnchorTendonFormulaHtml(c) {
  if (!c || !c.anchor) return 'Select a ground anchor to run the tendon strength check.';
  const p = c.inputs, r = c.tendon;
  return `<div><b>Tendon strength</b></div>
    <div>P<sub>w</sub> = N × f<sub>s</sub> / F.S. = ${fmtNum(p.strand_count,3)} × ${fmtNum(p.strand_tensile_load_kgf,0)} / ${fmtNum(p.tendon_fs,3)} = ${fmtNum(r.Pw_kgf,1)} kgf = ${fmtNum(r.capacity_t,3)} tf</div>
    <div>T<sub>w</sub> = ${fmtNum(c.design_load_t,3)} tf</div>
    <div>T<sub>w</sub> / P<sub>w</sub> = ${fmtNum(r.ratio,3)} ≤ 1.000</div>`;
}

function buildAnchorTendonGroutFormulaHtml(c) {
  if (!c || !c.anchor) return 'Select a ground anchor to run the tendon-to-grout bond check.';
  const p = c.inputs, r = c.tendonGrout;
  return `<div><b>Tendon-to-grout bond</b></div>
    <div>τ<sub>ub</sub> = 0.06 × f<sub>c</sub>' = 0.06 × ${fmtNum(p.grout_fc_kg_cm2,0)} = ${fmtNum(r.tau_ub,3)} kgf/cm²</div>
    <div>τ<sub>ab</sub> = τ<sub>ub</sub> / F.S. = ${fmtNum(r.tau_ub,3)} / ${fmtNum(p.tendon_grout_fs,3)} = ${fmtNum(r.tau_ab,3)} kgf/cm²</div>
    <div>d<sub>t</sub> = N × D' = ${fmtNum(p.strand_count,3)} × ${fmtNum(p.strand_diameter_cm,3)} = ${fmtNum(r.dt_cm,3)} cm</div>
    <div>F<sub>w</sub> = π × d<sub>t</sub> × L<sub>a</sub> × τ<sub>ab</sub> = π × ${fmtNum(r.dt_cm,3)} × ${fmtNum(p.bond_length_m * 100,1)} × ${fmtNum(r.tau_ab,3)} = ${fmtNum(r.Fw_kgf,1)} kgf = ${fmtNum(r.capacity_t,3)} tf</div>
    <div>T<sub>w</sub> / F<sub>w</sub> = ${fmtNum(r.ratio,3)} ≤ 1.000</div>`;
}

function buildAnchorGroundFormulaHtml(c) {
  if (!c || !c.anchor) return 'Select a ground anchor to run the grout-to-ground bond check.';
  const p = c.inputs, r = c.groutGround;
  return `<div><b>Grout-to-ground bond</b></div>
    <div>T<sub>s</sub> = π × D × L<sub>a</sub> × τ<sub>u</sub> / F.S.</div>
    <div>T<sub>s</sub> = π × ${fmtNum(p.borehole_diameter_cm,3)} × ${fmtNum(p.bond_length_m * 100,1)} × ${fmtNum(p.ground_bond_tau_u_kg_cm2,3)} / ${fmtNum(p.ground_bond_fs,3)} = ${fmtNum(r.Ts_kgf,1)} kgf = ${fmtNum(r.capacity_t,3)} tf</div>
    <div>T<sub>w</sub> / T<sub>s</sub> = ${fmtNum(r.ratio,3)} ≤ 1.000</div>`;
}
