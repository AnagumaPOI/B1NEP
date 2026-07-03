(function () {
  window.installBuilderSitePanel = function installBuilderSitePanel(deps) {
    const {
      model,
      markModelDirty,
      el,
      bindNumberInput,
      bindTextInput,
      syncStagePreviewAfterStageChange,
    } = deps;

    function defaultLayer() {
      return {
        type: 'Soil Layer 1',
        depth: 5.0,
        gamma: 1.9,
        gamma_sub: 0.9,
        Ka: 0.333,
        K0: 0.5,
        Kp: 3.00,
        c: 0.0,
        phi: 30,
        Da: 0.0,
        Dp: 0.0,
        kh: 1000,
        analysis: 'effective'
      };
    }

    function addLayer(data) {
      const nextIndex = model.layers.length + 1;
      data = data || defaultLayer();
      if (!String(data.type || '').trim()) data.type = `Soil Layer ${nextIndex}`;
      model.layers.push(data);
      rerenderLayers();
    }

    function rerenderLayers() {
      markModelDirty();
      const host = document.getElementById('layers');
      host.innerHTML = '';
      const gridWrap = el('div', { class: 'soil-grid-wrap' });
      const table = el('table', { class: 'soil-grid' });
      const thead = el('thead', {},
        el('tr', {},
          el('th', {}, '#'),
          el('th', {}, 'Soil type'),
          el('th', {}, 'Z'),
          el('th', {}, 'c'),
          el('th', {}, 'phi'),
          el('th', {}, 'r'),
          el('th', {}, 'r_sub'),
          el('th', {}, 'Ka'),
          el('th', {}, 'K0'),
          el('th', {}, 'Kp'),
          el('th', {}, 'Da'),
          el('th', {}, 'Dp'),
          el('th', {}, 'kh'),
          el('th', {}, '')
        )
      );
      const tbody = el('tbody');
      table.appendChild(thead);
      table.appendChild(tbody);
      gridWrap.appendChild(table);
      host.appendChild(gridWrap);

      model.layers.forEach((L, i) => {
        if (!String(L.type || '').trim()) L.type = `Soil Layer ${i + 1}`;
        tbody.appendChild(el('tr', {},
          el('td', { class: 'soil-grid-id' }, String(i + 1)),
          el('td', {}, bindTextInput(L, 'type', `Soil Layer ${i + 1}`)),
          el('td', {}, bindNumberInput(L, 'depth', 0.1)),
          el('td', {}, bindNumberInput(L, 'c', 0.1)),
          el('td', {}, bindNumberInput(L, 'phi', 0.1)),
          el('td', {}, bindNumberInput(L, 'gamma', 0.01)),
          el('td', {}, bindNumberInput(L, 'gamma_sub', 0.01)),
          el('td', {}, bindNumberInput(L, 'Ka', 0.01)),
          el('td', {}, bindNumberInput(L, 'K0', 0.01)),
          el('td', {}, bindNumberInput(L, 'Kp', 0.01)),
          el('td', {}, bindNumberInput(L, 'Da', 0.1)),
          el('td', {}, bindNumberInput(L, 'Dp', 0.1)),
          el('td', {}, bindNumberInput(L, 'kh', 50)),
          el('td', { class: 'soil-grid-actions' },
            el('button', { class: 'tiny', onclick: () => moveLayer(i, -1) }, '↑'),
            el('button', { class: 'tiny', onclick: () => moveLayer(i, +1) }, '↓'),
            el('button', { class: 'tiny', onclick: () => removeLayer(i) }, '×'),
          ),
        ));
      });
    }

    function removeLayer(i) {
      model.layers.splice(i, 1);
      rerenderLayers();
      syncStagePreviewAfterStageChange();
    }

    function moveLayer(i, dir) {
      const j = i + dir;
      if (j < 0 || j >= model.layers.length) return;
      const t = model.layers[i];
      model.layers[i] = model.layers[j];
      model.layers[j] = t;
      rerenderLayers();
    }

    function defaultWallSection() {
      return { depth: 9.0, EI: 5674 };
    }

    function addWallSection(data) {
      if (!model.wall.sections) model.wall.sections = [];
      model.wall.sections.push(data || defaultWallSection());
      rerenderWallSections();
    }

    function removeWallSection(i) {
      model.wall.sections.splice(i, 1);
      if (!model.wall.sections.length) model.wall.sections.push(defaultWallSection());
      rerenderWallSections();
    }

    function moveWallSection(i, dir) {
      const j = i + dir;
      if (j < 0 || j >= model.wall.sections.length) return;
      const t = model.wall.sections[i];
      model.wall.sections[i] = model.wall.sections[j];
      model.wall.sections[j] = t;
      rerenderWallSections();
    }

    function rerenderWallSections() {
      markModelDirty();
      const host = document.getElementById('wallSections');
      host.innerHTML = '';
      model.wall.sections.forEach((S, i) => {
        host.appendChild(el('div', { class: 'block' },
          el('div', { class: 'row' },
            el('span', {}, '#' + (i + 1)),
            el('label', {}, 'Z(bot) m'), bindNumberInput(S, 'depth', 0.1),
            el('label', {}, 'EI tf-m'), bindNumberInput(S, 'EI', 1, '90px'),
            el('button', { class: 'tiny', onclick: () => moveWallSection(i, -1) }, '↑'),
            el('button', { class: 'tiny', onclick: () => moveWallSection(i, +1) }, '↓'),
            el('button', { class: 'tiny', onclick: () => removeWallSection(i) }, '×'),
          ),
        ));
      });
    }

    return {
      defaultLayer,
      addLayer,
      rerenderLayers,
      removeLayer,
      moveLayer,
      defaultWallSection,
      addWallSection,
      removeWallSection,
      moveWallSection,
      rerenderWallSections,
    };
  };
})();
