// Simple Soil Buider
//
// Friendly soil-layer editor that writes the existing internal
// model.layers format:
//   { depth, gamma, gamma_sub, c, phi, Da, Dp, Ka, K0, Kp, kh }
//
// Effective stress rows use c' / phi'. Total stress rows use su as c
// and phi = 0. K0/Ka/Kp are auto-filled from selectable formulas but
// remain editable before applying.

(function () {
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function num(v) {
    const n = Number(String(v == null ? '' : v).trim());
    return Number.isFinite(n) ? n : null;
  }

  function ratioNum(v) {
    const raw = String(v == null ? '' : v).trim();
    if (!raw) return null;
    const m = raw.match(/^([+-]?\d+(?:\.\d+)?)\s*\/\s*([+-]?\d+(?:\.\d+)?)$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      return Number.isFinite(a) && Number.isFinite(b) && Math.abs(b) > 1e-12 ? a / b : null;
    }
    return num(raw);
  }

  function fmt(v, digits) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '';
    return n.toFixed(digits);
  }

  function coeffsFromPhi(phiDeg) {
    const phi = Number(phiDeg);
    if (!Number.isFinite(phi)) return null;
    const s = Math.sin(phi * Math.PI / 180.0);
    if (Math.abs(1 + s) < 1e-12 || Math.abs(1 - s) < 1e-12) return null;
    return {
      K0: Math.max(0, 1 - s),
      Ka: (1 - s) / (1 + s),
      Kp: (1 + s) / (1 - s),
    };
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function activeCoeffSettings() {
    const kaMethod = document.querySelector('input[name="qsoilKaMethod"]:checked')?.value || 'rankine';
    const kpMethod = document.querySelector('input[name="qsoilKpMethod"]:checked')?.value || 'rankine';
    const alpha = num(document.getElementById('qsoilAlphaDeg')?.value);
    const kEh = num(document.getElementById('qsoilKEh')?.value);
    const kEv = num(document.getElementById('qsoilKEv')?.value);
    return {
      kaMethod,
      kpMethod,
      alphaDeg: Number.isFinite(alpha) ? alpha : 0,
      kEh: Number.isFinite(kEh) ? kEh : 0,
      kEv: Number.isFinite(kEv) ? kEv : 0,
    };
  }

  function coulombKa(phiDeg, deltaDeg, alphaDeg = 0) {
    const phi = phiDeg * Math.PI / 180.0;
    const delta = deltaDeg * Math.PI / 180.0;
    const alpha = alphaDeg * Math.PI / 180.0;
    const cd = Math.cos(delta);
    const ca = Math.cos(alpha);
    if (!(cd > 0) || !(ca > 0)) return null;
    const rad = Math.sin(phi + delta) * Math.sin(phi - alpha) / (cd * ca);
    if (rad < 0) return null;
    const den = cd * Math.pow(1 + Math.sqrt(rad), 2);
    return den > 0 ? Math.pow(Math.cos(phi), 2) / den : null;
  }

  function coulombKp(phiDeg, deltaDeg, alphaDeg = 0) {
    const phi = phiDeg * Math.PI / 180.0;
    const delta = deltaDeg * Math.PI / 180.0;
    const alpha = alphaDeg * Math.PI / 180.0;
    const cd = Math.cos(delta);
    const ca = Math.cos(alpha);
    if (!(cd > 0) || !(ca > 0)) return null;
    const rad = Math.sin(phi + delta) * Math.sin(phi + alpha) / (cd * ca);
    if (rad < 0) return null;
    const root = Math.sqrt(rad);
    const den = cd * Math.pow(1 - root, 2);
    return den > 1e-12 ? Math.pow(Math.cos(phi), 2) / den : null;
  }

  function mononobeOkabeKa(phiDeg, deltaDeg, alphaDeg = 0, kh = 0, kv = 0, thetaDeg = 0) {
    const phi = phiDeg * Math.PI / 180.0;
    const delta = deltaDeg * Math.PI / 180.0;
    const alpha = alphaDeg * Math.PI / 180.0;
    const theta = thetaDeg * Math.PI / 180.0;
    if (Math.abs(1 - kv) < 1e-12) return null;
    const psi = Math.atan(kh / (1 - kv));
    const cPsi = Math.cos(psi);
    const cTheta = Math.cos(theta);
    const c1 = Math.cos(delta + theta + psi);
    const c2 = Math.cos(theta - alpha);
    if (!(cPsi > 0) || !(cTheta > 0) || !(c1 > 0) || !(c2 > 0)) return null;
    const rad = Math.sin(phi + delta) * Math.sin(phi - psi - alpha) / (c1 * c2);
    if (rad < 0) return null;
    const den = cPsi * cTheta * cTheta * c1 * Math.pow(1 + Math.sqrt(rad), 2);
    return den > 1e-12 ? Math.pow(Math.cos(phi - theta - psi), 2) / den : null;
  }

  function mononobeOkabeKp(phiDeg, deltaDeg, alphaDeg = 0, kh = 0, kv = 0, thetaDeg = 0) {
    const phi = phiDeg * Math.PI / 180.0;
    const delta = deltaDeg * Math.PI / 180.0;
    const alpha = alphaDeg * Math.PI / 180.0;
    const theta = thetaDeg * Math.PI / 180.0;
    if (Math.abs(1 - kv) < 1e-12) return null;
    const psi = Math.atan(kh / (1 - kv));
    const cPsi = Math.cos(psi);
    const cTheta = Math.cos(theta);
    const c1 = Math.cos(delta - theta + psi);
    const c2 = Math.cos(alpha - theta);
    if (!(cPsi > 0) || !(cTheta > 0) || !(c1 > 0) || !(c2 > 0)) return null;
    const rad = Math.sin(phi + delta) * Math.sin(phi - psi + alpha) / (c1 * c2);
    if (rad < 0) return null;
    const root = Math.sqrt(rad);
    const den = cPsi * cTheta * cTheta * c1 * Math.pow(1 - root, 2);
    return den > 1e-12 ? Math.pow(Math.cos(phi + theta - psi), 2) / den : null;
  }

  function caquotActiveKaRaw(phiDeg, deltaRatio, alphaDeg = 0, thetaDeg = 0) {
    // Caquot-Kerisel active earth pressure:
    //   Ka = Ra * Ka_Poncelet
    const phi = Number(phiDeg) * Math.PI / 180.0;
    if (!(phi > 0) || !(phi < Math.PI / 2)) return null;
    const rankine = coeffsFromPhi(phiDeg);
    if (!rankine) return null;

    const alpha = Number(alphaDeg || 0) * Math.PI / 180.0;
    const theta = Number(thetaDeg || 0) * Math.PI / 180.0;
    const ratio = clamp(Number(deltaRatio || 0), -1, 1);
    const delta = ratio * phi;
    if (Math.abs(delta) < 1e-12) return rankine.Ka;

    const cosDeltaTheta = Math.cos(delta + theta);
    const cosAlphaTheta = Math.cos(alpha - theta);
    const radicand = (Math.sin(phi + delta) * Math.sin(phi - alpha))
      / (cosDeltaTheta * cosAlphaTheta);
    if (!(cosDeltaTheta > 0) || !(cosAlphaTheta > 0) || radicand < 0) return null;

    const kaPoncelet = Math.pow(Math.cos(phi - theta), 2)
      / (cosDeltaTheta * Math.pow(1 + Math.sqrt(radicand), 2));

    const tanPhi = Math.tan(phi);
    const sinPhi = Math.sin(phi);
    const n = (2 - (Math.tan(alpha) * Math.tan(alpha) + Math.tan(delta) * Math.tan(delta))
      / (2 * tanPhi * tanPhi)) * Math.sqrt(sinPhi);

    const cotPhi = 1 / Math.tan(phi);
    const cotDelta = 1 / Math.tan(Math.abs(delta));
    const deltaRadicand = cotDelta * cotDelta - cotPhi * cotPhi;
    if (deltaRadicand < -1e-12) return null;
    const bigDeltaAbs = Math.abs(2 * Math.atan((cotPhi - Math.sqrt(Math.max(0, deltaRadicand)))
      / (1 + 1 / sinPhi)));
    const bigDelta = Math.sign(delta) * bigDeltaAbs;
    const gamma = Math.asin(clamp(Math.sin(alpha) / sinPhi, -1, 1));
    const theta0 = 0.5 * (bigDelta + alpha - gamma);
    const lambda = (theta - theta0) / (theta + theta0 + Math.PI - 2 * phi);
    const raBase = (1 - 0.9 * lambda * lambda - 0.1 * Math.pow(lambda, 4))
      * (1 - 0.3 * Math.pow(lambda, 3));
    if (!(raBase > 0)) return null;
    const logKa = Math.log(kaPoncelet) - n * Math.log(raBase);
    const Ka = Math.exp(logKa);
    return Number.isFinite(Ka) ? Ka : null;
  }

  function caquotActiveKa(phiDeg, deltaRatio, alphaDeg = 0, thetaDeg = 0) {
    const phi = Number(phiDeg);
    const da = clamp(Number(deltaRatio || 0), -1, 1);
    const omegaRatio = phi > 0 ? Number(alphaDeg || 0) / phi : 0;
    const rankine = coeffsFromPhi(phiDeg);
    if (rankine && Math.abs(omegaRatio - 1) < 1e-10 && Math.abs(da + 1) < 1e-10) {
      return rankine.Ka;
    }

    const nearExtreme = Math.abs(Math.abs(da) - 1) < 1e-10
      || Math.abs(Math.abs(omegaRatio) - 1) < 1e-10;
    const direct = nearExtreme ? null : caquotActiveKaRaw(phiDeg, deltaRatio, alphaDeg, thetaDeg);
    if (direct != null) return direct;
    if (!nearExtreme) return null;

    const epsList = [1e-4, 3e-5, 1e-5, 3e-6, 1e-6];
    const values = [];
    for (const eps of epsList) {
      const daPerturbed = da >= 0 ? Math.min(1 - eps, da) : Math.max(-1 + eps, da);
      const omegaPerturbed = omegaRatio >= 0
        ? Math.min(1 - eps, omegaRatio)
        : Math.max(-1 + eps, omegaRatio);
      const v = caquotActiveKaRaw(phiDeg, daPerturbed, omegaPerturbed * phi, thetaDeg);
      if (Number.isFinite(v)) values.push(v);
    }
    if (!values.length) return null;
    return values[values.length - 1];
  }

  function caquotPassiveBaseKp(phiDeg, alphaDeg = 0, thetaDeg = 0) {
    // Caquot-Kerisel passive earth pressure for beta = delta = 0.
    // General wall friction is then applied by the Rp reduction table.
    const phi = Number(phiDeg) * Math.PI / 180.0;
    const alpha = Number(alphaDeg || 0) * Math.PI / 180.0;
    const theta = Number(thetaDeg || 0) * Math.PI / 180.0;
    if (!(phi > 0) || !(phi < Math.PI / 2)) return null;
    if (Math.abs(alpha) > phi + 1e-12 || Math.abs(theta) >= Math.PI / 2) return null;
    const alphaEff = clamp(alpha, -phi, phi);

    const tanPhi = Math.tan(phi);
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const cosTheta = Math.cos(theta);
    //if (!(cosTheta > 0)) return null;

    const ratio = alphaEff / phi;
    const sinAlphaOverPhi = Math.sin(Math.PI * ratio);
    const sinAlphaOver4Phi = Math.sin(Math.PI * ratio / 4);
    const phi0 = 1.10 * tanPhi + 0.275 * Math.pow(tanPhi, 5 / 3);
    const phi1 = Math.pow(cosPhi, 6);
    const phi2 = 1.135 * Math.pow(tanPhi, 9 / 8);
    const phi3 = sinPhi / 2;
    const phi4 = 0.463 * sinPhi + 0.426 * Math.pow(sinPhi, 6);
    const phi5 = phi0 - phi4 - Math.log10(cosPhi * cosPhi);
    const phi6 = 0.07 * tanPhi * (1 - 0.7 * tanPhi);
    const phi7 = 0.34 * sinPhi / (0.10 + sinPhi + sinPhi * sinPhi);
    const theta1 = -Math.log10(cosTheta);
    const theta2 = Math.sin(theta);
    const theta3 = Math.pow(Math.sin(theta), 3);
    const theta7 = 1 - Math.cos(theta) + 0.62 * Math.sin(theta);
    const a4 = Math.pow(Math.tan(19 * Math.PI * ratio / 60), 2);
    const a5 = 1.124 * sinAlphaOver4Phi + 1.16 * Math.pow(sinAlphaOver4Phi, 5);
    const a6 = sinAlphaOverPhi;
    const a7 = 1 - Math.pow(1 - ratio, 2.5);
    const f1 = phi1 * theta1 + phi2 * theta2 + phi3 * theta3;
    const f2 = -0.422 * phi4 * a4 + phi5 * a5 - phi6 * a6
      + 2.5 * (1 + ratio) * Math.pow(10, -6 * (1 + ratio)) * Math.sin(2 * phi);
    const f7 = Math.sin(0.5 * (80 + 17 *  Math.pow(ratio, 3) - 25 * Math.pow(ratio, 4) - Number(phiDeg))
      * Math.PI / 180.0);
    const logN = phi0 - f1 + f2 + f7 * phi7 * theta7 * a7;
    const kp = Math.pow(10, logN - Math.log10(cosPhi));
    return Number.isFinite(kp) ? kp : null;
  }

  const RP_TABLE = {
    phis: [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60],
    ratios: [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.0],
    values: [
      [1.000,0.991,0.989,0.978,0.962,0.946,0.929,0.912,0.898,0.881,0.864],
      [1.000,0.986,0.979,0.961,0.934,0.907,0.881,0.854,0.830,0.803,0.775],
      [1.000,0.983,0.968,0.939,0.901,0.862,0.824,0.787,0.752,0.716,0.678],
      [1.000,0.980,0.954,0.912,0.860,0.808,0.759,0.711,0.666,0.620,0.574],
      [1.000,0.980,0.937,0.878,0.811,0.746,0.686,0.627,0.574,0.520,0.467],
      [1.000,0.980,0.916,0.836,0.752,0.674,0.603,0.536,0.475,0.417,0.362],
      [1.000,0.980,0.886,0.783,0.682,0.592,0.512,0.439,0.375,0.316,0.262],
      [1.000,0.979,0.848,0.718,0.600,0.500,0.414,0.339,0.276,0.221,0.174],
      [1.000,0.975,0.797,0.638,0.506,0.399,0.313,0.242,0.185,0.138,0.102],
      [1.000,0.966,0.731,0.543,0.401,0.295,0.215,0.153,0.108,0.0737,0.0492],
      [1.000,0.948,0.647,0.434,0.290,0.193,0.127,0.0809,0.0505,0.0301,0.0178],
    ],
  };

  function interp1(xs, ys, x) {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
    for (let i = 0; i < xs.length - 1; i++) {
      if (x >= xs[i] && x <= xs[i + 1]) {
        const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
        return ys[i] * (1 - t) + ys[i + 1] * t;
      }
    }
    return ys[ys.length - 1];
  }

  function caquotPassiveReduction(phiDeg, deltaRatio) {
    const phi = clamp(phiDeg, RP_TABLE.phis[0], RP_TABLE.phis[RP_TABLE.phis.length - 1]);
    const r = clamp(Math.abs(deltaRatio), 0, 1);
    const revRatios = RP_TABLE.ratios.slice().reverse();
    const byPhi = RP_TABLE.values.map(row => interp1(revRatios, row.slice().reverse(), r));
    return interp1(RP_TABLE.phis, byPhi, phi);
  }

  function caquotPassiveKp(phiDeg, deltaRatio, alphaDeg = 0) {
    const kpFull = caquotPassiveBaseKp(phiDeg, alphaDeg, 0);
    const rp = caquotPassiveReduction(phiDeg, deltaRatio);
    return Number.isFinite(kpFull) && Number.isFinite(rp) ? kpFull * rp : null;
  }

  function calcCoefficients(phiDeg, settings, daRatio, dpRatio, alphaDeg) {
    const base = coeffsFromPhi(phiDeg);
    if (!base) return null;
    const da = clamp(Number(daRatio || 0), -1, 1);
    const dp = clamp(Math.abs(Number(dpRatio || 0)), 0, 1);
    const deltaActiveDeg = clamp(Number(phiDeg) * da, -Number(phiDeg), Number(phiDeg));
    const deltaPassiveDeg = clamp(Number(phiDeg) * dp, 0, Number(phiDeg));
    let Ka = base.Ka;
    let Kp = base.Kp;
    if (settings.kaMethod === 'coulomb') Ka = coulombKa(phiDeg, deltaActiveDeg, alphaDeg) ?? Ka;
    if (settings.kaMethod === 'caquot') Ka = caquotActiveKa(phiDeg, da, alphaDeg) ?? Ka;
    if (settings.kaMethod === 'mononobe') {
      Ka = mononobeOkabeKa(phiDeg, deltaActiveDeg, alphaDeg, settings.kEh, settings.kEv) ?? Ka;
    }
    if (settings.kpMethod === 'coulomb') Kp = coulombKp(phiDeg, deltaPassiveDeg, alphaDeg) ?? Kp;
    if (settings.kpMethod === 'caquot') Kp = caquotPassiveKp(phiDeg, dp, alphaDeg) ?? Kp;
    if (settings.kpMethod === 'mononobe') {
      Kp = mononobeOkabeKp(phiDeg, deltaPassiveDeg, alphaDeg, settings.kEh, settings.kEv) ?? Kp;
    }
    return { K0: base.K0, Ka, Kp };
  }

  function defaultRow() {
    return {
      type: 'Sand',
      analysis: 'effective',
      depth: 5.0,
      gamma: 1.9,
      gamma_sub: 0.9,
      cPrime: 0.0,
      phiPrime: 30,
      sptN: '',
      su: '',
      Da: 0.0,
      Dp: 0.0,
      K0: 0.5,
      Ka: 0.333,
      Kp: 3.00,
      kh: 1000,
    };
  }

  function sptStrengthValues(analysis, sptN) {
    const n = Number(sptN);
    if (!Number.isFinite(n) || n < 0) return null;
    if (analysis === 'total') {
      const su = 0.5 + 0.7 * n;
      return { su, kh: 200 * su };
    }
    return { su: 0, kh: 1000 * n / 16 };
  }

  function inferRow(layer) {
    const L = layer || {};
    const phi = Number(L.phi);
    const c = Number(L.c);
    const savedAnalysis = L.analysis === 'total' || L.analysis === 'effective' ? L.analysis : null;
    const total = savedAnalysis
      ? savedAnalysis === 'total'
      : Number.isFinite(phi) && Math.abs(phi) < 1e-9 && Number.isFinite(c) && c > 0;
    return {
      type: String(L.type || '').trim() || (total ? 'Clay' : 'Sand'),
      analysis: total ? 'total' : 'effective',
      depth: Number.isFinite(Number(L.depth)) ? Number(L.depth) : 5.0,
      gamma: Number.isFinite(Number(L.gamma)) ? Number(L.gamma) : 1.9,
      gamma_sub: Number.isFinite(Number(L.gamma_sub)) ? Number(L.gamma_sub) : 0.9,
      cPrime: total ? 0.0 : (Number.isFinite(c) ? c : 0.0),
      phiPrime: total ? 0.0 : (Number.isFinite(phi) ? phi : 30.0),
      sptN: Number.isFinite(Number(L.sptN)) ? Number(L.sptN) : '',
      su: total ? c : (Number.isFinite(Number(L.su)) ? Number(L.su) : ''),
      Da: Number.isFinite(Number(L.Da)) ? Number(L.Da) : 0.0,
      Dp: Number.isFinite(Number(L.Dp)) ? Number(L.Dp) : 0.0,
      K0: Number.isFinite(Number(L.K0)) ? Number(L.K0) : 0.5,
      Ka: Number.isFinite(Number(L.Ka)) ? Number(L.Ka) : 0.333,
      Kp: Number.isFinite(Number(L.Kp)) ? Number(L.Kp) : 3.00,
      kh: Number.isFinite(Number(L.kh)) ? Number(L.kh) : 1000,
    };
  }

  function installSimpleSoilInput(opts) {
    const model = opts && opts.model;
    const rerenderLayers = opts && opts.rerenderLayers;

    function ensureModal() {
      if (document.getElementById('simpleSoilBuiderModal')) return;
      const wrapper = document.createElement('div');
      wrapper.innerHTML = `
        <div id="simpleSoilBuiderModal" class="modal-backdrop" aria-hidden="true">
          <div class="modal-card" role="dialog" aria-modal="true"
               aria-labelledby="quickSoilInputTitle" style="width:1180px;">
            <style>
              #simpleSoilBuiderModal .qsoil-supports {
                overflow-x: hidden;
              }
              #simpleSoilBuiderModal .qsoil-table {
                width: 100%;
                table-layout: fixed;
                border-collapse: collapse;
              }
              #simpleSoilBuiderModal .qsoil-table th,
              #simpleSoilBuiderModal .qsoil-table td {
                padding: 4px 3px;
                white-space: nowrap;
              }
              #simpleSoilBuiderModal .qsoil-table input,
              #simpleSoilBuiderModal .qsoil-table select {
                box-sizing: border-box;
                font-size: 12px;
                padding: 3px 5px;
                height: 27px;
                min-width: 0;
              }
              #simpleSoilBuiderModal [data-qsoil-id] {
                min-width: 0;
                text-align: center;
              }
              #simpleSoilBuiderModal [data-qsoil-type] {
                width: 100%;
              }
              #simpleSoilBuiderModal [data-qsoil-analysis] {
                width: 100%;
              }
              #simpleSoilBuiderModal [data-qsoil-depth],
              #simpleSoilBuiderModal [data-qsoil-gamma],
              #simpleSoilBuiderModal [data-qsoil-gammasub],
              #simpleSoilBuiderModal [data-qsoil-cp],
              #simpleSoilBuiderModal [data-qsoil-phip],
              #simpleSoilBuiderModal [data-qsoil-sptn],
              #simpleSoilBuiderModal [data-qsoil-su],
              #simpleSoilBuiderModal [data-qsoil-da],
              #simpleSoilBuiderModal [data-qsoil-dp],
              #simpleSoilBuiderModal [data-qsoil-k0],
              #simpleSoilBuiderModal [data-qsoil-ka],
              #simpleSoilBuiderModal [data-qsoil-kp] {
                width: 100%;
              }
              #simpleSoilBuiderModal [data-qsoil-kh] {
                width: 100%;
              }
            </style>
            <div class="modal-head">
              <div id="quickSoilInputTitle" class="modal-title">Simple Soil Builder</div>
              <button class="modal-close" type="button" data-qsoil-close="1">&times;</button>
            </div>
            <div class="maker-supports qsoil-supports">
              <table class="qsoil-table">
                <thead>
                  <tr>
                    <th style="width:24px;">Layer</th>
                    <th style="width:118px;">Soil Type</th>
                    <th style="width:92px;">Analysis</th>
                    <th style="width:58px;">z bottom</th>
                    <th style="width:52px;">&gamma;t</th>
                    <th style="width:58px;">&gamma;sub</th>
                    <th style="width:52px;">c'</th>
                    <th style="width:52px;">&phi;'</th>
                    <th style="width:54px;">SPT-N</th>
                    <th style="width:54px;">su</th>
                    <th style="width:52px;">Da</th>
                    <th style="width:52px;">Dp</th>
                    <th style="width:52px;">K0</th>
                    <th style="width:52px;">Ka</th>
                    <th style="width:52px;">Kp</th>
                    <th style="width:88px;">kh</th>
                    <th style="width:24px;"></th>
                  </tr>
                </thead>
                <tbody id="qsoilRows"></tbody>
              </table>
            </div>
            <div class="maker-note" id="qsoilFormulaControls"></div>
            <div class="maker-note" id="qsoilMessage"></div>
            <div class="modal-actions" style="justify-content:space-between;">
              <button type="button" id="qsoilAdd">+ Layer</button>
              <span style="flex:1;"></span>
              <button type="button" data-qsoil-close="1">Cancel</button>
              <button type="button" id="qsoilApply">Apply to Site</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(wrapper.firstElementChild);

      const modal = document.getElementById('simpleSoilBuiderModal');
      modal.addEventListener('click', e => {
        if (e.target === modal || e.target.closest('[data-qsoil-close="1"]')) closeModal();
      });
      document.getElementById('qsoilAdd').addEventListener('click', () => addRow());
      document.getElementById('qsoilApply').addEventListener('click', applyRows);
    }

    function optionHtml(values, selected) {
      return values.map(v =>
        `<option value="${esc(v)}"${String(v) === String(selected) ? ' selected' : ''}>${esc(v)}</option>`
      ).join('');
    }

    function methodRadio(name, value, label, checked) {
      return `<label style="display:inline-flex;align-items:center;gap:3px;margin-right:10px;font-size:11px;color:#445;">
        <input type="radio" name="${name}" value="${value}"${checked ? ' checked' : ''}>${label}
      </label>`;
    }

    function formulaSelectorHtml() {
      return `<div style="display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;align-items:center;">
        <div><b>Ground slope alpha</b></div>
        <div>
          <input id="qsoilAlphaDeg" type="text" value="0.0" style="width:54px;font-size:11px;padding:1px 3px;">
          <span style="color:#667;">deg, used by Coulomb / Caquot-Kerisel</span>
        </div>
        <div><b>K0</b></div>
        <div>simplified Jaky equation (1 - sin &phi;')</div>
        <div><b>Ka</b></div>
        <div>
          ${methodRadio('qsoilKaMethod', 'rankine', 'Rankine', true)}
          ${methodRadio('qsoilKaMethod', 'coulomb', 'Coulomb', false)}
          ${methodRadio('qsoilKaMethod', 'caquot', 'Caquot-Kerisel', false)}
          ${methodRadio('qsoilKaMethod', 'mononobe', 'Mononobe-Okabe', false)}
        </div>
        <div><b>Kp</b></div>
        <div>
          ${methodRadio('qsoilKpMethod', 'rankine', 'Rankine', true)}
          ${methodRadio('qsoilKpMethod', 'coulomb', 'Coulomb', false)}
          ${methodRadio('qsoilKpMethod', 'caquot', 'Caquot-Kerisel', false)}
          ${methodRadio('qsoilKpMethod', 'mononobe', 'Mononobe-Okabe', false)}
        </div>
        <div id="qsoilSeismicLabel" style="display:none;"><b>Seismic</b></div>
        <div id="qsoilSeismicInputs" style="display:none;">
          kEh <input id="qsoilKEh" type="text" value="0.0" style="width:54px;font-size:11px;padding:1px 3px;">
          kEv <input id="qsoilKEv" type="text" value="0.0" style="width:54px;font-size:11px;padding:1px 3px;">
        </div>
      </div>
      <span>**Da/Dp can be either decimals or fractions.</span><br>
      <span>**Coefficients can be edited manually in the Site panel.</span>`;
    }

    function syncSeismicInputs() {
      const show = (document.querySelector('input[name="qsoilKaMethod"]:checked')?.value === 'mononobe')
        || (document.querySelector('input[name="qsoilKpMethod"]:checked')?.value === 'mononobe');
      ['qsoilSeismicLabel', 'qsoilSeismicInputs'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = show ? '' : 'none';
      });
    }

    function wireFormulaControls() {
      document.querySelectorAll('input[name="qsoilKaMethod"],input[name="qsoilKpMethod"]').forEach(el => {
        el.addEventListener('change', () => {
          syncSeismicInputs();
          recomputeAllCoefficients();
        });
      });
      ['qsoilAlphaDeg', 'qsoilKEh', 'qsoilKEv'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener('input', recomputeAllCoefficients);
          el.addEventListener('change', recomputeAllCoefficients);
        }
      });
      syncSeismicInputs();
    }

    function rowHtml(row, idx) {
      const analysis = row.analysis || 'effective';
      return `
        <tr data-qsoil-row>
          <td data-qsoil-id>${idx + 1}</td>
          <td><input data-qsoil-type type="text" value="${esc(row.type || 'Sand')}"></td>
          <td><select data-qsoil-analysis>${optionHtml(['effective','total'], analysis)}</select></td>
          <td><input data-qsoil-depth type="text" value="${esc(fmt(row.depth, 2))}"></td>
          <td><input data-qsoil-gamma type="text" value="${esc(fmt(row.gamma, 2))}"></td>
          <td><input data-qsoil-gammasub type="text" value="${esc(fmt(row.gamma_sub, 2))}"></td>
          <td><input data-qsoil-cp type="text" value="${esc(fmt(row.cPrime, 2))}"></td>
          <td><input data-qsoil-phip type="text" value="${esc(fmt(row.phiPrime, 2))}"></td>
          <td><input data-qsoil-sptn type="text" value="${esc(row.sptN === '' ? '' : fmt(row.sptN, 0))}"></td>
          <td><input data-qsoil-su type="text" value="${esc(row.su === '' ? '' : fmt(row.su, 2))}"></td>
          <td><input data-qsoil-da type="text" value="${esc(row.Da == null ? '0' : String(row.Da))}"></td>
          <td><input data-qsoil-dp type="text" value="${esc(row.Dp == null ? '-0.5' : String(row.Dp))}"></td>
          <td><input data-qsoil-k0 type="text" value="${esc(fmt(row.K0, 2))}"></td>
          <td><input data-qsoil-ka type="text" value="${esc(fmt(row.Ka, 2))}"></td>
          <td><input data-qsoil-kp type="text" value="${esc(fmt(row.Kp, 2))}"></td>
          <td><input data-qsoil-kh type="text" value="${esc(fmt(row.kh, 0))}"></td>
          <td><button class="tiny" type="button" data-qsoil-remove>&times;</button></td>
        </tr>`;
    }

    function renumber() {
      document.querySelectorAll('#qsoilRows tr[data-qsoil-row]').forEach((tr, i) => {
        const id = tr.querySelector('[data-qsoil-id]');
        if (id) id.textContent = String(i + 1);
      });
    }

    function syncAnalysisVisibility(tr) {
      const a = tr.querySelector('[data-qsoil-analysis]')?.value || 'effective';
      const cp = tr.querySelector('[data-qsoil-cp]');
      const ph = tr.querySelector('[data-qsoil-phip]');
      const su = tr.querySelector('[data-qsoil-su]');
      if (a === 'total') {
        if (cp) { cp.value = '0.00'; cp.disabled = true; }
        if (ph) { ph.value = '0.00'; ph.disabled = true; }
        if (su) su.disabled = false;
        if (cp) cp.style.background = '#eef1f5';
        if (ph) ph.style.background = '#eef1f5';
        if (su) su.style.background = '';
      } else {
        if (cp) cp.disabled = false;
        if (ph) ph.disabled = false;
        if (su) su.disabled = false;
        if (cp) cp.style.background = '';
        if (ph) ph.style.background = '';
        if (su) su.style.background = '';
      }
    }

    function autoStrengthFromSpt(tr, force = false) {
      const analysis = tr.querySelector('[data-qsoil-analysis]')?.value || 'effective';
      const spt = num(tr.querySelector('[data-qsoil-sptn]')?.value);
      const values = sptStrengthValues(analysis, spt);
      if (!values) return;
      const suInput = tr.querySelector('[data-qsoil-su]');
      const khInput = tr.querySelector('[data-qsoil-kh]');
      if (suInput && (force || tr.dataset.qsoilSuDirty !== '1')) {
        suInput.value = fmt(values.su, 2);
      }
      if (khInput && (force || tr.dataset.qsoilKhDirty !== '1')) {
        khInput.value = fmt(values.kh, 0);
      }
    }

    function autoCoefficients(tr, forceTotal) {
      const analysis = tr.querySelector('[data-qsoil-analysis]')?.value || 'effective';
      const phiInput = tr.querySelector('[data-qsoil-phip]');
      const phi = analysis === 'total' || forceTotal ? 0 : num(phiInput && phiInput.value);
      const da = ratioNum(tr.querySelector('[data-qsoil-da]')?.value);
      const dp = ratioNum(tr.querySelector('[data-qsoil-dp]')?.value);
      const settings = activeCoeffSettings();
      const c = calcCoefficients(phi, settings, da, dp, settings.alphaDeg);
      if (!c) return;
      tr.querySelector('[data-qsoil-k0]').value = fmt(c.K0, 2);
      tr.querySelector('[data-qsoil-ka]').value = fmt(c.Ka, 2);
      tr.querySelector('[data-qsoil-kp]').value = fmt(c.Kp, 2);
    }

    function recomputeAllCoefficients() {
      document.querySelectorAll('#qsoilRows tr[data-qsoil-row]').forEach(tr => {
        autoCoefficients(tr, (tr.querySelector('[data-qsoil-analysis]')?.value || 'effective') === 'total');
      });
    }

    function wireRow(tr) {
      tr.querySelector('[data-qsoil-remove]').addEventListener('click', () => {
        tr.remove();
        renumber();
      });
      tr.querySelector('[data-qsoil-analysis]').addEventListener('change', () => {
        const analysis = tr.querySelector('[data-qsoil-analysis]').value;
        if (analysis === 'total') {
          autoCoefficients(tr, true);
        } else {
          autoCoefficients(tr, false);
        }
        autoStrengthFromSpt(tr);
        syncAnalysisVisibility(tr);
      });
      tr.querySelector('[data-qsoil-sptn]')?.addEventListener('input', () => autoStrengthFromSpt(tr));
      tr.querySelector('[data-qsoil-sptn]')?.addEventListener('change', () => autoStrengthFromSpt(tr));
      tr.querySelector('[data-qsoil-su]')?.addEventListener('input', () => { tr.dataset.qsoilSuDirty = '1'; });
      tr.querySelector('[data-qsoil-kh]')?.addEventListener('input', () => { tr.dataset.qsoilKhDirty = '1'; });
      tr.querySelector('[data-qsoil-phip]').addEventListener('input', () => {
        if ((tr.querySelector('[data-qsoil-analysis]')?.value || 'effective') === 'effective') {
          autoCoefficients(tr, false);
        }
      });
      ['[data-qsoil-da]','[data-qsoil-dp]'].forEach(sel => {
        tr.querySelector(sel)?.addEventListener('input', () => {
          autoCoefficients(tr, (tr.querySelector('[data-qsoil-analysis]')?.value || 'effective') === 'total');
        });
      });
      syncAnalysisVisibility(tr);
    }

    function addRow(data) {
      ensureModal();
      const body = document.getElementById('qsoilRows');
      const row = data || defaultRow();
      const tmp = document.createElement('tbody');
      tmp.innerHTML = rowHtml(row, body.querySelectorAll('tr[data-qsoil-row]').length);
      const tr = tmp.firstElementChild;
      body.appendChild(tr);
      wireRow(tr);
      renumber();
    }

    function clearErrors() {
      document.querySelectorAll('#qsoilRows input, #qsoilRows select').forEach(el => {
        el.style.outline = '';
      });
      ['qsoilAlphaDeg', 'qsoilKEh', 'qsoilKEv'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.outline = '';
      });
      const msg = document.getElementById('qsoilMessage');
      if (msg) {
        msg.style.color = '#555';
        msg.textContent = '';
      }
    }

    function mark(el) {
      if (el) el.style.outline = '2px solid #d9534f';
    }

    function readRows() {
      clearErrors();
      const rows = [];
      const errors = [];
      let lastDepth = 0;
      document.querySelectorAll('#qsoilRows tr[data-qsoil-row]').forEach((tr, i) => {
        const get = sel => tr.querySelector(sel);
        const type = String(get('[data-qsoil-type]')?.value || '').trim() || `Soil Layer ${i + 1}`;
        const analysis = get('[data-qsoil-analysis]')?.value || 'effective';
        const depth = num(get('[data-qsoil-depth]')?.value);
        const gamma = num(get('[data-qsoil-gamma]')?.value);
        const gammaSub = num(get('[data-qsoil-gammasub]')?.value);
        const cp = num(get('[data-qsoil-cp]')?.value);
        const phi = num(get('[data-qsoil-phip]')?.value);
        const sptRaw = String(get('[data-qsoil-sptn]')?.value || '').trim();
        const sptN = sptRaw ? num(sptRaw) : null;
        const su = num(get('[data-qsoil-su]')?.value);
        const Da = ratioNum(get('[data-qsoil-da]')?.value);
        const Dp = ratioNum(get('[data-qsoil-dp]')?.value);
        const K0 = num(get('[data-qsoil-k0]')?.value);
        const Ka = num(get('[data-qsoil-ka]')?.value);
        const Kp = num(get('[data-qsoil-kp]')?.value);
        const kh = num(get('[data-qsoil-kh]')?.value);
        const label = `Layer ${i + 1}`;
        const settings = activeCoeffSettings();
        const alphaEl = document.getElementById('qsoilAlphaDeg');

        if (!(depth > 0) || depth <= lastDepth) { errors.push(`${label}: z bottom must be increasing and greater than 0.`); mark(get('[data-qsoil-depth]')); }
        if (!(gamma > 0)) { errors.push(`${label}: gamma_t must be greater than 0.`); mark(get('[data-qsoil-gamma]')); }
        if (!(gammaSub >= 0)) { errors.push(`${label}: gamma_sub must be 0 or greater.`); mark(get('[data-qsoil-gammasub]')); }
        if (!Number.isFinite(Da)) { errors.push(`${label}: Da must be a decimal or fraction such as 0.5 or 1/2.`); mark(get('[data-qsoil-da]')); }
        if (!Number.isFinite(Dp)) { errors.push(`${label}: Dp must be a decimal or fraction such as -0.5 or -1/2.`); mark(get('[data-qsoil-dp]')); }
        if (Number.isFinite(Da) && Math.abs(Da) > 1) { errors.push(`${label}: Da should be between -1 and 1.`); mark(get('[data-qsoil-da]')); }
        if (Number.isFinite(Dp) && Math.abs(Dp) > 1) { errors.push(`${label}: Dp should be between -1 and 1.`); mark(get('[data-qsoil-dp]')); }
        if (sptRaw && !(sptN >= 0)) { errors.push(`${label}: SPT-N must be 0 or greater.`); mark(get('[data-qsoil-sptn]')); }
        if (analysis === 'total') {
          if (!(su >= 0)) { errors.push(`${label}: su must be 0 or greater for total stress analysis.`); mark(get('[data-qsoil-su]')); }
        } else {
          if (!(cp >= 0)) { errors.push(`${label}: c' must be 0 or greater.`); mark(get('[data-qsoil-cp]')); }
          if (!(phi >= 0 && phi <= 60)) { errors.push(`${label}: phi' must be between 0 and 60 degrees.`); mark(get('[data-qsoil-phip]')); }
          if ((settings.kaMethod === 'coulomb' || settings.kaMethod === 'caquot'
              || settings.kpMethod === 'coulomb' || settings.kpMethod === 'caquot')
              && Number.isFinite(settings.alphaDeg) && Number.isFinite(phi) && Math.abs(settings.alphaDeg) > phi) {
            errors.push(`${label}: absolute ground slope alpha cannot exceed phi'.`);
            mark(alphaEl); mark(get('[data-qsoil-phip]'));
          }
        }
        if (!(K0 > 0)) { errors.push(`${label}: K0 must be greater than 0.`); mark(get('[data-qsoil-k0]')); }
        if (!(Ka > 0)) { errors.push(`${label}: Ka must be greater than 0.`); mark(get('[data-qsoil-ka]')); }
        if (!(Kp > 0)) { errors.push(`${label}: Kp must be greater than 0.`); mark(get('[data-qsoil-kp]')); }
        if (!(kh > 0)) { errors.push(`${label}: kh must be greater than 0.`); mark(get('[data-qsoil-kh]')); }
        if (K0 > 0 && Ka > 0 && Kp > 0 && !(Kp >= K0 && K0 >= Ka)) {
          errors.push(`${label}: usual order is Kp >= K0 >= Ka; please check the edited coefficients.`);
          mark(get('[data-qsoil-k0]')); mark(get('[data-qsoil-ka]')); mark(get('[data-qsoil-kp]'));
        }

        lastDepth = Number.isFinite(depth) ? depth : lastDepth;
        rows.push({
          type,
          analysis,
          depth,
          gamma,
          gamma_sub: gammaSub,
          c: analysis === 'total' ? su : cp,
          phi: analysis === 'total' ? 0 : phi,
          sptN: sptN == null ? '' : sptN,
          su,
          Da,
          Dp,
          Ka,
          K0,
          Kp,
          kh,
        });
      });
      return { rows, errors };
    }

    function applyRows() {
      const body = document.getElementById('qsoilRows');
      if (!body || !body.querySelectorAll('tr[data-qsoil-row]').length) {
        const msg = document.getElementById('qsoilMessage');
        if (msg) { msg.style.color = '#b23'; msg.textContent = 'Please add at least one soil layer.'; }
        return;
      }
      const parsed = readRows();
      if (parsed.errors.length) {
        const msg = document.getElementById('qsoilMessage');
        if (msg) {
          msg.style.color = '#b23';
          msg.textContent = parsed.errors.slice(0, 4).join(' ');
        }
        return;
      }
      model.layers = parsed.rows;
      if (typeof rerenderLayers === 'function') rerenderLayers();
      if (typeof renderProfile2D === 'function') renderProfile2D();
      closeModal();
    }

    function seedRows() {
      const body = document.getElementById('qsoilRows');
      body.innerHTML = '';
      const source = model && Array.isArray(model.layers) && model.layers.length
        ? model.layers.map(inferRow)
        : [defaultRow()];
      source.forEach(r => addRow(r));
      const formula = document.getElementById('qsoilFormulaControls');
      if (formula) {
        formula.style.color = '#555';
        formula.innerHTML = formulaSelectorHtml();
        wireFormulaControls();
      }
      clearErrors();
    }

    function openModal() {
      ensureModal();
      seedRows();
      const modal = document.getElementById('simpleSoilBuiderModal');
      modal.classList.add('show');
      modal.setAttribute('aria-hidden', 'false');
      modal.style.display = 'flex';
      modal.style.zIndex = '9000';
    }

    function closeModal() {
      const modal = document.getElementById('simpleSoilBuiderModal');
      if (modal) {
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');
        modal.style.display = 'none';
      }
    }

    return { openModal, closeModal };
  }

  window.installSimpleSoilInput = installSimpleSoilInput;
  window.B1SoilPressureCoefficients = Object.assign({}, window.B1SoilPressureCoefficients || {}, {
    coeffsFromPhi,
    coulombKp,
    caquotPassiveKp,
  });
})();
