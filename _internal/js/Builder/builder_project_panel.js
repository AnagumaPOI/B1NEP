(function () {
  window.installBuilderProjectPanel = function installBuilderProjectPanel(deps) {
    const {
      model,
      rerenderStages,
      showStage,
      playInit,
      getCurrentStageIdx,
    } = deps;

    function syncActiveStagesRef() {
      const dir = model.wall.directionMode === 'LW'
        ? (model.stageTargetDir || 'L')
        : ((model.wall.direction === 'W') ? 'W' : 'L');
      if (!model.stagesByDir) model.stagesByDir = { L: [], W: [] };
      if (!Array.isArray(model.stagesByDir.L)) model.stagesByDir.L = [];
      if (!Array.isArray(model.stagesByDir.W)) model.stagesByDir.W = [];
      model.stageTargetDir = dir;
      model.stages = model.stagesByDir[dir];
    }

    function updateStageTargetButtons() {
      const btnL = document.getElementById('btnStageForL');
      const btnW = document.getElementById('btnStageForW');
      if (!btnL || !btnW) return;
      const mode = model.wall.directionMode || 'L';
      const active = mode === 'LW'
        ? (model.stageTargetDir || 'L')
        : ((model.wall.direction === 'W') ? 'W' : 'L');
      const shared = mode === 'LW' && model.wall.lwSharedStages;
      btnL.classList.toggle('active', active === 'L');
      btnW.classList.toggle('active', active === 'W');
      if (mode === 'LW') {
        btnL.disabled = false;
        btnW.disabled = shared;
        if (shared) btnW.title = 'W stages are derived from L in shared mode';
        else btnW.removeAttribute('title');
      } else if (mode === 'L') {
        btnL.disabled = true;
        btnW.disabled = true;
        btnL.classList.add('active');
        btnW.classList.remove('active');
      } else {
        btnL.disabled = true;
        btnW.disabled = true;
        btnW.classList.add('active');
        btnL.classList.remove('active');
      }
      const segWrap = btnL.parentElement;
      if (segWrap && segWrap.parentElement) {
        let infoEl = document.getElementById('lwShareInfo');
        if (!infoEl) {
          infoEl = document.createElement('span');
          infoEl.id = 'lwShareInfo';
          infoEl.style.cssText = 'margin-right:8px; font-size:11px; color:#445; display:inline-flex; align-items:center; gap:6px;';
          segWrap.parentElement.insertBefore(infoEl, segWrap);
        }
        infoEl.innerHTML = '';
        if (mode === 'LW') {
          const tag = document.createElement('span');
          tag.textContent = shared ? '(shared L→W)' : '(forked L / W)';
          tag.style.color = shared ? '#357' : '#963';
          const btn = document.createElement('button');
          btn.className = 'tiny';
          btn.textContent = shared ? 'Fork W' : 'Re-share';
          btn.title = shared
            ? 'Snapshot W into an independent list so you can edit it directly.'
            : 'Discard W edits and re-derive W from L (with per-action ΔZ_W / S_W overrides).';
          btn.onclick = () => {
            if (shared) {
              model.stagesByDir.W = window.B1BuilderStages.deriveWFromL(model.stagesByDir.L);
              model.wall.lwSharedStages = false;
            } else {
              if (model.stagesByDir.W && model.stagesByDir.W.length
                  && !window.confirm('Discard the current independent W stages and re-derive from L?')) {
                return;
              }
              model.wall.lwSharedStages = true;
              window.B1BuilderStages.reDeriveSharedW();
            }
            rerenderStages();
            const currentStageIdx = getCurrentStageIdx();
            if (typeof currentStageIdx === 'number' && currentStageIdx >= 0
                && currentStageIdx < model.stages.length) {
              showStage(currentStageIdx);
            }
          };
          infoEl.appendChild(tag);
          infoEl.appendChild(btn);
        }
      }
    }

    function setStageTargetDir(dir, opts = {}) {
      if (dir === 'W'
          && model.wall.directionMode === 'LW'
          && model.wall.lwSharedStages) {
        dir = 'L';
      }
      const target = (dir === 'W') ? 'W' : 'L';
      model.stageTargetDir = target;
      model.wall.direction = target;
      syncActiveStagesRef();
      updateStageTargetButtons();
      if (opts.rerenderStages !== false) rerenderStages();
      const currentStageIdx = getCurrentStageIdx();
      if (typeof currentStageIdx === 'number' && currentStageIdx >= 0 && currentStageIdx < model.stages.length) {
        showStage(currentStageIdx);
      } else if (window.resetModel) {
        playInit();
      }
    }

    function wallTotalLength() {
      const s = model.wall.sections;
      return s && s.length ? Number(s[s.length - 1].depth) : 0;
    }

    function getStrutLength() {
      const w = model.wall || {};
      return Number((w.direction === 'W') ? w.L : w.W) || 0;
    }

    function defaultStrutCalcLength() {
      const L = getStrutLength();
      return L > 0 ? L : 0;
    }

    function autoStrutK(act) {
      if (!act || !act.strut_type || act.strut_type === 'Custom') return null;
      const supportCheckL = act.support_check && Number(act.support_check.strut_L) > 0
        ? Number(act.support_check.strut_L)
        : null;
      const L = supportCheckL || (Number(act.strut_L) > 0 ? Number(act.strut_L) : defaultStrutCalcLength());
      act.strut_L = L;
      const rs = Number.isFinite(Number(act.k_reduction)) ? Number(act.k_reduction) : 0.5;
      const mode = String(act.support_mode || act.strut_L_mode || '').toLowerCase();
      const multiplier = (mode === 'single' || mode === 'non-symmetrical' || mode === 'non_symmetric') ? 1 : 2;
      const thetaS = Number.isFinite(Number(act.theta_s)) ? Number(act.theta_s) : 0;
      return window.kFromStrutType(act.strut_type, L, rs * multiplier, thetaS);
    }

    function setSiteWaterLevel(value) {
      const z = Number(value);
      if (!Number.isFinite(z)) return;
      model.wall.w_depth = z;
      const input = document.getElementById('wall_w');
      if (input) input.value = String(z);
    }

    function syncCwOptionUI() {
      const chk = document.getElementById('opt_CW');
      const ratio = document.getElementById('opt_cw_ratio');
      if (!chk || !ratio) return;
      ratio.disabled = !chk.checked;
      ratio.style.opacity = chk.checked ? '1' : '0.55';
    }

    function applyGeometry(patch = {}, opts = {}) {
      if (patch.L != null) {
        const v = Number(patch.L); if (v > 0) model.wall.L = v;
      }
      if (patch.W != null) {
        const v = Number(patch.W); if (v > 0) model.wall.W = v;
      }
      if (patch.direction === 'L' || patch.direction === 'W' || patch.direction === 'LW') {
        model.wall.directionMode = patch.direction;
        if (patch.direction === 'L' || patch.direction === 'W') {
          model.wall.direction = patch.direction;
          model.stageTargetDir = patch.direction;
        } else {
          model.wall.direction = model.stageTargetDir || 'L';
        }
        syncActiveStagesRef();
      }

      window.soil_w = Number(model.wall.L);
      window.soil_d = Number(model.wall.W);
      if (typeof window.rescaleCamera === 'function') window.rescaleCamera();

      for (const dir of ['L', 'W']) {
        const savedDir = model.wall.direction;
        model.wall.direction = dir;
        const stages = (model.stagesByDir && model.stagesByDir[dir]) || [];
        for (const stage of stages) {
          for (const a of stage.actions) {
            if ((a.type === 'BUT' || a.type === 'ANC')
                && Number(a.index) !== 0
                && a.strut_type && a.strut_type !== 'Custom') {
              const k = autoStrutK(a);
              if (k != null) a.kstrut = k;
            }
          }
        }
        model.wall.direction = savedDir;
      }
      if (opts.rerenderStages !== false) rerenderStages();
      updateStageTargetButtons();

      const currentStageIdx = getCurrentStageIdx();
      if (typeof currentStageIdx === 'number' && currentStageIdx >= 0
          && currentStageIdx < model.stages.length) {
        showStage(currentStageIdx);
      } else if (window.resetModel) {
        playInit();
      }
    }

    ['wall_le', 'wall_w'].forEach(id => {
      const e = document.getElementById(id);
      if (!e) return;
      e.addEventListener('input', () => {
        if (id === 'wall_le') model.wall.max_le = parseFloat(e.value);
        if (id === 'wall_w') model.wall.w_depth = parseFloat(e.value);
      });
    });

    ['opt_A', 'opt_F', 'opt_CW'].forEach(id => {
      const e = document.getElementById(id);
      if (!e) return;
      e.addEventListener('change', () => {
        model.wall[id] = e.checked;
        if (id === 'opt_CW') syncCwOptionUI();
      });
    });

    (function bindCwRatio() {
      const e = document.getElementById('opt_cw_ratio');
      if (!e) return;
      e.addEventListener('input', () => {
        const v = window.fractionInputNumber(e);
        if (Number.isFinite(v)) model.wall.cw_ratio = v;
      });
      e.addEventListener('change', () => {
        const v = window.fractionInputNumber(e);
        if (Number.isFinite(v)) model.wall.cw_ratio = v;
      });
      syncCwOptionUI();
    })();

    (function bindCaseName() {
      const e = document.getElementById('case_name');
      if (!e) return;
      e.addEventListener('input', () => { model.wall.case_name = e.value; });
    })();

    (function bindGeometryControls() {
      const lEl = document.getElementById('geom_L');
      const wEl = document.getElementById('geom_W');
      if (lEl) {
        lEl.value = model.wall.L;
        lEl.addEventListener('input', () => applyGeometry({ L: parseFloat(lEl.value) }));
      }
      if (wEl) {
        wEl.value = model.wall.W;
        wEl.addEventListener('input', () => applyGeometry({ W: parseFloat(wEl.value) }));
      }
      for (const r of document.querySelectorAll('input[name="geom_dir"]')) {
        if (r.value === (model.wall.directionMode || model.wall.direction)) r.checked = true;
        r.addEventListener('change', () => {
          if (r.checked) applyGeometry({ direction: r.value });
        });
      }
      const btnL = document.getElementById('btnStageForL');
      const btnW = document.getElementById('btnStageForW');
      if (btnL) btnL.addEventListener('click', () => setStageTargetDir('L'));
      if (btnW) btnW.addEventListener('click', () => setStageTargetDir('W'));
      updateStageTargetButtons();
    })();

    return {
      syncActiveStagesRef,
      updateStageTargetButtons,
      setStageTargetDir,
      wallTotalLength,
      getStrutLength,
      defaultStrutCalcLength,
      autoStrutK,
      setSiteWaterLevel,
      syncCwOptionUI,
      applyGeometry,
    };
  };
})();
