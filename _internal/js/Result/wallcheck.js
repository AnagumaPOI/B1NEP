// Wall Check library
//
// Mirrors the Simple Wall Builder's family list so the two views stay
// in lock-step: every wall the user can build with one click also
// has a matching entry here.  Four families:
//
//   soldier_pile (steel H / rail)  → per-piece Zx/Ix/Av · spacing → per-m
//   sheet_pile                     → per-metre Zx/Ix/Av (fixed)
//   diaphragm_wall (RC)            → I = t³/12, E = 12000·√fc — rebar deferred
//   rc_pile_wall                   → I = πD⁴/64 ÷ spacing, E from fc — rebar deferred
//
// Per the design note: only the two STEEL families have fixed section
// properties baked in (Zx, Ix, Av) — they're general H, sheet pile,
// and rail sections.  The RC families need a rebar layout for a real
// capacity check; we record the inputs and return a deferred placeholder
// rather than misleading fb/fv numbers.
//
// Soldier-pile walls can optionally run a reference timber lagging check.

(function () {
  const WALL_MATERIAL = {
    Fy_kg_cm2: 2400.0,
    f_factor: 0.9,
    Fb_factor: 0.6,
    Fv_factor: 0.4,
    temporary_increase: 1.25,
  };

  // Catalogue.  Keys align with the keys used by Simple Wall Builder
  // (see js/Builder/simple_wall_builder.js) so the auto-prefill path can map
  // directly without translation.
  const WALL_LIBRARY = {
    soldier_pile: {
      label: 'Soldier Pile (steel H / rail)',
      family: 'steel_piece',                        // per-piece × spacing → per-m
      needsSpacing: true,
      needsLagging: true,
      sections: {
        'H350': { hint: 'H 350×350×12×19',
                  I_cm4_per_piece: 40300.0, Z_cm3_per_piece: 2300.0,
                  A_cm2_per_piece:  173.9,  Av_cm2_per_piece: 1.2 * 35.0,
                  D_cm: 35.0, B_cm: 35,
                  note: 'H-section per the in-house screening dataset.' },
        'H300': { hint: 'H 300×300×10×15',
                  I_cm4_per_piece: 20400.0, Z_cm3_per_piece: 1360.0,
                  A_cm2_per_piece:  119.8,  Av_cm2_per_piece: 1.0 * 30.0,
                  D_cm: 30.0, B_cm: 30.0,
                  note: 'H-section per the in-house screening dataset.' },
        'R50':  { hint: '50kgN rail',
                  I_cm4_per_piece:  1960.0, Z_cm3_per_piece:  242.0,
                  A_cm2_per_piece:   64.2,  Av_cm2_per_piece: 1.5 * 7.4,
                  D_cm: 14.0, B_cm: 60.0,
                  note: 'Rail section per the in-house screening dataset.' },
        'R37':  { hint: '37kgA rail',
                  I_cm4_per_piece:   952.0, Z_cm3_per_piece:  149.0,
                  A_cm2_per_piece:   47.3,  Av_cm2_per_piece: 1.4 * 7.35,
                  D_cm: 12.0, B_cm: 60.0,
                  note: 'Rail section per the in-house screening dataset.' },
      },
    },
    sheet_pile: {
      label: 'Sheet Pile',
      family: 'steel_perm',                          // already per-m
      needsSpacing: false,
      sections: {
        'SP-III': { I_cm4_per_m: 16800.0, Z_cm3_per_m: 1340.0,
                    A_cm2_per_piece: 76.42, Av_cm2_per_piece: 1.3 * 12.5 * 2.0,
                    D_cm: 40.0,
                    note: 'Section properties from the in-house screening dataset.' },
        'SP-IV':  { I_cm4_per_m: 38600.0, Z_cm3_per_m: 2270.0,
                    A_cm2_per_piece: 96.99, Av_cm2_per_piece: 1.55 * 17.0 * 2.0,
                    D_cm: 40.0,
                    note: 'Section properties from the in-house screening dataset.' },
      },
    },
    diaphragm_wall: {
      label: 'Diaphragm Wall (RC)',
      family: 'rc_section',                          // rebar design — deferred
      needsSpacing: false,
      needsFc: true,
      needsThickness: true,
      sections: {},                                 // fully user-parameterised
    },
    rc_pile_wall: {
      label: 'RC Pile Wall (cast-in-place piles, single row)',
      family: 'rc_section',                          // rebar design — deferred
      needsSpacing: true,
      needsFc: true,
      needsDiameter: true,
      sections: {},                                  // fully user-parameterised
    },
  };

  function pickExtreme(pair) {
    if (!pair) return { absValue: 0, value: 0, z: null, stage: null };
    const candidates = [];
    if (pair.max) candidates.push(pair.max);
    if (pair.min) candidates.push(pair.min);
    if (!candidates.length) return { absValue: 0, value: 0, z: null, stage: null };
    const best = candidates.reduce((a, c) => Math.abs(c.value) > Math.abs(a.value) ? c : a, candidates[0]);
    return { absValue: Math.abs(best.value), value: best.value, z: best.z, stage: best.stage };
  }

  function summarizeWallDemand(resultData) {
    const extremes = (resultData && resultData.extremes) || {};
    const m = pickExtreme(extremes.moment);
    const v = pickExtreme(extremes.shear);
    return {
      Mmax_tf_m_per_m: m.absValue,
      Vmax_tf_per_m:   v.absValue,
      sourceLabel:     'Overall envelope',
    };
  }

  function summarizeLaggingDemand(resultData) {
    const stages = (resultData && Array.isArray(resultData.stages)) ? resultData.stages : [];
    let preMax = 0.0;
    let uNetMax = 0.0;
    for (const st of stages) {
      for (const v of (Array.isArray(st.pre_r) ? st.pre_r : [])) {
        const n = Number(v);
        if (isFinite(n)) preMax = Math.max(preMax, n);
      }
      for (const v of (Array.isArray(st.u_net) ? st.u_net : [])) {
        const n = Number(v);
        if (isFinite(n)) uNetMax = Math.max(uNetMax, n);
      }
    }
    return {
      ps_tf_m2: preMax,
      u_net_tf_m2: uNetMax,
      sourceLabel: stages.length ? 'Maximum retained-side PRE across all stages' : 'Not available',
    };
  }

  function buildLaggingCheck(resultData, sec, opts) {
    opts = opts || {};
    const demand = summarizeLaggingDemand(resultData);
    const pileSpacingM = Number(sec.spacing_cm) / 100.0;
    const flangeWidthM = Number(sec.B_cm || sec.flange_width_cm || 0) / 100.0;
    const hCm = Number(opts.lagging_height_cm) > 0 ? Number(opts.lagging_height_cm) : 10.0;
    const tCm = Number(opts.lagging_thickness_cm) > 0 ? Number(opts.lagging_thickness_cm) : 3.0;
    const Fb = Number(opts.lagging_Fb_kg_cm2) > 0 ? Number(opts.lagging_Fb_kg_cm2) : 75.0;
    const Fv = Number(opts.lagging_Fv_kg_cm2) > 0 ? Number(opts.lagging_Fv_kg_cm2) : 7.0;
    const stf = Number(opts.lagging_short_term_factor) > 0 ? Number(opts.lagging_short_term_factor) : 1.2;
    const waterRatio = isFinite(Number(opts.lagging_water_ratio)) ? Number(opts.lagging_water_ratio) : 0.0;
    const L_eff = Math.max(0.0, pileSpacingM - flangeWidthM);
    const ps = Math.max(0.0, Number(demand.ps_tf_m2) || 0.0);
    const uNet = Math.max(0.0, Number(demand.u_net_tf_m2) || 0.0);
    const ud = waterRatio * uNet;
    const p = ps + ud;
    const hM = hCm / 100.0;
    const w = p * hM;
    const M = w * L_eff * L_eff / 8.0;
    const V = w * L_eff / 2.0;
    const A = hCm * tCm;
    const S = hCm * tCm * tCm / 6.0;
    const fb = S > 0 ? M * 100000.0 / S : NaN;
    const fv = A > 0 ? 1.5 * V * 1000.0 / A : NaN;
    const FbAllow = Fb * stf;
    const FvAllow = Fv * stf;
    const bendingStatus = isFinite(fb) && fb <= FbAllow ? 'PASS' : 'FAIL';
    const shearStatus = isFinite(fv) && fv <= FvAllow ? 'PASS' : 'FAIL';
    return {
      material: 'Timber',
      inputs: {
        Fb_kg_cm2: Fb,
        Fv_kg_cm2: Fv,
        water_pressure_ratio: waterRatio,
        short_term_factor: stf,
        h_cm: hCm,
        t_cm: tCm,
      },
      demand: {
        ps_tf_m2: ps,
        u_net_tf_m2: uNet,
        ud_tf_m2: ud,
        p_tf_m2: p,
        pile_spacing_m: pileSpacingM,
        flange_width_m: flangeWidthM,
        L_eff_m: L_eff,
        w_tf_m: w,
        Mmax_tf_m: M,
        Vmax_tf: V,
        sourceLabel: demand.sourceLabel,
      },
      section: { A_cm2: A, S_cm3: S },
      checks: {
        fb_kg_cm2: fb,
        fv_kg_cm2: fv,
        Fb_allow_kg_cm2: FbAllow,
        Fv_allow_kg_cm2: FvAllow,
        bending_status: bendingStatus,
        shear_status: shearStatus,
        status: bendingStatus === 'PASS' && shearStatus === 'PASS' ? 'PASS' : 'FAIL',
      },
    };
  }

  // Build the section spec actually checked, starting from the preset
  // (if any) and layering live UI inputs (spacing, diameter, fc) on top.
  // For steel families this resolves per-m Zx / Ix / Av; for RC families
  // it produces a geometry-only spec (Z is meaningless without rebar).
  function deriveWallSection(wallType, sectionName, opts) {
    opts = opts || {};
    const fam = WALL_LIBRARY[wallType];
    if (!fam) return null;
    const preset = fam.sections[sectionName];
    const sec = preset ? JSON.parse(JSON.stringify(preset)) : {};
    if (fam.needsSpacing && Number(opts.spacing_m) > 0) {
      sec.spacing_cm = Number(opts.spacing_m) * 100;
    }
    if (fam.needsDiameter && Number(opts.diameter_cm) > 0) {
      sec.diameter_cm = Number(opts.diameter_cm);
    }
    if (fam.needsThickness && Number(opts.thickness_cm) > 0) {
      sec.thickness_cm = Number(opts.thickness_cm);
    }
    if (fam.needsFc && Number(opts.fc_kgf_cm2) > 0) {
      sec.fc_kgf_cm2 = Number(opts.fc_kgf_cm2);
    }
    if (fam.family === 'steel_piece') {
      const sp = Number(sec.spacing_cm);
      if (sp > 0) {
        sec.I_cm4_per_m = Number(sec.I_cm4_per_piece) / sp * 100.0;
        sec.Z_cm3_per_m = Number(sec.Z_cm3_per_piece) / sp * 100.0;
      }
    } else if (fam.family === 'rc_section') {
      if (Number(sec.fc_kgf_cm2) > 0) {
        sec.E_kgf_cm2 = 12000.0 * Math.sqrt(Number(sec.fc_kgf_cm2));
      }
      let I_m4_per_m = 0;
      if (wallType === 'diaphragm_wall') {
        const t_m = Number(sec.thickness_cm) / 100.0;
        if (t_m > 0) I_m4_per_m = Math.pow(t_m, 3) / 12.0;
      } else if (wallType === 'rc_pile_wall') {
        const D_m  = Number(sec.diameter_cm) / 100.0;
        const sp_m = Number(sec.spacing_cm)  / 100.0;
        if (D_m > 0 && sp_m > 0) {
          I_m4_per_m = (Math.PI * Math.pow(D_m, 4) / 64.0) / sp_m;
        }
      }
      if (I_m4_per_m > 0) sec.I_cm4_per_m = I_m4_per_m * 1e8;
    }
    return sec;
  }

  function buildWallCandidate(resultData, wallType, sectionName, opts) {
    opts = opts || {};
    const fam = WALL_LIBRARY[wallType];
    if (!fam) return null;
    const sec = deriveWallSection(wallType, sectionName, opts);
    const demand = summarizeWallDemand(resultData);
    const out = {
      wall_type:    wallType,
      wall_label:   fam.label,
      family:       fam.family,
      section_name: sectionName,
      section:      sec || {},
      options:      opts,
      demand,
      notes:        [],
    };
    if (fam.needsLagging && opts.enable_lagging_check) {
      out.lagging = buildLaggingCheck(resultData, sec || {}, opts);
    }
    if (fam.family === 'steel_piece' || fam.family === 'steel_perm') {
      const material = Object.assign({}, WALL_MATERIAL);
      const fy = material.Fy_kg_cm2;
      const f  = material.f_factor;
      // Short-term factor (STF): user input, falls back to the
      // catalogue default.  Allowable stresses scale with it exactly
      // like the support check:  Fb = 0.6·Fy·STF, Fv = 0.4·Fy·STF.
      const stf = Number(opts.short_term_factor) > 0
        ? Number(opts.short_term_factor)
        : material.temporary_increase;
      const Fb = material.Fb_factor * fy * stf;
      const Fv = material.Fv_factor * fy * stf;
      let fb = NaN, fv = NaN;
      if (Number(sec.Z_cm3_per_m) > 0) {
        fb = demand.Mmax_tf_m_per_m / (f * Number(sec.Z_cm3_per_m) / 1.0e6) / 10.0;
      }
      if (Number(sec.Av_cm2_per_piece) > 0 && Number(sec.D_cm) > 0) {
        fv = demand.Vmax_tf_per_m * (Number(sec.D_cm) / 100.0)
             / (f * Number(sec.Av_cm2_per_piece)) * 1000.0;
      }
      out.material = material;
      out.checks = {
        Fy_kg_cm2: fy, stf: stf,
        fb_factor: material.Fb_factor, fv_factor: material.Fv_factor,
        fb_kg_cm2: fb, Fb_kg_cm2: Fb,
        fb_ratio:  Fb ? fb / Fb : null,
        fv_kg_cm2: fv, Fv_kg_cm2: Fv,
        fv_ratio:  Fv ? fv / Fv : null,
        status:    (isFinite(fb) && isFinite(fv) && fb <= Fb && fv <= Fv) ? 'PASS' : 'FAIL',
      };
      if (out.lagging && out.lagging.checks && out.lagging.checks.status !== 'PASS') {
        out.checks.status = 'FAIL';
      }
      if (sec.note) out.notes.push(sec.note);
    } else if (fam.family === 'rc_section') {
      out.checks = null;
      out.deferred = 'Rebar design pending — provide rebar layout for an RC capacity check (to be implemented).';
    }
    return out;
  }

  // ------------------------------------------------------------------
  //  Diaphragm-wall RC rebar design / check
  //
  //  Faithful port of the strength-design math in the GSDAS_mod
  //  DiaphragmWallAnalysis.cs (flexural + shear + temperature steel),
  //  for a SINGLE input case — no bar-quantity takeoff.  Working units
  //  internally are kgf / cm; moment envelope is t-m/m and shear t/m
  //  (as produced by FEM_RIO).:
  //  
  //  Max rebar spacing = min(45,3h,l/3). Since h > 20cm and l >> 135cm, 
  //  the governing s_max is always 45cm, and it has been limited in the UI, 
  //  so there's no need to check for main and temp rebar here. 
  //
  //    beta1   = clamp(0.85 - 0.05*((Fc-280)/70), 0.65, 0.85)
  //    rho_b   = (0.85*Fc*beta1/Fy) * (6120/(6120+Fy))
  //    rho_min = max(0.8*sqrt(Fc)/Fy, 14/Fy)
  //    d       = t - cover - db/2                        (single layer)
  //    m       = Fy/(0.85*Fc)
  //    Rn      = Mu*1000*100/(phi_m*b*d*d)               (kgf/cm²)
  //    rho     = (1/m)*(1 - sqrt(1 - 2*m*Rn/Fy))
  //    rho_req = rho<rho_min ? (4/3*rho>rho_min ? rho_min : 4/3*rho) : rho
  //    As_req  = rho_req*b*d
  //    As      = Ab*100/spacing                          (cm²/m strip)
  //    a       = As*Fy/(0.85*Fc*b)
  //    Mn      = 0.85*Fc*b*a*(d-a/2)/1e5                  (t-m/m)
  //    PhiMn   = 0.9*Mn
  //    Vc      = 0.53*sqrt(Fc)*b*d                        (kgf)
  //    Vs      = Ab_s*Fys*(b/H)*(d/V)                     (kgf)
  //    PhiVn   = 0.75*(Vc+Vs)                             (/1000 → t/m)
  //    Avs_min = max(0.2*sqrt(Fc)*b/Fys, 3.5*b/Fys)
  //    rho_t   = 0.0025 or 0.002 ;  Ash_req = rho_t*b*t  ;  Ash = Ab*100/s*2
  // ------------------------------------------------------------------

  // Bar designation → { dia (cm), area (cm²) }.  Matches Unite/RebarInfo.
  const REBAR = {
    D10: { dia: 0.953, area: 0.713 },
    D13: { dia: 1.270, area: 1.267 },
    D16: { dia: 1.590, area: 1.986 },
    D19: { dia: 1.910, area: 2.865 },
    D22: { dia: 2.220, area: 3.871 },
    D25: { dia: 2.540, area: 5.067 },
    D29: { dia: 2.870, area: 6.469 },
    D32: { dia: 3.220, area: 8.143 },
    D36: { dia: 3.581, area: 10.07 },
    D43: { dia: 4.300, area: 14.52 },
  };
  function barArea(name) { return (REBAR[name] || {}).area || 0; }
  function barDia(name)  { return (REBAR[name] || {}).dia  || 0; }

  // Bar-size ranking for the strength-grade rule.  A bar's yield
  // strength is decided by its SIZE, not a separate user field:
  // rank(bar) >= rank(boundary)  →  fy = 4200  (high-strength)
  // otherwise                    →  fy = 2800  (mild)
  // Default boundary D19 (D19 and larger are SD420 grade).
  const REBAR_ORDER = ['D10','D13','D16','D19','D22','D25','D29','D32','D36','D43'];
  function barRank(name) { const i = REBAR_ORDER.indexOf(name); return i < 0 ? 0 : i; }
  function fyForBar(name, boundary) {
    return barRank(name) >= barRank(boundary || 'D19') ? 4200 : 2800;
  }

  // ---- Constructability preference weights -----------------------
  // Two designs that carry the demand equally well are NOT equally
  // desirable in practice: very large bars (≥ D32) and awkward
  // spacings are avoided.  These return a small fractional penalty
  // applied multiplicatively to a combo's cost so the optimiser
  // (and the shear / temperature pickers) lean toward common,
  // buildable detailing without ever overriding strength/feasibility.
  //   bar : D22–D29 best · D19,D32 next · D16,D36,D43 worse
  //   sp  : 15, 30 best · 12.5, 25 next · 20 worst
  function rebarSizeWeight(bar) {
    switch (bar) {
      case 'D22': case 'D25': case 'D29': return 0.00;
      case 'D19': case 'D32':             return 0.05;
      case 'D16':                         return 0.12;
      case 'D36':                         return 0.15;
      case 'D43':                         return 0.25;
      default:                            return 0.20;  // D10/D13 etc.
    }
  }
  function rebarSpacingWeight(sp) {
    const s = Number(sp);
    if (s === 15 || s === 30)            return 0.00;
    if (s === 12.5 || s === 25)          return 0.03;
    if (s === 10 || s === 45 || s === 60) return 0.05;
    if (s === 20)                        return 0.07;
    return 0.05;
  }
  // Consistency penalty between two spacings.  0 when equal; grows
  // with the RATIO (so a half/double pairing like 30↔15 is much
  // worse than a near pair like 25↔20), capped.  Used so the 2nd
  // layer matches the main spacing, and so spacings stay uniform
  // across both faces / segments (vs an `anchor` spacing).
  //   30,15 → r=2   → ~0.20      25,20 → r=1.25 → ~0.05
  function spacingRatioPenalty(a, b) {
    a = Number(a); b = Number(b);
    if (!(a > 0) || !(b > 0)) return 0;
    const r = a > b ? a / b : b / a;
    return Math.min(0.40, (r - 1) * 0.20);
  }
  // Length-weighted modal spacing of a list of {spacing,len} — the
  // spacing that covers the most wall depth.  Used as the shared
  // "anchor" both faces (and the shear stirrups) are nudged toward.
  function weightedSpacingMode(items) {
    const acc = {};
    let bestSp = null, bestW = -1;
    (items || []).forEach(it => {
      const s = Number(it.spacing); const w = Number(it.len) || 0;
      if (!(s > 0) || w <= 0) return;
      acc[s] = (acc[s] || 0) + w;
      if (acc[s] > bestW) { bestW = acc[s]; bestSp = s; }
    });
    return bestSp;
  }

  // Governing factored moment / shear over a depth band [z0, z1].
  //   moment_min  = most-negative envelope ordinate  → excavation face
  //   moment_max  = most-positive envelope ordinate  → soil face
  // Returns the band extremes already multiplied by `factor` and devided by amplifier
  function bandDemand(env, z0, z1, factor, amplifier) {
    const z = env.z || [];
    let mNeg = 0, mPos = 0, vAbs = 0, found = false;
    const mmin = env.moment_min || [];
    const mmax = env.moment_max || [];
    const vmin = env.shear_min  || [];
    const vmax = env.shear_max  || [];
    for (let i = 0; i < z.length; i++) {
      if (z[i] < z0 - 1e-9 || z[i] > z1 + 1e-9) continue;
      found = true;
      if (mmin[i] != null && mmin[i] < mNeg) mNeg = mmin[i];
      if (mmax[i] != null && mmax[i] > mPos) mPos = mmax[i];
      const v = Math.max(Math.abs(vmin[i] || 0), Math.abs(vmax[i] || 0));
      if (v > vAbs) vAbs = v;
    }
    if (!found) return { excaMu: 0, soilMu: 0, Vu: 0 };
    return {
      excaMu: Math.abs(mNeg) * factor/amplifier,   // excavation-side design moment (t-m/m)
      soilMu: Math.abs(mPos) * factor/amplifier,   // soil-side design moment      (t-m/m)
      Vu:     vAbs * factor/amplifier,             // design shear                 (t/m)
    };
  }

  // One flexural segment check given the provided bar + spacing, plus
  // an OPTIONAL second layer (bar2 @ spacing2) so the user can fine-
  // tune capacity when a single bar size is too small but the next
  // size up wildly overshoots (e.g. D22+D19 instead of jumping D25→D29).
  // Combined two-layer effective depth follows GetRevise_d:
  //   As1 = a1·100/s1 ; As2 = a2·100/s2
  //   d   = t - cover - (As1·r1 + As2·(db1 + 2.5 + r2)) / (As1 + As2)
  function flexuralSegment(num, idx, z0, z1, Mu, P) {
    const Fc = P.Fc, b = P.b, t = P.thickness, cover = P.cover;
    // Yield strength is derived from the bar SIZE via the boundary rule
    // (≥ boundary → 4200, else 2800) — there is no separate fy input.
    // For a two-layer section we conservatively use the lower-grade
    // (smaller) bar's fy for the section material parameters.
    const has2 = !!(num.bar2 && Number(num.spacing2) > 0 && barArea(num.bar2) > 0);
    const Fy = has2
      ? Math.min(fyForBar(num.bar, P.fyBoundary), fyForBar(num.bar2, P.fyBoundary))
      : fyForBar(num.bar, P.fyBoundary);
    const phi = 0.9;
    let beta1 = 0.85 - 0.05 * ((Fc - 280) / 70);
    beta1 = Math.max(0.65, Math.min(0.85, beta1));
    const rhoB   = ((0.85 * Fc * beta1) / Fy) * (6120 / (6120 + Fy));
    let rhoMin   = 0.8 * Math.sqrt(Fc) / Fy;
    if (rhoMin < 14 / Fy) rhoMin = 14 / Fy;
    const db  = barDia(num.bar);
    const As1 = barArea(num.bar) * 100 / num.spacing;          // cm²/m
    let As, d;
    if (has2) {
      const db2 = barDia(num.bar2);
      const As2 = barArea(num.bar2) * 100 / Number(num.spacing2);
      As = As1 + As2;
      const cg = (As1 * (db / 2) + As2 * (db + 2.5 + db2 / 2)) / (As1 + As2);
      d = t - cover - cg;
    } else {
      As = As1;
      d  = t - cover - db / 2;
    }
    const m  = Fy / (0.85 * Fc);
    const Rn = Mu * 1000 * 100 / (phi * b * d * d);
    const disc = 1 - (2 * m * Rn / Fy);
    let rhoStr, inadequate = false;
    if (disc < 0) { rhoStr = rhoB; inadequate = true; }   // section can't carry Mu
    else          { rhoStr = (1 / m) * (1 - Math.sqrt(disc)); }
    // As_req = STRENGTH steel required to resist Mu (no min-steel
    // inflation).  When φMn ≥ Mu this is, by construction, ≤ As — so
    // the table never shows the contradictory "As_req > As while
    // φMn > Mu" any more.
    const AsReq = rhoStr * b * d;
    // As_min = ACI minimum reinforcement, with the 10.5.3 exemption:
    // a section is exempt from ρ_min if it provides at least 4/3 of
    // the strength-required steel.  Effective minimum = the lesser.
    const AsMinCode = rhoMin * b * d;
    const AsMinEff  = Math.min(AsMinCode, (4 / 3) * AsReq);
    const a  = As * Fy / (0.85 * Fc * b);
    const Mn = 0.85 * Fc * b * a * (d - a / 2) / 1e5;         // t-m/m
    const PhiMn = phi * Mn;
    // Two independent acceptance criteria:
    //   strength : φMn ≥ Mu  (⇔ As ≥ As_req)
    //   min steel: As ≥ As_min(eff)
    // A segment PASSES only when BOTH hold.  When it fails we record
    // which one so the UI can tell the user the real reason.
    const strengthOk = !inadequate && PhiMn >= Mu - 1e-9;
    const minSteelOk = As >= AsMinEff - 1e-9;
    const status = strengthOk && minSteelOk;
    let reason = '';
    if (inadequate)        reason = 'section inadequate — Mu exceeds max moment capacity';
    else if (!strengthOk)  reason = 'φMn < Mu — increase bar size / reduce spacing';
    else if (!minSteelOk)  reason = 'As < As_min — minimum reinforcement not satisfied';
    return {
      seg: idx + 1, z0, z1,
      bar: num.bar, spacing: num.spacing,
      bar2: has2 ? num.bar2 : null, spacing2: has2 ? Number(num.spacing2) : null,
      fy: Fy,
      d, As, As_req: AsReq, As_min: AsMinEff, rho_b: rhoB, rho_min: rhoMin,
      Mn, PhiMn, Mu,
      strength_ok: strengthOk, min_steel_ok: minSteelOk,
      status, reason,
    };
  }

  // Temperature / shrinkage (horizontal) steel check against the
  // USER-PROVIDED bar + spacing.  rho_t = 0.0025(fy<4200) or 0.002(fy>4200);
  // Ash_req = rho_t*b*t ;  Ash = Ab*100/s*2 (two faces).
  function temperatureSteel(P) {
    const bar = P.temp && P.temp.bar ? P.temp.bar : null;
    const rhoT = (barDia(bar)<=barDia('D16') && fyForBar(bar, P.fyBoundary)) >=4200 ? 0.002 : 0.0025;
    const AshReq = rhoT * P.b * P.thickness;
    const s  = P.temp ? Number(P.temp.spacing) : 30;
    const Ash = (bar && s > 0) ? barArea(bar) * 100 / s * 2 : 0;
    return {
      rho_t: rhoT, As_req: AshReq,
      bar: bar, spacing: s || null, As: Ash,
      status: (Ash >= AshReq),
    };
  }

  // One shear segment check given the chosen stirrup bar / V / H.
  function shearSegment(idx, z0, z1, Vu_tpm, d, P) {
    const Fc = P.Fc, b = P.b;
    // Stirrup yield strength follows the same size→grade rule.
    const Fys = fyForBar(P.shear.bar, P.fyBoundary);
    const phi = 0.75;
    const Vu = Vu_tpm * 1000;                                  // t/m → kgf
    const Vc = 0.53 * Math.sqrt(Fc) * b * d;                   // kgf
    const Ab = barArea(P.shear.bar);
    const Vs = Ab * Fys * (b / P.shear.H) * (d / P.shear.V);   // kgf
    const Vn = Vc + Vs;
    const PhiVn = phi * Vn;
    const PhiVc = phi * Vc;
    // Minimum shear-steel ratio Av/s and the PROVIDED Av/s for this
    // stirrup layout (legs across the strip width b, at vertical pitch V).
    const AvsMin = Math.max(0.2 * Math.sqrt(Fc) * b / Fys, 3.5 * b / Fys);
    const Avs    = Ab * (b / P.shear.H) / P.shear.V;            // cm²/cm
    // Maximum vertical stirrup spacing (ACI 11.4.5): halved when the
    // stirrup contribution Vs exceeds 2·Vc (≈ 1.06√fc·b·d range).
    const smax = (Vs > 2 * Vc) ? Math.min(d / 4, 30) : Math.min(d / 2, 60);  // cm
    const sV    = P.shear.V;                                     // vertical pitch
    // Four independent acceptance criteria — ALL must hold to PASS:
    const strengthOk = PhiVn >= Vu;
    const vsCheck    = (4 * Vc) > Vs;     // section big enough (Vs ≤ 4·Vc)
    const smaxCheck  = sV <= smax + 1e-9;  // spacing not over the code max
    const avsCheck   = Avs >= AvsMin - 1e-12;
    const status = strengthOk && vsCheck && smaxCheck && avsCheck;
    const fails = [];
    if (!strengthOk) fails.push('φVn < Vu');
    if (!vsCheck)    fails.push('Vs > 4·Vc (section too small)');
    if (!smaxCheck)  fails.push(`sV > s_max (${smax.toFixed(1)} cm)`);
    if (!avsCheck)   fails.push('Av/s < Av/s_min');
    return {
      seg: idx + 1, z0, z1,
      bar: P.shear.bar, V: P.shear.V, H: P.shear.H, fys: Fys,
      Vc: Vc / 1000, Vs: Vs / 1000, Vn: Vn / 1000,
      PhiVn: PhiVn / 1000, PhiVc: PhiVc / 1000,
      Avs: Avs, Avs_min: AvsMin, smax: smax, Vu: Vu_tpm,
      vs_check: vsCheck, smax_check: smaxCheck, avs_check: avsCheck,
      strength_ok: strengthOk,
      status: status,
      reason: fails.join('; '),
    };
  }

  function segmentBands(zTop, zBot, n) {
    n = Math.max(1, Math.min(3, n | 0));
    const out = [];
    const span = (zBot - zTop) / n;
    for (let i = 0; i < n; i++) out.push([zTop + i * span, zTop + (i + 1) * span]);
    return out;
  }

  // ---------------------------------------------------------------
  //  Auto-segmentation: read the demand envelope for one side and
  //  recommend how many depth bands to design, splitting at the
  //  VALLEYS (local minima) between successive demand PEAKS so each
  //  band brackets one peak.  This is what the rebar tables use as
  //  their default layout — the user can still add/remove rows.
  //
  //    side = 'exca'  → governed by −moment_min (excavation face)
  //    side = 'soil'  → governed by +moment_max (soil face)
  //    side = 'shear' → governed by max|shear|
  //
  //  Returns [[z0,z1], …] (depth-ordered, ≥1 band) or null when the
  //  envelope is unusable.
  // ---------------------------------------------------------------
  function recommendSegments(env, side, opts) {
    opts = opts || {};
    const maxSeg = Math.max(1, opts.maxSeg || 4);
    const z = env && env.z;
    if (!Array.isArray(z) || z.length < 3) return null;

    // Depth-sorted index so peak/valley logic works regardless of the
    // raw envelope ordering.
    const ord = z.map((v, i) => i).sort((a, b) => z[a] - z[b]);
    const zs  = ord.map(i => z[i]);
    let raw;
    if (side === 'shear') {
      const a = env.shear_min || [], b = env.shear_max || [];
      raw = ord.map(i => Math.max(Math.abs(a[i] || 0), Math.abs(b[i] || 0)));
    } else if (side === 'exca') {
      const mm = env.moment_min || [];
      raw = ord.map(i => Math.max(0, -(mm[i] || 0)));
    } else {
      const mx = env.moment_max || [];
      raw = ord.map(i => Math.max(0,  (mx[i] || 0)));
    }
    const zTop = zs[0], zBot = zs[zs.length - 1];
    const round2 = v => Math.round(v * 100) / 100;
    const whole  = [[round2(zTop), round2(zBot)]];

    const gMax = Math.max.apply(null, raw);
    if (!(gMax > 0) || zBot - zTop < 1e-6) return whole;

    // 3-point smoothing to suppress numeric jitter on the envelope.
    const m = raw.map((v, i) => {
      const p = i > 0 ? raw[i - 1] : v;
      const n = i < raw.length - 1 ? raw[i + 1] : v;
      return (p + v + n) / 3;
    });

    // Interior local maxima (plateaus registered once, on entry).
    const peaks = [];
    for (let i = 1; i < m.length - 1; i++) {
      if (m[i] >= m[i - 1] && m[i] >= m[i + 1] &&
          (m[i] > m[i - 1] || m[i] > m[i + 1])) {
        peaks.push(i);
      }
    }
    // A high endpoint (cantilever head / toe fixity) is itself a peak.
    if (m[0]              >= 0.55 * gMax) peaks.unshift(0);
    if (m[m.length - 1]   >= 0.55 * gMax) peaks.push(m.length - 1);

    // Keep only meaningfully large peaks.
    let cand = peaks.filter(i => m[i] >= 0.25 * gMax);
    if (!cand.length) {
      let bi = 0; for (let i = 1; i < m.length; i++) if (m[i] > m[bi]) bi = i;
      cand = [bi];
    }
    cand.sort((a, b) => a - b);

    // Merge peaks closer than 12 % of the wall depth (keep the taller).
    const minGap = 0.12 * (zBot - zTop);
    const merged = [];
    cand.forEach(p => {
      const last = merged[merged.length - 1];
      if (last != null && (zs[p] - zs[last]) < minGap) {
        if (m[p] > m[last]) merged[merged.length - 1] = p;
      } else {
        merged.push(p);
      }
    });

    // Cap the number of bands: keep the tallest peaks, back in depth order.
    let kept = merged;
    if (kept.length > maxSeg) {
      kept = merged.slice().sort((a, b) => m[b] - m[a])
                   .slice(0, maxSeg).sort((a, b) => a - b);
    }
    if (kept.length <= 1) return whole;

    // Split at the deepest valley between each pair of kept peaks.
    const bounds = [zTop];
    for (let k = 0; k < kept.length - 1; k++) {
      let vi = kept[k], vv = m[vi];
      for (let i = kept[k]; i <= kept[k + 1]; i++) {
        if (m[i] < vv) { vv = m[i]; vi = i; }
      }
      bounds.push(zs[vi]);
    }
    bounds.push(zBot);

    // Round, enforce monotonic increase, and drop bands thinner than
    // 5 % of the wall (or 0.30 m) by merging into the neighbour.
    const minBand = Math.max(0.30, 0.05 * (zBot - zTop));
    const cuts = [round2(bounds[0])];
    for (let i = 1; i < bounds.length; i++) {
      const b = round2(bounds[i]);
      if (b - cuts[cuts.length - 1] >= (i === bounds.length - 1 ? 1e-6 : minBand)) {
        cuts.push(b);
      } else if (i === bounds.length - 1) {
        cuts[cuts.length - 1] = b;            // keep the true bottom
      }
    }
    if (cuts.length < 2) return whole;
    const out = [];
    for (let i = 0; i < cuts.length - 1; i++) out.push([cuts[i], cuts[i + 1]]);
    return out;
  }

  // ---------------------------------------------------------------
  //  Optimal auto-segmentation + rebar selection for ONE side.
  //
  //  Instead of guessing breakpoints from envelope peaks, we treat
  //  this as a partition-optimisation problem:
  //
  //    1. Candidate break depths live on a `gridStep` (default 1 m)
  //       grid between zTop and zBot.
  //    2. For every candidate band we find the CHEAPEST rebar combo
  //       (single layer, or main + 2nd layer with bar2 ≤ main ≥ D16)
  //       that PASSES flexuralSegment (strength AND min-steel).  Its
  //       cost is the capacity area  φMn · band-length  (waste = that
  //       minus the demand area, a constant per side).
  //    3. Dynamic programming gives the EXACT min-cost partition for
  //       exactly n segments, n = 1 … maxSeg.
  //    4. n is chosen by diminishing returns: keep adding a segment
  //       only while it cuts the over-design waste by more than
  //       `gamma` (×) the single-segment baseline (plus a small
  //       absolute floor so flat-demand sides don't over-split).
  //
  //  Returns [{z0,z1,bar,spacing,bar2,spacing2,phiMn,feasible}, …]
  //  (depth-ordered) or null when the envelope is unusable.
  // ---------------------------------------------------------------
  function optimizeSideSegments(env, side, P, opts) {
    opts = opts || {};
    const maxSeg   = Math.max(1, Math.min(4, opts.maxSeg || 4));
    const gridStep = opts.gridStep || 1;
    const gamma    = opts.gamma != null ? opts.gamma : 0.10;
    const absFloor = opts.absFloor != null ? opts.absFloor : 1.0;  // cm²·m
    const anchorSp = opts.anchorSp ? Number(opts.anchorSp) : null;
    const z = env && env.z;
    if (!Array.isArray(z) || z.length < 2) return null;
    const zTop = Math.min.apply(null, z);
    const zBot = Math.max.apply(null, z);
    if (zBot - zTop < 1e-6) return null;

    const pick = side === 'exca' ? d => d.excaMu : d => d.soilMu;
    const r2 = v => Math.round(v * 100) / 100;

    // 1 m grid of node depths (exact ends always included).
    const set = new Set([+zTop.toFixed(6), +zBot.toFixed(6)]);
    for (let g = Math.ceil(zTop / gridStep) * gridStep; g < zBot - 1e-9; g += gridStep) {
      if (g > zTop + 1e-9) set.add(+g.toFixed(6));
    }
    const grid = Array.from(set).sort((a, b) => a - b);
    const N = grid.length;
    if (N < 2) return null;

    const BARS = opts.bars || ['D16','D19','D22','D25','D29','D32','D36','D43'];
    const SPS  = opts.spacings || [10, 12.5, 15, 20, 25, 30, 45];
    const sizeOf = n => parseInt(String(n).replace(/^D/i, ''), 10) || 0;

    // Cheapest PASSING combo for band grid[i]..grid[j]  (memoised).
    const cache = {};
    function bestCombo(i, j) {
      const key = i + '_' + j;
      if (cache[key] !== undefined) return cache[key];
      const za = grid[i], zb = grid[j], len = zb - za;
      const govMu = pick(bandDemand(env, za, zb, P.factor, P.amplifier));
      let best = null;
      const consider = (r, bar, sp, b2, sp2) => {
        if (!r) return;
        const feasible = !!r.status;
        // Primary cost is the actual STEEL QUANTITY per metre of
        // wall (As · band-length), so the optimiser genuinely
        // minimises rebar usage — not just over-capacity.  It is
        // then scaled by constructability penalties:
        //   · bar size / spacing tier preference
        //   · 2nd-layer spacing must match the main spacing
        //     (half/double penalised hardest)
        //   · all spacings nudged toward the shared `anchor`
        let mult = 1 + rebarSizeWeight(bar) + rebarSpacingWeight(sp);
        if (b2) {
          mult += 0.05 + rebarSizeWeight(b2) * 0.5 + rebarSpacingWeight(sp2);
          mult += spacingRatioPenalty(sp, sp2);          // 2nd ≈ main
        }
        if (anchorSp) mult += 0.5 * spacingRatioPenalty(sp, anchorSp);
        const cap = r.As * len * mult;                   // cm²/m · m
        const tie = (b2 ? 2e6 : 0) + (-sp) * 1e3 + sizeOf(bar);
        const cand = { feasible, phi: r.PhiMn, d: r.d, As: r.As, cap, tie,
                       bar, spacing: sp, bar2: b2, spacing2: sp2 };
        if (!best) { best = cand; return; }
        if (best.feasible !== cand.feasible) { if (cand.feasible) best = cand; return; }
        if (cand.cap < best.cap - 1e-9 ||
           (Math.abs(cand.cap - best.cap) <= 1e-9 && cand.tie < best.tie)) best = cand;
      };
      for (const bar of BARS) {
        for (const sp of SPS) {
          consider(flexuralSegment({ bar, spacing: sp }, 0, za, zb, govMu, P),
                   bar, sp, null, null);
          for (const b2 of BARS) {
            if (sizeOf(b2) > sizeOf(bar)) break;            // bar2 ≤ main
            consider(flexuralSegment({ bar, spacing: sp, bar2: b2, spacing2: sp },
                                     0, za, zb, govMu, P), bar, sp, b2, sp);
          }
        }
      }
      cache[key] = best;
      return best;
    }

    // DP: dp[s][i] = min Σ(cap + infeasPenalty) covering grid[0..i]
    // with exactly s segments; par for reconstruction.
    const INF = Infinity;
    const dp = [], par = [], nbad = [];
    for (let s = 0; s <= maxSeg; s++) {
      dp[s]   = new Array(N).fill(INF);
      par[s]  = new Array(N).fill(-1);
      nbad[s] = new Array(N).fill(0);
    }
    dp[0][0] = 0;
    for (let s = 1; s <= maxSeg; s++) {
      for (let i = 1; i < N; i++) {
        for (let j = 0; j < i; j++) {
          if (dp[s - 1][j] === INF) continue;
          const bc = bestCombo(j, i);
          if (!bc) continue;
          const c = dp[s - 1][j] + bc.cap + (bc.feasible ? 0 : 1e9);
          if (c < dp[s][i] - 1e-9) {
            dp[s][i]  = c;
            par[s][i] = j;
            nbad[s][i] = nbad[s - 1][j] + (bc.feasible ? 0 : 1);
          }
        }
      }
    }

    // G[n] is the total (constructability-weighted) steel quantity of
    // the best n-segment partition.  More segments can only use ≤ as
    // much steel, so we add a segment only while it saves more than
    // max(gamma · single-segment steel, absFloor).
    const G = []; for (let n = 1; n <= maxSeg; n++) G[n] = dp[n][N - 1];
    const base = Math.max(isFinite(G[1]) ? G[1] : 0, 1e-9);

    let nBest = maxSeg;
    for (let n = 1; n < maxSeg; n++) {
      if (!isFinite(G[n])) continue;
      const improve = G[n] - (isFinite(G[n + 1]) ? G[n + 1] : G[n]);
      if (improve < Math.max(gamma * base, absFloor)) { nBest = n; break; }
    }
    // Prefer a fully-feasible partition if a larger n removes failures.
    if (nbad[nBest][N - 1] > 0) {
      for (let n = nBest + 1; n <= maxSeg; n++) {
        if (isFinite(G[n]) && nbad[n][N - 1] < nbad[nBest][N - 1]) { nBest = n; }
        if (nbad[nBest][N - 1] === 0) break;
      }
    }

    // Reconstruct.
    const segs = [];
    let n = nBest, node = N - 1;
    while (n > 0 && node > 0) {
      const j = par[n][node];
      if (j < 0) break;
      segs.push([j, node]);
      node = j; n--;
    }
    segs.reverse();
    if (!segs.length) return null;
    return segs.map(([a, b]) => {
      const bc = bestCombo(a, b);
      return {
        z0: r2(grid[a]), z1: r2(grid[b]),
        bar: bc.bar, spacing: String(bc.spacing),
        bar2: bc.bar2 || null,
        spacing2: bc.bar2 ? String(bc.spacing2) : null,
        phiMn: bc.phi, d: bc.d, As: bc.As, feasible: bc.feasible,
      };
    });
  }

  // ---------------------------------------------------------------
  //  Optimal auto-segmentation + stirrup selection for SHEAR — the
  //  same partition-optimisation as the flexural side, but the
  //  per-band cost is the stirrup steel ratio Av/s · band-length
  //  (constructability-weighted).  `dMin` is the effective depth
  //  carried over from the flexural design.  Only the VERTICAL pitch
  //  V is nudged toward the shared `anchorV` (horizontal H is free).
  //
  //  Returns [{z0,z1,bar,V,H,phiVn,feasible}, …] or null.
  // ---------------------------------------------------------------
  function optimizeShearSegments(env, P, dMin, opts) {
    opts = opts || {};
    const maxSeg   = Math.max(1, Math.min(4, opts.maxSeg || 4));
    const gridStep = opts.gridStep || 1;
    const gamma    = opts.gamma != null ? opts.gamma : 0.12;
    const absFloor = opts.absFloor != null ? opts.absFloor : 0.02; // cm²/cm·m
    const anchorV  = opts.anchorV ? Number(opts.anchorV) : null;
    const z = env && env.z;
    if (!Array.isArray(z) || z.length < 2) return null;
    const zTop = Math.min.apply(null, z);
    const zBot = Math.max.apply(null, z);
    if (zBot - zTop < 1e-6) return null;
    const d  = (isFinite(dMin) && dMin > 0) ? dMin : (P.thickness - P.cover);
    const r2 = v => Math.round(v * 100) / 100;

    const set = new Set([+zTop.toFixed(6), +zBot.toFixed(6)]);
    for (let g = Math.ceil(zTop / gridStep) * gridStep; g < zBot - 1e-9; g += gridStep) {
      if (g > zTop + 1e-9) set.add(+g.toFixed(6));
    }
    const grid = Array.from(set).sort((a, b) => a - b);
    const N = grid.length;
    if (N < 2) return null;

    const BARS = opts.bars || ['D10','D13','D16'];
    const SPS  = opts.spacings || [10, 15, 20, 25, 30, 60];
    const cache = {};
    function bestCombo(i, j) {
      const key = i + '_' + j;
      if (cache[key] !== undefined) return cache[key];
      const za = grid[i], zb = grid[j], len = zb - za;
      const Vu = bandDemand(env, za, zb, P.factor, P.amplifier).Vu;
      let best = null;
      for (const bar of BARS) {
        for (const V of SPS) {
          for (const H of SPS) {
            const Pseg = Object.assign({}, P, { shear: { bar, V, H } });
            const r = shearSegment(0, za, zb, Vu, d, Pseg);
            const feasible = !!r.status;
            let mult = 1 + rebarSpacingWeight(V) + rebarSpacingWeight(H);
            if (anchorV) mult += 0.5 * spacingRatioPenalty(V, anchorV);
            const cost = r.Avs * len * mult;               // cm²/cm · m
            const tie  = (-V) * 1e3 + (-H);
            const cand = { feasible, phi: r.PhiVn, Avs: r.Avs, cost, tie,
                           bar, V, H };
            if (!best) { best = cand; }
            else if (best.feasible !== cand.feasible) { if (cand.feasible) best = cand; }
            else if (cand.cost < best.cost - 1e-12 ||
                    (Math.abs(cand.cost - best.cost) <= 1e-12 && cand.tie < best.tie)) best = cand;
          }
        }
      }
      cache[key] = best;
      return best;
    }

    const INF = Infinity;
    const dp = [], par = [], nbad = [];
    for (let s = 0; s <= maxSeg; s++) {
      dp[s]   = new Array(N).fill(INF);
      par[s]  = new Array(N).fill(-1);
      nbad[s] = new Array(N).fill(0);
    }
    dp[0][0] = 0;
    for (let s = 1; s <= maxSeg; s++) {
      for (let i = 1; i < N; i++) {
        for (let j = 0; j < i; j++) {
          if (dp[s - 1][j] === INF) continue;
          const bc = bestCombo(j, i);
          if (!bc) continue;
          const c = dp[s - 1][j] + bc.cost + (bc.feasible ? 0 : 1e9);
          if (c < dp[s][i] - 1e-12) {
            dp[s][i]  = c;
            par[s][i] = j;
            nbad[s][i] = nbad[s - 1][j] + (bc.feasible ? 0 : 1);
          }
        }
      }
    }

    const G = []; for (let n = 1; n <= maxSeg; n++) G[n] = dp[n][N - 1];
    const base = Math.max(isFinite(G[1]) ? G[1] : 0, 1e-12);
    let nBest = maxSeg;
    for (let n = 1; n < maxSeg; n++) {
      if (!isFinite(G[n])) continue;
      const improve = G[n] - (isFinite(G[n + 1]) ? G[n + 1] : G[n]);
      if (improve < Math.max(gamma * base, absFloor)) { nBest = n; break; }
    }
    if (nbad[nBest][N - 1] > 0) {
      for (let n = nBest + 1; n <= maxSeg; n++) {
        if (isFinite(G[n]) && nbad[n][N - 1] < nbad[nBest][N - 1]) nBest = n;
        if (nbad[nBest][N - 1] === 0) break;
      }
    }

    const segs = [];
    let n = nBest, node = N - 1;
    while (n > 0 && node > 0) {
      const j = par[n][node];
      if (j < 0) break;
      segs.push([j, node]);
      node = j; n--;
    }
    segs.reverse();
    if (!segs.length) return null;
    return segs.map(([a, b]) => {
      const bc = bestCombo(a, b);
      return {
        z0: r2(grid[a]), z1: r2(grid[b]),
        bar: bc.bar, V: String(bc.V), H: String(bc.H),
        phiVn: bc.phi, Avs: bc.Avs, feasible: bc.feasible,
      };
    });
  }

  // ---------------------------------------------------------------
  //  Auto-pick a SHEAR stirrup that passes over the whole wall.
  //  No segmentation — a single full-depth band governs.  Among the
  //  passing combos the constructability-weighted steel area wins;
  //  if none pass the strongest layout is returned (feasible=false).
  // ---------------------------------------------------------------
  function pickShearStirrup(env, P, dMin, opts) {
    opts = opts || {};
    const z = env && env.z;
    if (!Array.isArray(z) || !z.length) return null;
    const zTop = Math.min.apply(null, z);
    const zBot = Math.max.apply(null, z);
    const Vu = bandDemand(env, zTop, zBot, P.factor, P.amplifier).Vu;
    const d  = (isFinite(dMin) && dMin > 0) ? dMin : (P.thickness - P.cover);
    const BARS = opts.bars || ['D10','D13','D16'];
    const SPS  = opts.spacings || [10, 15, 20, 25, 30, 60];
    let best = null, strong = null;
    for (const bar of BARS) {
      for (const V of SPS) {
        for (const H of SPS) {
          const Pseg = Object.assign({}, P, { shear: { bar, V, H } });
          const r = shearSegment(0, zTop, zBot, Vu, d, Pseg);
          if (!strong || r.PhiVn > strong._phi)
            strong = { bar, V: String(V), H: String(H), _phi: r.PhiVn };
          if (r.status) {
            const steel = barArea(bar) * (P.b / H) / V;            // proxy area
            const cost  = steel * (1 + rebarSpacingWeight(V) + rebarSpacingWeight(H));
            if (!best || cost < best._c)
              best = { bar, V: String(V), H: String(H), _c: cost };
          }
        }
      }
    }
    const p = best || strong;
    return p ? { bar: p.bar, V: p.V, H: p.H, feasible: !!best } : null;
  }

  // ---------------------------------------------------------------
  //  Auto-pick a TEMPERATURE / shrinkage bar+spacing that satisfies
  //  Ash ≥ Ash_req.  Cheapest constructability-weighted steel wins.
  // ---------------------------------------------------------------
  function pickTemperatureSteel(P, opts) {
    opts = opts || {};
    const BARS = opts.bars || ['D10','D13','D16','D19'];
    const SPS  = opts.spacings || [10, 12.5, 15, 20, 25, 30, 45];
    let best = null, strong = null;
    for (const bar of BARS) {
      for (const s of SPS) {
        const t = temperatureSteel(Object.assign({}, P, { temp: { bar, spacing: s } }));
        if (!strong || t.As > strong._as)
          strong = { bar, spacing: String(s), _as: t.As };
        if (t.status) {
          const cost = t.As * (1 + rebarSpacingWeight(s) + rebarSizeWeight(bar) * 0.3);
          if (!best || cost < best._c)
            best = { bar, spacing: String(s), _c: cost };
        }
      }
    }
    const p = best || strong;
    return p ? { bar: p.bar, spacing: p.spacing, feasible: !!best } : null;
  }

  // ---------------------------------------------------------------
  //  Full diaphragm-wall auto-design: flexural (both faces) + shear
  //  + temperature, with a SHARED spacing anchor so the whole layout
  //  uses a consistent spacing rather than a different one per band.
  //
  //  Two passes:
  //    1. Optimise each face / shear independently (no anchor) to
  //       discover what spacings the demand naturally wants.
  //    2. Take the length-weighted modal main spacing across BOTH
  //       faces as the anchor, re-optimise flexure nudged toward it;
  //       take the modal vertical stirrup pitch as the shear anchor
  //       and re-optimise shear (horizontal pitch left free).
  //
  //  Returns { exca, soil, shear, temp, anchorSp, anchorV }.
  // ---------------------------------------------------------------
  function optimizeDiaphragmRebar(env, P, opts) {
    opts = opts || {};
    const fOpt = { maxSeg: opts.maxSeg || 4, gridStep: opts.gridStep || 1,
                   gamma: opts.gamma != null ? opts.gamma : 0.10 };
    // Pass 1 — independent.
    const exca1 = optimizeSideSegments(env, 'exca', P, fOpt);
    const soil1 = optimizeSideSegments(env, 'soil', P, fOpt);
    const items = [];
    (exca1 || []).concat(soil1 || []).forEach(s => {
      if (s) items.push({ spacing: s.spacing, len: (s.z1 - s.z0) });
    });
    const anchorSp = weightedSpacingMode(items);

    // Pass 2 — flexure nudged toward the shared anchor spacing.
    const fOpt2 = Object.assign({}, fOpt, { anchorSp: anchorSp });
    const exca = optimizeSideSegments(env, 'exca', P, fOpt2) || exca1;
    const soil = optimizeSideSegments(env, 'soil', P, fOpt2) || soil1;

    // Effective depth carried into shear (min across flexural bands).
    let dMin = Infinity;
    (exca || []).concat(soil || []).forEach(s => {
      if (s && s.d != null && s.d < dMin) dMin = s.d;
    });
    if (!isFinite(dMin)) dMin = P.thickness - P.cover;

    const sOpt = { maxSeg: opts.maxSegShear || 4, gridStep: opts.gridStep || 1 };
    const shear1 = optimizeShearSegments(env, P, dMin, sOpt);
    const vItems = (shear1 || []).map(s => ({ spacing: s.V, len: (s.z1 - s.z0) }));
    const anchorV = weightedSpacingMode(vItems);
    const shear = optimizeShearSegments(env, P, dMin,
                    Object.assign({}, sOpt, { anchorV: anchorV })) || shear1;

    const temp = pickTemperatureSteel(P, {});
    return { exca, soil, shear, temp, anchorSp, anchorV, dMin };
  }

  function parseLimitText(value, fallback) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return { value: fallback, label: fallback != null ? `1/${Math.round(1 / fallback)}` : '' };
    const frac = raw.match(/^([0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)$/);
    if (frac) {
      const num = Number(frac[1]);
      const den = Number(frac[2]);
      if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
        return { value: num / den, label: `${frac[1]}/${frac[2]}` };
      }
    }
    const direct = Number(raw);
    if (Number.isFinite(direct) && direct > 0) return { value: direct, label: raw };
    return { value: fallback, label: fallback != null ? `1/${Math.round(1 / fallback)}` : '' };
  }

  // Top-level entry.  `resultData` is the FEM payload (needs .envelope
  // and .L); `p` carries the user rebar inputs.  Returns a structured
  // result the Wall Check UI renders as text + a Mu/φMn plot.
  function designDiaphragmWall(resultData, p) {
    const env = resultData && resultData.envelope;
    if (!env || !Array.isArray(env.z) || !env.z.length) {
      return { ok: false, error: 'No moment/shear envelope available.' };
    }
    const zTop = Math.min.apply(null, env.z);
    const zBot = Math.max.apply(null, env.z);
    // Wall length comes straight from the FEM payload (parsed from the
    // .rio by FEM_RIO) — the user no longer types it.  Fall back to the
    // envelope span only if L is somehow absent.
    const wallLen = Number(resultData.L) || (zBot - zTop);
    const P = {
      Fc: Number(p.Fc) || 280,
      b: 100,
      thickness: Number(p.thickness_cm) || 60,
      cover: Number(p.cover_cm) || 7.5,
      factor: Number(p.factor) || 1.6,
      amplifier: Number(p.amplifier) || 1.25,
      fyBoundary: p.fyBoundary || 'D19',
      fullLength_m: wallLen,
      temp: p.temp || {},
    };

    // Normalise a user range row into a usable [z0, z1] band, clamped
    // to the model depth.  Rows with no/invalid range cover the whole
    // wall.  Returned segments are sorted by z0 so the plot steps in
    // depth order regardless of input order.
    function normRows(rows, fallbackBar, fallbackSp) {
      const list = (rows && rows.length)
        ? rows.slice()
        : [{ z0: zTop, z1: zBot, bar: fallbackBar, spacing: fallbackSp }];
      list.forEach(r => {
        let a = Number(r.z0), b = Number(r.z1);
        if (!isFinite(a)) a = zTop;
        if (!isFinite(b)) b = zBot;
        if (b < a) { const t = a; a = b; b = t; }
        r._z0 = Math.max(zTop, a);
        r._z1 = Math.min(zBot, b);
      });
      return list.sort((x, y) => x._z0 - y._z0);
    }

    // ---- Flexural: excavation + soil side, explicit per-row ranges ----
    function sideSegments(rows, pick, fb, fs) {
      const list = normRows(rows, fb, fs);
      return list.map((r, i) => {
        const dem = bandDemand(env, r._z0, r._z1, P.factor,P.amplifier);
        return flexuralSegment(
          { bar: r.bar, spacing: Number(r.spacing),
            bar2: r.bar2 || null,
            spacing2: r.spacing2 != null ? Number(r.spacing2) : null },
          i, r._z0, r._z1, pick(dem), P);
      });
    }
    const exca = sideSegments(p.exca && p.exca.rows, d => d.excaMu, 'D25', 15);
    const soil = sideSegments(p.soil && p.soil.rows, d => d.soilMu, 'D22', 15);

    // ---- Temperature steel (user-provided bar + spacing) ----
    const temp = temperatureSteel(P);

    // ---- Shear: per-row range stirrup, d = min effective depth across
    //      both moment sides (most conservative). ----
    let dMin = Infinity;
    exca.concat(soil).forEach(s => { if (s.d < dMin) dMin = s.d; });
    if (!isFinite(dMin)) dMin = P.thickness - P.cover;
    const shearList = normRows(p.shear && p.shear.rows, 'D16', null);
    const shear = shearList.map((r, i) => {
      const dem = bandDemand(env, r._z0, r._z1, P.factor,P.amplifier);
      const Pseg = Object.assign({}, P, {
        shear: { bar: r.bar, V: Number(r.V) || 15, H: Number(r.H) || 15 },
      });
      return shearSegment(i, r._z0, r._z1, dem.Vu, dMin, Pseg);
    });

    // ---- Displacement check: δ_max / H ≤ 1/200 ----
    let dispMaxCm = 0;
    const ex = (resultData.extremes && resultData.extremes.disp_mm) || null;
    if (ex) {
      dispMaxCm = Math.max(Math.abs(ex.max ? ex.max.value : 0),
                           Math.abs(ex.min ? ex.min.value : 0)) / 10.0; // mm→cm
    }
    const Hcm = P.fullLength_m * 100;
    const dispRatio = Hcm > 0 ? dispMaxCm / Hcm : 0;
    const dispLimitInfo = parseLimitText(p.disp_limit_text, 1 / 200);
    const dispLimit = dispLimitInfo.value;
    const displacement = {
      max_cm: dispMaxCm, total_depth_m: P.fullLength_m,
      ratio: dispRatio, limit: dispLimit, limit_label: dispLimitInfo.label, status: dispRatio <= dispLimit,
    };

    // ---- Mu / φMn plot ----
    // φMn is a STEP function of depth: each segment band has its own
    // capacity (per-segment rebar), so the capacity envelope is a
    // staircase, not a single constant line.  Soil side is plotted at
    // +φMn, excavation side at −φMn, each labelled with its bar@spacing.
    const fmtBar = s => `${s.bar}@${Math.round(s.spacing * 10)}` +
      (s.bar2 ? ` + ${s.bar2}@${Math.round(s.spacing2 * 10)}` : '');   // cm→mm label
    // φVn resists shear in either direction, so it is drawn as a
    // mirrored step (±φVn) against the factored shear envelope.
    const fmtStir = s =>
      `${s.bar}@${Math.round(s.V * 10)}/${Math.round(s.H * 10)}`;
    const plot = {
      z: env.z,
      mu_exca: (env.moment_min || env.z.map(() => 0)).map(v => v * P.factor/P.amplifier),
      mu_soil: (env.moment_max || env.z.map(() => 0)).map(v => v * P.factor/P.amplifier),
      soil_segs: soil.map(s => ({ z0: s.z0, z1: s.z1, phiMn: +s.PhiMn, label: fmtBar(s) })),
      exca_segs: exca.map(s => ({ z0: s.z0, z1: s.z1, phiMn: -s.PhiMn, label: fmtBar(s) })),
      vu_neg: (env.shear_min || env.z.map(() => 0)).map(v => v * P.factor/P.amplifier),
      vu_pos: (env.shear_max || env.z.map(() => 0)).map(v => v * P.factor/P.amplifier),
      shear_pos: shear.map(s => ({ z0: s.z0, z1: s.z1, phiVn: +s.PhiVn, label: fmtStir(s) })),
      shear_neg: shear.map(s => ({ z0: s.z0, z1: s.z1, phiVn: -s.PhiVn, label: fmtStir(s) })),
    };

    const allPass = exca.every(s => s.status) && soil.every(s => s.status)
                 && shear.every(s => s.status) && temp.status && displacement.status;

    return {
      ok: true,
      params: P,
      flexural: { exca, soil },
      temperature: temp,
      shear,
      displacement,
      plot,
      status: allPass ? 'PASS' : 'FAIL',
    };
  }

  // =================================================================
  //  RC PILE WALL (cast-in-place circular bored piles, single row)
  //  Ported from GSDAS_mod/Core/Analysis/BoringPilesAnalysis.cs
  //  (CirclePMCurve + GetPhiValue + MainSteelCheck + circular shear).
  //  Circular section → axial+moment P–M interaction, not pure
  //  flexure like the diaphragm wall.  All section maths in kgf-cm.
  // =================================================================

  // ACI φ transition (BoringPilesAnalysis.GetPhiValue).  The curve
  // used depends on the *stirrup* steel grade (fysType) and whether
  // hoops are tied (0) or spiral (1) — faithful to the source.
  function _pilePhi(Et, fysType, stirrupType) {
    let phi;
    if (fysType === 4200) {
      phi = 0.48 + 83 * Et; if (phi < 0.65) phi = 0.65;
      if (stirrupType === 1) { phi = 0.57 + 67 * Et; if (phi < 0.7) phi = 0.7; }
    } else if (fysType === 3500) {
      phi = 0.52 + 76 * Et; if (phi < 0.65) phi = 0.65;
      if (stirrupType === 1) { phi = 0.60 + 61 * Et; if (phi < 0.7) phi = 0.7; }
    } else {
      phi = 0.55 + 69 * Et; if (phi < 0.65) phi = 0.65;
      if (stirrupType === 1) { phi = 0.62 + 56 * Et; if (phi < 0.7) phi = 0.7; }
    }
    if (phi > 0.9) phi = 0.9;
    return phi;
  }

  // Circular-section P–M interaction curve (21 points, axial 0 →
  // −Pnmax).  Returns parallel arrays of φ, Pn, Mn (kgf, kgf-cm) and
  // the net-tensile strain εt.  Compression is negative.
  function _pilePMCurve(P) {
    const D = P.diameter, Fc = P.Fc, Fy = P.Fy, Es = 2.04e6;
    const beta1 = Fc <= 280 ? 0.85
                            : Math.max(0.65, 0.85 - 0.05 * (Fc - 280) / 70);
    // Outermost compression fibre → centroid of the furthest bar.
    const dEff = D - P.cover - barDia('D16') - barDia(P.mainBar) / 2;
    const Ag = Math.PI * D * D / 4;
    const Abar = barArea(P.mainBar) * P.bundle;     // one bar position
    const AstTot = Abar * P.nBars;
    const Pnmax = 0.85 * (Fc * (Ag - AstTot)) + Fy * AstTot;   // kgf
    const out = { phi: [], pn: [], mn: [], et: [],
                  Pnmax: Pnmax, dEff: dEff, beta1: beta1, AstTot: AstTot };
    const dP = Pnmax / 20;
    for (let i = 0; i < 21; i++) {
      const target = i * (-dP);
      let elo = 0, eup = 0, Et = 0, rec = null;
      for (let j = 1; j < 100; j++) {
        if (j === 1)      { elo = -0.002; Et = -0.002; }
        else if (j === 2) { Et = 0.1; eup = 0.1; }
        else if (j === 3) { Et = (elo + Et) / 2; }
        const phi = _pilePhi(Et, P.fysType, P.stirrupType);
        const c = 0.003 * dEff / (0.003 + Et);
        const a = beta1 * c;
        let y = D / 2 - a;
        const x = Math.sqrt(Math.max(0, Math.pow(D / 2, 2) - y * y));
        let thita;
        if (y < 0) { y = Math.abs(y); thita = Math.PI / 2 + Math.atan(y / x); }
        else       { thita = Math.atan(x / y); }
        let Xc = (4 * (D / 2) * Math.pow(Math.sin(thita), 3)) /
                 (3 * (2 * thita - Math.sin(2 * thita)));
        let A = (Math.pow(D / 2, 2) * (2 * thita - Math.sin(2 * thita))) / 2;
        if (Math.abs(y) > D / 2) { A = Math.pow(D / 2, 2) * Math.PI; Xc = 0; }
        if (!isFinite(A) || A < 0) A = 0;
        if (!isFinite(Xc)) Xc = 0;
        const Pnc = 0.85 * Fc * A;
        const Mnc = Pnc * Xc;
        const delta = 360 / P.nBars;
        let sP = 0, sM = 0;
        for (let k = 0; k < P.nBars; k++) {
          const yi = D / 2 - (dEff - D / 2) * Math.cos(k * delta * Math.PI / 180);
          const Es_s = 0.003 * yi / c - 0.003;
          let Pns;
          if (yi < a)               Pns = Abar * (Math.max(-Fy, Es * Es_s) + 0.85 * Fc);
          else if (yi > a && yi < c) Pns = Abar * Math.max(-Fy, Es * Es_s);
          else                       Pns = Abar * Math.min(Fy, Es * Es_s);
          sP += Pns;
          sM += Pns * (yi - D / 2);
        }
        const Pn = -Pnc + sP;
        const Mn = Mnc + sM;
        const diff = Math.abs(Pn - target);
        if ((target !== 0 && diff / Math.abs(target) < 0.005) ||
            (target === 0 && diff < 0.001)) {
          rec = { phi: phi, Pn: Pn, Mn: Mn, Et: Et };
          break;
        } else if (j > 2) {
          if (Pn - target > 0) { eup = Et; Et = (elo + eup) / 2; }
          else                 { elo = Et; Et = (elo + eup) / 2; }
        }
      }
      if (rec) {
        out.phi.push(rec.phi); out.pn.push(rec.Pn);
        out.mn.push(rec.Mn);   out.et.push(rec.Et);
      }
    }
    return out;
  }

  // Main-steel check against demand (BoringPilesAnalysis.MainSteelCheck,
  // circular branch).  Mu / Pu in kgf-cm / kgf.  Negligible axial
  // (Pu<1) ⇒ pure-flexure point; otherwise interpolate φMn at Pu on
  // the φP–φM curve.
  function _pileMainCheck(curve, Mu, Pu) {
    const Pn = curve.pn, Mn = curve.mn, Ph = curve.phi;
    if (!Pn.length) return { status: false, phiMn: 0, mu: Mu, pu: Pu,
                             mode: 'n/a', reason: 'P–M curve empty' };
    if (Pu < 1) {
      const cap = Math.abs(Mn[0]) * Ph[0];
      return { status: cap > Math.abs(Mu), phiMn: cap, mu: Mu, pu: Pu,
               mode: 'flexure' };
    }
    let idx = -1;
    for (let i = 0; i < Pn.length; i++) {
      if (Math.abs(Pn[i] * Ph[i]) - Math.abs(Pu) > 0) { idx = i; break; }
    }
    if (idx < 0) {
      return { status: false, phiMn: 0, mu: Mu, pu: Pu, mode: 'axial-exceed',
               reason: 'axial load exceeds section P–M capacity' };
    }
    if (idx === 0) {
      const cap = Math.abs(Mn[0]) * Ph[0];
      return { status: cap > Math.abs(Mu), phiMn: cap, mu: Mu, pu: Pu,
               mode: 'pm-low' };
    }
    const APn = Math.abs(Pn[idx - 1] * Ph[idx - 1]);
    const AMn = Math.abs(Mn[idx - 1] * Ph[idx - 1]);
    const BPn = Math.abs(Pn[idx] * Ph[idx]);
    const BMn = Math.abs(Mn[idx] * Ph[idx]);
    const FiMn = (BMn - AMn) / (BPn - APn) * (Math.abs(Pu) - APn) + AMn;
    return { status: Math.abs(FiMn) > Math.abs(Mu), phiMn: Math.abs(FiMn),
             mu: Mu, pu: Pu, mode: 'pm-interp' };
  }

  // Circular shear capacity (BoringPilesAnalysis circular shear):
  //   Vc = 0.53√Fc · 0.8 · π(D/2)²   ;  Vs = Ab·legs·Fys·d/V
  function _pileShearVc(P) {
    return 0.53 * Math.sqrt(P.Fc) * 0.8 * Math.pow(P.diameter / 2, 2) * Math.PI;
  }
  function _pileShearEval(P, num, V, legs, Vu) {
    const d = P.diameter - P.cover - barDia(num) - barDia(P.mainBar) / 2;
    const Vc = _pileShearVc(P);
    const Vs = barArea(num) * legs * P.Fys * d / V;
    const Vn = Vc + Vs, phi = 0.75;
    return {
      bar: num, V: V, legs: legs, d: d,
      Vc: Vc, Vs: Vs, Vn: Vn, phiVn: phi * Vn, phiVc: phi * Vc, Vu: Vu,
      status: phi * Vn > Vu, vs_check: 4 * Vc > Vs,
    };
  }
  // Auto stirrup: try D13/D16, 2 or 4 legs, V∈{10..30}; cheapest
  // (min Vs) that passes — mirrors CircleShearDesign ordering.
  function _pileShearAuto(P, Vu) {
    const nums = ['D13', 'D16'], sps = [10, 15, 20, 25, 30];
    const cand = [];
    for (const num of nums) {
      for (let m = 1; m <= 2; m++) {
        const legs = 2 * m;
        for (const V of sps) cand.push(_pileShearEval(P, num, V, legs, Vu));
      }
    }
    cand.sort((x, y) => x.Vs - y.Vs);
    for (const c of cand) if (c.status) return c;
    return cand.length ? cand[cand.length - 1] : null;
  }

  // Top-level RC-pile-wall design.  `resultData` carries the FEM
  // envelope; `p` the user inputs.  Demand is per single pile =
  // per-metre envelope × pile centre-to-centre spacing, ×factor
  // /amplifier (same convention as the diaphragm path).
  function designPileWall(resultData, p) {
    const env = resultData && resultData.envelope;
    if (!env || !Array.isArray(env.z) || !env.z.length) {
      return { ok: false, error: 'No moment/shear envelope available.' };
    }
    const zTop = Math.min.apply(null, env.z);
    const zBot = Math.max.apply(null, env.z);
    const factor    = Number(p.factor)    || 1.6;
    const amplifier = Number(p.amplifier) || 1.25;
    const spacing   = Number(p.spacing_m) || 1.0;            // pile c/c (m)
    const FysIn     = Number(p.Fys) || 2800;
    const P = {
      Fc:          Number(p.Fc) || 280,
      Fy:          Number(p.Fy) || 4200,
      Fys:         FysIn,
      fysType:     FysIn >= 4200 ? 4200 : (FysIn >= 3500 ? 3500 : 2800),
      diameter:    Number(p.diameter_cm) || 80,
      cover:       Number(p.cover_cm) != null ? Number(p.cover_cm) : 7.5,
      mainBar:     p.mainBar || 'D25',
      nBars:       Math.max(4, Number(p.nBars) || 12),
      bundle:      Math.max(1, Number(p.bundle) || 1),
      stirrupType: (p.stirrupType === 'spiral' || p.stirrupType === 1) ? 1 : 0,
      factor: factor, amplifier: amplifier, spacing_m: spacing,
    };
    const dem = bandDemand(env, zTop, zBot, factor, amplifier);   // t-m/m, t/m
    const Mu_perm   = Math.max(dem.excaMu, dem.soilMu);           // t-m / m
    const Mu_pile   = Mu_perm * spacing;                           // t-m / pile
    const Vu_pile   = dem.Vu  * spacing;                           // t   / pile
    const Mu_kgfcm  = Mu_pile * 1e5;
    const Vu_kgf    = Vu_pile * 1000;
    const Pu_kgf    = (Number(p.Pu_tf) || 0) * 1000;               // axial / pile

    let curve;
    try { curve = _pilePMCurve(P); }
    catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
    if (Pu_kgf > curve.Pnmax) {
      return { ok: false,
               error: 'Axial load exceeds section capacity — increase '
                    + 'diameter / main steel.' };
    }

    const main = _pileMainCheck(curve, Mu_kgfcm, Pu_kgf);

    let shear;
    if (p.shearBar) {
      const legs = (Number(p.shearLegs) === 4) ? 4 : 2;
      shear = _pileShearEval(P, p.shearBar, Number(p.shearV) || 15,
                             legs, Vu_kgf);
      shear.auto = false;
    } else {
      shear = _pileShearAuto(P, Vu_kgf);
      if (shear) shear.auto = true;
    }
    const shearOut = shear ? {
      bar: shear.bar, V: shear.V, legs: shear.legs, auto: !!shear.auto,
      d_cm: +shear.d.toFixed(2),
      Vc_t: shear.Vc / 1000, Vs_t: shear.Vs / 1000, Vn_t: shear.Vn / 1000,
      phiVn_t: shear.phiVn / 1000, phiVc_t: shear.phiVc / 1000,
      Vu_t: Vu_pile, status: !!shear.status, vs_check: !!shear.vs_check,
    } : { status: false, Vu_t: Vu_pile };

    const pmMn = curve.mn.map((m, i) => Math.abs(m * curve.phi[i]) / 1e5);
    const pmPn = curve.pn.map((pn, i) => Math.abs(pn * curve.phi[i]) / 1000);
    const mainOut = {
      status: !!main.status, mode: main.mode, reason: main.reason || '',
      phiMn_tm: main.phiMn / 1e5, Mu_tm: Mu_pile, Pu_tf: Pu_kgf / 1000,
    };
    const allPass = mainOut.status && shearOut.status &&
                    (!shear || shear.vs_check !== false);

    // ---- Secant pile: also design the rectangular "web" -----------
    // For a secant (cut) pile the solid overlap between adjacent
    // circular piles forms a rectangular section of thickness
    //   t = 2·(c/c) − D            (BoringPilesAnalysis: RectMainRebar
    //                               uses t = Width − 2(Width − c2c))
    // designed in flexure + shear EXACTLY like a diaphragm wall (per
    // metre run).  We reuse the diaphragm optimiser for one
    // representative full-depth band.
    const kind = (p.pileKind === 'secant') ? 'secant' : 'single';
    let web = null;
    if (kind === 'secant') {
      const c2c = spacing * 100;                 // cm
      const t   = 2 * c2c - P.diameter;          // web thickness (cm)
      if (t > 1) {
        const Pw = { Fc: P.Fc, b: 100, thickness: t, cover: P.cover,
                     factor: factor, amplifier: amplifier,
                     fyBoundary: 'D19' };
        const wIn = p.web || {};
        const zr0 = +zTop.toFixed(2), zr1 = +zBot.toFixed(2);
        const dmW = bandDemand(env, zTop, zBot, factor, amplifier);
        // User-specified bar → evaluate that exact layout; otherwise
        // fall back to the auto optimiser (single full-depth band).
        function flexSide(side, govMu) {
          const u = wIn[side];
          if (u && u.bar) {
            const r = flexuralSegment({
              bar: u.bar, spacing: Number(u.spacing) || 15,
              bar2: u.bar2 || null,
              spacing2: u.spacing2 != null ? Number(u.spacing2) : null,
            }, 0, zTop, zBot, govMu, Pw);
            return [{
              z0: zr0, z1: zr1, bar: r.bar, spacing: String(r.spacing),
              bar2: r.bar2 || null,
              spacing2: r.bar2 ? String(r.spacing2) : null,
              phiMn: +r.PhiMn, As: +r.As, d: r.d,
              feasible: !!r.status, user: true,
            }];
          }
          try { return optimizeSideSegments(env, side, Pw, { maxSeg: 1, gridStep: 1 }); }
          catch (e) { return null; }
        }
        const exca = flexSide('exca', dmW.excaMu);
        const soil = flexSide('soil', dmW.soilMu);
        let dMin = Infinity;
        (exca || []).concat(soil || []).forEach(s => {
          if (s && s.d != null && s.d < dMin) dMin = s.d;
        });
        if (!isFinite(dMin)) dMin = t - P.cover;
        let sh = null;
        const us = wIn.shear;
        if (us && us.bar) {
          const Pseg = Object.assign({}, Pw, {
            shear: { bar: us.bar, V: Number(us.V) || 15, H: Number(us.H) || 15 },
          });
          const r = shearSegment(0, zTop, zBot, dmW.Vu, dMin, Pseg);
          sh = [{
            z0: zr0, z1: zr1, bar: r.bar, V: String(r.V), H: String(r.H),
            phiVn: +r.PhiVn, feasible: !!r.status, user: true,
          }];
        } else {
          try { sh = optimizeShearSegments(env, Pw, dMin, { maxSeg: 1, gridStep: 1 }); }
          catch (e) { sh = null; }
        }
        const ok = exca && exca.length && exca.every(s => s.feasible) &&
                   soil && soil.length && soil.every(s => s.feasible) &&
                   sh   && sh.length   && sh.every(s => s.feasible);
        web = {
          thickness_cm: +t.toFixed(2), c2c_cm: +c2c.toFixed(1),
          exca: exca || [], soil: soil || [], shear: sh || [],
          status: ok ? 'PASS' : 'FAIL',
        };
      } else {
        web = {
          invalid: true,
          thickness_cm: +t.toFixed(2), c2c_cm: +c2c.toFixed(1),
          note: 'Pile c/c spacing ≥ diameter → the circular piles do '
              + 'not overlap, so there is no secant rectangular web. '
              + 'Use "Single-row pile", or reduce the spacing.',
        };
      }
    }
    let status = allPass ? 'PASS' : 'FAIL';
    if (web && (web.invalid || web.status !== 'PASS')) status = 'FAIL';

    return {
      ok: true,
      kind: kind,
      params: {
        Fc: P.Fc, Fy: P.Fy, Fys: P.Fys, diameter_cm: P.diameter,
        cover_cm: P.cover, mainBar: P.mainBar, nBars: P.nBars,
        bundle: P.bundle, stirrupType: P.stirrupType ? 'spiral' : 'tied',
        spacing_m: spacing, factor: factor, amplifier: amplifier,
        dEff_cm: +curve.dEff.toFixed(2),
        Ast_cm2: +curve.AstTot.toFixed(2),
        Pnmax_tf: +(curve.Pnmax / 1000).toFixed(1),
      },
      main: mainOut,
      shear: shearOut,
      web: web,
      demand: { Mu_tm: Mu_pile, Vu_t: Vu_pile, Pu_tf: Pu_kgf / 1000,
                Mu_perm: Mu_perm },
      pm: { phiMn_tm: pmMn, phiPn_tf: pmPn },
      status: status,
    };
  }

  window.WallCheckModule = {
    material:        WALL_MATERIAL,
    library:         WALL_LIBRARY,
    summarizeDemand: summarizeWallDemand,
    deriveSection:   deriveWallSection,
    buildCandidate:  buildWallCandidate,
    rebar:           REBAR,
    designDiaphragmWall:  designDiaphragmWall,
    designPileWall:       designPileWall,
    recommendSegments:    recommendSegments,
    optimizeSideSegments: optimizeSideSegments,
    optimizeShearSegments: optimizeShearSegments,
    optimizeDiaphragmRebar: optimizeDiaphragmRebar,
    pickShearStirrup:     pickShearStirrup,
    pickTemperatureSteel: pickTemperatureSteel,
  };
})();
