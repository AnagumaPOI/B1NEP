(function () {
  const STEEL_SUPPORT_MATERIAL = {
      Fy_t_cm2: 2.4,
      E_t_cm2: 2100.0,
      temp_increase: 1.25,
      Fbx_override: null,
      Fv_override: null,
      Cmx: 0.85,
      Cmy: 0.85,
    };
  
  function pickMaterial(common) {
    return {
      Fy_t_cm2: Number(common && common.Fy_t_cm2) > 0 ? Number(common.Fy_t_cm2) : STEEL_SUPPORT_MATERIAL.Fy_t_cm2,
      E_t_cm2: Number(common && common.E_t_cm2) > 0 ? Number(common.E_t_cm2) : STEEL_SUPPORT_MATERIAL.E_t_cm2,
      temp_increase: Number(common && common.temp_increase) > 0 ? Number(common.temp_increase) : STEEL_SUPPORT_MATERIAL.temp_increase,
      Fbx_override: Number(common && common.Fbx_override) > 0 ? Number(common.Fbx_override) : null,
      Fv_override: Number(common && common.Fv_override) > 0 ? Number(common.Fv_override) : null,
      Cmx: STEEL_SUPPORT_MATERIAL.Cmx,
      Cmy: STEEL_SUPPORT_MATERIAL.Cmy,
    };
  }

  function ratioStatus(value, okLimit = 1.0, softLimit = 1.05) {
    if (value == null || !Number.isFinite(value)) return 'N/A';
    if (value <= okLimit) return 'PASS';
    if (value < softLimit) return 'OK';
    return 'FAIL';
  }

  const SUPPORT_FAMILIES = {
    h_steel: 'H Steel',
    ground_anchor: 'Ground Anchor',
    slab: 'Slab',
  };
  const H_SECTIONS = window.H_SECTIONS || {};

  function degCos(deg) {
    return Math.cos(Number(deg || 0) * Math.PI / 180.0);
  }

  function parseLimitValue(value) {
    if (value == null) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const frac = raw.match(/^([0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)$/);
    if (frac) {
      const num = Number(frac[1]);
      const den = Number(frac[2]);
      if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) return num / den;
      return null;
    }
    const direct = Number(raw);
    return Number.isFinite(direct) && direct > 0 ? direct : null;
  }

  function listSupportIds(resultData) {
    const meta = new Map();
    for (const st of ((resultData && resultData.stages) || [])) {
      for (const s of (st.struts || [])) {
        const key = String(s.id);
        if (!meta.has(key)) meta.set(key, { id: key, z: s.z });
      }
    }
    return Array.from(meta.values()).sort((a, b) => Number(a.id) - Number(b.id));
  }

  function supportIdLabel(item) {
    if (!item || item.id == null) return '(none)';
    const rawZ = item.z != null ? item.z : item.z_m;
    const z = rawZ == null || Number.isNaN(Number(rawZ)) ? '-' : Number(rawZ).toFixed(2);
    return `id ${item.id} @ z=${z} m`;
  }

  function summarizeSupportDemandById(resultData, supportId) {
    if (!supportId) return null;
    let best = null;
    for (const st of ((resultData && resultData.stages) || [])) {
      for (const s of (st.struts || [])) {
        if (String(s.id) !== String(supportId)) continue;
        const absForce = Math.abs(Number(s.force || 0));
        if (!best || absForce > best.max_force_t) {
          best = {
            max_force_t: absForce,
            signed_force_t: Number(s.force || 0),
            strut_id: s.id,
            z_m: s.z,
            stage: st.name || '-',
          };
        }
      }
    }
    return best;
  }

  function buildSteelInteraction(section, opts) {
    const material = pickMaterial(opts.material);
    const As = Number(section.As_cm2);
    const Zx = Number(section.Zx_cm3);
    const rx = Number(section.rx_cm);
    const ry = Number(section.ry_cm);
    const hw = Number(section.hw_cm);
    const tw = Number(section.tw_cm);
    const Fy = material.Fy_t_cm2;
    const E = material.E_t_cm2;
    const N = Number(opts.N_t || 0);
    const M = Number(opts.M_tf_m || 0);
    const L = Number(opts.L_m || 0);
    const K = Number(opts.K || 1);
    const Ft = Number(opts.Ft_t || 0);
    const fa = As > 0 ? N / As : 0;
    const ftem = As > 0 ? Ft / As : 0;
    const klry = ry > 0 ? K * L * 100 / ry : 0;
    const klrx = rx > 0 ? K * L * 100 / rx : 0;
    const Cc = Math.sqrt(2 * Math.PI * Math.PI * E / Fy);
    const R = Cc > 0 ? klry / Cc : 0;
    const Fa = (klry < Cc)
      ? Fy * (1 - R * R / 2) / (5 / 3 + 3 * R / 8 - R * R * R / 8)
      : (12 * Math.PI * Math.PI * E) / (23 * klry * klry);
    const fbx = Zx > 0 ? M * 100 / Zx : 0;
      const Fbx = material.Fbx_override != null ? material.Fbx_override : (0.6 * Fy * material.temp_increase);
    const Fex = klrx > 0 ? 12 * Math.PI * Math.PI * E / (23 * klrx * klrx) : null;
    const Fey = klry > 0 ? 12 * Math.PI * Math.PI * E / (23 * klry * klry) : null;
    const axialRatio = Fa > 0 ? (fa + ftem) / Fa : null;
    const beamColumnSimplified = (Fa > 0 && Fbx > 0)
      ? ((fa + ftem) / Fa) + (fbx / Fbx)
      : null;
    const beamColumnDetailed = (Fa > 0 && Fbx > 0 && Fex && Fey)
      ? ((fa + ftem) / Fa) + (material.Cmx * fbx) / ((1 - ((fa + ftem) / Fex)) * Fbx)
      : null;
    const fby = 0.0;
    const Fby = Fbx;
    const combinedStressInteraction = ((0.6 * Fy) > 0 && Fbx > 0 && Fby > 0)
      ? ((fa + ftem) / (0.6 * Fy)) + (fbx / Fbx) + (fby / Fby)
      : null;
    const interaction = (axialRatio != null && axialRatio < 0.15 && beamColumnSimplified != null)
      ? beamColumnSimplified
      : beamColumnDetailed;
    const axialStatus = ratioStatus(axialRatio);
    const detailedStatus = ratioStatus(beamColumnDetailed, 1.0, 1.05);
    const simpleStatus = ratioStatus(beamColumnSimplified, 1.0, 1.05);
    const combinedStatus = ratioStatus(combinedStressInteraction, 1.0, 1.05);
    const V = Number(opts.V_t || 0);
    const fv = opts.doShear && hw > 0 && tw > 0 ? V / (hw * tw) : null;
      const Fv = opts.doShear ? (material.Fv_override != null ? material.Fv_override : (0.4 * Fy * material.temp_increase)) : null;
      const shearRatio = (fv != null && Fv) ? fv / Fv : null;
    const shearStatus = ratioStatus(shearRatio);
    let status = 'N/A';
    if (interaction != null) {
      if (shearRatio == null) status = ratioStatus(interaction);
      else {
        const worst = Math.max(interaction || 0, shearRatio || 0);
        status = ratioStatus(worst);
      }
    }
      return {
        fa, ftem, klry, klrx, Cc, R, Fa, fbx, Fbx, Fex, Fey,
        axialRatio, axialStatus,
        beamColumnSimplified, simpleStatus,
        beamColumnDetailed, detailedStatus,
        combinedStressInteraction, combinedStatus,
        fby, Fby,
        interaction, fv, Fv, shearRatio,
        shearStatus, status,
      };
  }

  function buildWaleCandidate(resultData, supportId, inputs) {
      const material = pickMaterial(inputs.common);
      const p = inputs.wale;
      const supportDemand = summarizeSupportDemandById(resultData, supportId);
      const sec = H_SECTIONS[inputs.wale.sectionName];
      if (!sec || inputs.family !== 'h_steel' || !supportDemand || p.L1 <= 0) {
        return { section: sec || null, demand: supportDemand, result: null, note: 'Requires H-steel support family, a selected support member, and L1.' };
      }
        const s = p.L1;
      const R = supportDemand.max_force_t;
    const thetaDeg = Number(inputs.diag.angleDeg || 45);
    const thetaRad = thetaDeg * Math.PI / 180.0;
    const sinTheta = Math.sin(thetaRad);
    const cosTheta = Math.cos(thetaRad);

    const strutSec = H_SECTIONS[inputs.strut.sectionName];
    const braceSec = H_SECTIONS[inputs.diag.sectionName];
    const Ks = (strutSec && inputs.strut.L > 0)
      ? material.E_t_cm2 * Number(strutSec.As_cm2) / (inputs.strut.L * 100.0)
      : 0;

    const braceSpacing = Number(inputs.diag.spacing || 0);
    const braceLength = (braceSpacing > 0 && Math.abs(sinTheta) > 1e-9)
      ? Math.abs(braceSpacing / sinTheta)
      : 0;
    const Kb = (braceSec && braceLength > 0)
      ? material.E_t_cm2 * Number(braceSec.As_cm2) / (braceLength * 100.0)
      : 0;
      const Kb_eff = Kb * sinTheta * sinTheta;
      const K_eq = Ks + 2.0 * Kb_eff;
      const Pb_h = (K_eq > 0) ? R * Kb_eff / K_eq : 0;
      const Nb = Math.abs(sinTheta) > 1e-9 ? Pb_h / sinTheta : 0;
      const Pa = Nb * cosTheta;

      const w = s > 0 ? R / s : 0;
      const L = Number(inputs.strut.L || 0);
      const Lb = braceLength;
      const headExtension = p.withHead ? 0.5 : 0.0;
      const supportReach = Math.max(0, L + headExtension);
      const compressionLength = (s > 0 || supportReach > 0) ? ((s + supportReach) / 2.0) : 0;
      const shearPartnerSpan = Math.max(0, s - 2.0 * braceSpacing);
      // Restore the original wale-style demand path used in the spreadsheet:
      // for this case the bending span is reduced by the angle-support spacing.
      const effectiveMomentSpan = Math.max(0, s - braceSpacing);
      const beamModel = p.beamModel === 'simple' ? 'simple' : 'continuous';
      const momentDivisor = beamModel === 'simple' ? 8.0 : 10.0;
      const Mw = w * effectiveMomentSpan * effectiveMomentSpan / momentDivisor;
      const Sw = shearPartnerSpan > 0 ? (w * ((s + shearPartnerSpan) / 2.0) / 2.0) : (w * s / 2.0);

      // ---- "Wale with head = No" ----------------------------------
      //   When there's no head on the wale, the wale acts as a simple
      //   bending+shear beam ??there is no axial compression path to
      //   consider ??so the screening collapses to just fb/Fb <= 1 and
      //   fv/Fv <= 1.  We compute those directly here instead of going
      //   through buildSteelInteraction (which always runs the full
      //   beam-column interaction).
      if (!p.withHead) {
        const Fy = material.Fy_t_cm2;
        const Fb = material.Fbx_override != null ? material.Fbx_override : (0.6 * Fy * material.temp_increase);
        const Fv = material.Fv_override  != null ? material.Fv_override  : (0.4 * Fy * material.temp_increase);
        const Zx = Number(sec.Zx_cm3);
        const hw = Number(sec.hw_cm);
        const tw = Number(sec.tw_cm);
        const fb = Zx > 0 ? Mw * 100 / Zx : 0;
        const fv = (hw > 0 && tw > 0) ? Sw / (hw * tw) : 0;
        const fbRatio = Fb > 0 ? fb / Fb : null;
        const fvRatio = Fv > 0 ? fv / Fv : null;
        const fbStatus = ratioStatus(fbRatio);
        const fvStatus = ratioStatus(fvRatio);
        const worst = Math.max(fbRatio || 0, fvRatio || 0);
        const overallStatus = ratioStatus(worst);
        return {
          section: sec,
          demand: supportDemand,
          result: {
            simple: true,
            fb, Fb, fbRatio, fbStatus,
            fv, Fv, fvRatio, fvStatus,
            status: overallStatus,
          },
          stiffness: { Ks, Kb, Kb_eff, K_eq },
          forceSplit: {
            R, s, thetaDeg, braceSpacing,
            Pb_h, Nb, Pa,
            L, Lb: braceLength,
            headExtension, supportReach, compressionLength,
            shearPartnerSpan, effectiveMomentSpan,
          },
          demandForces: { w, Mw, Sw, beamModel, momentDivisor },
          material,
          note: 'Wale without head: simple beam check on flexure and shear only (fb/Fb and fv/Fv).',
        };
      }

      const result = buildSteelInteraction(sec, {
        material,
        N_t: Pa,
        M_tf_m: Mw,
        L_m: compressionLength > 0 ? compressionLength : Math.max(s, 0.01),
        K: 1.0,
        Ft_t: inputs.common.Ft,
        doShear: true,
        V_t: Sw,
      });

      return {
        section: sec,
        demand: supportDemand,
        result,
        stiffness: { Ks, Kb, Kb_eff, K_eq },
        forceSplit: {
          R,
          s,
          thetaDeg,
          braceSpacing,
            Pb_h,
            Nb,
            Pa,
            L,
            Lb: braceLength,
            headExtension,
            supportReach,
            compressionLength,
            shearPartnerSpan,
            effectiveMomentSpan,
          },
        demandForces: { w, Mw, Sw, beamModel, momentDivisor },
        material,
        note: 'Wale uses the original beam-column style screening with flexure, shear, axial compression, and interaction checks based on horizontal support and angle-support geometry.',
      };
    }

  function buildStrutCandidate(resultData, supportId, inputs) {
    const material = pickMaterial(inputs.common);
    const p = inputs.strut;
    const supportDemand = summarizeSupportDemandById(resultData, supportId);
    const sec = H_SECTIONS[inputs.strut.sectionName];
    if (!sec || inputs.family !== 'h_steel' || !supportDemand || p.L <= 0 || p.Lb <= 0) {
      return { section: sec || null, demand: supportDemand, result: null, note: 'Requires H-steel support family, a selected support member, positive L, and positive Lb.' };
      }
      const N = supportDemand.max_force_t;
      const w = Number(sec.w_t_m);
      const Dt = 5 * (w + p.LL) * Math.pow(p.L * 100, 4) / (384 * STEEL_SUPPORT_MATERIAL.E_t_cm2 * Number(sec.Ix_cm4) * 100);
      const DtRatio = p.L > 0 ? Dt / (p.L * 100) : null;
      const parsedDtLimit = parseLimitValue(p.DtLimitText);
      let DtLimit = Number.isFinite(parsedDtLimit) && parsedDtLimit > 0 ? parsedDtLimit : null;
      let DtLimitSource = 'user input';
      if (DtLimit == null) {
        const hasLL = Number(p.LL || 0) !== 0;
        DtLimit = hasLL ? (1 / 360) : (1 / 240);
        DtLimitSource = hasLL ? 'default with LL present = 1/360 (IBC 2012)' : 'default without LL = 1/240';
      }
      const DtStatus = DtRatio == null ? 'N/A' : (DtRatio <= DtLimit ? 'PASS' : 'FAIL');
      const Ms = (w + p.LL) * p.L * p.L / 8.0;
      const Mb = p.MbExtra;
      const M = Ms + Mb;
    const result = buildSteelInteraction(sec, {
      material,
      N_t: N,
      M_tf_m: M,
      L_m: p.Lb,
      K: 1.0,
        Ft_t: inputs.common.Ft,
        doShear: false,
        V_t: 0.0,
      });
    return { section: sec, demand: supportDemand, result, N, L: p.L, Lb: p.Lb, LbSource: p.LbSource, Dt, DtRatio, DtLimit, DtLimitSource, DtStatus, Ms, Mb, M, note: 'Horizontal strut check uses full length L for bending/deflection and buckling length Lb for compression stability.' };
  }

  function buildAngleCandidate(resultData, supportId, inputs) {
    const material = pickMaterial(inputs.common);
    const p = inputs.diag;
    const supportDemand = summarizeSupportDemandById(resultData, supportId);
    const sec = H_SECTIONS[inputs.diag.sectionName];
    if (!sec || inputs.family !== 'h_steel' || !supportDemand || p.spacing <= 0) {
      return { section: sec || null, demand: supportDemand, result: null, note: 'Requires H-steel support family, a selected support member, and angle brace geometry inputs.' };
    }
    const wale = buildWaleCandidate(resultData, supportId, inputs);
    const N = wale && wale.forceSplit ? Number(wale.forceSplit.Nb || 0) : 0;
    const theta = Number(p.angleDeg || 0);
    const L = degCos(theta) !== 0 ? p.spacing / degCos(theta) : 0;
    const M = (Number(sec.w_t_m) + p.LL) * L * L / 8.0;
    const result = buildSteelInteraction(sec, {
      material,
      N_t: N,
      M_tf_m: M,
      L_m: L,
      K: 1.0,
      Ft_t: inputs.common.Ft,
      doShear: false,
      V_t: 0.0,
    });
    return { section: sec, demand: supportDemand, result, N, L, M, theta, sa: p.spacing, LL: p.LL, note: 'Angle brace axial load is taken from the wale force split (N_a).' };
  }

  function buildBraceCandidate(resultData, supportId, inputs) {
    const material = pickMaterial(inputs.common);
    const p = inputs.brace;
    const supportDemand = summarizeSupportDemandById(resultData, supportId);
    const sec = H_SECTIONS[inputs.brace.sectionName];
    if (!sec || inputs.family !== 'h_steel' || !supportDemand || p.sh <= 0 || p.sd <= 0) {
      return { section: sec || null, demand: supportDemand, result: null, note: 'Requires H-steel support family, a selected support member, and diagonal brace geometry inputs.' };
    }
    const Ww = supportDemand.max_force_t / p.sh;
    const theta = Number(p.angleDeg || 0);
    const sinTheta = Math.sin(theta * Math.PI / 180.0);
    const N = (Math.abs(sinTheta) > 1e-9) ? Ww * p.sd / 2.0 / sinTheta : 0;
    const L = (degCos(theta) !== 0) ? p.sd / degCos(theta) : 0;
    const source = 'corner';
    const M = (Number(sec.w_t_m) + p.LL) * L * L / 8.0;
    const result = buildSteelInteraction(sec, {
      material,
      N_t: N,
      M_tf_m: M,
      L_m: L,
      K: 1.0,
      Ft_t: inputs.common.Ft,
      doShear: false,
      V_t: 0.0,
    });
    return { section: sec, demand: supportDemand, result, Ww, source, N, L, M, theta, sh: p.sh, sd: p.sd, LL: p.LL, note: 'Diagonal brace force uses the corner branch only.' };
  }

  window.SupportCheckModule = {
    material: STEEL_SUPPORT_MATERIAL,
    families: SUPPORT_FAMILIES,
    sections: H_SECTIONS,
    listSupportIds,
    supportIdLabel,
    summarizeDemandById: summarizeSupportDemandById,
    buildSteelInteraction,
    buildWaleCandidate,
    buildStrutCandidate,
    buildAngleCandidate,
    buildBraceCandidate,
  };
})();

