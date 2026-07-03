(function () {
  window.installBuilderStagesPanel = function installBuilderStagesPanel(deps) {
    const {
      model,
      markModelDirty,
      el,
      num,
      autoStrutK,
      defaultStrutCalcLength,
      ACTION_DEFS,
      STRUT_TYPES,
      getCurrentStageIdx,
      updateStageTargetButtons,
      onStageChanged,
      renderProfile,
    } = deps;

    const DEFAULT_W_DZ = 0.3;

    function defaultAction(type) {
      const def = ACTION_DEFS[type];
      const a = { type: type.replace('_REMOVE', '') };
      if (type === 'BUT_REMOVE') a.index = 0;
      for (const p of def.params) a[p.key] = p.default;
      if (a.type === 'EXC') {
        a.berm = false;
        a.Z2 = 5.0;
        a.A = 1.0;
        a.B = 3.0;
      }
      return a;
    }

    function addStage(actions) {
      model.stages.push({ actions: actions || [defaultAction('CAL')] });
      rerenderStages();
    }

    function removeStage(i) {
      model.stages.splice(i, 1);
      rerenderStages();
    }

    function moveStage(i, dir) {
      const j = i + dir;
      if (j < 0 || j >= model.stages.length) return;
      const t = model.stages[i];
      model.stages[i] = model.stages[j];
      model.stages[j] = t;
      rerenderStages();
    }

    function addAction(stageIdx, type) {
      model.stages[stageIdx].actions.push(defaultAction(type));
      rerenderStages();
    }

    function removeAction(si, ai) {
      model.stages[si].actions.splice(ai, 1);
      rerenderStages();
    }

    function moveAction(si, ai, dir) {
      const a = model.stages[si].actions;
      const j = ai + dir;
      if (j < 0 || j >= a.length) return;
      const t = a[ai];
      a[ai] = a[j];
      a[j] = t;
      rerenderStages();
    }

    function moveActionTo(fromSi, fromAi, toSi, toAi) {
      if (fromSi < 0 || fromSi >= model.stages.length) return;
      if (toSi < 0 || toSi >= model.stages.length) return;
      const src = model.stages[fromSi].actions;
      if (fromAi < 0 || fromAi >= src.length) return;
      const [item] = src.splice(fromAi, 1);
      if (fromSi === toSi && fromAi < toAi) toAi--;
      const dst = model.stages[toSi].actions;
      toAi = Math.max(0, Math.min(toAi, dst.length));
      dst.splice(toAi, 0, item);
      rerenderStages();
    }

    function deriveWFromL(stagesL) {
      return (stagesL || []).map(stage => ({
        actions: (stage.actions || []).map(act => {
          const copy = JSON.parse(JSON.stringify(act));
          const isStrut = (copy.type === 'BUT' || copy.type === 'ANC')
                           && Number(copy.index) !== 0;
          if (isStrut) {
            const ov = (act.per_dir && act.per_dir.W) || {};
            const dz = Number.isFinite(Number(ov.dz)) ? Number(ov.dz) : DEFAULT_W_DZ;
            if (Number.isFinite(Number(copy.Z))) copy.Z = Math.max(0, Number(copy.Z) - dz);
            if (ov.S != null && Number.isFinite(Number(ov.S))) copy.S = Number(ov.S);
            if (copy.strut_type && copy.strut_type !== 'Custom') {
              const savedDir = model.wall.direction;
              model.wall.direction = 'W';
              const k = autoStrutK(copy);
              model.wall.direction = savedDir;
              if (k != null) copy.kstrut = k;
            }
            copy.I = 0;
          }
          delete copy.per_dir;
          return copy;
        })
      }));
    }

    function reDeriveSharedW() {
      if (model.wall.directionMode === 'LW' && model.wall.lwSharedStages) {
        model.stagesByDir.W = deriveWFromL(model.stagesByDir.L);
      }
    }

    function playbackStagesForDirection(dir) {
      if (model.wall.directionMode !== 'LW') return model.stages || [];
      if (!model.stagesByDir) model.stagesByDir = { L: [], W: [] };
      return dir === 'W' ? (model.stagesByDir.W || []) : (model.stagesByDir.L || []);
    }

    function rerenderStages() {
      markModelDirty();
      reDeriveSharedW();
      updateStageTargetButtons();
      const host = document.getElementById('stages');
      host.innerHTML = '';
      if (model.wall.directionMode === 'LW' && model.wall.lwSharedStages && model.stageTargetDir === 'W') {
        model.stageTargetDir = 'L';
        model.stages = model.stagesByDir.L;
      }

      model.stages.forEach((stage, si) => {
        const stageEl = el('div', { class: 'stage' },
          el('div', { class: 'stage-title' },
            el('span', {}, 'Stage ' + (si + 1)),
            el('span', {},
              el('button', { class: 'tiny', onclick: () => moveStage(si, -1) }, '↑'),
              el('button', { class: 'tiny', onclick: () => moveStage(si, +1) }, '↓'),
              el('button', { class: 'tiny', onclick: () => removeStage(si) }, 'X'),
            ),
          )
        );

        stage.actions.forEach((act, ai) => {
          const isRemoveBut = (act.type === 'BUT' && Number(act.index) === 0);
          const typeKey = isRemoveBut ? 'BUT_REMOVE' : act.type;
          const def = ACTION_DEFS[typeKey] || ACTION_DEFS[act.type];
          const actionLabel = typeKey === 'CFM_LINK' ? 'CFM(n)' : (isRemoveBut ? '-BUT' : act.type);
          const headerRow = el('div', { class: 'row' },
            el('span', { style: 'min-width:36px;font-weight:bold' }, actionLabel)
          );
          const rows = [headerRow];
          let currentRow = headerRow;
          if (def) {
            const inputsByKey = {};
            let typeSelect = null;
            const isStrut = (act.type === 'BUT' || act.type === 'ANC') && !isRemoveBut;
            for (const p of def.params) {
              if (p === '__newrow__') {
                currentRow = el('div', { class: 'row' });
                rows.push(currentRow);
                continue;
              }
              if (p.key === 'paren') {
                const tx = el('input', { type: 'text', value: act.paren != null ? act.paren : (p.default || '0') });
                tx.style.width = '50px';
                tx.addEventListener('input', () => { act.paren = tx.value; });
                currentRow.appendChild(el('label', {}, p.label));
                currentRow.appendChild(tx);
                continue;
              }
              if (isStrut && p.key === 'kstrut') {
                typeSelect = el('select', {});
                typeSelect.style.width = '170px';
                typeSelect.style.fontSize = '11px';
                for (const t of STRUT_TYPES) typeSelect.appendChild(el('option', { value: t.name }, t.name));
                typeSelect.value = act.strut_type || 'Custom';
                currentRow.appendChild(el('label', {}, 'type'));
                currentRow.appendChild(typeSelect);
              }
              const inp = num(act[p.key] != null ? act[p.key] : p.default, p.step || 0.1, p.width || null);
              inp.addEventListener('input', () => { act[p.key] = parseFloat(inp.value); });
              inputsByKey[p.key] = inp;
              currentRow.appendChild(el('label', {}, p.label));
              currentRow.appendChild(inp);
            }
            if (isStrut && typeSelect) {
              const kInp = inputsByKey.kstrut;
              typeSelect.addEventListener('change', () => {
                act.strut_type = typeSelect.value;
                if (typeSelect.value !== 'Custom') {
                  if (!(Number(act.strut_L) > 0)) act.strut_L = defaultStrutCalcLength();
                  if (!Number.isFinite(Number(act.k_reduction))) act.k_reduction = 0.5;
                  if (!act.support_mode) act.support_mode = 'symmetrical';
                  if (!Number.isFinite(Number(act.theta_s))) act.theta_s = 0;
                  const k = autoStrutK(act);
                  if (k != null) { act.kstrut = k; if (kInp) kInp.value = k; }
                }
              });
              if (kInp) {
                kInp.addEventListener('input', () => {
                  act.strut_type = 'Custom';
                  typeSelect.value = 'Custom';
                });
              }
            }
            if (isStrut && model.wall.directionMode === 'LW' && model.wall.lwSharedStages) {
              const ovRow = el('div', { class: 'row' });
              rows.push(ovRow);
              ovRow.appendChild(el('span', { style: 'font-size:11px;color:#555;min-width:88px;' }, 'W override'));
              const ov = (act.per_dir && act.per_dir.W) || {};
              function ovInp(key, dflt, label) {
                const inp = num(ov[key] != null ? ov[key] : dflt, 0.1, null);
                inp.addEventListener('input', () => {
                  if (!act.per_dir) act.per_dir = {};
                  if (!act.per_dir.W) act.per_dir.W = {};
                  const v = parseFloat(inp.value);
                  if (Number.isFinite(v)) act.per_dir.W[key] = v;
                  else delete act.per_dir.W[key];
                  reDeriveSharedW();
                  onStageChanged();
                });
                ovRow.appendChild(el('label', {}, label));
                ovRow.appendChild(inp);
              }
              ovInp('dz', DEFAULT_W_DZ, 'dZ_W');
              ovInp('S', act.S != null ? act.S : 5.0, 'S_W');
              ovRow.appendChild(el('span', { style: 'font-size:10px;color:#888;margin-left:6px;' }, '(W = L - dZ, k_s recomputed for W span)'));
            }
            if (act.type === 'EXC' && !isRemoveBut) {
              const bermCb = el('input', { type: 'checkbox' });
              bermCb.checked = !!act.berm;
              bermCb.style.marginLeft = '6px';
              currentRow.appendChild(el('label', {}, 'berm/bank'));
              currentRow.appendChild(bermCb);
              const bermRow = el('div', { class: 'row' });
              rows.push(bermRow);
              const bermBox = document.createElement('span');
              bermBox.style.display = act.berm ? 'inline-flex' : 'none';
              bermBox.style.alignItems = 'center';
              bermBox.style.gap = '4px';
              bermBox.style.flexWrap = 'wrap';
              function bermInp(key, dflt) {
                const inp = num(act[key] != null ? act[key] : dflt, 0.1, null);
                inp.addEventListener('input', () => {
                  act[key] = parseFloat(inp.value);
                  renderProfile();
                });
                return inp;
              }
              bermBox.appendChild(el('label', {}, 'Z2')); bermBox.appendChild(bermInp('Z2', 5.0));
              bermBox.appendChild(el('label', {}, 'A'));  bermBox.appendChild(bermInp('A', 1.0));
              bermBox.appendChild(el('label', {}, 'B'));  bermBox.appendChild(bermInp('B', 3.0));
              const hint = document.createElement('span');
              hint.textContent = '  (Z2>Z1 berm, Z2<Z1 bank)';
              hint.style.fontSize = '10px';
              hint.style.color = '#888';
              bermBox.appendChild(hint);
              bermRow.appendChild(bermBox);
              bermCb.addEventListener('change', () => {
                act.berm = bermCb.checked;
                bermBox.style.display = bermCb.checked ? 'inline-flex' : 'none';
                renderProfile();
              });
            }
          }
          headerRow.appendChild(el('button', { class: 'tiny', onclick: () => moveAction(si, ai, -1) }, '↑'));
          headerRow.appendChild(el('button', { class: 'tiny', onclick: () => moveAction(si, ai, +1) }, '↓'));
          headerRow.appendChild(el('button', { class: 'tiny', onclick: () => removeAction(si, ai) }, 'X'));
          const actEl = el('div', { class: 'action act-' + act.type });
          for (const r of rows) actEl.appendChild(r);
          actEl.setAttribute('draggable', 'true');
          actEl.dataset.si = String(si);
          actEl.dataset.ai = String(ai);
          actEl.addEventListener('dragstart', ev => {
            ev.dataTransfer.effectAllowed = 'move';
            ev.dataTransfer.setData('application/x-rido-action', JSON.stringify({ si, ai }));
            ev.dataTransfer.setData('text/plain', JSON.stringify({ si, ai }));
            actEl.classList.add('dragging');
          });
          actEl.addEventListener('dragend', () => {
            actEl.classList.remove('dragging');
            document.querySelectorAll('.action.drop-before, .action.drop-after')
              .forEach(e => e.classList.remove('drop-before', 'drop-after'));
            document.querySelectorAll('.stage.drop-end')
              .forEach(e => e.classList.remove('drop-end'));
          });
          actEl.addEventListener('dragover', ev => {
            ev.preventDefault();
            ev.dataTransfer.dropEffect = 'move';
            const r = actEl.getBoundingClientRect();
            const before = (ev.clientY - r.top) < r.height / 2;
            actEl.classList.toggle('drop-before', before);
            actEl.classList.toggle('drop-after', !before);
          });
          actEl.addEventListener('dragleave', () => {
            actEl.classList.remove('drop-before', 'drop-after');
          });
          actEl.addEventListener('drop', ev => {
            ev.preventDefault();
            ev.stopPropagation();
            const raw = ev.dataTransfer.getData('application/x-rido-action')
                     || ev.dataTransfer.getData('text/plain');
            let src; try { src = JSON.parse(raw); } catch (_) { return; }
            if (src == null || src.si == null) return;
            const r = actEl.getBoundingClientRect();
            const before = (ev.clientY - r.top) < r.height / 2;
            actEl.classList.remove('drop-before', 'drop-after');
            moveActionTo(Number(src.si), Number(src.ai), si, ai + (before ? 0 : 1));
          });
          stageEl.appendChild(actEl);
        });

        const bar = el('div', { class: 'actions-bar' });
        const STAGE_BUTTONS = [
          { type: 'SUC', label: '+ SUC' },
          { type: 'SUB', label: '+ SUB' },
          { type: 'EXC', label: '+ EXC' },
          { type: 'WAT', label: '+ WAT' },
          { type: 'BUT', label: '+ BUT' },
          { type: 'ANC', label: '+ ANC' },
          { type: 'BUT_REMOVE', label: '-BUT' },
          { type: 'BAC', label: '+ BAC' },
          { type: 'SOI', label: '+ SOI' },
          { type: 'LOA', label: '+ LOA' },
          { type: 'CFM', label: '+ CFM' },
          { type: 'CFM_LINK', label: '+ CFM(n)' },
          { type: 'CAL', label: '+ CAL' },
          { type: 'ENV', label: '+ ENV' },
        ];
        for (const b of STAGE_BUTTONS) {
          bar.appendChild(el('button', { class: 'tiny', onclick: () => addAction(si, b.type) }, b.label));
        }
        stageEl.appendChild(bar);
        stageEl.addEventListener('dragover', ev => {
          if (ev.target.closest('.action')) return;
          ev.preventDefault();
          ev.dataTransfer.dropEffect = 'move';
          stageEl.classList.add('drop-end');
        });
        stageEl.addEventListener('dragleave', ev => {
          if (!stageEl.contains(ev.relatedTarget)) stageEl.classList.remove('drop-end');
        });
        stageEl.addEventListener('drop', ev => {
          if (ev.target.closest('.action')) return;
          ev.preventDefault();
          stageEl.classList.remove('drop-end');
          const raw = ev.dataTransfer.getData('application/x-rido-action')
                   || ev.dataTransfer.getData('text/plain');
          let src; try { src = JSON.parse(raw); } catch (_) { return; }
          if (src == null || src.si == null) return;
          moveActionTo(Number(src.si), Number(src.ai), si, model.stages[si].actions.length);
        });
        host.appendChild(stageEl);
      });
      renderProfile();
    }

    window.B1BuilderStages = {
      deriveWFromL,
      reDeriveSharedW,
    };

    return {
      defaultAction,
      addStage,
      removeStage,
      moveStage,
      addAction,
      removeAction,
      moveAction,
      moveActionTo,
      rerenderStages,
      deriveWFromL,
      reDeriveSharedW,
      playbackStagesForDirection,
      DEFAULT_W_DZ,
    };
  };
})();
