(function () {
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;');
  }

  function installSimpleStageMaker(opts) {
    const {
      model,
      rerenderStages,
      wallTotalLength,
      getStrutLength,
      kFromStrutType,
      strutTypes,
    } = opts;

    function availableTypes() {
      return (strutTypes || []).filter(t => t && t.name && t.name !== 'Custom');
    }

    function supportTypeOptions(selected) {
      return [...availableTypes().map(t => t.name), 'User defined']
        .map(name => `<option value="${esc(name)}"${name === selected ? ' selected' : ''}>${esc(name)}</option>`)
        .join('');
    }

    function ensureModal() {
      if (document.getElementById('simpleStageMakerModal')) return;
      const wrapper = document.createElement('div');
      wrapper.innerHTML = `
        <div id="simpleStageMakerModal" class="modal-backdrop" aria-hidden="true">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="simpleStageMakerTitle" style="width:1060px;">
            <div class="modal-head">
              <div id="simpleStageMakerTitle" class="modal-title">Simple Stage Maker</div>
              <button class="modal-close" type="button" data-ssm-close="1">×</button>
            </div>
            <div class="modal-grid">
              <label for="ssmFinalDepth">Final excavation depth, z (m)</label>
              <input id="ssmFinalDepth" type="text" value="4.0">
              <label for="ssmGlobalMode">Mode</label>
              <div style="display:flex; flex-direction:column; gap:2px; font-size:12px; color:#334;">
                <select id="ssmGlobalMode" style="width:190px;">
                  <option value="symmetrical">Symmetrical</option>
                  <option value="non-symmetrical">Non-symmetrical</option>
                </select>
                <span style="font-size:10px; color:#778; line-height:1.4;">
                  Stage Builder creates excavation and support stages only. Use Simple WAT Designer for water pressure.
                </span>
              </div>
            </div>

            <div class="maker-supports">
              <table>
                <thead>
                  <tr>
                    <th style="width:44px;">ID</th>
                    <th style="width:92px;">Level z (m)</th>
                    <th style="width:88px;">Spacing S (m)</th>
                    <th style="width:78px;">Angle I (deg)</th>
                    <th style="width:170px;">H-steel</th>
                    <th style="width:82px;">theta (θs)</th>
                    <th style="width:66px;">Rs</th>
                    <th style="width:92px;">K (t/m)</th>
                    <th style="width:110px;">Preload F (T)</th>
                    <th style="width:56px;"></th>
                  </tr>
                </thead>
                <tbody id="ssmSupportRows"></tbody>
              </table>
            </div>
            <button class="add" type="button" id="ssmAddSupport">+ Support</button>

            <details class="maker-note" style="margin-top:10px; border:1px solid #ccd2d8; border-radius:6px; padding:8px 10px; background:#f8fafc;">
              <summary style="cursor:pointer; font-weight:700; color:#223;">Optional backfill / strut removal stages</summary>
              <div style="display:grid; grid-template-columns: 140px 210px 150px 1fr; gap:7px 12px; align-items:center; margin-top:8px;">
                <label for="ssmApplyBackfill">Apply backfills</label>
                <select id="ssmApplyBackfill" style="width:160px;">
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
                <label for="ssmRemoveStruts">Remove struts</label>
                <select id="ssmRemoveStruts" style="width:160px;">
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
                <label for="ssmBackfillMode">Backfill with</label>
                <select id="ssmBackfillMode" style="width:180px;">
                  <option value="original">Original soil</option>
                  <option value="specific">Specific soil</option>
                </select>
                <div id="ssmSpecificBackfillFields" style="display:none; grid-column: 3 / span 2;">
                  <label style="margin-right:8px;">c <input id="ssmBackfillC" type="text" value="0.0" style="width:80px;"></label>
                  <label>phi <input id="ssmBackfillPhi" type="text" value="30.0" style="width:80px;"></label>
                </div>
              </div>
              <div style="font-size:10px; color:#667; margin-top:6px; line-height:1.45;">
                Backfill stages are generated after the final excavation. If both options are enabled, backfill and strut removal are merged into the same stage.
              </div>
            </details>

            <div class="maker-note" style="margin-top:8px; line-height:1.55;">
              <div><b>Support stiffness</b></div>
              <div>Symmetrical: K = Es * As / L * 2 * Rs * cos^2(θs)</div>
              <div>Non-symmetrical: K = Es * As / L * Rs * cos^2(θs)</div>
              <div>Es = 2,100,000 kg/cm^2. As uses the selected H-steel area. Rs defaults to 0.5.</div>
              <div>To modify L, open Advanced and edit Strut L. If blank, L uses the full strut length (= W when analyzing L, = L when analyzing W).</div>
              <div>Support Check prefill fields are also inside Advanced.</div>
            </div>

            <div class="modal-actions">
              <button type="button" data-ssm-close="1">Cancel</button>
              <button type="button" id="ssmGenerate">Generate stages</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(wrapper.firstElementChild);

      const modal = document.getElementById('simpleStageMakerModal');
      modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.closest('[data-ssm-close="1"]')) closeSimpleStageMaker();
      });
      document.getElementById('ssmAddSupport').addEventListener('click', () => addSimpleSupportRow());
      document.getElementById('ssmGenerate').addEventListener('click', () => generateSimpleStages());
      document.getElementById('ssmGlobalMode').addEventListener('change', () => refreshAllSupportK());
      document.getElementById('ssmApplyBackfill').addEventListener('change', () => syncBackfillOptions());
      document.getElementById('ssmBackfillMode').addEventListener('change', () => syncBackfillOptions());
    }

    function format1(value, fallback) {
      const n = Number(value);
      return Number.isFinite(n) ? n.toFixed(1) : fallback;
    }

    function syncBackfillOptions() {
      const apply = document.getElementById('ssmApplyBackfill')?.value === 'yes';
      const mode = document.getElementById('ssmBackfillMode');
      const fields = document.getElementById('ssmSpecificBackfillFields');
      if (mode) mode.disabled = !apply;
      if (fields) fields.style.display = apply && mode && mode.value === 'specific' ? '' : 'none';
    }

    function renumberSupportRows() {
      // Only "main" rows are numbered — paired advanced rows live as
      // siblings in the same tbody but should not consume an ID slot.
      document.querySelectorAll('#ssmSupportRows tr[data-ssm-row="main"]').forEach((tr, idx) => {
        const cell = tr.querySelector('[data-ssm-id]');
        if (cell) cell.textContent = String(idx + 1);
      });
    }

    function defaultSupportZ() {
      const finalDepth = Number(document.getElementById('ssmFinalDepth')?.value);
      const rows = [...document.querySelectorAll('#ssmSupportRows tr[data-ssm-row="main"]')];
      if (!rows.length) return '1.0';
      const lastZ = Number(rows[rows.length - 1].querySelector('[data-ssm-z]')?.value);
      let nextZ = Number.isFinite(lastZ) ? lastZ + 2.0 : 1.0;
      if (Number.isFinite(finalDepth)) nextZ = Math.min(nextZ, Math.max(0, finalDepth - 1.0));
      return nextZ.toFixed(1);
    }

    function toggleSupportRowMode(tr) {
      const typeSel = tr.querySelector('[data-ssm-type]');
      const kInp = tr.querySelector('[data-ssm-k]');
      if (!typeSel || !kInp) return;
      const userMode = typeSel.value === 'User defined';
      const rsInp = tr.querySelector('[data-ssm-rs]');
      if (rsInp) rsInp.disabled = userMode;
      if (userMode) return;
      const k = computeSupportK(tr);
      if (k != null && Number.isFinite(k)) kInp.value = String(k);
    }

    function normalizedGlobalMode(value) {
      const v = String(value || '').toLowerCase();
      if (v === 'single' || v === 'custom' || v === 'non-symmetrical' || v === 'non_symmetric') {
        return 'non-symmetrical';
      }
      return 'symmetrical';
    }

    function globalSupportMode() {
      const sel = document.getElementById('ssmGlobalMode');
      return normalizedGlobalMode(sel && sel.value);
    }

    function modeMultiplier(mode) {
      return normalizedGlobalMode(mode) === 'symmetrical' ? 2 : 1;
    }

    function defaultStrutLength() {
      const span = Number(getStrutLength ? getStrutLength() : 0);
      return span > 0 ? span : 0;
    }

    function supportLengthForK(tr) {
      const raw = tr && tr._advTr
        ? Number(tr._advTr.querySelector('[data-ssm-strut-l]')?.value)
        : NaN;
      return raw > 0 ? raw : defaultStrutLength();
    }

    function computeSupportK(tr) {
      const typeName = String(tr.querySelector('[data-ssm-type]')?.value || '');
      if (typeName === 'User defined') return null;
      const L = supportLengthForK(tr);
      const rs = Number(tr.querySelector('[data-ssm-rs]')?.value);
      const thetaS = Number(tr.querySelector('[data-ssm-theta-s]')?.value);
      const multiplier = modeMultiplier(globalSupportMode());
      return kFromStrutType ? kFromStrutType(typeName, L, (Number.isFinite(rs) ? rs : 0.5) * multiplier, Number.isFinite(thetaS) ? thetaS : 0) : null;
    }

    function refreshSupportK(tr) {
      const kInp = tr.querySelector('[data-ssm-k]');
      const typeSel = tr.querySelector('[data-ssm-type]');
      if (!kInp || !typeSel || typeSel.value === 'User defined') return;
      const k = computeSupportK(tr);
      if (k != null && Number.isFinite(k)) kInp.value = String(k);
    }

    function refreshAllSupportK() {
      document.querySelectorAll('#ssmSupportRows tr[data-ssm-row="main"]').forEach(tr => refreshSupportK(tr));
    }

    // Section dropdown options for the advanced support-check row.
    // Built from STRUT_TYPES (the same H-section catalogue the rest of
    // the builder uses) so the values round-trip with the existing
    // *STRUT comment metadata.  The empty option means "use whatever
    // Result Check's default would be" — i.e. no prefill.
    function sectionOptions(selected) {
      const opts = ['<option value="">(default)</option>']
        .concat(availableTypes().map(t =>
          `<option value="${esc(t.name)}"${t.name === selected ? ' selected' : ''}>${esc(t.name)}</option>`));
      return opts.join('');
    }

    function buildAdvancedRow(sc) {
      const tr = document.createElement('tr');
      tr.dataset.ssmRow = 'adv';
      tr.style.display = 'none';
      const v = key => sc && sc[key] != null ? esc(String(sc[key])) : '';
      const whVal = sc && sc.wale_with_head === true  ? 'Y'
                  : sc && sc.wale_with_head === false ? 'N' : '';
      tr.innerHTML = `
        <td colspan="10" style="background:#f5f7fa;border-top:0;">
          <div style="display:grid; grid-template-columns: 120px 160px 160px 160px 90px; gap:7px 14px; padding:8px 10px;
                      font-size:11px; color:#334; align-items:end;">
            <label>Strut L (m)<br>
              <input data-ssm-strut-l type="text" class="wide" value="${v('strut_L')}" style="width:112px;"></label>
            <label>Wale section<br>
              <select data-ssm-sec-wale style="width:154px;">${sectionOptions(sc && sc.wale_section)}</select></label>
            <label>Angle section<br>
              <select data-ssm-sec-angle style="width:154px;">${sectionOptions(sc && sc.angle_section)}</select></label>
            <label>Brace section<br>
              <select data-ssm-sec-diag style="width:154px;">${sectionOptions(sc && sc.diagonal_section)}</select></label>
            <label>Head<br>
              <select data-ssm-with-head style="width:84px;">
                <option value=""${whVal === '' ? ' selected' : ''}>(default)</option>
                <option value="Y"${whVal === 'Y' ? ' selected' : ''}>Yes</option>
                <option value="N"${whVal === 'N' ? ' selected' : ''}>No</option>
              </select></label>
            <label>Angle s_a (m)<br>
              <input data-ssm-angle-sa type="text" class="wide" value="${v('angle_s_a')}" style="width:112px;"></label>
            <label>Angle θa (deg)<br>
              <input data-ssm-angle-theta type="text" class="wide" value="${v('angle_theta')}" style="width:112px;"></label>
            <label>Brace s_d (m)<br>
              <input data-ssm-brace-sd type="text" class="wide" value="${v('brace_s_d')}" style="width:112px;"></label>
            <label>Brace θd (deg)<br>
              <input data-ssm-brace-theta type="text" class="wide" value="${v('brace_theta')}" style="width:112px;"></label>
          </div>
        </td>`;
      return tr;
    }

    // Read the live advanced inputs from a paired advanced <tr>.  Only
    // non-empty / valid fields end up in the returned object so the
    // resulting .rio doesn't carry zero-filled junk.  Returns null when
    // nothing has been filled in.
    function readAdvancedRow(advTr) {
      if (!advTr) return null;
      const sc = {};
      const txt = sel => (advTr.querySelector(sel)?.value || '').trim();
      const num = sel => {
        const t = txt(sel);
        if (!t) return null;
        const n = Number(t);
        return Number.isFinite(n) ? n : null;
      };
      const wale  = txt('[data-ssm-sec-wale]');
      const angle = txt('[data-ssm-sec-angle]');
      const diag  = txt('[data-ssm-sec-diag]');
      if (wale)  sc.wale_section     = wale;
      if (angle) sc.angle_section    = angle;
      if (diag)  sc.diagonal_section = diag;
      // strut_section is not collected here — the main row's "Support
      // type" column already drives selStrutSection via the *STRUT
      // comment metadata.
      const wh = txt('[data-ssm-with-head]');
      if (wh === 'Y') sc.wale_with_head = true;
      else if (wh === 'N') sc.wale_with_head = false;
      const fields = [
        ['[data-ssm-strut-l]',     'strut_L'],
        ['[data-ssm-angle-sa]',    'angle_s_a'],
        ['[data-ssm-angle-theta]', 'angle_theta'],
        ['[data-ssm-brace-sd]',    'brace_s_d'],
        ['[data-ssm-brace-theta]', 'brace_theta'],
      ];
      for (const [sel, key] of fields) {
        const n = num(sel);
        if (n != null) sc[key] = n;
      }
      return Object.keys(sc).length ? sc : null;
    }

    function addSimpleSupportRow(data = {}) {
      ensureModal();
      const host = document.getElementById('ssmSupportRows');
      const selected = data.strut_type || availableTypes()[0]?.name || 'User defined';
      const thetaS = data.theta_s != null ? Number(data.theta_s) : 0;
      const rsValue = data.k_reduction != null ? Number(data.k_reduction) : 0.5;
      const tr = document.createElement('tr');
      tr.dataset.ssmRow = 'main';
      tr.innerHTML = `
        <td data-ssm-id></td>
        <td><input data-ssm-z type="text" value="${esc(data.z != null ? format1(data.z, '1.0') : defaultSupportZ())}" class="wide"></td>
        <td><input data-ssm-s type="text" value="${esc(data.S != null ? format1(data.S, '3.0') : '3.0')}" class="wide"></td>
        <td><input data-ssm-angle type="text" value="${esc(data.I != null ? format1(data.I, '0.0') : '0.0')}" class="wide"></td>
        <td><select data-ssm-type style="width:170px;">${supportTypeOptions(selected)}</select></td>
        <td><input data-ssm-theta-s type="text" value="${esc(Number.isFinite(thetaS) ? format1(thetaS, '0.0') : '0.0')}" class="wide"></td>
        <td><input data-ssm-rs type="text" value="${esc(Number.isFinite(rsValue) ? String(rsValue) : '0.5')}" style="width:48px;"></td>
        <td><input data-ssm-k type="text" value="${esc(data.kstrut != null ? String(data.kstrut) : '')}" class="wide"></td>
        <td><input data-ssm-f type="text" value="${esc(data.F != null ? format1(data.F, '-30.0') : '-30.0')}" class="wide"></td>
        <td style="white-space:nowrap;">
          <button class="tiny" type="button" data-ssm-adv title="Show / hide advanced support-check prefill">Adv ▾</button>
          <button class="tiny" type="button" data-ssm-remove>✕</button>
        </td>`;
      const advTr = buildAdvancedRow(data.support_check);
      tr._advTr = advTr;

      tr.querySelector('[data-ssm-adv]').addEventListener('click', () => {
        const isOpen = advTr.style.display !== 'none';
        advTr.style.display = isOpen ? 'none' : '';
        const btn = tr.querySelector('[data-ssm-adv]');
        if (btn) btn.textContent = isOpen ? 'Adv ▾' : 'Adv ▴';
      });
      tr.querySelector('[data-ssm-remove]').addEventListener('click', () => {
        tr.remove();
        advTr.remove();
        renumberSupportRows();
      });
      tr.querySelector('[data-ssm-type]').addEventListener('change', () => toggleSupportRowMode(tr));
      ['[data-ssm-theta-s]','[data-ssm-rs]'].forEach(sel => {
        tr.querySelector(sel)?.addEventListener('input', () => refreshSupportK(tr));
        tr.querySelector(sel)?.addEventListener('change', () => refreshSupportK(tr));
      });
      // Recalculate once the user edits the Advanced Strut L field; the
      // rest of Advanced is only prefill metadata for support checks.
      advTr.querySelector('[data-ssm-strut-l]')?.addEventListener('input', () => refreshSupportK(tr));
      advTr.querySelector('[data-ssm-strut-l]')?.addEventListener('change', () => refreshSupportK(tr));
      host.appendChild(tr);
      host.appendChild(advTr);                  // sits directly below the main row
      toggleSupportRowMode(tr);
      renumberSupportRows();
    }

    function seedPlanFromModel() {
      const stages = Array.isArray(model.stages) ? model.stages : [];
      let finalDepth = 0;
      const supports = [];
      stages.forEach(stage => {
        (stage.actions || []).forEach(action => {
          if (action.type === 'EXC') {
            const z = Number(action.Z1);
            if (Number.isFinite(z)) finalDepth = Math.max(finalDepth, z);
            return;
          }
          if (!['BUT', 'ANC'].includes(action.type) || Number(action.index) === 0) return;
          const kValue = Number(action.kstrut);
          const hasTypedSteel = action.strut_type
            && action.strut_type !== 'Custom'
            && action.strut_type !== 'User defined';
          const supportCheck = Object.assign({}, action.support_check || {});
          if (supportCheck.strut_L == null && Number(action.strut_L) > 0) {
            supportCheck.strut_L = Number(action.strut_L);
          }
          supports.push({
            z: Number(action.Z),
            S: Number(action.S),
            I: Number(action.I),
            F: Number(action.F),
            kstrut: Number.isFinite(kValue) ? kValue : '',
            strut_type: hasTypedSteel ? action.strut_type : 'User defined',
            support_mode: action.support_mode || action.strut_L_mode || 'symmetrical',
            theta_s: Number.isFinite(Number(action.theta_s)) ? Number(action.theta_s) : 0,
            k_reduction: Number.isFinite(Number(action.k_reduction)) ? Number(action.k_reduction) : 0.5,
            support_check: Object.keys(supportCheck).length ? supportCheck : null,
          });
        });
      });
      supports.sort((a, b) => a.z - b.z);
      return { finalDepth, supports };
    }

    function seedRowsFromModel() {
      ensureModal();
      const seed = seedPlanFromModel();
      const modeEl = document.getElementById('ssmGlobalMode');
      if (modeEl) {
        modeEl.value = seed.supports.length
          ? normalizedGlobalMode(seed.supports[0].support_mode)
          : 'symmetrical';
      }
      const finalEl = document.getElementById('ssmFinalDepth');
      if (finalEl) {
        finalEl.value = seed.finalDepth > 0 ? format1(seed.finalDepth, '4.0') : '4.0';
      }
      const rows = document.getElementById('ssmSupportRows');
      if (rows) rows.innerHTML = '';
      if (seed.supports.length) {
        seed.supports.forEach(addSimpleSupportRow);
      } else {
        addSimpleSupportRow({ z: 1.0, S: 3.0, I: 0.0, F: -30.0, strut_type: availableTypes()[0]?.name || '' });
      }
      const applyBackfill = document.getElementById('ssmApplyBackfill');
      const removeStruts = document.getElementById('ssmRemoveStruts');
      const backfillMode = document.getElementById('ssmBackfillMode');
      if (applyBackfill) applyBackfill.value = 'no';
      if (removeStruts) removeStruts.value = 'no';
      if (backfillMode) backfillMode.value = 'original';
      syncBackfillOptions();
    }

    function simpleStageMakerPlan() {
      const finalDepth = Number(document.getElementById('ssmFinalDepth')?.value);
      const mode = globalSupportMode();
      const rows = [...document.querySelectorAll('#ssmSupportRows tr[data-ssm-row="main"]')].map(tr => {
        const preloadText = tr.querySelector('[data-ssm-f]')?.value.trim() || '';
        const kText = tr.querySelector('[data-ssm-k]')?.value.trim() || '';
        const thetaS = Number(tr.querySelector('[data-ssm-theta-s]')?.value);
        const supportCheck = readAdvancedRow(tr._advTr);
        const lValue = supportCheck && Number.isFinite(Number(supportCheck.strut_L))
          ? Number(supportCheck.strut_L)
          : null;
        const rsValue = Number(tr.querySelector('[data-ssm-rs]')?.value);
        return {
          z: Number(tr.querySelector('[data-ssm-z]')?.value),
          S: Number(tr.querySelector('[data-ssm-s]')?.value),
          I: Number(tr.querySelector('[data-ssm-angle]')?.value),
          strut_type: String(tr.querySelector('[data-ssm-type]')?.value || ''),
          kstrut_user: String(tr.querySelector('[data-ssm-type]')?.value || '') === 'User defined' && kText !== ''
            ? Number(kText)
            : null,
          support_mode: mode,
          theta_s: Number.isFinite(thetaS) ? thetaS : 0,
          strut_L: Number.isFinite(lValue) && lValue > 0 ? lValue : null,
          k_reduction: Number.isFinite(rsValue) ? rsValue : 0.5,
          F: Number(preloadText),
          support_check: supportCheck,
        };
      }).filter(r =>
        Number.isFinite(r.z) && r.z > 0 &&
        Number.isFinite(r.S) && r.S > 0 &&
        Number.isFinite(r.I) &&
        r.strut_type &&
        (r.strut_type !== 'User defined' || Number.isFinite(r.kstrut_user))
      );
      rows.sort((a, b) => a.z - b.z);
      return {
        finalDepth,
        supports: rows,
        post: {
          applyBackfill: document.getElementById('ssmApplyBackfill')?.value === 'yes',
          removeStruts: document.getElementById('ssmRemoveStruts')?.value === 'yes',
          backfillMode: document.getElementById('ssmBackfillMode')?.value === 'specific' ? 'specific' : 'original',
          specificC: Number(document.getElementById('ssmBackfillC')?.value),
          specificPhi: Number(document.getElementById('ssmBackfillPhi')?.value),
        },
      };
    }

    function coeffsFromPhi(phiDeg) {
      const phi = Number(phiDeg);
      if (!Number.isFinite(phi)) return { K0: 0.5, Ka: 0.333, Kp: 3.0 };
      const s = Math.sin(phi * Math.PI / 180);
      if (Math.abs(1 + s) < 1e-9 || Math.abs(1 - s) < 1e-9) return { K0: 1, Ka: 1, Kp: 1 };
      return {
        K0: Math.max(0, 1 - s),
        Ka: (1 - s) / (1 + s),
        Kp: (1 + s) / (1 - s),
      };
    }

    function layerSegmentsBetween(deep, shallow) {
      const zDeep = Number(deep);
      const zShallow = Math.max(0, Number(shallow));
      if (!(zDeep > zShallow)) return [];
      const cuts = new Set([zDeep, zShallow]);
      (model.layers || []).forEach(layer => {
        const d = Number(layer && layer.depth);
        if (Number.isFinite(d) && d > zShallow + 1e-6 && d < zDeep - 1e-6) cuts.add(d);
      });
      const zs = [...cuts].sort((a, b) => b - a);
      const segments = [];
      for (let i = 0; i < zs.length - 1; i += 1) {
        segments.push({ bottom: zs[i], top: zs[i + 1] });
      }
      return segments;
    }

    function soilLayerAt(depth) {
      const z = Number(depth);
      let top = 0;
      for (const layer of (model.layers || [])) {
        const bottom = Number(layer && layer.depth);
        if (Number.isFinite(bottom) && z >= top - 1e-6 && z <= bottom + 1e-6) return layer;
        if (Number.isFinite(bottom)) top = bottom;
      }
      return (model.layers || [])[Math.max(0, (model.layers || []).length - 1)] || {};
    }

    function backfillActionForSegment(segment, plan) {
      const layer = soilLayerAt((segment.top + segment.bottom) / 2);
      const specific = plan.post.backfillMode === 'specific';
      const phi = specific && Number.isFinite(plan.post.specificPhi) ? plan.post.specificPhi : Number(layer.phi);
      const c = specific && Number.isFinite(plan.post.specificC) ? plan.post.specificC : Number(layer.c);
      const coeffs = specific ? coeffsFromPhi(phi) : {
        Ka: Number(layer.Ka),
        K0: Number(layer.K0),
        Kp: Number(layer.Kp),
      };
      return {
        type: 'BAC',
        side: 2,
        Z1: segment.top,
        Z2: segment.bottom,
        c: Number.isFinite(c) ? c : 0,
        phi: Number.isFinite(phi) ? phi : 30,
        UW: Number.isFinite(Number(layer.gamma)) ? Number(layer.gamma) : 1.9,
        Ka: Number.isFinite(coeffs.Ka) ? coeffs.Ka : 0.333,
        K0: Number.isFinite(coeffs.K0) ? coeffs.K0 : 0.5,
        Kp: Number.isFinite(coeffs.Kp) ? coeffs.Kp : 3.0,
        kh: Number.isFinite(Number(layer.kh)) ? Number(layer.kh) : 1000,
      };
    }

    function appendBackfillAndRemovalStages(stages, plan, installedSupports) {
      const post = plan.post || {};
      if (!post.applyBackfill && !post.removeStruts) return;
      const supports = installedSupports.slice().sort((a, b) => b.z - a.z);
      let currentBackfillDepth = plan.finalDepth;
      const targets = post.applyBackfill
        ? supports.map(s => Math.max(0, s.z)).concat([0])
        : supports.map(s => Math.max(0, s.z));

      targets.forEach((target, idx) => {
        const actions = [];
        if (post.applyBackfill && currentBackfillDepth > target + 1e-6) {
          layerSegmentsBetween(currentBackfillDepth, target).forEach(segment => {
            actions.push(backfillActionForSegment(segment, plan));
          });
          currentBackfillDepth = target;
        }
        if (post.removeStruts && idx < supports.length) {
          actions.push({ type: 'BUT', index: 0, sub_index: supports[idx].id });
        }
        if (actions.length) {
          actions.push({ type: 'CAL', paren: '1' });
          stages.push({ actions });
        }
      });
    }

    function generateSimpleStages() {
      const plan = simpleStageMakerPlan();
      if (!(plan.finalDepth > 0)) {
        alert('Please enter a valid final excavation depth.');
        return;
      }
      if (plan.post.applyBackfill && plan.post.backfillMode === 'specific'
          && (!Number.isFinite(plan.post.specificC) || !Number.isFinite(plan.post.specificPhi))) {
        alert('Please enter valid c and phi values for specific backfill.');
        return;
      }
      if (plan.post.removeStruts && !plan.supports.length) {
        alert('No supports are defined, so there are no struts to remove.');
        return;
      }

      const stages = [];
      const installedSupports = [];
      let currentExc = 0;
      let supportId = 1;
      for (const s of plan.supports.filter(x => x.z <= plan.finalDepth + 1e-6)) {
        const targetExc = Math.min(plan.finalDepth, s.z + 0.7);
        if (targetExc > currentExc + 1e-6) {
          const stage = {
            actions: [
              { type: 'EXC', side: 2, Z1: targetExc, berm: false, Z2: 5.0, A: 1.0, B: 3.0 },
              { type: 'CAL', paren: '0' },
            ],
          };
          stages.push(stage);
          currentExc = targetExc;
        }

        const kLength = s.strut_L || defaultStrutLength();
        const kMultiplier = modeMultiplier(s.support_mode);
        const k = Number.isFinite(s.kstrut_user)
          ? s.kstrut_user
          : (kFromStrutType ? kFromStrutType(s.strut_type, kLength, s.k_reduction * kMultiplier, s.theta_s) : null);
        const butAct = {
          type: 'BUT',
          index: supportId,
          Z: s.z,
          S: s.S,
          I: Number.isFinite(s.I) ? s.I : 0,
          F: Number.isFinite(s.F) ? s.F : -30,
          kstrut: k != null ? k : 0,
          strut_type: s.strut_type,
          support_mode: s.support_mode,
          theta_s: s.theta_s,
          strut_L: kLength,
          k_reduction: s.k_reduction,
        };
        // Carry the advanced Support Check prefill through to the BUT
        // action so .rio export (and ultimately Result Check) can pick
        // it up.  Only attached when the user actually filled in at
        // least one advanced field — keeps the model object clean.
        if (s.support_check && Object.keys(s.support_check).length) {
          butAct.support_check = s.support_check;
        }
        installedSupports.push({ id: supportId, z: s.z });
        stages.push({
          actions: [butAct, { type: 'CAL', paren: '0' }],
        });
        supportId += 1;
      }

      if (plan.finalDepth > currentExc + 1e-6) {
        const stage = {
          actions: [
            { type: 'EXC', side: 2, Z1: plan.finalDepth, berm: false, Z2: 5.0, A: 1.0, B: 3.0 },
            { type: 'CAL', paren: '0' },
          ],
        };
        stages.push(stage);
      }

      appendBackfillAndRemovalStages(stages, plan, installedSupports);
      stages.push({ actions: [{ type: 'ENV' }] });
      if (model.stagesByDir) {
        const dir = model.stageTargetDir === 'W' ? 'W' : 'L';
        model.stagesByDir[dir] = stages;
      }
      model.stages = stages;
      rerenderStages();
      closeSimpleStageMaker();
    }

    function openSimpleStageMaker() {
      ensureModal();
      const modal = document.getElementById('simpleStageMakerModal');
      seedRowsFromModel();
      modal.classList.add('show');
      modal.setAttribute('aria-hidden', 'false');
      modal.style.display = 'flex';
      modal.style.zIndex = '9000';
    }

    function closeSimpleStageMaker() {
      const modal = document.getElementById('simpleStageMakerModal');
      if (!modal) return;
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden', 'true');
      modal.style.display = 'none';
    }

    ensureModal();
    window.openSimpleStageMaker = openSimpleStageMaker;
    window.closeSimpleStageMaker = closeSimpleStageMaker;
    window.addSimpleSupportRow = addSimpleSupportRow;
    window.generateSimpleStages = generateSimpleStages;
  }

  window.installSimpleStageMaker = installSimpleStageMaker;
})();
