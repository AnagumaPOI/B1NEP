(function () {
  window.installBuilderAnalysisPanels = function installBuilderAnalysisPanels(deps) {
    const {
      model,
      reportState,
      refreshReportStatus,
      setReportReady,
      syncActiveStagesRef,
      rerenderStages,
      reDeriveSharedW,
      showStage,
      getCurrentStageIdx,
      getBuildRioText,
      wallTotalLength,
    } = deps;

    function syncBuilderChromeTabs(targetId) {
      document.querySelectorAll('.b1-builder-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.target === targetId);
      });
    }

    function stablePanelPayload() {
      return {
        model: JSON.parse(JSON.stringify(model)),
        currentStageIdx: getCurrentStageIdx(),
      };
    }

    function refreshAnalysisPanel() {
      const frame = document.getElementById('stablePanelFrame');
      if (!frame) return;
      const inject = () => {
        try {
          const win = frame.contentWindow;
          const doc = frame.contentDocument;
          if (doc && doc.body) doc.body.classList.add('embedded-stable');
          if (win && typeof win.loadStableModel === 'function') {
            win.__stableLoadedFromBuilder = true;
            win.loadStableModel(stablePanelPayload());
            return true;
          }
        } catch (err) {
          console.log('[stable-panel] inject failed', err);
        }
        return false;
      };
      if (!inject()) frame.addEventListener('load', inject, { once: true });
    }

    function applyUpliftPumpingControls(cases) {
      const rows = Array.isArray(cases) ? cases : [];
      if (!rows.length) return;
      syncActiveStagesRef();
      let changed = 0;
      rows.forEach(row => {
        const stageNo = Number(row.stageNo);
        const z = Number(row.z);
        const u = Number(row.u);
        if (!Number.isFinite(stageNo) || !Number.isFinite(z) || !Number.isFinite(u)) return;
        const stage = model.stages[stageNo - 1];
        if (!stage || !Array.isArray(stage.actions)) return;
        const existing = stage.actions.find(action => (
          action.type === 'WAT'
          && Number(action.side) === 2
          && Math.abs(Number(action.Z1) - z) <= 1e-6
        ));
        if (existing) {
          existing.U = u;
          existing.uplift_pumping = true;
        } else {
          const wat = { type: 'WAT', side: 2, Z1: z, U: u, uplift_pumping: true };
          const insertAt = stage.actions.findIndex(action => action.type === 'CAL' || action.type === 'ENV');
          if (insertAt >= 0) stage.actions.splice(insertAt, 0, wat);
          else stage.actions.push(wat);
        }
        // The pumping value is the pore pressure at the top of the
        // effective-stress aquifer.  Continue that pressure hydrostatically
        // below the interface; retaining old deeper WAT values would erase
        // most of the effective passive stress after pumping.
        stage.actions.forEach(action => {
          if (action.type !== 'WAT' || Number(action.side) !== 2) return;
          const depth = Number(action.Z1);
          if (!Number.isFinite(depth) || depth <= z + 1e-6) return;
          action.U = Math.round((u + depth - z) * 100) / 100;
          action.uplift_pumping_profile = true;
        });
        changed += 1;
      });
      if (!changed) return;
      if (model.wall.directionMode === 'LW' && model.wall.lwSharedStages) reDeriveSharedW();
      rerenderStages();
      const currentStageIdx = getCurrentStageIdx();
      if (typeof currentStageIdx === 'number' && currentStageIdx >= 0 && currentStageIdx < model.stages.length) {
        showStage(currentStageIdx);
      }
      refreshAnalysisPanel();
      alert(`Applied pumping WAT controls to ${changed} stage(s).`);
    }

    window.addEventListener('message', event => {
      const data = event && event.data;
      if (!data) return;
      if (data.type === 'b1nep:stable-calculated') {
        setReportReady('stability');
        return;
      }
      if (data.type === 'b1nep:stable-dirty') {
        reportState.stabilityRev = -1;
        refreshReportStatus();
        return;
      }
      if (data.type !== 'b1nep:apply-uplift-pumping') return;
      applyUpliftPumpingControls(data.cases);
    });

    let pyBridge = null;

    function setupBridge() {
      if (typeof QWebChannel === 'undefined') return;
      try {
        new QWebChannel(qt.webChannelTransport, function(channel) {
          pyBridge = channel.objects.pyBridge || null;
          window.pyBridge = pyBridge;
          if (pyBridge) console.log('[bridge] connected');
        });
      } catch (e) {
        console.log('[bridge] init failed', e);
      }
    }

    if (window.qt && window.qt.webChannelTransport) {
      if (typeof QWebChannel === 'undefined') {
        const s = document.createElement('script');
        s.src = 'qrc:///qtwebchannel/qwebchannel.js';
        s.onload = setupBridge;
        document.head.appendChild(s);
      } else {
        setupBridge();
      }
    }

    function getPyBridge() {
      return pyBridge || window.pyBridge || null;
    }

    function injectFEMResultsIntoPanel(payload) {
      const frame = document.getElementById('femPanelFrame');
      if (!frame) return false;
      const inject = () => {
        try {
          const win = frame.contentWindow;
          const doc = frame.contentDocument;
          if (doc && doc.body) doc.body.classList.add('embedded-results');
          if (win && typeof win.renderFEMResults === 'function') {
            win.renderFEMResults(payload);
            return true;
          }
          if (win) win.__pendingFEMResults = payload;
        } catch (err) {
          console.log('[fem-panel] inject failed', err);
        }
        return false;
      };
      if (!inject()) frame.addEventListener('load', inject, { once: true });
      return true;
    }

    function setFEMPanelStatus(text) {
      const el = document.getElementById('femPanelStatus');
      if (el) el.textContent = text || '';
    }

    function preFEMValidationError() {
      const wallLen = wallTotalLength();
      if (!(wallLen > 0)) return null;
      let soilDepth = 0;
      for (const L of (model.layers || [])) {
        const d = Number(L && L.depth);
        if (isFinite(d) && d > soilDepth) soilDepth = d;
      }
      if (soilDepth + 1e-6 < wallLen) {
        return ('Soil layers reach only z = ' + soilDepth.toFixed(2) + ' m, but the wall toe is at z = '
              + wallLen.toFixed(2) + ' m.\n\n'
              + 'Extend the deepest soil layer (Site pane) to at least the wall length, '
              + 'or shorten the wall, before running the FEM.');
      }
      return null;
    }

    function validateFEMBeforeRun() {
      if (!model.stages.length) {
        alert('No stages defined.  Add at least one stage with a CAL command first.');
        return false;
      }
      const validationMsg = preFEMValidationError();
      if (validationMsg) {
        alert(validationMsg);
        return false;
      }
      const isLW = model.wall.directionMode === 'LW';
      if (isLW) {
        const stagesL = (model.stagesByDir && model.stagesByDir.L) || [];
        const stagesW = (model.stagesByDir && model.stagesByDir.W) || [];
        if (!stagesL.length || !stagesW.length) {
          alert('L&W mode requires stages on both L and W directions.  Either fork the W list and add stages, or share with L.');
          return false;
        }
      }
      return true;
    }

    function runFEMIntoPanel() {
      const isLW = model.wall.directionMode === 'LW';
      const bridge = getPyBridge();
      const buildRioText = getBuildRioText();
      if (!bridge || (isLW ? !bridge.runFEMLWInline : !bridge.runFEMInline)) {
        const rioText = buildRioText();
        const blob = new Blob([rioText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'builder_output.rio';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        alert('Python bridge not available.  The .rio has been downloaded.');
        return;
      }
      setFEMPanelStatus(isLW ? 'Running FEM (L+W)...' : 'Running FEM...');
      const done = (reply) => {
        try {
          const r = JSON.parse(reply);
          if (r && r.error) {
            setFEMPanelStatus('FEM error.');
            alert('FEM error:\n' + r.error);
            return;
          }
          const payload = r && r.payload ? r.payload : r;
          window.__lastFEMPayload = payload;
          setReportReady('fem');
          injectFEMResultsIntoPanel(payload);
          setFEMPanelStatus(isLW ? 'FEM done (L+W) - results shown below.' : 'FEM done - results shown below.');
        } catch (e) {
          setFEMPanelStatus('FEM finished, but results could not be parsed.');
          alert('FEM finished, but results could not be parsed.');
        }
      };
      if (isLW) bridge.runFEMLWInline(buildRioText(model.stagesByDir.L), buildRioText(model.stagesByDir.W), done);
      else bridge.runFEMInline(buildRioText(), done);
    }

    function activateTab(targetId, opts = {}) {
      if (targetId === 'paneAnalysis' && (!model.layers || !model.layers.length)) {
        alert('No soil layers defined. Add soil layers before opening Analysis.');
        return false;
      }
      if (targetId === 'paneFEM' && !validateFEMBeforeRun()) return false;
      document.querySelectorAll('.b1-builder-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.target === targetId);
      });
      document.querySelectorAll('.tab-pane').forEach(p => {
        p.classList.toggle('active', p.id === targetId);
      });
      syncBuilderChromeTabs(targetId);
      document.body.classList.toggle('b1-analysis-mode', targetId === 'paneAnalysis' || targetId === 'paneFEM');
      if (targetId === 'paneAnalysis') refreshAnalysisPanel();
      if (targetId === 'paneFEM') runFEMIntoPanel();
      document.getElementById('builder').scrollTop = 0;
      return true;
    }

    document.querySelectorAll('.b1-builder-tab').forEach(btn => {
      btn.addEventListener('click', () => activateTab(btn.dataset.target));
    });
    window.activateB1BuilderTab = activateTab;

    return {
      activateTab,
      refreshAnalysisPanel,
      runFEMIntoPanel,
      getPyBridge,
      stablePanelPayload,
      preFEMValidationError,
    };
  };
})();
