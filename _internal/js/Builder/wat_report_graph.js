(function () {
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function svgToDataUrl(svgText) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
  }

  window.buildB1Profile2DStackDataUrl = async function buildB1Profile2DStackDataUrl(svgItems, opts = {}) {
    const items = Array.isArray(svgItems) ? svgItems.filter(item => item && item.svg) : [];
    if (!items.length) return null;

    const scale = finiteNumber(opts.scale, 2);
    const gap = finiteNumber(opts.gap, 12);
    const width = Math.max.apply(null, items.map(item => finiteNumber(item.width, 800)));
    const heights = items.map(item => finiteNumber(item.height, 240));
    const height = heights.reduce((sum, h) => sum + h, 0) + gap * Math.max(0, items.length - 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    let y = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const h = heights[i];
      const img = await loadImage(svgToDataUrl(item.svg));
      ctx.drawImage(img, 0, y, finiteNumber(item.width, width), h);
      y += h + gap;
    }
    return canvas.toDataURL('image/png');
  };

  const COLORS = [
    '#111827', '#2563eb', '#dc2626', '#16a34a', '#9333ea',
    '#ea580c', '#0891b2', '#be123c', '#4f46e5', '#65a30d',
  ];

  function finiteNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function firstDefined() {
    for (let i = 0; i < arguments.length; i++) {
      if (arguments[i] !== undefined && arguments[i] !== null) return arguments[i];
    }
    return undefined;
  }

  function layerBottom(layer) {
    return finiteNumber(layer && firstDefined(layer.depth, layer.bottom, layer.zbot, layer.Z), 0);
  }

  function wallDepth(model) {
    const wall = (model && model.wall) || {};
    const sections = Array.isArray(wall.sections) ? wall.sections : [];
    let depth = finiteNumber(firstDefined(wall.depth, wall.wall_depth, wall.length), 0);
    for (const sec of sections) {
      depth = Math.max(depth, finiteNumber(firstDefined(sec.depth, sec.bottom, sec.zbot, sec.Z), 0));
    }
    return depth;
  }

  function stageLabel(stage, index) {
    const name = String((stage && stage.name) || '').trim();
    return name || `${index + 1}`;
  }

  function fmtDepth(value) {
    const n = finiteNumber(value, 0);
    return Math.abs(n - Math.round(n)) < 1e-6 ? String(Math.round(n)) : n.toFixed(1);
  }

  function collectWatProfiles(stages) {
    const current = { 1: [], 2: [] };
    const profiles = [];
    let hasAnyWater = false;

    (stages || []).forEach((stage, stageIndex) => {
      const seenSide = {};
      for (const action of (stage && stage.actions) || []) {
        if (!action || action.type !== 'WAT') continue;
        const side = action.side | 0;
        if (side !== 1 && side !== 2) continue;
        if (!seenSide[side]) {
          current[side] = [];
          seenSide[side] = true;
        }
        current[side].push({
          z: finiteNumber(firstDefined(action.Z1, action.z), 0),
          u: finiteNumber(firstDefined(action.U, action.u_w, action.u), 0),
        });
        hasAnyWater = true;
      }
      if (hasAnyWater && (current[1].length || current[2].length)) {
        profiles.push({
          label: stageLabel(stage, stageIndex),
          water: {
            1: current[1].map(p => ({ z: p.z, u: p.u })),
            2: current[2].map(p => ({ z: p.z, u: p.u })),
          },
        });
      }
    });
    return profiles;
  }

  function soilColor(layer, index) {
    const mode = String((layer && (layer.draining_condition || layer.analysis_mode || layer.analysis)) || '').toLowerCase();
    if (mode.includes('undrained') || mode.includes('total')) return index % 2 ? '#d9c89d' : '#ccb987';
    return index % 2 ? '#f4e6b9' : '#ead6a0';
  }

  function drawText(ctx, text, x, y, opts = {}) {
    ctx.save();
    ctx.fillStyle = opts.fill || '#111827';
    ctx.font = opts.font || '14px Georgia, "Times New Roman", serif';
    ctx.textAlign = opts.align || 'left';
    ctx.textBaseline = opts.baseline || 'alphabetic';
    if (opts.rotate) {
      ctx.translate(x, y);
      ctx.rotate(opts.rotate);
      ctx.fillText(text, 0, 0);
    } else {
      ctx.fillText(text, x, y);
    }
    ctx.restore();
  }

  function textWidth(ctx, text, font) {
    ctx.save();
    ctx.font = font;
    const width = ctx.measureText(text).width;
    ctx.restore();
    return width;
  }

  function intersects(a, b) {
    return !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2);
  }

  function placeValueLabel(ctx, text, x, y, color, occupied, pointKeys, bounds) {
    const pointKey = `${Math.round(x)}:${Math.round(y)}:${text}`;
    if (pointKeys[pointKey]) return;
    pointKeys[pointKey] = true;

    const font = '10px Georgia, "Times New Roman", serif';
    const width = textWidth(ctx, text, font) + 6;
    const height = 13;
    const tx = Math.max(bounds.left + width / 2, Math.min(bounds.right - width / 2, x));

    for (let attempt = 0; attempt < 16; attempt++) {
      const cy = Math.min(bounds.bottom - 2, y + 14 + attempt * height);
      const box = { x1: tx - width / 2, x2: tx + width / 2, y1: cy - height + 2, y2: cy + 3 };
      if (!occupied.some(existing => intersects(existing, box))) {
        occupied.push(box);
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        ctx.fillRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);
        ctx.restore();
        drawText(ctx, text, tx, cy, {
          fill: color,
          font,
          align: 'center',
        });
        return;
      }
    }
  }

  function drawPolyline(ctx, points, xOf, yOf, color, labelValues, labelState, pointKeys, labelBounds, maxDepth) {
    const clean = points
      .map(p => ({ z: finiteNumber(p.z), u: finiteNumber(p.u) }))
      .filter(p => Number.isFinite(p.z) && Number.isFinite(p.u) && p.z <= maxDepth + 1e-6)
      .sort((a, b) => a.z - b.z);
    if (!clean.length) return;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    clean.forEach((p, i) => {
      const x = xOf(p.u);
      const y = yOf(p.z);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    clean.forEach((p, i) => {
      const x = xOf(p.u);
      const y = yOf(p.z);
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      if (labelValues) {
        placeValueLabel(ctx, p.u.toFixed(2), x, y, color, labelState, pointKeys, labelBounds);
      }
    });
    ctx.restore();
  }

  window.buildB1WatGraphDataUrl = function buildB1WatGraphDataUrl(model, opts = {}) {
    const stages = Array.isArray(opts.stages) ? opts.stages : ((model && model.stages) || []);
    const layers = Array.isArray(model && model.layers) ? model.layers : [];
    const profiles = collectWatProfiles(stages);
    if (!profiles.length) return null;

    const canvas = document.createElement('canvas');
    const scale = finiteNumber(opts.scale, 2);
    const width = finiteNumber(opts.width, 1250);
    const height = finiteNumber(opts.height, 900);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const layerDepth = layers.reduce((max, layer) => Math.max(max, layerBottom(layer)), 0);
    const watDepth = profiles.reduce((max, profile) => {
      let localMax = max;
      [1, 2].forEach(side => {
        (profile.water[side] || []).forEach(p => {
          localMax = Math.max(localMax, finiteNumber(p.z, 0));
        });
      });
      return localMax;
    }, 0);
    const toe = wallDepth(model);
    const zMax = Math.max(toe || Math.min(Math.max(layerDepth, watDepth), layerDepth || watDepth || 1), 1);
    const uMax = Math.max(1, profiles.reduce((max, profile) => {
      let localMax = max;
      [1, 2].forEach(side => {
        (profile.water[side] || []).forEach(p => {
          localMax = Math.max(localMax, Math.abs(finiteNumber(p.u, 0)));
        });
      });
      return localMax;
    }, 0));

    const plot = { left: 220, right: width - 130, top: 72, bottom: height - 70 };
    const xCenter = (plot.left + plot.right) / 2;
    const xSpan = (plot.right - plot.left) / 2 * 0.86;
    const xOfRight = u => xCenter + (u / uMax) * xSpan;
    const xOfLeft = u => xCenter - (u / uMax) * xSpan;
    const yOf = z => plot.top + (z / zMax) * (plot.bottom - plot.top);
    const graphBounds = { left: plot.left + 6, right: plot.right - 6, top: plot.top + 16, bottom: plot.bottom - 10 };

    drawText(ctx, 'Water Pressure (t/m^2)', xCenter, 30, {
      font: '22px Georgia, "Times New Roman", serif',
      align: 'center',
    });
    drawText(ctx, '(Excavated Side)', plot.left + 110, 58, { align: 'center' });
    drawText(ctx, '(Retained Side)', plot.right - 110, 58, { align: 'center' });

    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(plot.left, plot.top, plot.right - plot.left, plot.bottom - plot.top);
    ctx.beginPath();
    ctx.moveTo(xCenter, plot.top);
    ctx.lineTo(xCenter, plot.bottom);
    ctx.strokeStyle = '#8b8b8b';
    ctx.stroke();

    const uTickCount = 4;
    ctx.save();
    ctx.font = '11px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = -uTickCount; i <= uTickCount; i++) {
      const u = Math.abs(uMax * i / uTickCount);
      const x = xCenter + (i / uTickCount) * xSpan;
      ctx.strokeStyle = i === 0 ? '#6b7280' : '#d1d5db';
      ctx.lineWidth = i === 0 ? 1.1 : 0.7;
      ctx.beginPath();
      ctx.moveTo(x, plot.top);
      ctx.lineTo(x, plot.bottom);
      ctx.stroke();
      ctx.strokeStyle = '#111827';
      ctx.beginPath();
      ctx.moveTo(x, plot.top - 5);
      ctx.lineTo(x, plot.top);
      ctx.stroke();
      ctx.fillStyle = '#111827';
      ctx.fillText(u.toFixed(uMax >= 10 ? 0 : 1), x, plot.top - 21);
    }
    ctx.restore();

    let top = 0;
    layers.forEach((layer, index) => {
      const bottom = Math.min(layerBottom(layer), zMax);
      if (!(bottom > top)) return;
      const y1 = yOf(top);
      const y2 = yOf(bottom);
      ctx.fillStyle = soilColor(layer, index);
      ctx.globalAlpha = 0.28;
      ctx.fillRect(plot.left, y1, plot.right - plot.left, y2 - y1);
      ctx.globalAlpha = 1;
      ctx.setLineDash([8, 8]);
      ctx.strokeStyle = '#9ca3af';
      ctx.beginPath();
      ctx.moveTo(plot.left, y2);
      ctx.lineTo(plot.right, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      const name = String(layer.type || layer.name || `Soil ${index + 1}`);
      const mode = String(layer.draining_condition || layer.analysis_mode || layer.analysis || '').trim();
      drawText(ctx, mode ? `${name} (${mode})` : name, plot.right - 8, (y1 + y2) / 2, {
        font: '12px Georgia, "Times New Roman", serif',
        align: 'right',
        baseline: 'middle',
      });
      drawText(ctx, fmtDepth(bottom), plot.right + 14, y2 + 4, {
        font: '11px Georgia, "Times New Roman", serif',
      });
      top = bottom;
    });

    if (toe > 0) {
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(xCenter, yOf(0));
      ctx.lineTo(xCenter, yOf(Math.min(toe, zMax)));
      ctx.stroke();
    }

    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.left, plot.top);
    ctx.lineTo(plot.right, plot.top);
    ctx.stroke();

    const depthGridMax = Math.ceil(zMax);
    for (let i = 0; i <= depthGridMax; i++) {
      const z = Math.min(i, zMax);
      const y = yOf(z);
      ctx.save();
      ctx.strokeStyle = i === 0 ? '#111827' : '#e5e7eb';
      ctx.lineWidth = i === 0 ? 1 : 0.65;
      ctx.beginPath();
      ctx.moveTo(plot.left, y);
      ctx.lineTo(plot.right, y);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = '#111827';
      ctx.beginPath();
      ctx.moveTo(plot.left - 6, y);
      ctx.lineTo(plot.left, y);
      ctx.stroke();
      drawText(ctx, fmtDepth(z), plot.left - 12, y + 4, {
        font: '12px Georgia, "Times New Roman", serif',
        align: 'right',
      });
      if (z >= zMax) break;
    }
    drawText(ctx, 'z (m)', plot.left - 56, (plot.top + plot.bottom) / 2, {
      rotate: -Math.PI / 2,
      font: '13px Georgia, "Times New Roman", serif',
      align: 'center',
    });

    const labelState = [];
    const pointKeys = {};
    profiles.forEach((profile, index) => {
      const color = COLORS[index % COLORS.length];
      drawPolyline(ctx, profile.water[2] || [], xOfLeft, yOf, color, profiles.length <= 8, labelState, pointKeys, graphBounds, zMax);
      drawPolyline(ctx, profile.water[1] || [], xOfRight, yOf, color, profiles.length <= 8, labelState, pointKeys, graphBounds, zMax);
    });

    const legendX = 24;
    const legendY = plot.top + 32;
    const rowH = 19;
    const legendH = Math.min(profiles.length, 18) * rowH + 22;
    ctx.fillStyle = 'rgba(255,255,255,0.86)';
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 1;
    ctx.fillRect(legendX, legendY, 150, legendH);
    ctx.strokeRect(legendX, legendY, 150, legendH);
    profiles.slice(0, 18).forEach((profile, index) => {
      const y = legendY + 18 + index * rowH;
      const color = COLORS[index % COLORS.length];
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(legendX + 14, y);
      ctx.lineTo(legendX + 44, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(legendX + 29, y, 3, 0, Math.PI * 2);
      ctx.fill();
      drawText(ctx, `Stage ${profile.label}`, legendX + 54, y + 4, {
        font: '12px Georgia, "Times New Roman", serif',
      });
    });
    if (profiles.length > 18) {
      drawText(ctx, `+ ${profiles.length - 18} more`, legendX + 54, legendY + 18 + 18 * rowH, {
        font: '12px Georgia, "Times New Roman", serif',
      });
    }

    return canvas.toDataURL('image/png');
  };
})();
