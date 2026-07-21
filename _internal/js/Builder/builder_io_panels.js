(function () {
  window.installBuilderIOPanels = function installBuilderIOPanels(deps) {
    const {
      model,
      reportState,
      isReportCurrent,
      getCurrentStageIdx,
      defaultWallSection,
      syncCwOptionUI,
      applyGeometry,
      rerenderWallSections,
      rerenderLayers,
      rerenderStages,
      syncActiveStagesRef,
      markModelDirty,
      getPyBridge,
      getActivateTab,
      showStage,
      showInitialStage,
    } = deps;

    function fmt(x, dec = 2) {
      return Number(x).toFixed(dec).replace(/\.?0+$/, '') || '0';
    }

    function rioTitleLine() {
      const flags = [];
      if (model.wall && model.wall.opt_A) flags.push('*A*');
      if (model.wall && model.wall.opt_F) flags.push('*F*');
      const tail = flags.length ? '  ' + flags.join(' ') : '';
      return '*.RIO Created by B1NEP' + tail;
    }

    function pushCaseLine(lines) {
      const name = model.wall && model.wall.case_name ? String(model.wall.case_name).trim() : '';
      if (name) lines.push('*Case: ' + name);
    }

    function pushGeometryLine(lines) {
      const w = model.wall || {};
      if (w.L > 0 || w.W > 0) {
        const stageTarget = w.directionMode === 'LW'
          ? (model.stageTargetDir || 'L')
          : ((w.direction === 'W') ? 'W' : 'L');
        lines.push(`*GEOMETRY: L=${fmt(w.L, 2)} W=${fmt(w.W, 2)} dir=${w.directionMode || w.direction || 'L'} target=${stageTarget}`);
      }
    }

    function pushWallBuilderMetaLine(lines) {
      const meta = model.wall && model.wall.wall_builder_meta;
      if (!meta || typeof meta !== 'object') return;
      if (!Object.keys(meta).length) return;
      lines.push('*WALLBUILDER ' + JSON.stringify(meta));
    }

    function supportDepthById(stages, id) {
      let sid = 0;
      for (const stage of (stages || [])) {
        for (const act of (stage.actions || [])) {
          if ((act.type === 'BUT' || act.type === 'ANC') && Number(act.index) !== 0) {
            sid += 1;
            if (sid === id) return Number(act.Z) || 0;
          }
        }
      }
      return 0;
    }

    function actionToRio(a, stagesForIds) {
      switch (a.type) {
        case 'CAL': return `CAL(${a.paren != null ? a.paren : '0'})`;
        case 'ENV': return 'CAL(2,1)';
        case 'EXC': {
          const head = `EXC(${a.side | 0}) ${fmt(a.Z1, 2)}`;
          return a.berm
            ? `${head} ${fmt(a.Z2, 2)} ${fmt(a.A, 2)} ${fmt(a.B, 2)}`
            : head;
        }
        case 'WAT': {
          const hasU2 = Number.isFinite(Number(a.U2));
          const head = hasU2 ? `WAT(${a.side | 0},1)` : `WAT(${a.side | 0})`;
          return hasU2
            ? `${head} ${fmt(a.Z1, 2)}  ${fmt(a.U, 2)}  ${fmt(a.U2, 2)}`
            : `${head} ${fmt(a.Z1, 2)}  ${fmt(a.U, 2)}`;
        }
        case 'SUC': return `SUC(${a.side | 0}) ${fmt(a.Q, 2)}`;
        case 'SUB': return `SUB(${a.side | 0}) ${fmt(a.Z1, 2)} ${fmt(a.A, 2)} ${fmt(a.B, 2)} ${fmt(a.Q, 2)}`;
        case 'BUT':
        case 'ANC': {
          if (Number(a.index) === 0) return `${a.type}(0,${a.sub_index | 0})`;
          const head = `${a.type}(${a.index | 0}) ${fmt(a.Z, 2)} ${fmt(a.S, 2)} ${a.I | 0} ${fmt(a.F, 1)} ${Math.round(a.kstrut)}`;
          const lines = [head];
          if (a.strut_type && a.strut_type !== 'Custom') lines.push(`*STRUT ${a.strut_type}`);
          if (a.strut_L != null || a.k_reduction != null || a.strut_L_mode || a.support_mode || a.theta_s != null) {
            lines.push(`*STRUTK ${JSON.stringify({
              mode: a.support_mode || a.strut_L_mode || 'symmetrical',
              L: Number(a.strut_L) || null,
              Rs: Number.isFinite(Number(a.k_reduction)) ? Number(a.k_reduction) : 0.5,
              theta_s: Number.isFinite(Number(a.theta_s)) ? Number(a.theta_s) : 0,
            })}`);
          }
          if (a.support_check && typeof a.support_check === 'object'
              && Object.keys(a.support_check).length > 0) {
            lines.push(`*SUPPORTCHECK ${JSON.stringify(a.support_check)}`);
          }
          return lines.join('\n');
        }
        case 'LOA':
          return `LOA(${a.side | 0}) ${fmt(a.Z1, 2)} ${fmt(a.Z2, 2)} ${fmt(a.Q1, 2)} ${fmt(a.Q2, 2)}`;
        case 'CFM': {
          return `CFM ${fmt(a.Z, 2)} ${fmt(a.F, 2)} ${fmt(a.M, 2)}`;
        }
        case 'CFM_LINK': {
          const sid = Number(a.support_id) | 0;
          const z = supportDepthById(stagesForIds, sid);
          const head = `CFM(${sid}) ${fmt(z, 2)} ${fmt(a.F, 2)} ${fmt(a.M, 2)}`;
          return head + '\n' + [
            fmt(a.CFY || 0, 2),
            fmt(a.CFA || 0, 2),
            fmt(a.CMY || 0, 2),
            fmt(a.CMA || 0, 2),
          ].join(' ');
        }
        case 'BAC':
        case 'SOI': {
          const head = `${a.type}(${a.side | 0}) ${fmt(a.Z1, 2)}`;
          const body = [
            fmt(a.Z2, 2), fmt(a.UW, 2), fmt(a.UW - 1, 2),
            fmt(a.Ka, 3), fmt(a.K0, 3), fmt(a.Kp, 3),
            fmt(a.c, 3), fmt(a.phi, 2), 0, -0.5,
            Math.round(a.kh), 0,
          ].join(' ');
          return head + '\n' + body;
        }
        default: return `* ${a.type} (unhandled)`;
      }
    }

    function buildRioText(stages) {
      const stagesToUse = Array.isArray(stages) ? stages : model.stages;
      const lines = [];
      lines.push(rioTitleLine());
      pushCaseLine(lines);
      pushGeometryLine(lines);
      pushWallBuilderMetaLine(lines);
      const sections = model.wall.sections && model.wall.sections.length
        ? model.wall.sections : [defaultWallSection()];
      for (const S of sections) lines.push(`${fmt(S.depth, 2)} ${Math.round(S.EI)}`);
      lines.push('0');
      if (model.wall && model.wall.opt_CW) lines.push(`*CW_RATIO ${fmt(model.wall.cw_ratio, 7)}`);
      for (const L of model.layers) {
        const soilMeta = {
          type: String(L.type || '').trim(),
          analysis: L.analysis === 'total' ? 'total' : 'effective',
        };
        if (soilMeta.type || soilMeta.analysis !== 'effective') {
          lines.push(`*SOILMETA ${JSON.stringify(soilMeta)}`);
        }
        lines.push([
          fmt(L.depth, 2), fmt(L.gamma, 2), fmt(L.gamma_sub, 2),
          fmt(L.Ka, 3), fmt(L.K0, 3), fmt(L.Kp, 3),
          fmt(L.c, 3), fmt(L.phi, 2),
          Math.round(L.Da * 100) / 100, Math.round(L.Dp * 100) / 100,
          Math.round(L.kh), 0,
        ].join(' '));
      }
      lines.push(`${fmt(model.wall.w_depth, 2)} ${fmt(model.wall.max_le, 2)}`);
      for (const stage of stagesToUse) {
        for (const a of stage.actions) lines.push(actionToRio(a, stagesToUse));
      }
      lines.push('FIN');
      lines.push('STOP');
      return lines.join('\n') + '\n';
    }

    function exportRio() {
      const blob = new Blob([buildRioText()], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'builder_output.rio';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function collectResultsReportPayload() {
      const frame = document.getElementById('femPanelFrame');
      try {
        const win = frame && frame.contentWindow;
        if (win && typeof win.getB1ReportPayload === 'function') {
          return await Promise.resolve(win.getB1ReportPayload() || null);
        }
      } catch (err) {
        console.log('[report] unable to collect checks payload', err);
      }
      return null;
    }

    function collectStableReportPayload() {
      const frame = document.getElementById('stablePanelFrame');
      try {
        const win = frame && frame.contentWindow;
        if (win && typeof win.getB1StableReportPayload === 'function') return win.getB1StableReportPayload();
      } catch (err) {
        console.log('[report] unable to collect stability payload', err);
      }
      return null;
    }

    function nextFrame() {
      return new Promise(resolve => requestAnimationFrame(() => resolve()));
    }

    function serializeProfileSvg() {
      const svg = document.getElementById('profileSvg');
      if (!svg) return null;
      const width = Math.max(1, Math.round(svg.clientWidth || 800));
      const height = Math.max(1, Math.round(svg.clientHeight || 240));
      const clone = svg.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', String(width));
      clone.setAttribute('height', String(height));
      clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
      return {
        width,
        height,
        svg: new XMLSerializer().serializeToString(clone),
      };
    }

    async function captureProfile2DStageStack() {
      if (typeof window.buildB1Profile2DStackDataUrl !== 'function') return null;
      if (!Array.isArray(model.stages) || !model.stages.length || typeof showStage !== 'function') return null;
      const originalStageIdx = getCurrentStageIdx();
      const snapshots = [];
      for (let i = 0; i < model.stages.length; i++) {
        showStage(i);
        await nextFrame();
        const shot = serializeProfileSvg();
        if (shot) snapshots.push(shot);
      }
      if (originalStageIdx >= 0 && originalStageIdx < model.stages.length) {
        showStage(originalStageIdx);
      } else if (typeof showInitialStage === 'function') {
        showInitialStage();
      }
      return window.buildB1Profile2DStackDataUrl(snapshots, { scale: 2, gap: 10 });
    }

    async function reportPayload() {
      const isLW = model.wall && model.wall.directionMode === 'LW';
      const resultsReport = isReportCurrent('fem') ? await collectResultsReportPayload() : null;
      const payload = {
        model: JSON.parse(JSON.stringify(model)),
        currentStageIdx: getCurrentStageIdx(),
        report_language: (document.getElementById('reportLanguage') || {}).value || 'zh',
        stability_payload: isReportCurrent('stability') ? collectStableReportPayload() : null,
        fem_payload: isReportCurrent('fem') ? (window.__lastFEMPayload || null) : null,
        check_payload: resultsReport && resultsReport.checkPayload ? resultsReport.checkPayload : null,
        wall_design: resultsReport && resultsReport.wallDesign ? resultsReport.wallDesign : null,
        wall_plots: resultsReport && resultsReport.wallPlots ? resultsReport.wallPlots : null,
        support_checks: resultsReport && resultsReport.supportChecks ? resultsReport.supportChecks : null,
        anchor_checks: resultsReport && resultsReport.anchorChecks ? resultsReport.anchorChecks : null,
        formula_text: resultsReport && resultsReport.formulaText ? resultsReport.formulaText : null,
        report_flags: {
          input: true,
          stability: isReportCurrent('stability'),
          fem: isReportCurrent('fem'),
        },
      };
      if (isLW) {
        payload.rio_text_L = buildRioText(model.stagesByDir.L);
        payload.rio_text_W = buildRioText(model.stagesByDir.W);
      } else {
        payload.rio_text = buildRioText();
      }
      try {
        payload.wat_graph_png = await captureProfile2DStageStack();
      } catch (err) {
        console.log('[report] unable to build WAT graph', err);
      }
      return payload;
    }

    function setReportModalOpen(open) {
      const modal = document.getElementById('reportModal');
      if (!modal) return;
      modal.classList.toggle('open', !!open);
      modal.setAttribute('aria-hidden', open ? 'false' : 'true');
      deps.refreshReportStatus();
    }

    async function exportReports() {
      const bridge = getPyBridge();
      if (!bridge || (!bridge.exportReports && !bridge.exportCalculationBook)) {
        alert('Export Reports requires the Python bridge.');
        return;
      }
      const payload = await reportPayload();
      if (!payload.report_flags.stability && !payload.report_flags.fem) {
        const ok = window.confirm('Only Input Summary is current. Export input-only workbook?');
        if (!ok) return;
      }
      const done = (reply) => {
        try {
          const r = JSON.parse(reply || '{}');
          if (r.error) {
            alert(r.error);
            return;
          }
          if (r.cancelled) return;
          const warnings = Array.isArray(r.warnings) ? r.warnings : [];
          const warningText = warnings.length ? '\n\nWarnings:\n' + warnings.join('\n') : '';
          alert('Reports exported:\n' + (r.xlsx_path || '') + warningText);
          setReportModalOpen(false);
        } catch (err) {
          alert('Export Reports finished, but the reply could not be parsed.');
        }
      };
      if (bridge.exportReports) bridge.exportReports(JSON.stringify(payload), done);
      else bridge.exportCalculationBook(JSON.stringify(payload), done);
    }

    function loadRioViaBridge(text) {
      const bridge = getPyBridge();
      if (!bridge || !bridge.parseRio) {
        alert('.rio loading requires the Python bridge (running the builder via UI.py).  Open the file from the PyQt window, not directly in a browser, or paste your model into the blocks manually.');
        return;
      }
      let parsedCaseName = '';
      let parsedGeometry = null;
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        const mc = line.match(/^\s*\*\s*Case\s*:\s*(.+?)\s*$/i);
        if (mc && !parsedCaseName) { parsedCaseName = mc[1]; continue; }
        const mg = line.match(/^\s*\*\s*Geometry\s*:\s*L\s*=\s*([\-\d.]+)\s+W\s*=\s*([\-\d.]+)\s+dir\s*=\s*(L|W|LW)(?:\s+target\s*=\s*([LW]))?\s*$/i);
        if (mg && !parsedGeometry) {
          parsedGeometry = {
            L: parseFloat(mg[1]),
            W: parseFloat(mg[2]),
            direction: mg[3].toUpperCase(),
            target: (mg[4] || mg[3]).toUpperCase()
          };
        }
      }
      bridge.parseRio(text, function(reply) {
        let cfg;
        try {
          cfg = JSON.parse(reply);
        } catch (e) {
          alert('parseRio: bad JSON from bridge: ' + e);
          return;
        }
        if (cfg && cfg.error) {
          alert('parseRio failed:\n' + cfg.error);
          return;
        }
        applyCfgToModel(cfg, { caseName: parsedCaseName, geometry: parsedGeometry });
      });
    }

    function applyCfgToModel(cfg, opts = {}) {
      const sec = (cfg.wall_sections || []).map(s => ({
        depth: Number(s.z_bot),
        EI: Number(s.EI),
      }));
      model.wall.sections = sec.length ? sec : [defaultWallSection()];
      model.wall.max_le = Number(cfg.max_le != null ? cfg.max_le : 0.5);
      model.wall.w_depth = Number(cfg.w_depth != null ? cfg.w_depth : 1.0);
      model.wall.opt_A = !!cfg.sub_option_A;
      model.wall.opt_F = !!cfg.buckling_option_F;
      const importedCw = (cfg.layers || [])
        .filter(L => L.cw_ratio_enabled)
        .map(L => Number(L.cw_ratio))
        .find(Number.isFinite);
      if (Number.isFinite(importedCw)) {
        model.wall.opt_CW = true;
        model.wall.cw_ratio = importedCw;
      } else {
        model.wall.opt_CW = false;
        model.wall.cw_ratio = 2 / 3;
      }

      model.layers = (cfg.layers || []).map(L => ({
        type: String(L.type || '').trim(),
        analysis: (L.analysis === 'total') ? 'total' : 'effective',
        depth: Number(L.level),
        gamma: Number(L.gamma),
        gamma_sub: Number(L.gamma_sub),
        Ka: Number(L.ka),
        K0: Number(L.k0),
        Kp: Number(L.kp),
        c: Number(L.cohesion),
        phi: Number(L.phi),
        Da: Number(L.Da || 0),
        Dp: Number(L.Dp || 0),
        kh: Number(L.kh),
        khp: Number(L.khp || 0),
      }));

      model.stages = [];
      model.stagesByDir = { L: [], W: [] };
      model.stageTargetDir = 'L';
      let stage = { actions: [] };
      const cmds = cfg.commands || [];
      for (const c of cmds) {
        const kw = (c.kw || '').toUpperCase();
        const paren = (c.paren || []).map(String);
        const nums = c.nums || [];
        const pay = c.payload || null;

        if (kw === 'END') continue;
        if (kw === 'CAL') {
          if (paren.length >= 2 && paren[0] === '2' && paren[1] === '1') stage.actions.push({ type: 'ENV' });
          else stage.actions.push({ type: 'CAL', paren: paren.join(',') || '0' });
          model.stages.push(stage);
          stage = { actions: [] };
          continue;
        }

        const a = {};
        if (kw === 'SUC') {
          a.type = 'SUC';
          a.side = parseInt(paren[0], 10) || 1;
          a.Q = Number(nums[0]);
        } else if (kw === 'SUB') {
          a.type = 'SUB';
          a.side = parseInt(paren[0], 10) || 1;
          a.Z1 = Number(nums[0]); a.A = Number(nums[1]);
          a.B = Number(nums[2]); a.Q = Number(nums[3]);
        } else if (kw === 'EXC') {
          a.type = 'EXC';
          a.side = parseInt(paren[0], 10) || 2;
          a.Z1 = Number(nums[0]);
          if (nums.length >= 4) {
            a.berm = true;
            a.Z2 = Number(nums[1]);
            a.A = Number(nums[2]);
            a.B = Number(nums[3]);
          } else {
            a.berm = false;
          }
        } else if (kw === 'WAT' || kw === 'EAU') {
          a.type = 'WAT';
          a.side = parseInt(paren[0], 10) || 2;
          a.Z1 = Number(nums[0]);
          a.U = (nums.length > 1) ? Number(nums[1]) : 0;
          if (String(paren[1] || '').trim() === '1' && nums.length > 2) {
            const u2 = Number(nums[2]);
            if (Number.isFinite(u2)) a.U2 = u2;
          }
        } else if (kw === 'LOA' || kw === 'CHA') {
          a.type = 'LOA';
          a.side = parseInt(paren[0], 10) || 1;
          a.Z1 = Number(nums[0]); a.Z2 = Number(nums[1]);
          a.Q1 = Number(nums[2]); a.Q2 = Number(nums[3]);
        } else if (kw === 'CFM') {
          a.type = (paren.length && pay) ? 'CFM_LINK' : 'CFM';
          if (a.type === 'CFM_LINK') a.support_id = parseInt(paren[0], 10) || 1;
          else a.Z = Number(nums[0]);
          a.F = Number(nums[1]);
          a.M = Number(nums[2]);
          if (pay) {
            a.CFY = Number(pay.CFY || 0);
            a.CFA = Number(pay.CFA || 0);
            a.CMY = Number(pay.CMY || 0);
            a.CMA = Number(pay.CMA || 0);
          }
        } else if (kw === 'BUT' || kw === 'STR' || kw === 'ANC' || kw === 'TIR') {
          a.type = (kw === 'ANC' || kw === 'TIR') ? 'ANC' : 'BUT';
          const idx = parseInt(paren[0], 10);
          if (idx === 0) {
            a.index = 0;
            a.sub_index = parseInt(paren[1], 10) || 0;
          } else {
            a.index = idx || 1;
            a.Z = Number(nums[0]);
            a.S = Number(nums[1]);
            a.I = Number(nums[2]);
            a.F = Number(nums[3]);
            a.kstrut = Number(nums[4]);
            if (c.strut_type) a.strut_type = c.strut_type;
            if (c.support_check && typeof c.support_check === 'object') a.support_check = c.support_check;
            if (c.support_k && typeof c.support_k === 'object') {
              a.support_mode = c.support_k.mode || c.support_k.L_mode || 'symmetrical';
              a.strut_L = Number(c.support_k.L) || undefined;
              a.k_reduction = Number.isFinite(Number(c.support_k.Rs)) ? Number(c.support_k.Rs) : 0.5;
              a.theta_s = Number.isFinite(Number(c.support_k.theta_s)) ? Number(c.support_k.theta_s) : 0;
            }
          }
        } else if (kw === 'BAC' || kw === 'REM' || kw === 'SOI' || kw === 'SOL') {
          a.type = (kw === 'SOI' || kw === 'SOL') ? 'SOI' : 'BAC';
          a.side = parseInt(paren[0], 10) || 2;
          a.Z1 = Number(nums[0]);
          if (pay) {
            a.Z2 = Number(pay.level);
            a.UW = Number(pay.gamma);
            a.Ka = Number(pay.ka);
            a.K0 = Number(pay.k0);
            a.Kp = Number(pay.kp);
            a.c = Number(pay.cohesion);
            a.phi = Number(pay.phi);
            a.kh = Number(pay.kh);
          }
        } else {
          continue;
        }
        stage.actions.push(a);
      }
      if (stage.actions.length) model.stages.push(stage);
      model.stagesByDir.L = model.stages.slice();
      model.stagesByDir.W = [];

      document.getElementById('wall_le').value = model.wall.max_le;
      document.getElementById('wall_w').value = model.wall.w_depth;
      document.getElementById('opt_A').checked = !!model.wall.opt_A;
      document.getElementById('opt_F').checked = !!model.wall.opt_F;
      const optCw = document.getElementById('opt_CW');
      const cwRatio = document.getElementById('opt_cw_ratio');
      if (optCw) optCw.checked = !!model.wall.opt_CW;
      if (cwRatio) {
        const cwValue = Number.isFinite(model.wall.cw_ratio) ? model.wall.cw_ratio : (2 / 3);
        cwRatio.value = Math.abs(cwValue - (2 / 3)) <= 1e-9 ? '2/3' : String(cwValue);
        cwRatio.dispatchEvent(new Event('change'));
      }
      syncCwOptionUI();
      if (opts && typeof opts.caseName === 'string') {
        model.wall.case_name = opts.caseName;
        const cnEl = document.getElementById('case_name');
        if (cnEl) cnEl.value = opts.caseName;
      }
      if (opts && opts.geometry) {
        const g = opts.geometry;
        if (g.L > 0) model.wall.L = g.L;
        if (g.W > 0) model.wall.W = g.W;
        if (g.direction === 'L' || g.direction === 'W' || g.direction === 'LW') model.wall.directionMode = g.direction;
        model.wall.direction = (g.target === 'W') ? 'W' : 'L';
        model.stageTargetDir = model.wall.direction;
        const lEl = document.getElementById('geom_L');
        const wEl = document.getElementById('geom_W');
        if (lEl) lEl.value = model.wall.L;
        if (wEl) wEl.value = model.wall.W;
        for (const r of document.querySelectorAll('input[name="geom_dir"]')) {
          r.checked = (r.value === (model.wall.directionMode || model.wall.direction));
        }
        if (typeof applyGeometry === 'function') applyGeometry({}, { rerenderStages: false });
      }
      model.wall.lwSharedStages = false;
      if ((model.wall.directionMode === 'LW') && (!model.stagesByDir.W || model.stagesByDir.W.length === 0)) {
        model.stageTargetDir = 'L';
        model.wall.direction = 'L';
        syncActiveStagesRef();
        const makeW = window.confirm('Detected LW mode. Auto-generate W stages from the imported L stages?\n');
        if (makeW) {
          model.wall.lwSharedStages = true;
          window.B1BuilderStages.reDeriveSharedW();
        }
        syncActiveStagesRef();
      }
      rerenderWallSections();
      rerenderLayers();
      rerenderStages();
      window.__lastFEMPayload = null;
      reportState.stabilityRev = -1;
      reportState.femRev = -1;
      markModelDirty();
      const activateTab = getActivateTab();
      if (typeof activateTab === 'function') activateTab('paneProject');
    }

    document.getElementById('btnExport').onclick = exportRio;
    document.getElementById('btnCalcBook').onclick = () => setReportModalOpen(true);
    document.getElementById('btnReportExport').onclick = exportReports;
    document.getElementById('btnReportClose').onclick = () => setReportModalOpen(false);
    document.getElementById('btnReportCancel').onclick = () => setReportModalOpen(false);
    document.getElementById('btnLoad').onclick = () => {
      const inp = document.getElementById('loadFileInput');
      inp.value = '';
      inp.click();
    };
    document.getElementById('loadFileInput').addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        loadRioViaBridge(r.result);
        e.target.value = '';
      };
      r.readAsText(f);
    });

    return {
      fmt,
      rioTitleLine,
      pushCaseLine,
      pushGeometryLine,
      pushWallBuilderMetaLine,
      actionToRio,
      buildRioText,
      exportRio,
      setReportModalOpen,
      exportReports,
      loadRioViaBridge,
      applyCfgToModel,
    };
  };
})();
