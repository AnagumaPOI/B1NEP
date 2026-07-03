(function () {
  const STRAND_SPECS = {
    "0.95": { label: "9.5 mm", diameter_cm: 0.95, unit_weight_kg_m: 0.432, area_mm2: 54.84, tensile_strength_kgf_mm2: 104 },
    "1.11": { label: "11.1 mm", diameter_cm: 1.11, unit_weight_kg_m: 0.580, area_mm2: 74.19, tensile_strength_kgf_mm2: 141 },
    "1.27": { label: "12.7 mm", diameter_cm: 1.27, unit_weight_kg_m: 0.774, area_mm2: 98.71, tensile_strength_kgf_mm2: 187 },
    "1.52": { label: "15.2 mm", diameter_cm: 1.52, unit_weight_kg_m: 1.101, area_mm2: 138.7, tensile_strength_kgf_mm2: 266 },
  };
  for (const spec of Object.values(STRAND_SPECS)) {
    spec.area_cm2 = spec.area_mm2 / 100;
    spec.tensile_load_kgf = spec.area_mm2 * spec.tensile_strength_kgf_mm2;
    spec.proof_load_kgf = spec.tensile_load_kgf * (15900 / 18700);
  }

  const DEFAULTS = {
    strand_count: 7,
    strand_diameter_cm: 1.27,
    tendon_fs: 1.6,
    grout_fc_kg_cm2: 210,
    tendon_grout_fs: 2.5,
    borehole_diameter_cm: 10,
    bond_length_m: 10,
    ground_bond_tau_u_kg_cm2: 4,
    ground_bond_fs: 2.5,
    manual_design_load_t: null,
  };

  function toNum(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function statusByCapacity(capacity, demand) {
    if (!(capacity > 0) || !(demand >= 0)) return "N/A";
    return capacity >= demand ? "PASS" : "FAIL";
  }

  function parseNumbers(text) {
    return String(text || "")
      .match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?/g)
      ?.map(Number) || [];
  }

  function parseInstallCommands(resultData) {
    const text = (resultData && resultData.rio_text) || "";
    const anchors = [];
    let nextId = 1;
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (/^\*\s*---\s*W direction RIO\s*---/i.test(line)) break;
      if (!line || line.startsWith("*")) continue;
      const m = line.match(/^(BUT|STR|ANC|TIR)\s*(?:\(([^)]*)\))?\s*(.*)$/i);
      if (!m) continue;
      const kw = m[1].toUpperCase();
      const parenNums = parseNumbers(m[2] || "");
      const nums = parseNumbers(m[3] || "");
      const isRemoval = nums.length === 0 && parenNums.length >= 2 && Number(parenNums[0]) === 0;
      if (isRemoval || nums.length === 0) continue;
      const id = nextId++;
      if (kw !== "ANC" && kw !== "TIR") continue;
      anchors.push({
        id,
        command: kw,
        z_m: nums[0],
        spacing_m: nums.length >= 2 ? nums[1] : null,
        inclination_deg: nums.length >= 3 ? nums[2] : null,
        lockoff_load_t: nums.length >= 4 ? nums[3] : null,
        stiffness_t_m: nums.length >= 5 ? nums[4] : null,
      });
    }
    return anchors;
  }

  function listSupportInstalls(resultData) {
    const text = (resultData && resultData.rio_text) || "";
    const supports = [];
    let nextId = 1;
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (/^\*\s*---\s*W direction RIO\s*---/i.test(line)) break;
      if (!line || line.startsWith("*")) continue;
      const m = line.match(/^(BUT|STR|ANC|TIR)\s*(?:\(([^)]*)\))?\s*(.*)$/i);
      if (!m) continue;
      const kw = m[1].toUpperCase();
      const parenNums = parseNumbers(m[2] || "");
      const nums = parseNumbers(m[3] || "");
      const isRemoval = nums.length === 0 && parenNums.length >= 2 && Number(parenNums[0]) === 0;
      if (isRemoval || nums.length === 0) continue;
      const id = nextId++;
      if (kw !== "BUT" && kw !== "STR") continue;
      supports.push({ id, command: kw, z: nums[0], z_m: nums[0] });
    }
    return supports;
  }

  function strandSpecByDiameter(diameterCm) {
    const key = Object.keys(STRAND_SPECS).find(k => Math.abs(Number(k) - Number(diameterCm)) < 1e-9) || "1.27";
    return STRAND_SPECS[key];
  }

  function summarizeDemandById(resultData, anchorId) {
    if (!resultData || anchorId == null || anchorId === "") return null;
    const key = String(anchorId);
    let best = null;
    for (const st of (resultData.stages || [])) {
      for (const s of (st.struts || [])) {
        if (String(s.id) !== key) continue;
        const absForce = Math.abs(toNum(s.force, 0));
        if (!best || absForce > best.max_force_t) {
          best = {
            max_force_t: absForce,
            signed_force_t: toNum(s.force, 0),
            anchor_id: s.id,
            z_m: s.z ?? s.depth,
            stage: st.name || "-",
          };
        }
      }
    }
    return best;
  }

  function anchorIdLabel(anchor, demand) {
    if (!anchor) return "(none)";
    const z = Number.isFinite(Number(anchor.z_m)) ? Number(anchor.z_m).toFixed(2) : "-";
    return `id ${anchor.id} @ z=${z} m`;
  }

  function buildCandidate(resultData, anchorId, inputs) {
    const anchors = parseInstallCommands(resultData);
    const anchor = anchors.find(a => String(a.id) === String(anchorId)) || anchors[0] || null;
    const demand = summarizeDemandById(resultData, anchor ? anchor.id : anchorId);
    const p = Object.assign({}, DEFAULTS, inputs || {});
    const Tw = toNum(p.manual_design_load_t, 0) > 0
      ? toNum(p.manual_design_load_t, 0)
      : (demand ? toNum(demand.max_force_t, 0) : 0);
    const spec = strandSpecByDiameter(p.strand_diameter_cm);

    const N = toNum(p.strand_count, 0);
    const fs = spec.tensile_load_kgf;
    const tendonFs = toNum(p.tendon_fs, 0);
    const Pw_kgf = tendonFs > 0 ? N * fs / tendonFs : null;
    const Pw_t = Pw_kgf != null ? Pw_kgf / 1000 : null;

    const fc = toNum(p.grout_fc_kg_cm2, 0);
    const tau_ub = 0.06 * fc;
    const tau_ab = toNum(p.tendon_grout_fs, 0) > 0 ? tau_ub / toNum(p.tendon_grout_fs, 0) : null;
    const dt = N * spec.diameter_cm;
    const La_cm = toNum(p.bond_length_m, 0) * 100;
    const Fw_kgf = tau_ab != null ? Math.PI * dt * La_cm * tau_ab : null;
    const Fw_t = Fw_kgf != null ? Fw_kgf / 1000 : null;

    const D = toNum(p.borehole_diameter_cm, 0);
    const tau_u = toNum(p.ground_bond_tau_u_kg_cm2, 0);
    const groundFs = toNum(p.ground_bond_fs, 0);
    const Ts_kgf = groundFs > 0 ? Math.PI * D * La_cm * tau_u / groundFs : null;
    const Ts_t = Ts_kgf != null ? Ts_kgf / 1000 : null;

    const tendon = {
      capacity_t: Pw_t,
      ratio: Pw_t > 0 ? Tw / Pw_t : null,
      status: statusByCapacity(Pw_t, Tw),
      Pw_kgf,
    };
    const tendonGrout = {
      tau_ub,
      tau_ab,
      dt_cm: dt,
      capacity_t: Fw_t,
      ratio: Fw_t > 0 ? Tw / Fw_t : null,
      status: statusByCapacity(Fw_t, Tw),
      Fw_kgf,
    };
    const groutGround = {
      capacity_t: Ts_t,
      ratio: Ts_t > 0 ? Tw / Ts_t : null,
      status: statusByCapacity(Ts_t, Tw),
      Ts_kgf,
    };
    const statuses = [tendon.status, tendonGrout.status, groutGround.status];
    const overall = statuses.includes("FAIL") ? "FAIL" : (statuses.every(s => s === "PASS") ? "PASS" : "N/A");

    return {
      anchor,
      anchors,
      demand,
      inputs: Object.assign({}, p, {
        strand_diameter_cm: spec.diameter_cm,
        strand_area_cm2: spec.area_cm2,
        strand_area_mm2: spec.area_mm2,
        strand_tensile_load_kgf: spec.tensile_load_kgf,
        strand_yield_load_kgf: spec.proof_load_kgf,
        strand_tensile_strength_kgf_mm2: spec.tensile_strength_kgf_mm2,
        strand_unit_weight_kg_m: spec.unit_weight_kg_m,
        strand_label: spec.label,
      }),
      design_load_t: Tw,
      tendon,
      tendonGrout,
      groutGround,
      overall,
    };
  }

  window.AnchorCheckModule = {
    defaults: DEFAULTS,
    strandSpecs: STRAND_SPECS,
    strandSpecByDiameter,
    listAnchors: parseInstallCommands,
    listSupportInstalls,
    summarizeDemandById,
    anchorIdLabel,
    buildCandidate,
  };
})();
