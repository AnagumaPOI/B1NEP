function buildWallSectionTableHtml(wall) {
  if (!wall) return '';
  const sec = wall.section || {};
  const isDiaphragm = wall.wall_type === 'diaphragm_wall';
  const rows = [];
  if (sec.Z_cm3_per_m      != null) rows.push(['Section modulus Zx (cm^3/m)', fmtNum(sec.Z_cm3_per_m, 2)]);
  if (sec.I_cm4_per_m      != null) rows.push(['Ix (cm^4/m)', fmtNum(sec.I_cm4_per_m, 0)]);
  if (sec.Z_cm3_per_piece  != null) rows.push(['Section modulus Zx (cm^3/pile)', fmtNum(sec.Z_cm3_per_piece, 2)]);
  if (sec.I_cm4_per_piece  != null) rows.push(['Ix (cm^4/pile)', fmtNum(sec.I_cm4_per_piece, 0)]);
  if (sec.Av_cm2_per_piece != null) rows.push(['Av (cm^2)', fmtNum(sec.Av_cm2_per_piece, 2)]);
  if (sec.D_cm             != null) rows.push(['D (cm)', fmtNum(sec.D_cm, 2)]);
  if (sec.B_cm             != null) rows.push(['Flange width bf (cm)', fmtNum(sec.B_cm, 2)]);
  if (sec.spacing_cm       != null) rows.push(['Spacing (cm)', fmtNum(sec.spacing_cm, 2)]);
  if (sec.diameter_cm      != null) rows.push(['Pile D (cm)', fmtNum(sec.diameter_cm, 2)]);
  if (sec.thickness_cm     != null) rows.push(['Thickness (cm)', fmtNum(sec.thickness_cm, 2)]);
  if (sec.fc_kgf_cm2       != null) rows.push(['fc (kgf/cm^2)', fmtNum(sec.fc_kgf_cm2, 0)]);
  if (sec.E_kgf_cm2        != null) rows.push(['E (kgf/cm^2)', fmtNum(sec.E_kgf_cm2, 0)]);
  const matRows = [];
  if (wall.material) {
    matRows.push(['Fy (kgf/cm^2)', fmtNum(wall.material.Fy_kg_cm2, 1)]);
    matRows.push(['Reduction factor f', fmtNum(wall.material.f_factor, 2)]);
  }
  const checkRows = [];
  if (wall.checks && wall.material && (wall.family === 'steel_piece' || wall.family === 'steel_perm')) {
    const c = wall.checks;
    const fbF = c.fb_factor != null ? c.fb_factor : 0.6;
    const fvF = c.fv_factor != null ? c.fv_factor : 0.4;
    checkRows.push([
      'Short-term factor (STF)',
      `<input id="inpWallStf" class="table-input" type="text" value="${fmtNum(c.stf,2)}">`
    ]);
    checkRows.push([
      `Allowable bending stress, Fb (tf/cm^2)<br><small>= ${fbF} Fy * STF</small>`,
      `${fmtNum(c.Fb_kg_cm2/1000,3)}`
    ]);
    checkRows.push([
      `Allowable shear stress, Fv (tf/cm^2)<br><small>= ${fvF} Fy * STF</small>`,
      `${fmtNum(c.Fv_kg_cm2/1000,3)}`
    ]);
  }
  let html = `<table>
    <thead>
      <tr><th class="label">Parameter</th><th>Value</th></tr>
    </thead>
    <tbody>
      <tr><td class="label">Wall type</td><td>${escapeHtml(wall.wall_label || '')}</td></tr>
      ${wall.section_name && !isDiaphragm ? `<tr><td class="label">Section</td><td>${escapeHtml(wall.section_name)}</td></tr>` : ''}
      ${rows.map(([k,v])=>`<tr><td class="label">${k}</td><td>${v}</td></tr>`).join('')}
      ${matRows.map(([k,v])=>`<tr><td class="label">${k}</td><td>${v}</td></tr>`).join('')}
      ${checkRows.map(([k,v])=>`<tr><td class="label">${k}</td><td>${v}</td></tr>`).join('')}
    </tbody>
  </table>`;
  return html;
}

function buildLaggingInputHtml(lag) {
  if (!lag) return '';
  const li = lag.inputs || {};
  return `<div class="hint" style="margin:4px 0 6px;">
      Lagging calculation is provided for reference only. Timber lagging in soldier pile systems is commonly selected based on practical experience and field conditions.
    </div>
    <table>
      <thead><tr><th class="label">Parameter</th><th>Value</th></tr></thead>
      <tbody>
        <tr><td class="label">Material</td><td>Timber</td></tr>
        <tr><td class="label">Fb (kgf/cm^2)</td><td><input id="inpLagFb" class="table-input" type="text" value="${fmtNum(li.Fb_kg_cm2 ?? 75, 1)}"></td></tr>
        <tr><td class="label">Fv (kgf/cm^2)</td><td><input id="inpLagFv" class="table-input" type="text" value="${fmtNum(li.Fv_kg_cm2 ?? 7, 1)}"></td></tr>
        <tr><td class="label">Water Pressure Ratio</td><td><input id="inpLagWaterRatio" class="table-input" type="text" value="${fmtNum(li.water_pressure_ratio ?? 0, 2)}"></td></tr>
        <tr><td class="label">Short-Term Factor</td><td><input id="inpLagStf" class="table-input" type="text" value="${fmtNum(li.short_term_factor ?? 1.2, 2)}"></td></tr>
        <tr><td class="label">Lagging Height h (cm)</td><td><input id="inpLagH" class="table-input" type="text" value="${fmtNum(li.h_cm ?? 10, 1)}"></td></tr>
        <tr><td class="label">Lagging Thickness t (cm)</td><td><input id="inpWallLagThk" class="table-input" type="text" value="${fmtNum(li.t_cm ?? 3, 1)}"></td></tr>
      </tbody>
    </table>`;
}

const ALL_REBAR_OPTIONS  = ['D10','D13','D16','D19','D22','D25','D29','D32','D36','D43'];
const MAIN_REBAR_OPTIONS = ['D16','D19','D22','D25','D29','D32','D36','D43'];
const TEMP_REBAR_OPTIONS = ['D10','D13','D16','D19','D22','D25'];          
const MAIN_SPACING_OPTIONS = ['10','12.5','15','20','25','30','45'];
const SHEAR_REBAR_OPTIONS = ['D10','D13','D16'];
const SHEAR_SPACING_OPTIONS = ['10','15','20','25','30','60'];


// <option> list (no wrapping <select>) for dynamic rows.
function optList(values, selected) {
  return values.map(v =>
    `<option value="${escapeHtml(v)}"${String(v)===String(selected)?' selected':''}>${escapeHtml(v)}</option>`
  ).join('');
}
// Parse a range textbox: "0~5", "0-5", "0 5" → [0, 5].  Returns
// [null,null] on failure so the engine falls back to the full wall.
function parseRange(txt) {
  if (txt == null) return [null, null];
  const m = String(txt).trim().match(/^(-?\d+(?:\.\d+)?)\s*[~\-– ]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return [null, null];
  return [parseFloat(m[1]), parseFloat(m[2])];
}

function selectHtml(id, values, selected) {
  return `<select id="${id}" class="table-input">` +
    values.map(v => `<option value="${escapeHtml(v)}"${String(v)===String(selected)?' selected':''}>${escapeHtml(v)}</option>`).join('') +
    `</select>`;
}

// Default first-segment rebar when the table is first built.
const DW_DEFAULTS = {
  exca:  { bar: 'D25', sp: '15' },
  soil:  { bar: 'D22', sp: '15' },
  shear: { bar: 'D16', v: '15', h: '15' },
};

// '(none)' + bar list, for the optional 2nd reinforcement layer.
const ADD_REBAR_OPTIONS = [''].concat(MAIN_REBAR_OPTIONS);
// Numeric bar size (mm) from a "D25"-style name.
function barSize(name) {
  const n = parseInt(String(name || '').replace(/^D/i, ''), 10);
  return Number.isFinite(n) ? n : 0;
}
// <option> list for the optional 2nd layer: '(none)' + bars from D16
// up to AND INCLUDING the row's main bar — the added rebar may never
// be larger than the main rebar, and never smaller than D16.  A stale
// selection that no longer fits the cap silently falls back to none.
function addBarOptionList(mainBar, selected) {
  const cap = barSize(mainBar) || barSize('D43');
  const opts = [''].concat(
    MAIN_REBAR_OPTIONS.filter(b => barSize(b) >= 16 && barSize(b) <= cap));
  const sel = opts.indexOf(String(selected)) >= 0 ? selected : '';
  return optList(opts, sel);
}
// One flexural segment row: [range] : [bar]@[spacing]  (+ optional
// 2nd layer [bar2]@[sp2] so capacity can be fine-tuned
function dwFlexRowHtml(range, bar, sp, bar2, sp2) {
  return `<tr class="dw-row">
    <td><input class="dw-range table-input" type="text" value="${escapeHtml(range)}" placeholder="0~5"></td>
    <td><select class="dw-bar table-input">${optList(MAIN_REBAR_OPTIONS, bar)}</select></td>
    <td><select class="dw-sp table-input">${optList(MAIN_SPACING_OPTIONS, sp)}</select></td>
    <td><select class="dw-bar2 table-input" title="optional 2nd layer (≥ D16, ≤ main bar)">${addBarOptionList(bar, bar2 || '')}</select></td>
    <td><select class="dw-sp2 table-input">${optList(MAIN_SPACING_OPTIONS, sp2 || sp)}</select></td>
    <td class="center"><button type="button" class="tiny" data-dwdel="1" title="remove segment">✕</button></td>
  </tr>`;
}
// One shear segment row: [range] : [bar]@[V]@[H] + delete.
function dwShearRowHtml(range, bar, v, h) {
  return `<tr class="dw-row">
    <td><input class="dw-range table-input" type="text" value="${escapeHtml(range)}" placeholder="0~5"></td>
    <td><select class="dw-bar table-input">${optList(SHEAR_REBAR_OPTIONS, bar)}</select></td>
    <td><select class="dw-v table-input">${optList(SHEAR_SPACING_OPTIONS, v)}</select></td>
    <td><select class="dw-h table-input">${optList(SHEAR_SPACING_OPTIONS, h)}</select></td>
    <td class="center"><button type="button" class="tiny" data-dwdel="1" title="remove segment">✕</button></td>
  </tr>`;
}

function buildWallRebarDesignHtml(wall) {
  if (!wall || !['diaphragm_wall','rc_pile_wall'].includes(wall.wall_type)) return '';
  if (wall.wall_type === 'rc_pile_wall') return buildPileRebarDesignHtml(wall);
  // Wall length from the analysed .rio (auto), used as the default
  // full-depth range on the first row of every table.
  const L = (resultData && Number(resultData.L)) ? Number(resultData.L) : 0;
  const fullRange = L > 0 ? `0~${(+L.toFixed(2))}` : '0~0';
  const d = DW_DEFAULTS;
  // Auto-recommended depth bands from the demand envelope (split at the
  // valleys between moment/shear peaks).  Falls back to one full-depth
  // row when the envelope is missing or shows no distinct peaks.
  const env = resultData && resultData.envelope;
  const recRanges = side => {
    let bands = null;
    try {
      if (env && WallCheckModule.recommendSegments) {
        bands = WallCheckModule.recommendSegments(env, side, { maxSeg: 4 });
      }
    } catch (e) { bands = null; }
    if (!bands || !bands.length) return [fullRange];
    return bands.map(b => `${+(+b[0]).toFixed(2)}~${+(+b[1]).toFixed(2)}`);
  };
  // Optimiser params: use the SAME defaults the freshly-built common-
  // params table shows (factor 1.6, amplifier 1.25, cover 7.5, Fy
  // boundary D19) so the recommended layout is self-consistent.  Fc /
  // thickness come from the already-rendered wall-section inputs.
  const num = id => { const e = document.getElementById(id);
    const v = e ? parseFloat(e.value) : NaN; return Number.isFinite(v) ? v : null; };
  const optP = {
    b: 100,
    Fc:        num('inpWallFc')        || (wall && wall.fc_kgfcm2) || 280,
    thickness: num('inpWallThickness') || (wall && wall.thickness_cm) || 60,
    cover: 7.5, factor: 1.6, amplifier: 1.25, fyBoundary: 'D19',
  };
  // Full auto-design (both faces + shear + temperature) with a
  // SHARED spacing anchor so the whole layout is consistent and the
  // total rebar quantity is minimised.  Falls back to the peak-split
  // ranges with the static default bar if it yields nothing usable.
  let auto = null;
  try {
    if (env && WallCheckModule.optimizeDiaphragmRebar) {
      auto = WallCheckModule.optimizeDiaphragmRebar(env, optP,
               { maxSeg: 4, gridStep: 1, gamma: 0.10 });
    }
  } catch (e) {}
  const optExca = auto && auto.exca;
  const optSoil = auto && auto.soil;
  const flexRowsFrom = (o, side, bar, sp) => {
    if (o && o.length) {
      return o.map(s => dwFlexRowHtml(
        `${s.z0}~${s.z1}`, s.bar, String(s.spacing),
        s.bar2 || '', s.spacing2 ? String(s.spacing2) : String(s.spacing)
      )).join('');
    }
    return recRanges(side).map(r => dwFlexRowHtml(r, bar, sp)).join('');
  };
  const tpBar = (auto && auto.temp) ? auto.temp.bar : 'D13';
  const tpSp  = (auto && auto.temp) ? auto.temp.spacing : '30';
  const shearBody = (auto && auto.shear && auto.shear.length)
    ? auto.shear.map(s => dwShearRowHtml(`${s.z0}~${s.z1}`, s.bar, s.V, s.H)).join('')
    : recRanges('shear').map(r => dwShearRowHtml(r, d.shear.bar, d.shear.v, d.shear.h)).join('');
  return `<h3 style="margin-top:10px;">Rebar Design</h3>
    <table class="tight-table">
      <thead><tr><th class="label">Parameter</th><th>Value</th></tr></thead>
      <tbody>
        <tr><td class="label">Load factor <br><span class="hint">(suggested:1.6)</span></td><td><input id="inpDwFactor" class="table-input" type="text" value="1.6"></td></tr>
        <tr><td class="label">Allowable stress amplifier <br><span class="hint">(for short term: 1~1.25)</span></td><td><input id="inpDwAmplifier" class="table-input" type="text" value="1.25"></td></tr>
        <tr><td class="label">Cover thickness (cm)</td><td><input id="inpDwCover" class="table-input" type="text" value="7.5"></td></tr>
        <tr><td class="label">Deflection limit, Dt/L</td><td><input id="inpDwDispLimit" class="table-input" type="text" value="1/200"></td></tr>
        <tr><td class="label">Fy boundary <br><span class="hint">(above this size use Fy = 4200 kgf/cm^2, else 2800 kgf/cm^2)</span></td>
            <td><select id="selDwFyBound" class="table-input">${optList(ALL_REBAR_OPTIONS, 'D19')}</select></td></tr>
        <tr><td class="label">Temperature bar / spacing (cm)</td><td style="display:flex;gap:4px;">
          <select id="selDwTempBar" class="table-input">${optList(TEMP_REBAR_OPTIONS, tpBar)}</select>
          <select id="selDwTempSp"  class="table-input">${optList(MAIN_SPACING_OPTIONS, tpSp)}</select></td></tr>
        <tr><td class="label">Auto-design <br><span class="hint">(optimal segmentation &amp; rebar from the moment / shear envelope)</span></td>
            <td><button type="button" id="btnDwAutoDesign" class="tiny" title="Re-run the optimiser using the parameters above and overwrite the segment tables below">⚙ Optimise segmentation &amp; rebar</button></td></tr>
      </tbody>
    </table>

    <h4 style="margin:10px 0 2px;">Excavation side</h4>
    <table class="tight-table">
      <thead><tr><th>Range z (m)</th><th>Bar</th><th>Sp (cm)</th>
        <th>+2nd</th><th>Sp2 (cm)</th><th></th></tr></thead>
      <tbody id="dwExcaBody">${flexRowsFrom(optExca, 'exca', d.exca.bar, d.exca.sp)}</tbody>
    </table>
    <button type="button" class="tiny" data-dwadd="Exca">+ Segment</button>

    <h4 style="margin:10px 0 2px;">Soil side</h4>
    <table class="tight-table">
      <thead><tr><th>Range z (m)</th><th>Bar</th><th>Sp (cm)</th>
        <th>+2nd</th><th>Sp2 (cm)</th><th></th></tr></thead>
      <tbody id="dwSoilBody">${flexRowsFrom(optSoil, 'soil', d.soil.bar, d.soil.sp)}</tbody>
    </table>
    <button type="button" class="tiny" data-dwadd="Soil">+ Segment</button>

    <h4 style="margin:10px 0 2px;">Shear</h4>
    <table class="tight-table">
      <thead><tr><th>Range z (m)</th><th>Bar</th><th>V (cm)</th><th>H (cm)</th><th></th></tr></thead>
      <tbody id="dwShearBody">${shearBody}</tbody>
    </table>
    <button type="button" class="tiny" data-dwadd="Shear">+ Segment</button>`;
}

// ---- RC Pile Wall (circular bored pile, P–M interaction) -----------
const PILE_MAIN_BARS  = ['D16','D19','D22','D25','D29','D32','D36','D43'];
const PILE_SHEAR_BARS = ['D10','D13','D16'];

// Input panel for the rc_pile_wall family.  Pile diameter & centre-to-
// centre spacing come from the wall-section fields above (inpWallDiameter
// / inpWallSpacing); everything else is pile-specific.
function buildPileRebarDesignHtml(wall) {
  return `<h3 style="margin-top:10px;">Pile Rebar Design (P–M)</h3>
    <div class="hint">Circular section checked for combined axial + moment
      (BoringPilesAnalysis port).</div>
    <table class="tight-table">
      <thead><tr><th class="label">Parameter</th><th>Value</th></tr></thead>
      <tbody>
        <tr><td class="label">Load factor (suggested: 1.6)</td><td><input id="inpPileFactor" class="table-input" type="text" value="1.6"></td></tr>
        <tr><td class="label">Allowable stress amplifier (short term 1~1.25)</td><td><input id="inpPileAmplifier" class="table-input" type="text" value="1.25"></td></tr>
        <tr><td class="label">Cover (cm)</td><td><input id="inpPileCover" class="table-input" type="text" value="7.5"></td></tr>
        <tr><td class="label">Main bar Fy (kgf/cm^2)</td><td><input id="inpPileFy" class="table-input" type="text" value="4200"></td></tr>
        <tr><td class="label">Stirrup Fys (kgf/cm^2)</td><td><input id="inpPileFys" class="table-input" type="text" value="2800"></td></tr>
        <tr><td class="label">Hoop type</td><td><select id="selPileStirrup" class="table-input"><option value="tied">Tied</option><option value="spiral">Spiral</option></select></td></tr>
        <tr><td class="label">Main bar size</td><td><select id="selPileMainBar" class="table-input">${optList(PILE_MAIN_BARS,'D25')}</select></td></tr>
        <tr><td class="label">No. of main bars (around circle)</td><td><input id="inpPileNBars" class="table-input" type="text" value="16"></td></tr>
        <tr><td class="label">Bundle per bar</td><td><input id="inpPileBundle" class="table-input" type="text" value="1"></td></tr>
        <tr><td class="label">Axial load Pu, compression (tf/pile)</td><td><input id="inpPilePu" class="table-input" type="text" value="0"></td></tr>
        <tr><td class="label">Shear hoop (blank = auto-pick)</td><td style="display:flex;gap:4px;">
          <select id="selPileShearBar" class="table-input"><option value="">(auto)</option>${optList(PILE_SHEAR_BARS,'')}</select>
          <input id="inpPileShearV" class="table-input" type="text" value="15" title="vertical pitch (cm)" style="width:64px;">
          <select id="selPileShearLegs" class="table-input"><option value="2">2 legs</option><option value="4">4 legs</option></select></td></tr>
      </tbody>
    </table>
    <div id="pileWebInputs" style="display:none;">
      <h4 style="margin:12px 0 2px;">Secant Web rebar (rectangular strip)</h4>
      <div class="hint">Web thickness t = 2·(c/c) − D, designed per 100 cm run
        (flexure + shear, like a diaphragm strip). Leave a row's bar on
        <b>(auto)</b> to let the optimiser size it.</div>
      <table class="tight-table">
        <thead><tr><th>Side</th><th>Bar</th><th>Sp (cm)</th><th>+2nd</th><th>Sp2 (cm)</th></tr></thead>
        <tbody>
          <tr><td class="label">Excavation</td>
            <td><select id="selPileWebExBar" class="table-input"><option value="">(auto)</option>${optList(MAIN_REBAR_OPTIONS,'')}</select></td>
            <td><select id="selPileWebExSp" class="table-input">${optList(MAIN_SPACING_OPTIONS,'15')}</select></td>
            <td><select id="selPileWebExBar2" class="table-input"><option value="">(none)</option>${optList(MAIN_REBAR_OPTIONS,'')}</select></td>
            <td><select id="selPileWebExSp2" class="table-input">${optList(MAIN_SPACING_OPTIONS,'15')}</select></td></tr>
          <tr><td class="label">Soil</td>
            <td><select id="selPileWebSoBar" class="table-input"><option value="">(auto)</option>${optList(MAIN_REBAR_OPTIONS,'')}</select></td>
            <td><select id="selPileWebSoSp" class="table-input">${optList(MAIN_SPACING_OPTIONS,'15')}</select></td>
            <td><select id="selPileWebSoBar2" class="table-input"><option value="">(none)</option>${optList(MAIN_REBAR_OPTIONS,'')}</select></td>
            <td><select id="selPileWebSoSp2" class="table-input">${optList(MAIN_SPACING_OPTIONS,'15')}</select></td></tr>
        </tbody>
      </table>
      <table class="tight-table">
        <thead><tr><th>Web shear</th><th>Bar</th><th>V (cm)</th><th>H (cm)</th></tr></thead>
        <tbody>
          <tr><td class="label">Stirrup</td>
            <td><select id="selPileWebShBar" class="table-input"><option value="">(auto)</option>${optList(PILE_SHEAR_BARS,'')}</select></td>
            <td><input id="inpPileWebShV" class="table-input" type="text" value="15" style="width:64px;"></td>
            <td><input id="inpPileWebShH" class="table-input" type="text" value="15" style="width:64px;"></td></tr>
        </tbody>
      </table>
    </div>`;
}

function getPileRebarInputs() {
  const val = id => { const e = document.getElementById(id); return e ? e.value : ''; };
  const num = id => { const v = parseFloat(val(id)); return Number.isFinite(v) ? v : null; };
  const shBar = val('selPileShearBar');
  return {
    Fc:          num('inpWallFc'),
    Fy:          num('inpPileFy'),
    Fys:         num('inpPileFys'),
    diameter_cm: num('inpWallDiameter'),
    cover_cm:    num('inpPileCover'),
    spacing_m:   num('inpWallSpacing'),
    mainBar:     val('selPileMainBar') || 'D25',
    nBars:       num('inpPileNBars'),
    bundle:      num('inpPileBundle'),
    stirrupType: val('selPileStirrup') || 'tied',
    Pu_tf:       num('inpPilePu'),
    factor:      num('inpPileFactor'),
    amplifier:   num('inpPileAmplifier'),
    shearBar:    shBar || null,
    shearV:      num('inpPileShearV'),
    shearLegs:   num('selPileShearLegs'),
    pileKind:    val('selPileKind') || 'single',
    web: {
      exca:  { bar: val('selPileWebExBar') || null,
               spacing: num('selPileWebExSp'),
               bar2: val('selPileWebExBar2') || null,
               spacing2: num('selPileWebExSp2') },
      soil:  { bar: val('selPileWebSoBar') || null,
               spacing: num('selPileWebSoSp'),
               bar2: val('selPileWebSoBar2') || null,
               spacing2: num('selPileWebSoSp2') },
      shear: { bar: val('selPileWebShBar') || null,
               V: num('inpPileWebShV'), H: num('inpPileWebShH') },
    },
  };
}

function buildPileResultHtml(design) {
  if (!design) return '';
  if (!design.ok) {
    return `<div class="sanity-banner"><h3>Pile check unavailable</h3>
      <div>${escapeHtml(design.error || 'No data.')}</div></div>`;
  }
  const p = design.params, m = design.main, s = design.shear, dm = design.demand;
  const tag = ok => ok ? '<span class="status-pass">PASS</span>'
                       : '<span class="status-fail">FAIL</span>';
  const shRow = s.bar
    ? `<tr><td class="label">Shear capacity</td><td>phiVn = ${fmtNum(s.phiVn_t,2)} tf</td><td>Vu = ${fmtNum(s.Vu_t,2)} tf</td><td>${tag(s.status)}</td></tr>`
    : `<tr><td class="label">Shear capacity</td><td colspan="3">no stirrup resolved</td></tr>`;
    return `
    <h3 style="margin-top:8px;">Main Steel — P–M Interaction</h3>
    <table>
      <thead><tr><th class="label">Check Item</th><th>Design</th><th>Allowable</th><th>Result</th></tr></thead>
      <tbody>
        <tr>
          <td class="label">P-M interaction</td>
          <td>phiMn at Pu = ${fmtNum(m.phiMn_tm,2)} tf-m</td>
          <td>Mu=${fmtNum(dm.Mu_tm,2)} tf-m, Pu=${fmtNum(dm.Pu_tf,1)} tf</td>
          <td class="center">${tag(m.status)}</td>
        </tr>
        ${m.reason?`<tr><td class="label">Note</td><td colspan="3">${escapeHtml(m.reason)}</td></tr>`:''}
      </tbody>
    </table>
    <h3 style="margin-top:8px;">Shear</h3>
    <table>
      <thead><tr><th class="label">Check Item</th><th>Design</th><th>Allowable</th><th>Result</th></tr></thead>
      <tbody>${shRow}</tbody>
    </table>`;
}

// Secant pile only: the rectangular overlap "web" between adjacent
// circular piles (flexure + shear, designed like a diaphragm wall).
function pileWebHtml(web, tag) {
  if (!web) return '';
  if (web.invalid) {
    return `<h3 style="margin-top:10px;">Secant Web</h3>
      <div class="sanity-banner"><div>${escapeHtml(web.note || '')}</div>
      <div>Computed web thickness t = 2·(c/c) − D = ${fmtNum(web.thickness_cm,1)} cm.</div></div>`;
  }
  const fb = s => `${escapeHtml(s.bar)}@${s.spacing}` +
    (s.bar2 ? ` + ${escapeHtml(s.bar2)}@${s.spacing2}` : '');
  const flexRow = (lbl, arr) => (arr && arr.length)
    ? arr.map(s => `<tr><td class="label">${lbl} ${fmtNum(s.z0,1)}-${fmtNum(s.z1,1)} m</td>
        <td>Mu = ${fmtNum(s.Mu,2)} tf-m</td>
        <td>phiMn = ${fmtNum(s.phiMn,2)} tf-m</td>
        <td>${tag(s.feasible)}</td></tr>`).join('')
    : `<tr><td class="label">${lbl}</td><td colspan="3">-</td></tr>`;
  const shRow = (web.shear && web.shear.length)
    ? web.shear.map(s => `<tr><td class="label">Shear ${fmtNum(s.z0,1)}-${fmtNum(s.z1,1)} m</td>
        <td>Vu = ${fmtNum(s.Vu,2)} tf</td>
        <td>phiVn = ${fmtNum(s.phiVn,2)} tf</td>
        <td>${tag(s.feasible)}</td></tr>`).join('')
    : `<tr><td class="label">Shear</td><td colspan="3">-</td></tr>`;
  return `<h3 style="margin-top:10px;">Secant Web (rectangular, like a diaphragm strip)</h3>
    <table>
      <thead><tr><th class="label">Check Item</th><th>Design</th><th>Allowable</th><th>Result</th></tr></thead>
      <tbody>
        ${flexRow('Excavation', web.exca)}
        ${flexRow('Soil', web.soil)}
        ${shRow}
      </tbody>
    </table>`;
}

// Most-recent RC-pile design (consumed by renderPilePmPlot).
let lastPileDesign = null;

// Most-recent diaphragm-wall design result (set by refreshCheckView,
// consumed by renderWallMomentPlot for the φMn capacity lines).
let lastDiaphragmDesign = null;
// Track which wall type the rebar-input table was last built for so we
// only rebuild it when the structure actually changes — rebuilding on
// every keystroke would reset the user's <select>/<input> values.
let lastWallRebarType = null;

function getDiaphragmRebarInputs() {
  const val = id => { const e = document.getElementById(id); return e ? e.value : ''; };
  const num = id => { const v = parseFloat(val(id)); return Number.isFinite(v) ? v : null; };
  // Read every dynamic <tr.dw-row> in a tbody into {z0,z1,bar,...}.
  function readRows(bodyId, kind) {
    const body = document.getElementById(bodyId);
    if (!body) return [];
    return Array.from(body.querySelectorAll('tr.dw-row')).map(tr => {
      const rngEl = tr.querySelector('.dw-range');
      const [z0, z1] = parseRange(rngEl ? rngEl.value : '');
      const barEl = tr.querySelector('.dw-bar');
      const bar = barEl ? barEl.value : '';
      if (kind === 'shear') {
        const vEl = tr.querySelector('.dw-v'), hEl = tr.querySelector('.dw-h');
        return { z0, z1, bar,
          V: vEl ? parseFloat(vEl.value) : null,
          H: hEl ? parseFloat(hEl.value) : null };
      }
      const spEl   = tr.querySelector('.dw-sp');
      const bar2El = tr.querySelector('.dw-bar2');
      const sp2El  = tr.querySelector('.dw-sp2');
      const bar2   = bar2El ? bar2El.value : '';
      return {
        z0, z1, bar, spacing: spEl ? spEl.value : '',
        bar2: bar2 || null,
        spacing2: (bar2 && sp2El) ? sp2El.value : null,
      };
    });
  }
    return {
      Fc:            num('inpWallFc'),
      cover_cm:      num('inpDwCover'),
      thickness_cm:  num('inpWallThickness'),
      fullLength_m:  num('inpWallFullLength'),    // auto-filled from RIO
      factor:        num('inpDwFactor'),
      amplifier:     num('inpDwAmplifier'),
      disp_limit_text: val('inpDwDispLimit') || '1/200',
      fyBoundary:    val('selDwFyBound') || 'D19',
      temp:  { bar: val('selDwTempBar'), spacing: val('selDwTempSp') },
      exca:  { rows: readRows('dwExcaBody',  'flex')  },
      soil:  { rows: readRows('dwSoilBody',  'flex')  },
      shear: { rows: readRows('dwShearBody', 'shear') },
  };
}

// "⚙ Optimise segmentation & rebar" button.  Re-runs the optimal-
// partition optimiser using the CURRENT common-params inputs (so it
// respects any edits the user made to factor / amplifier / cover /
// Fy boundary / Fc / thickness), overwrites the excavation, soil and
// shear segment tables, auto-picks a passing temperature bar, then
// recomputes the check.
function runDiaphragmAutoDesign() {
  const env = resultData && resultData.envelope;
  if (!env || !window.WallCheckModule) return;
  const gi = getDiaphragmRebarInputs();
  const P = {
    b: 100,
    Fc:        gi.Fc || 280,
    thickness: gi.thickness_cm || 60,
    cover:     gi.cover_cm != null ? gi.cover_cm : 7.5,
    factor:    gi.factor || 1.6,
    amplifier: gi.amplifier || 1.25,
    fyBoundary: gi.fyBoundary || 'D19',
  };
  const M = WallCheckModule;
  let auto = null;
  try { auto = M.optimizeDiaphragmRebar(env, P, { maxSeg: 4, gridStep: 1, gamma: 0.10 }); } catch (e) {}
  if (!auto) { refreshCheckView(); return; }
  const setFlex = (id, arr) => {
    const b = document.getElementById(id);
    if (b && arr && arr.length) b.innerHTML = arr.map(s => dwFlexRowHtml(
      `${s.z0}~${s.z1}`, s.bar, String(s.spacing),
      s.bar2 || '', s.spacing2 ? String(s.spacing2) : String(s.spacing))).join('');
  };
  setFlex('dwExcaBody', auto.exca);
  setFlex('dwSoilBody', auto.soil);
  const shBody = document.getElementById('dwShearBody');
  if (shBody && auto.shear && auto.shear.length) {
    shBody.innerHTML = auto.shear.map(s =>
      dwShearRowHtml(`${s.z0}~${s.z1}`, s.bar, s.V, s.H)).join('');
  }
  if (auto.temp) {
    const tb = document.getElementById('selDwTempBar');
    const ts = document.getElementById('selDwTempSp');
    if (tb) tb.value = auto.temp.bar;
    if (ts) ts.value = auto.temp.spacing;
  }
  refreshCheckView();
}

// Renders the design result as text tables in the requested layout.
function buildDiaphragmResultHtml(design) {
  if (!design) return '';
  if (!design.ok) {
    return `<div class="sanity-banner"><h3>Rebar check unavailable</h3><div>${escapeHtml(design.error || 'No data.')}</div></div>`;
  }
  // PASS / FAIL to match the rest of the app's check terminology.
  const okTag = s => s ? '<span class="status-pass">PASS</span>' : '<span class="status-fail">FAIL</span>';
  const failWithReason = reason =>
    '<span class="status-fail">FAIL</span>' +
    (reason ? `<div style="font-size:10px;color:#9d1f1f;">${escapeHtml(reason)}</div>` : '');
  const cmp = (a, b) => a >= b ? '&gt;' : '&lt;';
  const spMm = sp => Math.round(Number(sp) * 10);   // cm → mm label (D19@300)
  const rng  = s => `z=${fmtNum(s.z0,1)}~${fmtNum(s.z1,1)}`;   // segment depth band
  const barLbl = s => `${escapeHtml(s.bar)}@${spMm(s.spacing)}` +
    (s.bar2 ? ` + ${escapeHtml(s.bar2)}@${spMm(s.spacing2)}` : '');

  function flexTable(title, segs) {
    let rows = segs.map(s => {
      // Result cell: PASS, or FAIL with the governing reason so the
      // user knows whether it failed on strength (φMn<Mu) or minimum
      // steel (As<As_min) — never a silent pass.
      const resultCell = s.status
        ? '<span class="status-pass">PASS</span>'
        : failWithReason(s.reason);
      return `<tr><td class="label">${rng(s)}&nbsp;&nbsp;${barLbl(s)}<br>
          <small>fy=${s.fy}</small></td>
        <td>${fmtNum(s.As_req,2)}</td><td>${fmtNum(s.As_min,2)}</td><td>${fmtNum(s.As,2)}</td>
        <td>${fmtNum(s.PhiMn,2)}</td><td class="center">${cmp(s.PhiMn,s.Mu)}</td>
        <td>${fmtNum(s.Mu,2)}</td><td class="center">${resultCell}</td></tr>`;
    }).join('');
    return `<table style="margin-top:4px;">
      <thead><tr><th class="label">${title}</th>
        <th>As_req<br><small>cm^2 (Mu)</small></th>
        <th>As_min<br><small>cm^2</small></th>
        <th>As<br><small>cm^2</small></th>
        <th>φMn<br><small>t-m/m</small></th><th></th><th>Mu<br><small>t-m/m</small></th>
        <th>Result</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  }

  const t = design.temperature;
  const tempHtml = `<table style="margin-top:4px;">
    <thead><tr><th class="label">Temperature steel</th><th>Required<br><small>cm^2</small></th>
      <th>Provided</th><th>As<br><small>cm^2</small></th><th>Result</th></tr></thead>
    <tbody><tr>
      <td class="label">ρ_t·b·t = 0.0025·100·${fmtNum(design.params.thickness,0)}</td>
      <td>${fmtNum(t.As_req,2)}</td>
      <td>${t.bar ? escapeHtml(t.bar)+'@'+spMm(t.spacing) : '-'}</td>
      <td>${fmtNum(t.As,2)}</td>
      <td class="center">${okTag(t.status)}</td>
    </tr></tbody></table>`;

  const shearRows = design.shear.map(s =>
    `<tr><td class="label">${rng(s)}&nbsp;&nbsp;${escapeHtml(s.bar)}@${spMm(s.V)}V${spMm(s.H)}H<br>
        <small>fys=${s.fys} · s_max=${fmtNum(s.smax,1)}cm · Av/s=${fmtNum(s.Avs,4)}≥${fmtNum(s.Avs_min,4)}</small></td>
      <td>${fmtNum(s.PhiVn,3)}</td><td class="center">${cmp(s.PhiVn,s.Vu)}</td>
      <td>${fmtNum(s.Vu,3)}</td><td class="center">${s.status ? '<span class="status-pass">PASS</span>' : failWithReason(s.reason)}</td></tr>`).join('');
  const shearHtml = `<table style="margin-top:4px;">
    <thead><tr><th class="label">Shear reinforcement</th>
      <th>φVn<br><small>t/m</small></th><th></th><th>Vu<br><small>t/m</small></th>
      <th>Result</th></tr></thead>
    <tbody>${shearRows}</tbody></table>`;

  const dsp = design.displacement;
  const dspHtml = `<table style="margin-top:4px;">
      <thead><tr><th class="label">Deflection</th><th>δ_max</th><th>Depth</th>
        <th>δ/H</th><th></th><th>Limit</th><th>Result</th></tr></thead>
      <tbody><tr>
        <td class="label">δ_max / H ≤ limit</td>
        <td>${fmtNum(dsp.max_cm,3)} cm</td>
        <td>${fmtNum(dsp.total_depth_m,2)} m</td>
        <td>${fmtNum(dsp.ratio,5)}</td>
        <td class="center">${cmp(dsp.ratio,dsp.limit)}</td>
        <td>${escapeHtml(dsp.limit_label || fmtNum(dsp.limit,5))}</td>
        <td class="center">${okTag(dsp.status)}</td>
      </tr></tbody></table>`;

  
    return `
      <h3 style="margin-top:10px;">Flexural Reinforcement Check</h3>
      ${flexTable('Excavation side', design.flexural.exca)}
      ${flexTable('Soil side',       design.flexural.soil)}
      ${tempHtml}
    <h3 style="margin-top:10px;">Shear Reinforcement Check</h3>
    ${shearHtml}
    <h3 style="margin-top:10px;">Displacement Check</h3>
    ${dspHtml}`;
}

function buildWallCheckTableHtml(wall) {
  if (!wall) return '';
  if (['diaphragm_wall','rc_pile_wall'].includes(wall.wall_type)) return '';
  if (wall.deferred && !wall.checks) return '';
  const c = wall.checks || {};
  let html = `<table>
    <thead>
      <tr><th class="label">Check Item</th><th>Design</th><th>Allowable</th><th>Result</th></tr>
    </thead>
    <tbody>
      <tr>
        <td class="label">Bending stress fb</td>
        <td>${fmtNum(c.fb_kg_cm2,2)} kg/cm^2</td>
        <td>${fmtNum(c.Fb_kg_cm2,2)} kg/cm^2</td>
        <td class="center">${fmtStatus(c.fb_ratio<=1?'PASS':'FAIL')}</td>
      </tr>
      <tr>
        <td class="label">Shear stress fv</td>
        <td>${fmtNum(c.fv_kg_cm2,2)} kg/cm^2</td>
        <td>${fmtNum(c.Fv_kg_cm2,2)} kg/cm^2</td>
        <td class="center">${fmtStatus(c.fv_ratio<=1?'PASS':'FAIL')}</td>
      </tr>
    </tbody>
  </table>`;
  return html;
}

function buildLaggingOutputHtml(lag) {
  if (!lag || !lag.checks) return '';
  const lc = lag.checks;
  return `<table>
    <thead>
      <tr><th class="label">Check Item</th><th>Design</th><th>Allowable</th><th>Result</th></tr>
    </thead>
    <tbody>
      <tr>
        <td class="label">Bending</td>
        <td>${fmtNum(lc.fb_kg_cm2,2)} kgf/cm^2</td>
        <td>${fmtNum(lc.Fb_allow_kg_cm2,2)} kgf/cm^2</td>
        <td class="center">${fmtStatus(lc.bending_status)}</td>
      </tr>
      <tr>
        <td class="label">Shear</td>
        <td>${fmtNum(lc.fv_kg_cm2,2)} kgf/cm^2</td>
        <td>${fmtNum(lc.Fv_allow_kg_cm2,2)} kgf/cm^2</td>
        <td class="center">${fmtStatus(lc.shear_status)}</td>
      </tr>
    </tbody>
  </table>`;
}

function buildLaggingFormulaHtml(lag) {
  if (!lag || !lag.checks) return '';
  const d = lag.demand || {}, s = lag.section || {}, i = lag.inputs || {}, c = lag.checks || {};
  return `<div>p_s = max(PRE_r) = ${fmtNum(d.ps_tf_m2,3)} tf/m^2</div>
    <div>u_d = Water Pressure Ratio * u_net = ${fmtNum(i.water_pressure_ratio,3)} * ${fmtNum(d.u_net_tf_m2,3)} = ${fmtNum(d.ud_tf_m2,3)} tf/m^2</div>
    <div>p = p_s + u_d = ${fmtNum(d.p_tf_m2,3)} tf/m^2</div>
    <div>L_eff = pile spacing - flange width = ${fmtNum(d.pile_spacing_m,3)} - ${fmtNum(d.flange_width_m,3)} = ${fmtNum(d.L_eff_m,3)} m</div>
    <div>w = p * h = ${fmtNum(d.p_tf_m2,3)} * ${fmtNum((i.h_cm || 0) / 100,3)} = ${fmtNum(d.w_tf_m,3)} tf/m</div>
    <div>M_max = w * L_eff^2 / 8 = ${fmtNum(d.Mmax_tf_m,4)} tf-m</div>
    <div>V_max = w * L_eff / 2 = ${fmtNum(d.Vmax_tf,4)} tf</div>
    <div>A = h * t = ${fmtNum(s.A_cm2,2)} cm^2</div>
    <div>S = h * t^2 / 6 = ${fmtNum(s.S_cm3,2)} cm^3</div>
    <div>fb = M / S = ${fmtNum(c.fb_kg_cm2,2)} kgf/cm^2</div>
    <div>fv = 1.5 * V / A = ${fmtNum(c.fv_kg_cm2,2)} kgf/cm^2</div>`;
}

function buildWallFormulaHtml(wall) {
  if (!wall || !wall.checks || !wall.material) return '';
  if (['diaphragm_wall','rc_pile_wall'].includes(wall.wall_type)) return '';
  const d = wall.demand, s = wall.section, m = wall.material, c = wall.checks;
  return `<div>fb = Mmax / (f * Zx)</div>
    <div>&nbsp;&nbsp;&nbsp;&nbsp;= ${fmtNum(d.Mmax_tf_m_per_m,3)} / (${fmtNum(m.f_factor,2)} * ${fmtNum(s.Z_cm3_per_m,2)} / 1000 * 100)</div>
    <div>&nbsp;&nbsp;&nbsp;&nbsp;= ${fmtNum(c.fb_kg_cm2,2)} kg/cm^2</div>
    <div style="margin-top:6px;">Fb = ${fmtNum(c.fb_factor!=null?c.fb_factor:0.6,2)} * Fy * STF = ${fmtNum(c.fb_factor!=null?c.fb_factor:0.6,2)} * ${fmtNum((c.Fy_kg_cm2||0)/1000,3)} * ${fmtNum(c.stf,2)} = ${fmtNum(c.Fb_kg_cm2,2)} kg/cm^2</div>
    <div style="margin-top:8px;">fv = Vmax * D / (f * Av)</div>
    <div>&nbsp;&nbsp;&nbsp;&nbsp;= ${fmtNum(d.Vmax_tf_per_m,3)} * (${fmtNum(s.D_cm,2)} / 100) / (${fmtNum(m.f_factor,2)} * ${fmtNum(s.Av_cm2_per_piece,2)}) * 1000</div>
    <div>&nbsp;&nbsp;&nbsp;&nbsp;= ${fmtNum(c.fv_kg_cm2,2)} kg/cm^2</div>
    <div style="margin-top:6px;">Fv = ${fmtNum(c.fv_factor!=null?c.fv_factor:0.4,2)} * Fy * STF = ${fmtNum(c.fv_factor!=null?c.fv_factor:0.4,2)} * ${fmtNum((c.Fy_kg_cm2||0)/1000,3)} * ${fmtNum(c.stf,2)} = ${fmtNum(c.Fv_kg_cm2,2)} kg/cm^2</div>`;
}

// RC pile wall: P–M interaction diagram (φMn x-axis, φPn y-axis) with
// the factored demand point.  Drawn into the moment-plot host.
function renderPilePmPlot(wall) {
  const host = document.getElementById('wallMomentPlot');
  if (!host) return;
  const dz = (lastPileDesign && lastPileDesign.ok) ? lastPileDesign : null;
  if (!dz) { host.innerHTML = ''; host.style.height = '0px'; return; }
  host.style.display = '';
  host.style.height = '420px';
  const traces = [
    { x: dz.pm.phiMn_tm, y: dz.pm.phiPn_tf, mode: 'lines+markers',
      name: 'φMn–φPn', line: { color: '#1f5fbf', width: 2 },
      marker: { size: 4 } },
    { x: [Math.abs(dz.demand.Mu_tm)], y: [Math.abs(dz.demand.Pu_tf)],
      mode: 'markers', name: 'Demand (Mu, Pu)',
      marker: { color: dz.main.status ? '#0b6d2a' : '#c0271c',
                size: 12, symbol: 'x' } },
  ];
  const layout = {
    title: { text: 'Pile P–M Interaction', font: { size: 14, color: '#223' } },
    margin: { l: 60, r: 20, t: 42, b: 46 },
    xaxis: { title: 'φMn (tf·m)', gridcolor: '#e3e7ee', rangemode: 'tozero' },
    yaxis: { title: 'φPn (tf)',   gridcolor: '#eef1f5', rangemode: 'tozero' },
    legend: { orientation: 'h', x: 0.5, y: -0.18, xanchor: 'center' },
    paper_bgcolor: '#fff', plot_bgcolor: '#fff',
  };
  Plotly.react(host, traces, layout, { responsive: true, displaylogo: false });
}

// RC pile wall: factored shear demand per pile vs depth, with the
// single-section φVn capacity drawn as ±dashed lines.
function renderPileShearPlot(wall) {
  const host = document.getElementById('wallShearPlot');
  if (!host) return;
  const d = (lastPileDesign && lastPileDesign.ok) ? lastPileDesign : null;
  const env = resultData && resultData.envelope;
  if (!d || !env || !Array.isArray(env.z) || !env.z.length) {
    host.innerHTML = ''; host.style.height = '0px'; return;
  }
  host.style.display = '';
  host.style.height = '420px';
  const z = env.z;
  const f = (d.params.factor / d.params.amplifier) * d.params.spacing_m;
  const vmin = (env.shear_min || z.map(() => 0)).map(v => v * f);
  const vmax = (env.shear_max || z.map(() => 0)).map(v => v * f);
  const phiVn = (d.shear && d.shear.phiVn_t) ? d.shear.phiVn_t : 0;
  const zTop = Math.min.apply(null, z), zBot = Math.max.apply(null, z);
  const traces = [
    { x: vmin, y: z, mode: 'lines', name: 'Vu',
      line: { color: '#1f5fbf', width: 2 } },
    { x: vmax, y: z, mode: 'lines', name: 'Vu', showlegend: false,
      line: { color: '#1f5fbf', width: 2 } },
    { x: [phiVn, phiVn], y: [zTop, zBot], mode: 'lines', name: 'φVn',
      line: { color: '#ff8c1a', width: 2, dash: 'dash' } },
    { x: [-phiVn, -phiVn], y: [zTop, zBot], mode: 'lines', name: 'φVn',
      showlegend: false, line: { color: '#ff8c1a', width: 2, dash: 'dash' } },
  ];
  const layout = {
    title: { text: 'Pile Shear (per pile)', font: { size: 14, color: '#223' } },
    margin: { l: 54, r: 24, t: 42, b: 44 },
    xaxis: { title: '[t]', zeroline: true, zerolinecolor: '#444', gridcolor: '#e3e7ee' },
    yaxis: { title: '[m]', autorange: 'reversed', gridcolor: '#eef1f5' },
    legend: { orientation: 'h', x: 0.5, y: -0.2, xanchor: 'center' },
    paper_bgcolor: '#fff', plot_bgcolor: '#fff',
  };
  Plotly.react(host, traces, layout, { responsive: true, displaylogo: false });
}

function renderWallMomentPlot(wall) {
  const host = document.getElementById('wallMomentPlot');
  if (!host) return;
  // RC pile wall uses its own P–M diagram, not the moment staircase.
  if (wall && wall.wall_type === 'rc_pile_wall') return;
  if (!wall || wall.wall_type !== 'diaphragm_wall' || !resultData) {
    host.innerHTML = '';
    host.style.height = '0px';
    return;
  }
  host.style.display = '';
  host.style.height = '420px';
  const env = resultData.envelope;
  if (!env || !Array.isArray(env.z) || !env.z.length) {
    host.innerHTML = '<em style="color:#888;">No envelope data.</em>';
    return;
  }
  // Prefer the design's factored envelope + φMn capacity lines when a
  // diaphragm-wall rebar design has been computed; otherwise fall back
  // to the raw (unfactored) envelope so the plot still shows something.
  const dz = (lastDiaphragmDesign && lastDiaphragmDesign.ok && lastDiaphragmDesign.plot)
             ? lastDiaphragmDesign.plot : null;
  const z      = dz ? dz.z       : env.z;
  const muExca = dz ? dz.mu_exca : (env.moment_min || z.map(() => 0));
  const muSoil = dz ? dz.mu_soil : (env.moment_max || z.map(() => 0));
  const traces = [
    {
      x: muExca, y: z, mode: 'lines+markers', name: 'Mu',
      line: { color: '#1f5fbf', width: 2 }, marker: { size: 3 }
    },
    {
      x: muSoil, y: z, mode: 'lines+markers', name: 'Mu',
      showlegend: false,
      line: { color: '#1f5fbf', width: 2 }, marker: { size: 3 }
    }
  ];
  const annotations = [];
  if (dz && dz.soil_segs && dz.exca_segs) {
    // φMn as a depth STEP function — each segment band gets its own
    // capacity, so different per-segment rebar shows as a staircase
    // (matching the 連續壁彎矩配筋圖 reference).  Build a poly-line that
    // is vertical within a band and jumps horizontally at the band
    // boundary; annotate each band with its bar@spacing.
    function stepTrace(segs, showLegend) {
      const xs = [], ys = [];
      segs.forEach(s => {
        xs.push(s.phiMn, s.phiMn);
        ys.push(s.z0,    s.z1);
        annotations.push({
          x: s.phiMn, y: (s.z0 + s.z1) / 2, text: s.label,
          showarrow: false, font: { size: 9, color: '#b35c00' },
          textangle: -90,
          xanchor: s.phiMn >= 0 ? 'left' : 'right', yanchor: 'middle',
          xshift: s.phiMn >= 0 ? 4 : -4,
        });
      });
      return {
        x: xs, y: ys, mode: 'lines', name: 'φMn',
        showlegend: showLegend,
        line: { color: '#ff8c1a', width: 2, shape: 'linear' },
      };
    }
    traces.push(stepTrace(dz.soil_segs, true));
    traces.push(stepTrace(dz.exca_segs, false));
  }
  const layout = {
    title: { text: 'Moment', font: { size: 14, color: '#223' } },
    margin: { l: 54, r: 24, t: 42, b: 44 },
    xaxis: { title: '[t-m]', zeroline: true, zerolinecolor: '#444', gridcolor: '#e3e7ee' },
    yaxis: { title: '[m]', autorange: 'reversed', gridcolor: '#eef1f5' },
    legend: { orientation: 'h', x: 0.5,  y: -0.2, xanchor: 'center' },
    annotations: annotations,
    paper_bgcolor: '#fff',
    plot_bgcolor: '#fff',
  };
  Plotly.react(host, traces, layout, { responsive: true, displaylogo: false });
}

// Shear envelope + φVn capacity, drawn exactly like the moment plot
// (mirrored ±φVn staircase, factored Vu envelope, per-segment label).
function renderWallShearPlot(wall) {
  const host = document.getElementById('wallShearPlot');
  if (!host) return;
  // RC pile wall has no shear staircase (shear is a single section
  // check shown in the result table) — keep this panel hidden.
  if (!wall || wall.wall_type !== 'diaphragm_wall' || !resultData) {
    host.innerHTML = '';
    host.style.height = '0px';
    return;
  }
  host.style.display = '';
  host.style.height = '420px';
  const env = resultData.envelope;
  if (!env || !Array.isArray(env.z) || !env.z.length) {
    host.innerHTML = '<em style="color:#888;">No envelope data.</em>';
    return;
  }
  const dz = (lastDiaphragmDesign && lastDiaphragmDesign.ok && lastDiaphragmDesign.plot)
             ? lastDiaphragmDesign.plot : null;
  const z     = dz ? dz.z      : env.z;
  const vuNeg = dz ? dz.vu_neg : (env.shear_min || z.map(() => 0));
  const vuPos = dz ? dz.vu_pos : (env.shear_max || z.map(() => 0));
  const traces = [
    { x: vuNeg, y: z, mode: 'lines+markers', name: 'Vu',
      line: { color: '#1f5fbf', width: 2 }, marker: { size: 3 } },
    { x: vuPos, y: z, mode: 'lines+markers', name: 'Vu', showlegend: false,
      line: { color: '#1f5fbf', width: 2 }, marker: { size: 3 } },
  ];
  const annotations = [];
  if (dz && dz.shear_pos && dz.shear_neg) {
    function stepTrace(segs, showLegend) {
      const xs = [], ys = [];
      segs.forEach(s => {
        xs.push(s.phiVn, s.phiVn);
        ys.push(s.z0,    s.z1);
        annotations.push({
          x: s.phiVn, y: (s.z0 + s.z1) / 2, text: s.label,
          showarrow: false, font: { size: 9, color: '#b35c00' },
          textangle: -90,
          xanchor: s.phiVn >= 0 ? 'left' : 'right', yanchor: 'middle',
          xshift: s.phiVn >= 0 ? 4 : -4,
        });
      });
      return {
        x: xs, y: ys, mode: 'lines', name: 'φVn',
        showlegend: showLegend,
        line: { color: '#ff8c1a', width: 2, shape: 'linear' },
      };
    }
    traces.push(stepTrace(dz.shear_pos, true));
    traces.push(stepTrace(dz.shear_neg, false));
  }
  const layout = {
    title: { text: 'Shear', font: { size: 14, color: '#223' } },
    margin: { l: 54, r: 24, t: 42, b: 44 },
    xaxis: { title: '[t]', zeroline: true, zerolinecolor: '#444', gridcolor: '#e3e7ee' },
    yaxis: { title: '[m]', autorange: 'reversed', gridcolor: '#eef1f5' },
    legend: { orientation: 'h', x: 0.5, y: -0.2, xanchor: 'center' },
    annotations: annotations,
    paper_bgcolor: '#fff',
    plot_bgcolor: '#fff',
  };
  Plotly.react(host, traces, layout, { responsive: true, displaylogo: false });
}

