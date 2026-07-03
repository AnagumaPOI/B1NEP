// Simple Wall Builder
//
// One-click wall-section generator for the Site pane.  The user picks a
// wall family (soldier pile / sheet pile / diaphragm wall), a section,
// and (for soldier pile) a spacing; the module then writes a single
// segment into `model.wall.sections` with depth = L and EI computed
// from the catalog entry.
//
// Exposed as:
//   window.installSimpleWallBuilder({ model, rerenderWallSections })
//     → returns { openModal, closeModal }
//   builder.html wires the toolbar button to `openSimpleWallBuilder()`
//   which the inline builder script binds to `openModal()` once the
//   factory has been installed.
//
// Catalog values come from the in-house wall-screening dataset; they
// match what wallcheck.js advertises in the results page's Wall Check
// section, with the addition of R50 / R37 rail piles (mapped from the
// steel-lagging "50kgN @ 40 cm" / "37kgA @ 40 cm" entries).

(function () {
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // I in cm^4 (per piece for soldier pile / per metre for sheet pile);
  // E in tf/m^2 (steel 2.1e7 nominal, RC concrete 2.1e6 nominal).
  const WALL_PRESETS = {
    soldier_pile: {
      label: 'Soldier Pile (steel H / rail)',
      needsSpacing: true,
      defaultSpacing: 0.7,                                // metres
      sections: {
        'H350': { I_cm4_per_piece: 40300, E_tf_m2: 2.1e7, hint: 'H 350×350×12×19' },
        'H300': { I_cm4_per_piece: 20400, E_tf_m2: 2.1e7, hint: 'H 300×300×10×15' },
        'R50':  { I_cm4_per_piece:  1960, E_tf_m2: 2.1e7, hint: '50kgN rail'      },
        'R37':  { I_cm4_per_piece:   952, E_tf_m2: 2.1e7, hint: '37kgA rail'      },
      },
    },
    sheet_pile: {
      label: 'Sheet Pile',
      needsSpacing: false,
      sections: {
        'SP-III': { I_cm4_per_m: 16800, E_tf_m2: 2.1e7 },
        'SP-IV':  { I_cm4_per_m: 38600, E_tf_m2: 2.1e7 },
      },
    },
    // Diaphragm wall (RC): thickness is a free user input (not limited
    // to preset 60/80/100 cm); fc is a live input for the concrete grade.
    //   E         = 12000·√fc           (fc, E both in kgf/cm²; ×10 to tf/m²)
    //   I_per_m   = (1/12) · t_m³       (1 m wide strip)
    //   EI_per_m  = E · I_per_m
    diaphragm_wall: {
      label: 'Diaphragm Wall (RC)',
      needsSpacing: false,
      needsFc: true,
      needsThickness: true,
      defaultThickness_cm: 80,
      defaultFc_kgf_cm2: 280,
      sections: {},                   // user enters thickness directly
    },
    // RC pile wall: a single row of cast-in-place piles, fully
    // user-parameterised — no preset sections.  The user enters fc, the
    // pile diameter, and centre-to-centre spacing; computeEI() forms
    //   I_per_pile = π·D⁴ / 64           (per pile, m⁴)
    //   E          = 12000·√fc           (same formula as diaphragm)
    //   EI_per_m   = E · I_per_pile / spacing
    rc_pile_wall: {
      label: 'RC Pile Wall (cast-in-place piles, single row)',
      needsSpacing: true,
      needsFc: true,
      needsDiameter: true,
      defaultSpacing: 1.0,            // metres centre-to-centre
      defaultDiameter_cm: 80,
      defaultFc_kgf_cm2: 280,
      sections: {},                   // no preset sections; UI hides the picker
    },
  };

  // Returns EI in tf·m²/m.  `sec` is a section OBJECT (not a name) so
  // user-parameterised families (RC pile wall) can pass live inputs
  // directly instead of having to dummy-up a preset.  Returns 0 on any
  // invalid input so callers can surface a friendly alert instead of
  // writing junk into the model.
  function computeEI(wallType, sec, spacing_m) {
    if (!sec) return 0;
    let I_m4_per_m = 0;
    // E source: a live `fc_kgf_cm2` (E = 12000·√fc · 10) takes precedence
    // over any baked-in `E_tf_m2` preset.  This lets diaphragm walls and
    // RC pile walls share the same code path while keeping the legacy
    // steel families on their fixed E.
    let E_tf_m2 = Number(sec.E_tf_m2) || 0;
    if (Number(sec.fc_kgf_cm2) > 0) {
      E_tf_m2 = 12000.0 * Math.sqrt(Number(sec.fc_kgf_cm2)) * 10.0;
    }
    if (wallType === 'soldier_pile') {
      if (!(spacing_m > 0)) return 0;
      I_m4_per_m = (Number(sec.I_cm4_per_piece) / spacing_m) / 1e8;   // cm^4/m → m^4/m
    } else if (wallType === 'sheet_pile') {
      I_m4_per_m = Number(sec.I_cm4_per_m) / 1e8;
    } else if (wallType === 'diaphragm_wall') {
      const t = Number(sec.thickness_cm) / 100.0;                     // cm → m
      I_m4_per_m = Math.pow(t, 3) / 12.0;                              // b=1m strip
    } else if (wallType === 'rc_pile_wall') {
      if (!(spacing_m > 0)) return 0;
      const D_cm = Number(sec.diameter_cm);
      if (!(D_cm > 0)) return 0;
      const D_m  = D_cm / 100.0;
      const I_per_pile = Math.PI * Math.pow(D_m, 4) / 64.0;            // m^4 per pile
      I_m4_per_m = I_per_pile / spacing_m;
    }
    if (!(E_tf_m2 > 0)) return 0;
    return E_tf_m2 * I_m4_per_m;
  }

  function installSimpleWallBuilder(opts) {
    const { model, rerenderWallSections } = opts || {};

    function ensureModal() {
      if (document.getElementById('simpleWallBuilderModal')) return;
      const familyOptions = Object.entries(WALL_PRESETS)
        .map(([k, v]) => `<option value="${esc(k)}">${esc(v.label)}</option>`)
        .join('');
      const wrapper = document.createElement('div');
      wrapper.innerHTML = `
        <div id="simpleWallBuilderModal" class="modal-backdrop" aria-hidden="true">
          <div class="modal-card" role="dialog" aria-modal="true"
               aria-labelledby="swbTitle" style="width:520px;">
            <div class="modal-head">
              <div id="swbTitle" class="modal-title">Simple Wall Builder</div>
              <button class="modal-close" type="button" data-swb-close="1">×</button>
            </div>
            <div class="modal-grid">
              <label for="swbLength">Wall length (m)</label>
              <input id="swbLength" type="text" value="10.0">
              <label for="swbFamily">Wall type</label>
              <select id="swbFamily">${familyOptions}</select>
              <label id="swbSectionLabel" for="swbSection">Section</label>
              <select id="swbSection"></select>
              <label id="swbDiameterLabel" for="swbDiameter">Pile diameter, D (cm)</label>
              <input id="swbDiameter" type="text" value="80">
              <label id="swbThicknessLabel" for="swbThickness">Wall thickness, t (cm)</label>
              <input id="swbThickness" type="text" value="80">
              <label id="swbFcLabel" for="swbFc">Concrete fc (kgf/cm²)</label>
              <input id="swbFc" type="text" value="280">
              <label id="swbSpacingLabel" for="swbSpacing">Spacing (m)</label>
              <input id="swbSpacing" type="text" value="0.7">
              <label for="swbKEI">Stiffness reduction factor</label>
              <input id="swbKEI" type="text" value="0.6">
            </div>
            <div class="maker-note" id="swbPreview"></div>
            <div class="modal-actions">
              <button type="button" data-swb-close="1">Cancel</button>
              <button type="button" id="swbGenerate">Generate wall</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(wrapper.firstElementChild);

      const modal = document.getElementById('simpleWallBuilderModal');
      modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.closest('[data-swb-close="1"]')) closeModal();
      });
      document.getElementById('swbFamily').addEventListener('change', () => { syncSection(); syncPreview(); });
      document.getElementById('swbSection').addEventListener('change', syncPreview);
      document.getElementById('swbSpacing').addEventListener('input',  syncPreview);
      document.getElementById('swbLength').addEventListener('input',   syncPreview);
      document.getElementById('swbKEI').addEventListener('input',      syncPreview);
      document.getElementById('swbDiameter').addEventListener('input', syncPreview);
      document.getElementById('swbThickness').addEventListener('input', syncPreview);
      document.getElementById('swbFc').addEventListener('input',       syncPreview);
      document.getElementById('swbGenerate').addEventListener('click', generateWall);
      syncSection();
      syncPreview();
    }

    function currentFamily() {
      return document.getElementById('swbFamily').value;
    }

    function setRowVisible(labelId, inputId, show) {
      const lab = document.getElementById(labelId);
      const inp = document.getElementById(inputId);
      if (lab) lab.style.display = show ? '' : 'none';
      if (inp) inp.style.display = show ? '' : 'none';
    }

    function syncSection() {
      const fam = WALL_PRESETS[currentFamily()];
      const sel = document.getElementById('swbSection');
      // Section dropdown is meaningful only when the family has presets
      // (everyone except RC pile wall, which is fully user-parameterised).
      const hasPresets = fam && fam.sections && Object.keys(fam.sections).length > 0;
      setRowVisible('swbSectionLabel', 'swbSection', hasPresets);
      if (hasPresets) {
        sel.innerHTML = Object.keys(fam.sections).map(k => {
          const hint = fam.sections[k].hint ? ' (' + esc(fam.sections[k].hint) + ')' : '';
          return `<option value="${esc(k)}">${esc(k)}${hint}</option>`;
        }).join('');
      } else {
        sel.innerHTML = '';
      }
      // Diameter row: RC pile wall only.
      const wantD = !!fam.needsDiameter;
      setRowVisible('swbDiameterLabel', 'swbDiameter', wantD);
      if (wantD) {
        const dInp = document.getElementById('swbDiameter');
        if (fam.defaultDiameter_cm != null && (!dInp.value || isNaN(parseFloat(dInp.value)))) {
          dInp.value = String(fam.defaultDiameter_cm);
        }
      }
      // Thickness row: diaphragm wall only (free user input).
      const wantT = !!fam.needsThickness;
      setRowVisible('swbThicknessLabel', 'swbThickness', wantT);
      if (wantT) {
        const tInp = document.getElementById('swbThickness');
        if (fam.defaultThickness_cm != null && (!tInp.value || isNaN(parseFloat(tInp.value)))) {
          tInp.value = String(fam.defaultThickness_cm);
        }
      }
      // fc row: diaphragm wall AND RC pile wall.
      const wantFc = !!fam.needsFc;
      setRowVisible('swbFcLabel', 'swbFc', wantFc);
      if (wantFc) {
        const fInp = document.getElementById('swbFc');
        if (fam.defaultFc_kgf_cm2 != null && (!fInp.value || isNaN(parseFloat(fInp.value)))) {
          fInp.value = String(fam.defaultFc_kgf_cm2);
        }
      }
      // Spacing row visibility.
      const wantSpacing = !!fam.needsSpacing;
      setRowVisible('swbSpacingLabel', 'swbSpacing', wantSpacing);
      const spInput = document.getElementById('swbSpacing');
      if (wantSpacing && fam.defaultSpacing != null && (!spInput.value || isNaN(parseFloat(spInput.value)))) {
        spInput.value = String(fam.defaultSpacing);
      }
    }

    function readForm() {
      const L       = parseFloat(document.getElementById('swbLength').value);
      const family  = currentFamily();
      const fam     = WALL_PRESETS[family];
      const section = document.getElementById('swbSection').value;
      const spacing = parseFloat(document.getElementById('swbSpacing').value);
      // Resolve the section OBJECT computeEI works on.  Start from the
      // preset (if any), then layer the live RC inputs on top so the
      // same code path serves all four families:
      //   soldier_pile  : preset only
      //   sheet_pile    : preset only
      //   diaphragm_wall: preset (thickness)  +  live fc
      //   rc_pile_wall  : nothing             +  live diameter + live fc
      let sectionObj = null;
      if (fam) {
        const preset = fam.sections[section] || null;
        sectionObj = preset ? Object.assign({}, preset) : {};
        if (fam.needsDiameter) {
          sectionObj.diameter_cm = parseFloat(document.getElementById('swbDiameter').value);
        }
        if (fam.needsThickness) {
          sectionObj.thickness_cm = parseFloat(document.getElementById('swbThickness').value);
        }
        if (fam.needsFc) {
          sectionObj.fc_kgf_cm2  = parseFloat(document.getElementById('swbFc').value);
        }
      }
      // Clamp the stiffness factor to (0, 1] — defaulting to 0.6 if the
      // user leaves it blank / invalid.  This factor only lives inside
      // this popup; the rest of the app sees the already-reduced EI.
      let kEI = parseFloat(document.getElementById('swbKEI').value);
      if (!isFinite(kEI) || kEI <= 0) kEI = 0.6;
      if (kEI > 1) kEI = 1.0;
      return { L, family, section, sectionObj, spacing, kEI };
    }

    function syncPreview() {
      const { L, family, sectionObj, spacing, kEI } = readForm();
      const fam = WALL_PRESETS[family];
      const sp = fam && fam.needsSpacing ? spacing : null;
      const EIraw     = computeEI(family, sectionObj, sp);
      const EIreduced = EIraw * kEI;
      const parts = [];
      parts.push(`L = ${isFinite(L) ? L.toFixed(2) : '?'} m`);
      parts.push(`EI = ${EIreduced > 0 ? Math.round(EIreduced).toLocaleString() : '?'} tf·m²/m`);
      parts.push(`(EI₀ × k = ${EIraw > 0 ? Math.round(EIraw).toLocaleString() : '?'} × ${kEI.toFixed(2)})`);
      if (fam && sectionObj && fam.needsDiameter && isFinite(sectionObj.diameter_cm)) {
        parts.push(`D = ${sectionObj.diameter_cm.toFixed(1)} cm`);
      }
      if (fam && sectionObj && fam.needsThickness && isFinite(sectionObj.thickness_cm)) {
        parts.push(`t = ${sectionObj.thickness_cm.toFixed(1)} cm`);
      }
      if (fam && sectionObj && fam.needsFc && isFinite(sectionObj.fc_kgf_cm2)) {
        parts.push(`fc = ${sectionObj.fc_kgf_cm2.toFixed(0)} kgf/cm²`);
      }
      if (fam && fam.needsSpacing) parts.push(`spacing = ${isFinite(sp) ? sp.toFixed(2) : '?'} m`);
      const el = document.getElementById('swbPreview');
      if (el) {
        el.textContent =
          'Will replace wall sections with one segment: ' + parts.join(', ') +
          '.  Existing custom sections in the Site pane will be overwritten.';
      }
    }

    function generateWall() {
      const { L, family, section, sectionObj, spacing, kEI } = readForm();
      if (!(L > 0)) { alert('Wall length must be greater than 0.'); return; }
      const fam = WALL_PRESETS[family];
      if (!fam) { alert('Pick a wall type.'); return; }
      if (!sectionObj) { alert('Pick a wall section.'); return; }
      // Per-family input sanity — separated flags so families that need
      // just fc (diaphragm wall) don't also demand a diameter.
      if (fam.needsDiameter && !(sectionObj.diameter_cm > 0)) {
        alert('Pile diameter must be greater than 0.'); return;
      }
      if (fam.needsThickness && !(sectionObj.thickness_cm > 0)) {
        alert('Wall thickness must be greater than 0.'); return;
      }
      if (fam.needsFc && !(sectionObj.fc_kgf_cm2 > 0)) {
        alert('Concrete fc must be greater than 0.'); return;
      }
      const sp = fam.needsSpacing ? spacing : null;
      if (fam.needsSpacing && !(sp > 0)) { alert('Spacing must be greater than 0 for ' + fam.label + '.'); return; }
      const EIraw = computeEI(family, sectionObj, sp);
      if (!(EIraw > 0)) { alert('Computed EI is zero — check the inputs.'); return; }
      // Apply the user-chosen stiffness reduction factor right here, so
      // the value persisted into model.wall.sections is the as-analyzed
      // EI — every downstream consumer (FEM, .rio export, ...) just
      // reads it verbatim.  The Site pane's "+ Section" workflow can
      // still split this segment afterwards for depth-varying stiffness.
      const EI = EIraw * kEI;
      model.wall.sections = [{ depth: Number(L), EI: Math.round(EI) }];
      // Stash the choices so Wall Check (results.html) can prefill its
      // inputs from them.  Only fields the family actually uses are
      // carried — empty ones stay undefined.  The whole object is
      // round-tripped through .rio as a `*WALLBUILDER {...}` comment.
      const meta = { type: family, kEI };
      if (sectionObj && sectionObj.diameter_cm  > 0) meta.diameter_cm  = Number(sectionObj.diameter_cm);
      if (sectionObj && sectionObj.thickness_cm > 0) meta.thickness_cm = Number(sectionObj.thickness_cm);
      if (sectionObj && sectionObj.fc_kgf_cm2   > 0) meta.fc_kgf_cm2   = Number(sectionObj.fc_kgf_cm2);
      if (fam.needsSpacing && sp > 0)               meta.spacing_m   = Number(sp);
      if (!fam.needsRCParams && section)            meta.section     = section;
      // Backward-compat alias: simple_wall_builder used to call the
      // RC-pile-specific flag needsRCParams; the new split is
      // needsDiameter + needsFc.  Read both so older catalogue still works.
      const isRCPile = !!(fam.needsRCParams || (fam.needsDiameter && fam.needsFc));
      if (!isRCPile && fam.sections && Object.keys(fam.sections).length > 0 && section) {
        meta.section = section;
      }
      model.wall.wall_builder_meta = meta;
      if (typeof rerenderWallSections === 'function') rerenderWallSections();
      closeModal();
    }

    function openModal() {
      ensureModal();
      const modal = document.getElementById('simpleWallBuilderModal');
      modal.classList.add('show');
      modal.setAttribute('aria-hidden', 'false');
      modal.style.display = 'flex';
      modal.style.zIndex = '9000';
      syncPreview();
    }
    function closeModal() {
      const el = document.getElementById('simpleWallBuilderModal');
      if (el) {
        el.classList.remove('show');
        el.setAttribute('aria-hidden', 'true');
        el.style.display = 'none';
      }
    }

    return { openModal, closeModal };
  }

  window.installSimpleWallBuilder = installSimpleWallBuilder;
})();
