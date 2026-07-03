function buildSteelCheckTableHtml(candidate, memberLabel, includeShear) {
  if(!candidate.result) return `<table><tbody><tr><td class="label">${memberLabel}</td><td>${fmtStatus('N/A')}</td></tr></tbody></table>`;
  if (memberLabel === 'Wale') return buildWaleCheckTableHtml(candidate);
  const r = candidate.result;
  const beamColumnValue = (r.axialRatio!=null&&r.axialRatio<0.15) ? r.beamColumnSimplified : r.beamColumnDetailed;
  const beamColumnStatus = (r.axialRatio!=null&&r.axialRatio<0.15) ? r.simpleStatus : r.detailedStatus;
  const extraRows = memberLabel==='Horizontal Strut'
    ? `<tr><td class="label">Dt / L</td><td>${fmtNum(candidate.DtRatio,6)}</td><td>${fmtStatus(candidate.DtStatus)}</td></tr>`
    : '';
  return `<table>
    <thead>
      <tr><th class="label">Item</th><th>Value</th><th>Check</th></tr>
    </thead>
    <tbody>
        <tr><td class="label">Section</td><td>${escapeHtml(document.getElementById(memberLabel==='Wale'?'selWaleSection':memberLabel==='Horizontal Strut'?'selStrutSection':memberLabel==='Angle Brace'?'selDiagSection':'selBraceSection').value)}</td><td></td></tr>
      <tr><td class="label">fa</td><td>${fmtNum(r.fa,3)} tf/cm^2</td><td></td></tr>
      <tr><td class="label">ftem</td><td>${fmtNum(r.ftem,3)} tf/cm^2</td><td></td></tr>
      <tr><td class="label">fb</td><td>${fmtNum(r.fbx,3)} tf/cm^2</td><td></td></tr>
      ${includeShear?`<tr><td class="label">fv</td><td>${fmtNum(r.fv,3)} tf/cm^2</td><td></td></tr>`:''}
      <tr><td class="label">(fa + ftem) / Fa</td><td>${fmtNum(r.axialRatio,3)}</td><td>${fmtStatus(r.axialStatus)}</td></tr>
      <tr><td class="label">Beam-column interaction</td><td>${fmtNum(beamColumnValue,3)}</td><td>${fmtStatus(beamColumnStatus)}</td></tr>
      <tr><td class="label">Combined stress interaction</td><td>${fmtNum(r.combinedStressInteraction,3)}</td><td>${fmtStatus(r.combinedStatus)}</td></tr>
      ${includeShear?`<tr><td class="label">fv / Fv</td><td>${fmtNum(r.shearRatio,3)}</td><td>${fmtStatus(r.shearStatus)}</td></tr>`:''}
      ${extraRows}
      <tr><td class="label">Overall</td><td colspan="2">${fmtStatus(r.status)}</td></tr>
    </tbody>
  </table>`;
}

function buildWaleCheckTableHtml(candidate) {
  if(!candidate.result) return `<table><tbody><tr><td class="label">Wale</td><td>${fmtStatus('N/A')}</td></tr></tbody></table>`;
  const r = candidate.result;
  // Simple mode: "Wale with head = No" ??no axial compression path,
  // just flexure (fb/Fb) and shear (fv/Fv) checks.
  if (r.simple) {
    return `<table><thead><tr><th class="label">Item</th><th>Value</th><th>Check</th></tr></thead><tbody>
        <tr><td class="label">Section</td><td>${escapeHtml(document.getElementById('selWaleSection').value)}</td><td></td></tr>
        <tr><td class="label">fb</td><td>${fmtNum(r.fb,3)} tf/cm^2</td><td></td></tr>
        <tr><td class="label">Fb</td><td>${fmtNum(r.Fb,3)} tf/cm^2</td><td></td></tr>
        <tr><td class="label">fb / Fb</td><td>${fmtNum(r.fbRatio,3)}</td><td>${fmtStatus(r.fbStatus)}</td></tr>
        <tr><td class="label">fv</td><td>${fmtNum(r.fv,3)} tf/cm^2</td><td></td></tr>
        <tr><td class="label">Fv</td><td>${fmtNum(r.Fv,3)} tf/cm^2</td><td></td></tr>
        <tr><td class="label">fv / Fv</td><td>${fmtNum(r.fvRatio,3)}</td><td>${fmtStatus(r.fvStatus)}</td></tr>
        <tr><td class="label">Overall</td><td colspan="2">${fmtStatus(r.status)}</td></tr>
      </tbody></table>`;
  }
  const beamColumnValue = (r.axialRatio!=null&&r.axialRatio<0.15) ? r.beamColumnSimplified : r.beamColumnDetailed;
  const beamColumnStatus = (r.axialRatio!=null&&r.axialRatio<0.15) ? r.simpleStatus : r.detailedStatus;
  return `<table><thead><tr><th class="label">Item</th><th>Value</th><th>Check</th></tr></thead><tbody>
        <tr><td class="label">Section</td><td>${escapeHtml(document.getElementById('selWaleSection').value)}</td><td></td></tr>
        <tr><td class="label">fa</td><td>${fmtNum(r.fa,3)} tf/cm^2</td><td></td></tr>
        <tr><td class="label">ftem</td><td>${fmtNum(r.ftem,3)} tf/cm^2</td><td></td></tr>
        <tr><td class="label">fb</td><td>${fmtNum(r.fbx,3)} tf/cm^2</td><td></td></tr>
        <tr><td class="label">fv</td><td>${fmtNum(r.fv,3)} tf/cm^2</td><td></td></tr>
        <tr><td class="label">Ra = (fa + ftem) / Fa</td><td>${fmtNum(r.axialRatio,3)}</td><td>${fmtStatus(r.axialStatus)}</td></tr>
        <tr><td class="label">Beam-column interaction</td><td>${fmtNum(beamColumnValue,3)}</td><td>${fmtStatus(beamColumnStatus)}</td></tr>
        <tr><td class="label">Combined stress interaction</td><td>${fmtNum(r.combinedStressInteraction,3)}</td><td>${fmtStatus(r.combinedStatus)}</td></tr>
        <tr><td class="label">Rv = fv / Fv</td><td>${fmtNum(r.shearRatio,3)}</td><td>${fmtStatus(r.shearStatus)}</td></tr>
        <tr><td class="label">Overall</td><td colspan="2">${fmtStatus(r.status)}</td></tr>
      </tbody></table>`;
    }
  function supportInstallItemsForChecks() {
    if (!resultData) return [];
    if (window.AnchorCheckModule && typeof AnchorCheckModule.listSupportInstalls === 'function') {
      return AnchorCheckModule.listSupportInstalls(resultData);
    }
    return SupportCheckModule.listSupportIds(resultData);
  }

  function bindSupportSummaryControls(selectedSupportId) {
    const supportIds = supportInstallItemsForChecks();
    const selectEl = document.getElementById('selSupportId');
    if(selectEl) {
      if (!supportIds.length) fillSelect(selectEl, [''], () => '(none)');
      else fillSelect(selectEl, supportIds.map(x => String(x.id)), id => SupportCheckModule.supportIdLabel(supportIds.find(x => String(x.id) === String(id))));
      if(selectedSupportId && Array.from(selectEl.options).some(o => String(o.value) === String(selectedSupportId))) {
        selectEl.value = String(selectedSupportId);
      }
      activeSupportSelectionId = String(selectEl.value || selectedSupportId || '');
      // Run the section auto-fill for whichever support id ends up
      // selected after this rebuild ??the change-listener below only
      // fires when the user picks a different one, so without this
      // call the FIRST sid (the default selection) never gets its
      // builder-typed strut_type / spacing pulled in.
      applySupportSectionSelectionsForSupportId(activeSupportSelectionId);
      selectEl.addEventListener('change', () => {
        saveCurrentSupportSectionSelections(activeSupportSelectionId);
        activeSupportSelectionId = String(selectEl.value || '');
        applySupportSectionSelectionsForSupportId(activeSupportSelectionId);
        refreshCheckView();
      });
    }
    const syncStateAndRefresh = () => {
      supportCommonState = {
        Fy_t_cm2:Number(document.getElementById('inpSupportFy')?.value || supportCommonState.Fy_t_cm2 || 0),
        E_t_cm2:Number(document.getElementById('inpSupportE')?.value || supportCommonState.E_t_cm2 || 0),
        temp_increase:Number(document.getElementById('inpSupportShortTerm')?.value || supportCommonState.temp_increase || 0),
        Ft:Number(document.getElementById('inpSupportFt')?.value || supportCommonState.Ft || 0)
        // Fb/Fv overrides intentionally absent ??they're derived.
      };
      refreshCheckView();
    };
      // Geometry inputs (inpWaleL1, inpStrutLu, inpAngleSpacing,
      // inpAngleAngle, inpBraceSd, inpBraceAngle) live in the static
      // "Support geometry" panel and are wired by initControls() ??
      // don't bind them here too, or each keystroke would fire
      // refreshCheckView twice.
      for(const id of ['inpSupportFy','inpSupportE','inpSupportShortTerm','inpSupportFt','inpWaleWithHead','inpStrutLiveLoad','inpStrutMbExtra','inpStrutDtLimit','inpAngleLiveLoad','inpBraceLiveLoad']) {
        const el = document.getElementById(id);
        if(!el) continue;
        el.addEventListener('input', syncStateAndRefresh);
        el.addEventListener('change', syncStateAndRefresh);
      }
  }
  
function buildWaleFormulaHtml(c){
  if(!c.result) return 'Select an H-steel support family, a support member, and define wale geometry to run the wale check.';
  const r=c.result, fs=c.forceSplit||{}, d=c.demandForces||{}, stiff=c.stiffness||{};
  // Simple mode: wale-without-head ??just flexure and shear.
  if (r.simple) {
    return `<div><b>Wale without head : simple bending + shear check</b></div>
      <div>w = R / s_h = ${fmtNum(d.w,3)} tf/m</div>
      <div>Effective bending span = s_h - s_a = ${fmtNum(fs.effectiveMomentSpan,3)} m</div>
      <div>Mw = w*(s_h - s_a)^2 / 10 = ${fmtNum(d.Mw,3)} tf-m</div>
      <div>Sw = w*[(s_h + (s_h - 2*s_a))/2]/2 = ${fmtNum(d.Sw,3)} T</div>
      <div style="margin-top:6px;"><b>Bending:</b></div>
      <div>fb = Mw / Zx = ${fmtNum(r.fb,3)} tf/cm^2</div>
      <div>Fb = 0.6*Fy*ST = ${fmtNum(r.Fb,3)} tf/cm^2</div>
      <div>fb / Fb = ${fmtNum(r.fbRatio,3)}</div>
      <div style="margin-top:6px;"><b>Shear:</b></div>
      <div>fv = Sw / (hw*tw) = ${fmtNum(r.fv,3)} tf/cm^2</div>
      <div>Fv = 0.4*Fy*ST = ${fmtNum(r.Fv,3)} tf/cm^2</div>
      <div>fv / Fv = ${fmtNum(r.fvRatio,3)}</div>`;
  }
  const faBranch = (r.R < 1)
    ? `Since (KL/r) / Cc = ${fmtNum(r.R,3)} < 1 , Fa = Fy*[1 - R^2/2] / [5/3 + 3R/8 - R^3/8] = ${fmtNum(r.Fa,3)} tf/cm^2`
    : `Since (KL/r) / Cc = ${fmtNum(r.R,3)} >= 1 , Fa = 12*pi^2*E / [23*(KL/r)^2] = ${fmtNum(r.Fa,3)} tf/cm^2`;
  const beamColumnBranch = (r.axialRatio != null && r.axialRatio < 0.15)
    ? `Beam-column interaction = (fa+ftem)/Fa + fb/Fb = ${fmtNum(r.beamColumnSimplified,3)}`
    : `Beam-column interaction = (fa+ftem)/Fa + Cmx*fb/{[1-(fa+ftem)/Fex]*Fb} = ${fmtNum(r.beamColumnDetailed,3)}`;
  return `<div><b>1. Moment and Shear on Wale</b></div><div>w = R / s_h = ${fmtNum(d.w,3)} tf/m</div><div>Effective bending span = s_h - s_a = ${fmtNum(fs.effectiveMomentSpan,3)} m</div><div>Mw = w*(s_h - s_a)^2 / 10 = ${fmtNum(d.Mw,3)} tf-m</div><div>Sw = w*[(s_h + (s_h - 2*s_a))/2]/2 = ${fmtNum(d.Sw,3)} T</div><div style="margin-top:6px;"><b>2. Calculate Axial Load of Angle Braces (N_a)</b></div><div>Ks = E*As / L = ${fmtNum(stiff.Ks,3)} tf/cm</div><div>Kb = E*Ab / (s_a/sin(theta)) = ${fmtNum(stiff.Kb,3)} tf/cm</div><div>Kb,eff = Kb*sin^2(theta) = ${fmtNum(stiff.Kb_eff,3)} tf/cm</div><div>N_a,h = R*Kb,eff / (Ks + 2Kb,eff) = ${fmtNum(fs.Pb_h,3)} T</div><div>N_a = N_a,h / sin(theta) = ${fmtNum(fs.Nb,3)} T</div><div style="margin-top:6px;"><b>3. Check Ra = (fa+fem)/Fa <= 1.0</b></div><div>Pa = N_a*cos(theta) = ${fmtNum(fs.Pa,3)} T</div><div>KL/r = ${fmtNum(r.klry,3)}</div><div>Cc = sqrt(2*pi^2*E/Fy) = ${fmtNum(r.Cc,3)}</div><div>${faBranch}</div><div>fa = Pa / As = ${fmtNum(r.fa,3)} tf/cm^2, ftem = ${fmtNum(r.ftem,3)} tf/cm^2</div><div>Ra = (fa + ftem) / Fa = (${fmtNum(r.fa,3)} + ${fmtNum(r.ftem,3)}) / ${fmtNum(r.Fa,3)} = ${fmtNum(r.axialRatio,3)}</div><div style="margin-top:6px;"><b>4. Check Beam-column interaction</b></div><div>fb = Mw / Zx = ${fmtNum(r.fbx,3)} tf/cm^2</div><div>Cmx = 0.85</div><div>${beamColumnBranch}</div><div>Combined stress interaction = (fa+ftem)/(0.6Fy) + fb/Fb = ${fmtNum(r.combinedStressInteraction,3)}</div><div style="margin-top:6px;"><b>5. Check Rv = fv/Fv <= 1.0</b></div><div>fv = Sw/(hw*tw) = ${fmtNum(r.fv,3)} tf/cm^2</div><div>Rv = fv / Fv = ${fmtNum(r.shearRatio,3)}</div>`;
    }

      function buildStrutFormulaHtml(c){ if(!c.result) return 'Select an H-steel support family, a support member, and define L to run the horizontal strut check.'; const r=c.result; const beamColumnBranch=(r.axialRatio!=null&&r.axialRatio<0.15)?`Beam-column interaction = (fa+ftem)/Fa + fb/Fb = ${fmtNum(r.beamColumnSimplified,3)}`:`Beam-column interaction = (fa+ftem)/Fa + Cmx*fb/[1-(fa+ftem)/Fex]*Fb = ${fmtNum(r.beamColumnDetailed,3)}`; return `<div><b>1. Moment on Strut</b></div><div>R = peak force of the selected support = ${fmtNum(c.N,3)} tf</div><div>Dt = [5*(w + LL)*L^4] / [384*E*Ix] = ${fmtNum(c.Dt,5)} cm</div><div>Dt/L limit source = ${escapeHtml(c.DtLimitSource)}</div><div>Dt / L = ${fmtNum(c.DtRatio,6)} <= ${fmtNum(c.DtLimit,6)}</div><div>Ms = (w + LL)*L^2 / 8 = ${fmtNum(c.Ms,3)} tf-m</div><div>Mb = user input = ${fmtNum(c.Mb,3)} tf-m</div><div>M = Ms + Mb = ${fmtNum(c.M,3)} tf-m</div><div><b>2. Check Ra = (fa+fem)/Fa <= 1.0</b></div><div>Fa = Fy*[1 - R^2/2] / [5/3 + 3R/8 - R^3/8] = ${fmtNum(r.Fa,3)} tf/cm^2</div><div>fa = ${fmtNum(r.fa,3)} tf/cm^2, ftem = ${fmtNum(r.ftem,3)} tf/cm^2</div><div>(fa + ftem) / Fa = (${fmtNum(r.fa,3)} + ${fmtNum(r.ftem,3)}) / ${fmtNum(r.Fa,3)} = ${fmtNum(r.axialRatio,3)}</div><div><b>3. Check Beam-column interaction</b></div><div>fb = ${fmtNum(r.fbx,3)} tf/cm^2</div><div>${beamColumnBranch}</div><div>Combined stress interaction = (fa+ftem)/(0.6Fy) + fb/Fb = ${fmtNum(r.combinedStressInteraction,3)}</div>`; }
function buildAngleFormulaHtml(c){ if(!c.result) return 'Select an H-steel support family, a support member, and define angle brace geometry to run the angle brace check.'; const r=c.result; const beamColumnBranch=(r.axialRatio!=null&&r.axialRatio<0.15)?`Beam-column interaction = (fa+ftem)/Fa + fb/Fb = ${fmtNum(r.beamColumnSimplified,3)}`:`Beam-column interaction = (fa+ftem)/Fa + Cmx*fb/[1-(fa+ftem)/Fex]*Fb = ${fmtNum(r.beamColumnDetailed,3)}`; return `<div><b>1. Moment on Bracing</b></div><div>N_a = axial load from wale force split = ${fmtNum(c.N,3)} T</div><div>La = s_a / cos(theta) = ${fmtNum(c.L,3)} m</div><div>M = (w + LL) * La^2 / 8 = ${fmtNum(c.M,3)} tf-m</div><div><b>2. Check Ra = (fa+fem)/Fa <= 1.0</b></div><div>Fa = Fy*[1 - R^2/2] / [5/3 + 3R/8 - R^3/8] = ${fmtNum(r.Fa,3)} tf/cm^2</div><div>fa = N_a / As = ${fmtNum(r.fa,3)} tf/cm^2, ftem = ${fmtNum(r.ftem,3)} tf/cm^2</div><div>(fa + ftem) / Fa = (${fmtNum(r.fa,3)} + ${fmtNum(r.ftem,3)}) / ${fmtNum(r.Fa,3)} = ${fmtNum(r.axialRatio,3)}</div><div><b>3. Check Beam-column interaction</b></div><div>fb = ${fmtNum(r.fbx,3)} tf/cm^2</div><div>${beamColumnBranch}</div><div>Combined stress interaction = (fa+ftem)/(0.6Fy) + fb/Fb = ${fmtNum(r.combinedStressInteraction,3)}</div>`; }
function buildBraceFormulaHtml(c){ if(!c.result) return 'Select an H-steel support family, a support member, and define diagonal brace geometry to run the diagonal brace check.'; const r=c.result; const beamColumnBranch=(r.axialRatio!=null&&r.axialRatio<0.15)?`Beam-column interaction = (fa+ftem)/Fa + fb/Fb = ${fmtNum(r.beamColumnSimplified,3)}`:`Beam-column interaction = (fa+ftem)/Fa + Cmx*fb/[1-(fa+ftem)/Fex]*Fb = ${fmtNum(r.beamColumnDetailed,3)}`; return `<div><b>1. Moment on Bracing</b></div><div>Ww = P / s_h = ${fmtNum(c.Ww,3)} tf/m</div><div>N_d = Ww*s_d/2*(1/cos(theta)) = ${fmtNum(c.N,3)} T</div><div>Ld = s_d/cos(theta) = ${fmtNum(c.L,3)} m</div><div>M = (w + LL) * Ld^2 / 8 = ${fmtNum(c.M,3)} tf-m</div><div><b>2. Check Ra = (fa+fem)/Fa <= 1.0</b></div><div>Fa = Fy*[1 - R^2/2] / [5/3 + 3R/8 - R^3/8] = ${fmtNum(r.Fa,3)} tf/cm^2</div><div>fa = N / As = ${fmtNum(r.fa,3)} tf/cm^2, ftem = ${fmtNum(r.ftem,3)} tf/cm^2</div><div>(fa + ftem) / Fa = (${fmtNum(r.fa,3)} + ${fmtNum(r.ftem,3)}) / ${fmtNum(r.Fa,3)} = ${fmtNum(r.axialRatio,3)}</div><div><b>3. Check Beam-column interaction</b></div><div>fb = ${fmtNum(r.fbx,3)} tf/cm^2</div><div>${beamColumnBranch}</div><div>Combined stress interaction = (fa+ftem)/(0.6Fy) + fb/Fb = ${fmtNum(r.combinedStressInteraction,3)}</div>`; }

function htmlToReportLines(html) {
  const box = document.createElement('div');
  box.innerHTML = String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n');
  return (box.textContent || '')
    .split(/\n+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function buildSupportReportItems() {
  if (!resultData || !window.SupportCheckModule) return [];
  const ids = supportInstallItemsForChecks();
  if (!ids.length) return [];
  const selectEl = document.getElementById('selSupportId');
  const originalId = selectEl ? String(selectEl.value || '') : activeSupportSelectionId;
  if (originalId) saveCurrentSupportSectionSelections(originalId);
  const reports = [];
  for (const item of ids) {
    const sid = String(item.id);
    if (selectEl) selectEl.value = sid;
    activeSupportSelectionId = sid;
    applySupportSectionSelectionsForSupportId(sid);
    const inputs = getSupportInputs();
    inputs.supportId = sid;
    const pack = {
      family: inputs.family,
      common: inputs.common,
      wale: inputs.wale,
      strut: inputs.strut,
      diag: inputs.diag,
      brace: inputs.brace,
    };
    const wale = SupportCheckModule.buildWaleCandidate(resultData, sid, pack);
    const strut = SupportCheckModule.buildStrutCandidate(resultData, sid, {
      family: inputs.family,
      common: inputs.common,
      strut: inputs.strut,
    });
    const angle = SupportCheckModule.buildAngleCandidate(resultData, sid, pack);
    const brace = SupportCheckModule.buildBraceCandidate(resultData, sid, {
      family: inputs.family,
      common: inputs.common,
      brace: inputs.brace,
    });
    reports.push({
      supportId: sid,
      supportLabel: SupportCheckModule.supportIdLabel(item),
      demand: SupportCheckModule.summarizeDemandById(resultData, sid),
      inputs,
      sections: {
        wale: inputs.wale.sectionName,
        strut: inputs.strut.sectionName,
        angle: Number(inputs.diag.spacing || 0) > 0 ? inputs.diag.sectionName : 'no bracing',
        brace: Number(inputs.brace.sd || 0) > 0 ? inputs.brace.sectionName : 'no bracing',
      },
      candidates: { wale, strut, angle, brace },
      formulas: {
        wale: htmlToReportLines(buildWaleFormulaHtml(wale)),
        strut: htmlToReportLines(buildStrutFormulaHtml(strut)),
        angle: htmlToReportLines(buildAngleFormulaHtml(angle)),
        brace: htmlToReportLines(buildBraceFormulaHtml(brace)),
      },
      hidden: {
        angle: !(Number(inputs.diag.spacing || 0) > 0),
        brace: !(Number(inputs.brace.sd || 0) > 0),
      },
    });
    saveCurrentSupportSectionSelections(sid);
  }
  if (selectEl && originalId) {
    selectEl.value = originalId;
    activeSupportSelectionId = originalId;
    applySupportSectionSelectionsForSupportId(originalId);
  }
  return reports;
}
