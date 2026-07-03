// 2D cross-section profile renderer for the bottom strip of the
// viewer panel.
//
// Walks the same `model.stages[0..stageIdx]` that the 3D playback
// consumes, but accumulates a "scene state" object (active struts,
// water profile per side, surcharges, dredge depth, …) and turns it
// into an annotated SVG diagram inside `#profileSvg`.
//
// Exposed as a factory because the host script owns `model` and the
// `currentStageIdx` counter, and we need live access to both:
//
//     const p2d = window.installProfile2D({
//       model:              model,                  // live object ref
//       getCurrentStageIdx: () => currentStageIdx,  // reassigned, needs getter
//       wallTotalLength:    wallTotalLength,
//       getLayerColor:      getLayerColor,
//     });
//     window.renderProfile2D = p2d.renderProfile2D;
//
// After install, callers just call `renderProfile2D()` and the
// renderer reads the latest model state through the captured deps.
(function () {

  const _hex6  = c => '#' + (c & 0xFFFFFF).toString(16).padStart(6, '0');
  const escape = s => String(s).replace(/&/g, '&amp;')
                                .replace(/</g, '&lt;')
                                .replace(/>/g, '&gt;');

  window.installProfile2D = function (deps) {
    const {
      model,
      getCurrentStageIdx,
      wallTotalLength,
      getLayerColor,
    } = deps;

    // -------------------------------------------------------------------
    //  computeStageState(stageIdx)
    // -------------------------------------------------------------------
    //  Walks every action in stages 0..stageIdx and accumulates a
    //  snapshot of the scene at that point:
    //    L_total     - wall pile length (m)
    //    layers      - copy of the soil-layer list
    //    dredge      - effective excavation depth on side 2 (m)
    //    dredgeCmd   - 'EXC' or 'REM', for labelling
    //    water[s]    - array of {z, u_w} points on side s (1 or 2);
    //                  resets when a new stage issues any WAT(s)
    //    suc[s]      - latest uniform surcharge magnitude on side s
    //    sub[s]      - array of {z0,A,B,Q} for strip surcharges
    //    loa[s]      - array of {z1,z2,q1,q2} for trapezoidal loads
    //    soiBlocks   - array of {side,z1,z2,gamma,phi} for BAC/SOI
    //    struts      - active strut/anchor list, sorted by depth
    // -------------------------------------------------------------------
    function computeStageState(stageIdx) {
      const st = {
        L_total:   wallTotalLength(),
        layers:    model.layers.slice(),
        dredge:    0,
        dredgeCmd: null,
        // Active berm (or null).  Carries the EXC(n) Z1 Z2 A B geometry
        // from the most recent berm-flavoured EXC, cleared when a BAC
        // overrides the cut or a non-berm EXC supersedes it.
        berm:      null,
        water:     {1: [], 2: []},
        suc:       {1: 0,    2: 0},
        sub:       {1: [],   2: []},
        loa:       {1: [],   2: []},
        soiBlocks: [],
        struts:    [],     // populated below from activeStruts
      };
      const activeStruts = new Map();
      let   strutCounter = 0;
      const upTo = Math.min(stageIdx, model.stages.length - 1);

      // Track which (side, stage-index) pairs have already had their
      // water profile reset for that stage.  Successive WAT lines
      // within one stage build the profile; a new stage's first
      // WAT(side) replaces what was carried over.
      const waterStageSeen = {};

      for (let i = 0; i <= upTo; i++) {
        for (const a of model.stages[i].actions) {
          switch (a.type) {
            case 'EXC':
              if (a.Z1 != null) {
                st.dredge    = Number(a.Z1);
                st.dredgeCmd = 'EXC';
                // Carry berm geometry through when the action has the
                // berm flag set; otherwise plain flat cut.
                if (a.berm && a.Z2 != null && a.A != null && a.B != null) {
                  st.berm = {
                    side: (a.side|0) || 2,
                    Z1:   Number(a.Z1),
                    Z2:   Number(a.Z2),
                    A:    Number(a.A),
                    B:    Number(a.B),
                  };
                } else {
                  st.berm = null;
                }
              }
              break;
            case 'WAT': {
              const side = a.side|0;
              const key  = side + ':' + i;
              if (!waterStageSeen[key]) {
                st.water[side]     = [];      // reset on first WAT of stage
                waterStageSeen[key] = true;
              }
              st.water[side].push({ z: Number(a.Z1), u_w: Number(a.U)||0 });
              break;
            }
            case 'SUC':
              st.suc[a.side|0] = Number(a.Q);
              break;
            case 'SUB':
              st.sub[a.side|0].push({ z0: Number(a.Z1), A: Number(a.A),
                                       B:  Number(a.B),  Q: Number(a.Q) });
              break;
            case 'LOA':
              st.loa[a.side|0].push({ z1: Number(a.Z1), z2: Number(a.Z2),
                                       q1: Number(a.Q1), q2: Number(a.Q2) });
              break;
            case 'BUT':
            case 'ANC': {
              const idx = Number(a.index);
              if (idx === 0) {
                activeStruts.delete(Number(a.sub_index));
              } else {
                strutCounter += 1;
                activeStruts.set(strutCounter, {
                  id: strutCounter, kind: a.type,
                  z: Number(a.Z), S: Number(a.S), I: Number(a.I),
                  F: Number(a.F), k: Number(a.kstrut),
                  type: a.strut_type || '',
                });
              }
              break;
            }
            case 'BAC':
            case 'SOI':
              if (a.Z1 != null && a.Z2 != null) {
                const side = a.side|0;
                const z1   = Number(a.Z1);
                const z2   = Number(a.Z2);
                st.soiBlocks.push({ side, z1, z2,
                                    gamma: Number(a.UW), phi: Number(a.phi) });
                // BAC on the excavated side fills the cut back up.
                // SOI is an in-place property change; it doesn't move
                // the cut.
                if (a.type === 'BAC' && side === 2 && z1 < st.dredge) {
                  st.dredge    = z1;
                  st.dredgeCmd = 'REM';
                  // Backfill on the excavated side overrides the cut
                  // shape; the berm (if any) no longer applies.
                  st.berm      = null;
                }
              }
              break;
          }
        }
      }
      st.struts = Array.from(activeStruts.values()).sort((p, q) => p.z - q.z);
      return st;
    }

    // -------------------------------------------------------------------
    //  renderProfile2D()
    // -------------------------------------------------------------------
    //  Reads `getCurrentStageIdx()`, builds a stage state, and writes
    //  SVG primitives into `#profileSvg`.  Every visual layer is
    //  documented inline below.
    // -------------------------------------------------------------------
    function renderProfile2D() {
      const svg = document.getElementById('profileSvg');
      if (!svg) return;
      const W = svg.clientWidth  || 800;
      const H = svg.clientHeight || 240;
      if (W <= 0 || H <= 0) return;

      const currentStageIdx = getCurrentStageIdx();
      const state = computeStageState(currentStageIdx >= 0 ? currentStageIdx : -1);

      // ---- vertical span: ~20 % of the visible depth is reserved
      //      above grade for SUC arrows + labels.  Lower bound is
      //      1.5 × wall length; deeper layers are clipped at the cap.
      const Lwall = Math.max(state.L_total || 0, 1);
      const z_max = Lwall * 1.5;
      const z_min = -0.20 * z_max;

      const padT = 8, padB = 18, padL = 50, padR = 64;
      const y_top = padT, y_bot = H - padB;
      const yOf = z => y_top + (z - z_min) / (z_max - z_min) * (y_bot - y_top);
      const x_wall  = Math.round(W * 0.55);   // wall right of centre
      const wt      = 5;                       // wall thickness, px
      const xLside  = padL,         xLwall = x_wall - wt/2;
      const xRwall  = x_wall + wt/2, xRside = W - padR;

      let out = '';

      // ---- soil layers ----------------------------------------------
      //   Above the wall toe (z <= L_total): two side bands separated
      //   by the wall; the excavated side is only drawn below the
      //   current dredge so the cut shows as empty.
      //   Below the wall toe: one full-width band (no wall in the
      //   middle).  Each layer also gets a "c=… φ=… kh=…" label,
      //   right-aligned at the inner edge of the right margin so all
      //   labels share a clean vertical edge.
      const Ltot = state.L_total;
      let prev = 0;
      for (const layer of state.layers) {
        const z2 = Math.min(Number(layer.depth), z_max);
        if (!(z2 > prev)) continue;
        const col = _hex6(getLayerColor(Number(layer.phi)));
        const segments = [];
        if      (z2   <= Ltot) segments.push({ z1: prev, z2,    mode: 'sides' });
        else if (prev >= Ltot) segments.push({ z1: prev, z2,    mode: 'full'  });
        else {
          segments.push({ z1: prev, z2: Ltot, mode: 'sides' });
          segments.push({ z1: Ltot, z2,       mode: 'full'  });
        }
        for (const s of segments) {
          const y1 = yOf(s.z1), y2 = yOf(s.z2);
          if (s.mode === 'full') {
            out += `<rect x="${xLside}" y="${y1}" width="${xRside-xLside}" `
                +  `height="${y2-y1}" fill="${col}" opacity="0.55"/>`;
          } else {
            out += `<rect x="${xRwall}" y="${y1}" width="${xRside-xRwall}" `
                +  `height="${y2-y1}" fill="${col}" opacity="0.55"/>`;
            // Excavated side: nothing above `state.dredge` (the actual
            // cut at the wall).  Additionally, when a berm is active
            // the full-width soil band between Z1 and Z2 is hollowed
            // out — the berm itself is rendered separately as a
            // trapezoid later in this function.
            let top = Math.max(s.z1, state.dredge);
            if (state.berm) top = Math.max(top, state.berm.Z2);
            if (s.z2 > top) {
              out += `<rect x="${xLside}" y="${yOf(top)}" width="${xLwall-xLside}" `
                  +  `height="${y2-yOf(top)}" fill="${col}" opacity="0.55"/>`;
            }
          }
        }
        const labelY   = yOf((prev + z2) / 2);
        const labelTxt = `c=${Number(layer.c).toFixed(2)}  φ=${Number(layer.phi).toFixed(1)}°  kh=${Math.round(layer.kh)}`;
        out += `<text x="${xRside - 4}" y="${labelY + 3}" font-size="9.5" fill="#222" `
            +  `text-anchor="end">${escape(labelTxt)}</text>`;
        prev = z2;
      }

      // ---- BAC / SOI extra soil blocks ------------------------------
      for (const b of state.soiBlocks) {
        const col = _hex6(getLayerColor(b.phi));
        const xL  = b.side === 1 ? xRwall : xLside;
        const xR  = b.side === 1 ? xRside : xLwall;
        out += `<rect x="${xL}" y="${yOf(b.z1)}" width="${xR-xL}" `
            +  `height="${yOf(b.z2)-yOf(b.z1)}" fill="${col}" opacity="0.75" stroke="#7a5" stroke-width="0.5"/>`;
      }

      // ---- wall + ground line ---------------------------------------
      out += `<rect x="${xLwall}" y="${yOf(0)}" width="${wt}" height="${yOf(state.L_total)-yOf(0)}" fill="#444"/>`;
      out += `<line x1="${xLside}" y1="${yOf(0)}" x2="${xRside}" y2="${yOf(0)}" stroke="#000" stroke-width="0.7"/>`;

      // ---- excavation / backfill cut line on side 2 -----------------
      //   The dashed line sits at the current effective cut depth.
      //   The label sits ~14 px BELOW that line (i.e. inside the soil
      //   that's still there, just under the cut).  After a BAC the
      //   dredge has been pulled back up and the label reads "REM z=…"
      //   (brown) instead of "EXC z=…" (green).
      if (state.dredge > 0) {
        const cmd     = state.dredgeCmd || 'EXC';
        const lineCol = cmd === 'REM' ? '#960'    : '#0a0';
        const textCol = cmd === 'REM' ? '#7a4a00' : '#066b00';
        // With a berm: the actual floor sits at Z2 (beyond the berm);
        // the wall only "sees" the cut down to Z1.  Draw the dashed
        // line at Z2 and label both depths.  Without a berm: simple
        // flat-cut line at state.dredge.
        const lineZ = state.berm ? state.berm.Z2 : state.dredge;
        const y     = yOf(lineZ);
        out += `<line x1="${xLside}" y1="${y}" x2="${xLwall}" y2="${y}" `
            +  `stroke="${lineCol}" stroke-width="1.5" stroke-dasharray="4,3"/>`;
        const xLabel = (xLside + xLwall) / 2;
        const yLabel = y + 14;
        const text   = state.berm
          ? `${cmd} z=${state.berm.Z1.toFixed(2)} (wall) / ${state.berm.Z2.toFixed(2)} (floor)`
          : `${cmd} z=${state.dredge.toFixed(2)} m`;
        out += `<text x="${xLabel}" y="${yLabel}" font-size="11" fill="${textCol}" `
            +  `text-anchor="middle">${text}</text>`;
      }

      // ---- berm / bank wedge on side 2 ------------------------------
      //   Drawn after the cut line but before the water profile so
      //   the berm soil sits above water arrows in the z-order.
      //   Horizontal pixel scale matches the SUB rectangles (6 px/m)
      //   so a berm reads as the same size as a similar Boussinesq
      //   strip in the same diagram.  Clamped to xLside so very wide
      //   berms don't escape the pane.
      if (state.berm) {
        const b   = state.berm;
        const sc  = 6;
        const xT  = Math.max(xLside, xLwall - b.A * sc);   // top edge (z = Z1)
        const xB  = Math.max(xLside, xLwall - b.B * sc);   // foot of slope (z = Z2)
        const yZ1 = yOf(b.Z1), yZ2 = yOf(b.Z2);
        // Colour: borrow the local soil's colour so the berm reads as
        // part of the soil column.  Pick the layer that contains the
        // middle of the berm depth range.
        const midZ  = (b.Z1 + b.Z2) / 2;
        const layer = (state.layers || []).find(L => Number(L.depth) >= midZ)
                       || (state.layers || [])[(state.layers || []).length - 1];
        const col   = layer ? _hex6(getLayerColor(Number(layer.phi))) : '#c9a87a';
        // Polygon: wall@Z1 → outer@Z1 → outer@Z2 → wall@Z2
        out += `<polygon points="${xLwall},${yZ1} ${xT},${yZ1} ${xB},${yZ2} ${xLwall},${yZ2}" `
            +  `fill="${col}" opacity="0.65" stroke="#7a5" stroke-width="1" stroke-dasharray="3,2"/>`;
        // Inline label (centred on the trapezoid).
        const cx = (xT + xLwall) / 2, cy = (yZ1 + yZ2) / 2;
        out += `<text x="${cx}" y="${cy + 3}" font-size="9.5" fill="#3a2a00" `
            +  `text-anchor="middle">berm  A=${b.A}  B=${b.B}</text>`;
      }

      // ---- water profile (per side) ---------------------------------
      //   Full triangular pressure wedge built from every WAT(side)
      //   point in the current stage's water profile, plus a ▽ marker
      //   at the water surface and an arrow + "u=…" label at each
      //   non-zero point.  Scaling is shared across both sides: peak
      //   |u_w| → 60 px.
      let uMax = 0;
      for (const side of [1, 2]) {
        for (const p of state.water[side]) {
          if (Number(p.z) > Number(state.L_total) + 1e-6) continue;
          if (Math.abs(p.u_w) > uMax) uMax = Math.abs(p.u_w);
        }
      }
      const uScale = uMax > 0 ? 60 / uMax : 0;
      for (const side of [1, 2]) {
        const raw = (state.water[side] || [])
          .filter(p => Number(p.z) <= Number(state.L_total) + 1e-6);
        if (!raw || !raw.length) continue;
        const m = new Map();
        for (const p of raw) m.set(Number(p.z), Number(p.u_w));
        const pts = Array.from(m.entries()).map(([z, u]) => ({z, u_w: u}))
                        .sort((a, b) => a.z - b.z);
        const xWall = side === 1 ? xRwall : xLwall;
        const xSign = side === 1 ? 1 : -1;

        // pressure wedge
        const verts = [];
        verts.push([xWall, yOf(pts[0].z)]);
        for (const p of pts) verts.push([xWall + xSign*p.u_w*uScale, yOf(p.z)]);
        verts.push([xWall, yOf(pts[pts.length-1].z)]);
        const polyStr = verts.map(([x, y]) => `${x},${y}`).join(' ');
        out += `<polygon points="${polyStr}" fill="#06a" opacity="0.20" `
            +  `stroke="#06a" stroke-width="1"/>`;

        // explicit pressure polyline through every WAT point so
        // piecewise seepage / hydrostatic breaks remain visible even
        // when the filled wedge is visually subtle.
        const linePts = pts
          .map(p => `${xWall + xSign*p.u_w*uScale},${yOf(p.z)}`)
          .join(' ');
        out += `<polyline points="${linePts}" fill="none" stroke="#06a" `
            +  `stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>`;

        // small markers at the exact WAT definition points.
        for (const p of pts) {
          const x = xWall + xSign * p.u_w * uScale;
          const y = yOf(p.z);
          out += `<circle cx="${x}" cy="${y}" r="2.2" fill="#06a" stroke="#fff" stroke-width="0.7"/>`;
        }

        // arrow + u-label at every non-zero point
        for (const p of pts) {
          if (Math.abs(p.u_w) < 1e-9) continue;
          const xTip  = xWall;
          const xTail = xWall + xSign * p.u_w * uScale;
          const y     = yOf(p.z);
          out += `<line x1="${xTail}" y1="${y}" x2="${xTip - xSign*3}" y2="${y}" `
              +  `stroke="#06a" stroke-width="1"/>`;
          out += `<polygon points="${xTip},${y} ${xTip - xSign*5},${y-3} `
              +  `${xTip - xSign*5},${y+3}" fill="#06a"/>`;
          out += `<text x="${xTail + xSign*3}" y="${y+3}" font-size="9" fill="#06a" `
              +  `text-anchor="${side===1 ? 'start' : 'end'}">u=${p.u_w.toFixed(2)}</text>`;
        }

        // ▽ water-surface marker
        const surf  = pts.find(p => Math.abs(p.u_w) < 1e-9) || pts[0];
        const ySurf = yOf(surf.z);
        const xMark = xWall + xSign * 14;
        out += `<polygon points="${xMark-5},${ySurf-9} ${xMark+5},${ySurf-9} `
            +  `${xMark},${ySurf-1}" fill="#fff" stroke="#06a" stroke-width="1"/>`;
        out += `<line x1="${xMark-7}" y1="${ySurf-1}" x2="${xMark+7}" y2="${ySurf-1}" `
            +  `stroke="#06a" stroke-width="1"/>`;
        out += `<text x="${xMark + xSign*9}" y="${ySurf-3}" font-size="10" fill="#06a" `
            +  `text-anchor="${side===1 ? 'start' : 'end'}">WAT(${side}) z=${surf.z.toFixed(2)}</text>`;
      }

      // ---- SUC uniform surcharge (down-arrows along the top) --------
      for (const side of [1, 2]) {
        const q = state.suc[side];
        if (!q) continue;
        const xL = side === 1 ? (xRwall + 6) : (xLside + 6);
        const xR = side === 1 ? (xRside - 6) : (xLwall - 6);
        if (xR <= xL) continue;
        const yTop = yOf(0) - 16, yBot = yOf(0) - 1;
        const N    = Math.max(3, Math.floor((xR - xL) / 18));
        const step = (xR - xL) / N;
        out += `<line x1="${xL}" y1="${yTop}" x2="${xR}" y2="${yTop}" stroke="#a00" stroke-width="1"/>`;
        for (let i = 0; i <= N; i++) {
          const x = xL + i*step;
          out += `<line x1="${x}" y1="${yTop}" x2="${x}" y2="${yBot-3}" stroke="#a00" stroke-width="1"/>`;
          out += `<polygon points="${x-3},${yBot-3} ${x+3},${yBot-3} ${x},${yBot}" fill="#a00"/>`;
        }
        const xm = (xL + xR) / 2;
        out += `<text x="${xm}" y="${yTop-3}" font-size="10" fill="#a00" text-anchor="middle">SUC(${side}) Q=${q.toFixed(2)} tf/m²</text>`;
      }

      // ---- SUB strip surcharges (Boussinesq offset strip) -----------
      for (const side of [1, 2]) {
        for (const b of state.sub[side]) {
          const xWallEdge = side === 1 ? xRwall : xLwall;
          const xSign     = side === 1 ? 1 : -1;
          const xStart    = xWallEdge + xSign * Math.max(4, Math.min(60, b.A * 6));
          const xWidth    = Math.max(8, Math.min(80, (b.B - b.A) * 6));
          const xL = side === 1 ? xStart : (xStart - xWidth);
          const xR = xL + xWidth;
          const yTop = yOf(0) - 12, yBot = yOf(0) - 1;
          out += `<rect x="${xL}" y="${yTop}" width="${xR-xL}" height="${yBot-yTop}" fill="#a00" opacity="0.25" stroke="#a00" stroke-width="0.8"/>`;
          out += `<text x="${(xL+xR)/2}" y="${yTop-2}" font-size="9" fill="#a00" text-anchor="middle">SUB Q=${b.Q}</text>`;
        }
      }

      // ---- LOA trapezoid load on the wall face ----------------------
      for (const side of [1, 2]) {
        for (const b of state.loa[side]) {
          const xWallEdge = side === 1 ? xRwall : xLwall;
          const xSign     = side === 1 ? 1 : -1;
          const maxQ      = Math.max(Math.abs(b.q1), Math.abs(b.q2)) || 1;
          const wMax      = 48;
          const x1 = xWallEdge + xSign * (wMax * b.q1 / maxQ);
          const x2 = xWallEdge + xSign * (wMax * b.q2 / maxQ);
          const y1 = yOf(b.z1), y2 = yOf(b.z2);
          out += `<polygon points="${xWallEdge},${y1} ${x1},${y1} ${x2},${y2} ${xWallEdge},${y2}" fill="#088" opacity="0.4" stroke="#066" stroke-width="0.8"/>`;
          out += `<text x="${(x1+x2)/2}" y="${(y1+y2)/2}" font-size="9" fill="#066" text-anchor="middle">LOA ${b.q1}→${b.q2}</text>`;
        }
      }

      // ---- struts / anchors -----------------------------------------
      //   BUT: line + endpoint dots between the left margin and the wall
      //        (excavation side).  When I≠0 the far (open) end is
      //        rotated about the wall-end pivot — positive I tilts it
      //        downward.
      //   ANC: cap rectangle at the inside (excavation-side) wall face;
      //        tendon line pierces the wall outward into the retained
      //        soil on the right, tilted down by I degrees.
      //   Labels left-aligned at xLside so every row starts in the same
      //   vertical column.
      for (const s of state.struts) {
        const y     = yOf(s.z);
        const I     = Number(s.I) || 0;
        const I_rad = I * Math.PI / 180;
        if (s.kind === 'ANC') {
          const L_v = Math.max(40, (xRside - xRwall) * 0.7);
          const x1  = xLwall,  y1 = y;
          const x2  = xRwall + L_v * Math.cos(I_rad);
          const y2  = y      + L_v * Math.sin(I_rad);
          // tendon (line pierces through wall, into retained soil)
          out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#335577" stroke-width="2"/>`;
          // cap block flush with the inside wall face
          out += `<rect x="${xLwall-4}" y="${y-5}" width="6" height="10" fill="#223344"/>`;
          // far-end dot (grout bulb)
          out += `<circle cx="${x2}" cy="${y2}" r="3" fill="#335577"/>`;
          const tail = (s.type && s.type !== 'Custom') ? `  ${escape(s.type)}` : '';
          // Label runs along the tendon, on the retained-soil side.
          // Anchor at the wall-end (x1, y1) and offset slightly along
          // the tendon (start past the wall thickness), then rotated by
          // the line's screen angle so text aligns with the line.  The
          // baseline sits ~3 px above the line (perpendicular shift).
          const dx     = x2 - x1, dy = y2 - y1;
          const ang    = Math.atan2(dy, dx) * 180 / Math.PI;
          const startT = 12;                              // px along the line
          const tx     = x1 + Math.cos(I_rad) * startT;
          const ty     = y1 + Math.sin(I_rad) * startT;
          out += `<text x="${tx}" y="${ty - 3}" font-size="10" fill="#224466" `
              +  `text-anchor="start" transform="rotate(${ang.toFixed(2)} ${tx} ${ty})">`
              +  `#${s.id} ANC  z=${s.z.toFixed(2)}  I=${I}°  pre=${s.F}  k=${Math.round(s.k)}${tail}`
              +  `</text>`;
        } else {
          // BUT: pivot at the wall end, tilt the open end about it.
          // Positive I drops the far end by len·sin(I) (matches the 3D
          // convention where the +long-axis wall end goes down).
          const xEndL = xLside + 10;
          const len   = xLwall - xEndL;
          const yEnd  = y + len * Math.sin(I_rad);
          out += `<line x1="${xEndL}" y1="${yEnd}" x2="${xLwall}" y2="${y}" stroke="#c33" stroke-width="2.5"/>`;
          out += `<circle cx="${xEndL}" cy="${yEnd}" r="3.5" fill="#c33"/>`;
          out += `<circle cx="${xLwall}" cy="${y}" r="3.5" fill="#c33"/>`;
          const tail   = (s.type && s.type !== 'Custom') ? `  ${escape(s.type)}` : '';
          const incTxt = I ? `  I=${I}°` : '';
          out += `<text x="${xLside}" y="${y-3}" font-size="10" fill="#822" `
              +  `text-anchor="start">`
              +  `#${s.id} ${s.kind}  z=${s.z.toFixed(2)}${incTxt}  pre=${s.F}  k=${Math.round(s.k)}${tail}`
              +  `</text>`;
        }
      }

      // ---- depth scale on the right margin --------------------------
      const z_tick = Math.max(0.5, Math.ceil(z_max/8 * 2) / 2);
      for (let z = 0; z <= z_max + 0.001; z += z_tick) {
        const y = yOf(z);
        out += `<line x1="${xRside}" y1="${y}" x2="${xRside+5}" y2="${y}" stroke="#000" stroke-width="0.5"/>`;
        out += `<text x="${xRside+8}" y="${y+3}" font-size="9" fill="#000">${z.toFixed(1)}</text>`;
      }
      out += `<text x="${xRside+8}" y="${y_top+8}" font-size="9" fill="#666">z (m)</text>`;

      // ---- stage banner ---------------------------------------------
      const stageLabel = currentStageIdx >= 0
        ? `Stage ${currentStageIdx+1} / ${model.stages.length}`
        : '— initial —';
      out += `<text x="6" y="14" font-size="12" font-weight="bold" fill="#224">${stageLabel}</text>`;

      svg.innerHTML = out;
    }

    return { computeStageState, renderProfile2D };
  };
})();
