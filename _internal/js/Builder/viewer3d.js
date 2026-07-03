// =====================================================================
//   THREE.JS SCENE  (mounted in #viewer; logic kept identical to index.html)
// =====================================================================
const viewerEl   = document.getElementById('viewer');
const viewer3DEl = document.getElementById('viewer3D');
let scene = new THREE.Scene();
let camera = new THREE.PerspectiveCamera(60, viewer3DEl.clientWidth / viewer3DEl.clientHeight, 0.1, 1000);
let soil_h = 10;
// soil_w and soil_d are the horizontal extents of the rendered
// excavation in the 3D scene.  They follow model.wall.L (set via the
// "L (m)" input next to the viewer toggle buttons).  The pit is drawn
// square (length = width = L).
let soil_w = 10, soil_d = 10;
let wall_h = soil_h;
const wall_t = 1;

let renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(viewer3DEl.clientWidth, viewer3DEl.clientHeight);
renderer.setClearColor(0xffffff, 1);
viewer3DEl.appendChild(renderer.domElement);

let controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2;
// `_lastFitCs` is the scene-size used the last time the camera was fitted.
// rescaleCamera() uses it to scale the camera distance proportionally
// when the geometry changes, so the user-chosen view direction is
// preserved.  refitCamera() (full reset to the default isometric view) is
// only used at initial load — anything called during stage playback or
// geometry edits goes through rescaleCamera().
let _lastFitCs = 0;
function refitCamera() {
  const cs = Math.max(soil_w, soil_h, soil_d);
  camera.near = Math.max(0.1, cs * 0.01);
  camera.far  = Math.max(1000, cs * 50);
  camera.position.set(cs * 1.4, cs * 0.6, cs * 1.4);
  controls.target.set(0, -soil_h / 2, 0);
  camera.lookAt(controls.target);
  camera.updateProjectionMatrix();
  controls.update();
  _lastFitCs = cs;
}
function rescaleCamera() {
  // Keep whatever direction the user is currently looking from.
  // Only update near/far (depend on cs) and scale the camera-to-target
  // offset by the cs ratio if the scene size has changed.
  const cs = Math.max(soil_w, soil_h, soil_d);
  camera.near = Math.max(0.1, cs * 0.01);
  camera.far  = Math.max(1000, cs * 50);
  if (_lastFitCs > 0 && Math.abs(cs - _lastFitCs) > 1e-6) {
    const offset = camera.position.clone().sub(controls.target);
    offset.multiplyScalar(cs / _lastFitCs);
    controls.target.set(0, -soil_h / 2, 0);
    camera.position.copy(controls.target).add(offset);
  }
  camera.updateProjectionMatrix();
  controls.update();
  _lastFitCs = cs;
}
refitCamera();

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(10, 10, 10); scene.add(light);
scene.add(new THREE.AxesHelper(3));

window.updateStageInfo = function(text) {
  const el = document.getElementById("stageInfo");
  if (el) el.textContent = text || "Stage : -";
};

let wallMat = new THREE.MeshLambertMaterial({ color: 0x888888, transparent: true, opacity: 0.5 });
let soil = null;
const layerSoilGroup = new THREE.Group(); scene.add(layerSoilGroup);
const remSoilGroup   = new THREE.Group(); scene.add(remSoilGroup);

function clamp(v, a, b) { return Math.max(a, Math.min(v, b)); }
function getLayerColor(phi) {
  const t = (clamp(phi, 25, 40) - 25) / 15.0;
  const r = Math.round(230 + (120-230)*t), g = Math.round(200 + (85-200)*t), b = Math.round(120 + (45-120)*t);
  return (r << 16) | (g << 8) | b;
}
// Exposed on window so builder_main.js (loaded after this file) and the
// 2D profile installer can use it without depending on script order.
window.getLayerColor = getLayerColor;

function createSurroundingSoil(topY, bottomY, colorValue) {
  if (topY <= bottomY) return null;
  const outerOffset = 2;
  const outerW = soil_w + 2*wall_t + 2*outerOffset;
  const outerD = soil_d + 2*wall_t + 2*outerOffset;
  const innerW = soil_w + 2*wall_t, innerD = soil_d + 2*wall_t;
  const wallBottomY = -soil_h;
  const material = new THREE.MeshLambertMaterial({ color: colorValue, transparent: true, opacity: 0.5 });

  function makeRingMesh(segTop, segBottom) {
    const h = segTop - segBottom; if (h <= 0) return null;
    const shape = new THREE.Shape();
    shape.moveTo(-outerW/2, -outerD/2); shape.lineTo(outerW/2, -outerD/2);
    shape.lineTo(outerW/2, outerD/2);   shape.lineTo(-outerW/2, outerD/2);
    shape.lineTo(-outerW/2, -outerD/2);
    const hole = new THREE.Path();
    hole.moveTo(-innerW/2, -innerD/2); hole.lineTo(-innerW/2, innerD/2);
    hole.lineTo(innerW/2, innerD/2);   hole.lineTo(innerW/2, -innerD/2);
    hole.lineTo(-innerW/2, -innerD/2);
    shape.holes.push(hole);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: -h, bevelEnabled: false });
    geometry.rotateX(-Math.PI/2); geometry.translate(0, segTop, 0);
    return new THREE.Mesh(geometry, material.clone());
  }
  function makeSolidMesh(segTop, segBottom) {
    const h = segTop - segBottom; if (h <= 0) return null;
    const geometry = new THREE.BoxGeometry(outerW, h, outerD);
    geometry.translate(0, (segTop+segBottom)/2, 0);
    return new THREE.Mesh(geometry, material.clone());
  }
  if (bottomY >= wallBottomY) return makeRingMesh(topY, bottomY);
  if (topY <= wallBottomY)    return makeSolidMesh(topY, bottomY);
  const group = new THREE.Group();
  const upper = makeRingMesh(topY, wallBottomY);
  const lower = makeSolidMesh(wallBottomY, bottomY);
  if (upper) group.add(upper); if (lower) group.add(lower);
  return group.children.length ? group : null;
}

function createSoil(currentDepth = 0) {
  currentDepth = Math.max(0, Math.min(currentDepth, soil_h));
  const newHeight = soil_h - currentDepth;
  const geomHeight = Math.max(newHeight, 0.001);
  if (soil) { scene.remove(soil); soil.geometry.dispose(); soil.material.dispose(); }
  soil = new THREE.Mesh(new THREE.BoxGeometry(soil_w, geomHeight, soil_d),
                        new THREE.MeshLambertMaterial({ color: 0x8B4513 }));
  soil.position.y = -currentDepth - geomHeight/2;
  scene.add(soil);
}

function clearRemSoils() {
  while (remSoilGroup.children.length) {
    const o = remSoilGroup.children[0]; remSoilGroup.remove(o);
    if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose();
  }
}
function clearLayerSoils() {
  while (layerSoilGroup.children.length) {
    const o = layerSoilGroup.children[0]; layerSoilGroup.remove(o);
    if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose();
  }
}
function clearWalls() {
  while (wallGroup.children.length) {
    const o = wallGroup.children[0]; wallGroup.remove(o);
    if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose();
  }
}

// Tracks the current excavation (dredge) depth so newly added rem-soil
// blocks can be pre-clipped above it.  Reset by resetModel().
let currentDredgeDepth = 0;

function _makeRemSoilMesh(topDepth, bottomDepth) {
  const h = bottomDepth - topDepth;
  if (h <= 0) return null;
  const geom = new THREE.BoxGeometry(soil_w, h, soil_d);
  const mat = new THREE.MeshLambertMaterial({ color: 0x8B4513, transparent: true, opacity: 0.5 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(0, -(topDepth + bottomDepth)/2, 0);
  // remember the depth range so a later setExcavation can clip us.
  mesh.userData.topDepth    = topDepth;
  mesh.userData.bottomDepth = bottomDepth;
  return mesh;
}

window.addRemSoil = function(topDepth, bottomDepth) {
  // BAC = backfill (adds soil above the dredge) and SOI = in-place soil
  // change can both end up here.  We keep the block at the depths the
  // command literally asks for, even when it pokes above the current
  // dredge ??that's exactly what backfill is.  The earlier "in-place
  // soil change before an EXC" case (e.g. 06036's SOL at z=2..8 followed
  // by EXC to 5.3) is handled by clipRemSoilsAbove(), called from
  // setExcavation, which trims blocks at the new dredge depth.
  const t = Number(topDepth), b = Number(bottomDepth);
  if (!(b > t)) return;
  const mesh = _makeRemSoilMesh(t, b);
  if (mesh) remSoilGroup.add(mesh);
};

// Clip every existing rem-soil block at `depth`: blocks fully above it are
// removed, blocks straddling it have their top trimmed to `depth`.
function clipRemSoilsAbove(depth) {
  const survivors = [];
  for (const mesh of remSoilGroup.children) {
    const t = mesh.userData.topDepth;
    const b = mesh.userData.bottomDepth;
    if (t == null || b == null) { survivors.push(mesh); continue; }
    if (b <= depth) {                                  // fully above dredge
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
      continue;                                        // dropped
    }
    if (t < depth) {                                   // straddles, trim top
      const newH = b - depth;
      mesh.geometry.dispose();
      mesh.geometry = new THREE.BoxGeometry(soil_w, newH, soil_d);
      mesh.position.y = -(depth + b) / 2;
      mesh.userData.topDepth = depth;
    }
    survivors.push(mesh);
  }
  // rebuild the group's child list
  while (remSoilGroup.children.length) remSoilGroup.remove(remSoilGroup.children[0]);
  for (const m of survivors) remSoilGroup.add(m);
}

window.setLayerSoils = function(layers) {
  clearLayerSoils();
  if (!layers || !layers.length) return;
  let prevDepth = 0;
  for (const layer of layers) {
    const depth = Number(layer.depth), phi = Number(layer.phi);
    if (isNaN(depth) || isNaN(phi)) continue;
    if (depth <= prevDepth) continue;
    const m = createSurroundingSoil(-prevDepth, -depth, getLayerColor(phi));
    if (m) layerSoilGroup.add(m);
    prevDepth = depth;
  }
};
window.setExcavation = function(depth) {
  depth = Math.max(0, Math.min(depth, soil_h));
  currentDredgeDepth = depth;
  createSoil(depth);
  clipRemSoilsAbove(depth);
};

let showSurroundingSoil = true;
document.getElementById("toggleSoil").onclick = () => {
  showSurroundingSoil = !showSurroundingSoil;
  layerSoilGroup.visible = showSurroundingSoil;
};

const wallGroup = new THREE.Group(); scene.add(wallGroup);
let strutSets = [];
const strutGroup = new THREE.Group(); scene.add(strutGroup);

function clearStruts() {
  while (strutGroup.children.length) {
    const o = strutGroup.children[0]; strutGroup.remove(o); disposeObjectDeep(o);
  }
  strutSets = [];
}
function disposeObjectDeep(obj) {
  obj.traverse(c => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      if (Array.isArray(c.material)) c.material.forEach(m => m.dispose && m.dispose());
      else if (c.material.dispose) c.material.dispose();
    }
  });
}

function addDefaultStruts(y, s, setId, forcedDirection=null, incl=0, opts={}) {
  // opts.minimal       : skip walers + corner braces (use for the "upper"
  //                      layer in LW mode — its walers would just duplicate
  //                      the lower layer's, which doesn't match how real
  //                      cross-bracing stacks: lower layer carries the
  //                      primary waler ring, upper layer is just struts).
  // opts.sideWalerLift : raise the two perpendicular-to-bar walers by this
  //                      many metres (single-direction mode = 0.3 m so the
  //                      perpendicular walers visually sit one waler height
  //                      above the primary ones; LW mode = 0).
  // noCornerBraces : skip the 4 corner pieces.  Used by the W (upper)
  //                  layer in LW mode — L's pass already drew them.
  // noSideWalers   : skip the two walers parallel to the bar (the side
  //                  walers).  W in LW mode skips them because L drew
  //                  them on the perpendicular walls already, at the
  //                  correct (lifted) W elevation.  W still draws its
  //                  own TWO primary walers on the W-analysed walls so
  //                  the bars are physically supported in the scene.
  const noCornerBraces = !!opts.noCornerBraces;
  const noSideWalers   = !!opts.noSideWalers;
  const sideWalerLift  = Number(opts.sideWalerLift) || 0;
  const setGroup = new THREE.Group(); setGroup.userData.setId = setId;
  const mat = new THREE.MeshLambertMaterial({ color: 0xFF0000 });
  // BUT inclination: rotate the strut bar about the wall-parallel axis so
  // one end lifts.  Positive I in degrees tilts the +long-axis end down.
  const incl_rad = (Number(incl) || 0) * Math.PI / 180;
  function bar(x, z, w, d, levelY, tiltAxis=null, yShift=0, axisShift=0) {
    const geom = new THREE.BoxGeometry(w, 0.3, d);
    const m = new THREE.Mesh(geom, mat);
    // Tilt pivots at the -long-axis wall.  yShift sinks the bar centre
    // by (L/2)·sin(I); axisShift slides it along the long axis by
    // (L/2)·(cos(I)−1) so the pivot end stays pinned to its wall.
    if (tiltAxis === 'x') {
      m.position.set(x, -(levelY + yShift), z + axisShift);
      m.rotation.x = incl_rad;
    } else if (tiltAxis === 'z') {
      m.position.set(x + axisShift, -(levelY + yShift), z);
      m.rotation.z = -incl_rad;
    } else {
      m.position.set(x, -levelY, z);
    }
    setGroup.add(m);
    const edges = new THREE.EdgesGeometry(geom);
    m.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 })));
  }
  function makeMember(p1, p2, size = 0.25, color = 0xffa64d) {
    const dir = new THREE.Vector3().subVectors(p2, p1); const len = dir.length();
    if (len <= 1e-6) return null;
    const g = new THREE.BoxGeometry(len, size, size);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, transparent:true, opacity:0.95 }));
    m.position.copy(new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5));
    m.setRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(1,0,0), dir.clone().normalize()));
    return m;
  }
  // Plan braces (angle stiffeners at each bar end).  yPlus/yMinus are
  // the depth levels at the +long-axis and -long-axis bar ends; when
  // the bar tilts they shift so each brace pair translates as a unit
  // with its corresponding waler.
  function addPlanBraces(cx, cz, dir, len, yPlus, yMinus, off=1.5, sz=0.25) {
    const hl = len/2;
    let e1, e2, s1, s2, l1, r1, l2, r2;
    if (dir === "x") {
      // long axis along x: e1=-x end (yMinus), e2=+x end (yPlus)
      const yyM = -yMinus, yyP = -yPlus;
      e1 = new THREE.Vector3(cx-hl, yyM, cz); e2 = new THREE.Vector3(cx+hl, yyP, cz);
      s1 = new THREE.Vector3(e1.x+off, yyM, e1.z); s2 = new THREE.Vector3(e2.x-off, yyP, e2.z);
      l1 = new THREE.Vector3(e1.x, yyM, e1.z-off); r1 = new THREE.Vector3(e1.x, yyM, e1.z+off);
      l2 = new THREE.Vector3(e2.x, yyP, e2.z-off); r2 = new THREE.Vector3(e2.x, yyP, e2.z+off);
    } else {
      // long axis along z: e1=-z end (yMinus), e2=+z end (yPlus)
      const yyM = -yMinus, yyP = -yPlus;
      e1 = new THREE.Vector3(cx, yyM, cz-hl); e2 = new THREE.Vector3(cx, yyP, cz+hl);
      s1 = new THREE.Vector3(e1.x, yyM, e1.z+off); s2 = new THREE.Vector3(e2.x, yyP, e2.z-off);
      l1 = new THREE.Vector3(e1.x-off, yyM, e1.z); r1 = new THREE.Vector3(e1.x+off, yyM, e1.z);
      l2 = new THREE.Vector3(e2.x-off, yyP, e2.z); r2 = new THREE.Vector3(e2.x+off, yyP, e2.z);
    }
    [makeMember(s1,l1,sz), makeMember(s1,r1,sz), makeMember(s2,l2,sz), makeMember(s2,r2,sz)]
        .forEach(m => m && setGroup.add(m));
  }
  // Corner braces — translate vertically with their adjacent waler but
  // never rotate.  `offsetOf(xs, zs)` returns the extra depth Δ for the
  // corner at sign-combination (xs, zs).
  function addCornerBraces(yHigh, yLow, off=1.2, sz=0.25, color=0xffa64d, offsetOf=null) {
    const xIn = soil_w/2 - sz/2, zIn = soil_d/2 - sz/2;
    function corner(xs, zs) {
      const dy = offsetOf ? offsetOf(xs, zs) : 0;
      const p1 = new THREE.Vector3(xs*(xIn-off), 0, zs*zIn);
      const p2 = new THREE.Vector3(xs*xIn,       0, zs*(zIn-off));
      const t1 = p1.clone(); t1.y = -(yHigh + dy);
      const t2 = p2.clone(); t2.y = -(yHigh + dy);
      const b1 = p1.clone(); b1.y = -(yLow  + dy);
      const b2 = p2.clone(); b2.y = -(yLow  + dy);
      [makeMember(t1,t2,sz,color), makeMember(b1,b2,sz,color)].forEach(m => m && setGroup.add(m));
    }
    corner(1,1); corner(-1,1); corner(-1,-1); corner(1,-1);
  }
  // Walers: emit a 4-waler ring around the pit so all four walls carry a
  // waler.  The two walers on the analysed walls sit at yPlus / yMinus;
  // the two walers on the perpendicular (side) walls slope from the
  // yMinus corner to the yPlus corner so the ring is continuous when
  // the strut is tilted.  No tilt → all four sit at the same depth.
  function addWaler(yPlus, yMinus, dirAxis, sz=0.3) {
    const m = new THREE.MeshLambertMaterial({ color: 0x666666 });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x222222 });
    function box(x, z, w, d, lvl) {
      const me = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), m);
      me.position.set(x, -lvl, z);
      me.add(new THREE.LineSegments(new THREE.EdgesGeometry(me.geometry), edgeMat));
      setGroup.add(me);
    }
    function sideWaler(p1, p2) {
      // sloped waler box between two corner points.  makeMember orients
      // a box along (p2−p1) and centres it on the midpoint, giving a
      // tilted prism that matches the rectangular cross-section of the
      // straight walers.
      const dir = new THREE.Vector3().subVectors(p2, p1);
      const len = dir.length();
      if (len <= 1e-6) return;
      const geom = new THREE.BoxGeometry(len, 0.3, sz);
      const me = new THREE.Mesh(geom, m);
      me.position.copy(new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5));
      me.setRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(1,0,0), dir.clone().normalize()));
      me.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom), edgeMat));
      setGroup.add(me);
    }
    // Side walers (perpendicular to bar long axis, on the wall pair that
    // does NOT carry the bar) sit `sideWalerLift` metres above the
    // primary walers — single-direction mode passes 0.3 so they look
    // stacked on top of the primary ring, like real cross-bracing.  LW
    // mode passes dzW so L's side walers land at the W bar elevation.
    // `noSideWalers` skips them entirely (used by W in LW so it doesn't
    // duplicate the ones L already drew on those walls).
    const sideLift = sideWalerLift;
    if (dirAxis === "z") {
      // analysed walls run along x at z = ±soil_d/2
      box(0,  soil_d/2 - sz/2, soil_w, sz, yPlus);
      box(0, -soil_d/2 + sz/2, soil_w, sz, yMinus);
      if (!noSideWalers) {
        // side walls at x = ±soil_w/2: connect (z=-soil_d/2, yMinus) → (z=+soil_d/2, yPlus)
        sideWaler(new THREE.Vector3( soil_w/2 - sz/2, -(yMinus - sideLift), -soil_d/2 + sz/2),
                  new THREE.Vector3( soil_w/2 - sz/2, -(yPlus  - sideLift),  soil_d/2 - sz/2));
        sideWaler(new THREE.Vector3(-soil_w/2 + sz/2, -(yMinus - sideLift), -soil_d/2 + sz/2),
                  new THREE.Vector3(-soil_w/2 + sz/2, -(yPlus  - sideLift),  soil_d/2 - sz/2));
      }
    } else if (dirAxis === "x") {
      // analysed walls run along z at x = ±soil_w/2
      box( soil_w/2 - sz/2, 0, sz, soil_d, yPlus);
      box(-soil_w/2 + sz/2, 0, sz, soil_d, yMinus);
      if (!noSideWalers) {
        // side walls at z = ±soil_d/2: connect (x=-soil_w/2, yMinus) → (x=+soil_w/2, yPlus)
        sideWaler(new THREE.Vector3(-soil_w/2 + sz/2, -(yMinus - sideLift),  soil_d/2 - sz/2),
                  new THREE.Vector3( soil_w/2 - sz/2, -(yPlus  - sideLift),  soil_d/2 - sz/2));
        sideWaler(new THREE.Vector3(-soil_w/2 + sz/2, -(yMinus - sideLift), -soil_d/2 + sz/2),
                  new THREE.Vector3( soil_w/2 - sz/2, -(yPlus  - sideLift), -soil_d/2 + sz/2));
      }
    }
  }
  // Draw struts only perpendicular to the WALL we are analysing:
  //   direction === 'L'  ?? analysed wall runs along x; struts span z
  //                          (length = soil_d = W).  Bars are placed
  //                          along the x-axis at every `s` along it.
  //   direction === 'W'  ?? analysed wall runs along z; struts span x
  //                          (length = soil_w = L).  Bars are placed
  //                          along the z-axis.
  const direction = forcedDirection || (window.model && window.model.wall && window.model.wall.direction)
                    || (typeof model !== 'undefined' && model.wall && model.wall.direction)
                    || 'L';
  const safeS = (s && s > 0) ? s : Math.max(soil_w, soil_d);
  // Tilt geometry: bar pivots at the -long-axis wall (yMinus stays at
  // the original level y); the +long-axis wall end drops by the FULL
  // strut length times sin(I).  Bar mesh centre is therefore shifted
  // by (L/2)·sin(I) downward in y and by (L/2)·(cos(I)−1) along the
  // long axis so the pivot end stays pinned at z=-L/2 (or x=-L/2).
  const sI = Math.sin(incl_rad), cI = Math.cos(incl_rad);
  let dy_full = 0, yPlus = y, yMinus = y;
  let yShift = 0, axisShift = 0;
  if (direction === 'L') {
    dy_full  = soil_d * sI;
    yPlus    = y + dy_full;
    yMinus   = y;
    yShift    = (soil_d / 2) * sI;
    axisShift = (soil_d / 2) * (cI - 1);
    const N  = Math.max(1, Math.round(soil_w / safeS));
    const dx = soil_w / N;
    for (let i = 0; i < N; i++) {
      const x = -soil_w/2 + dx/2 + i*dx;
      bar(x, 0, 0.3, soil_d, y, 'x', yShift, axisShift);
      addPlanBraces(x, 0, "z", soil_d, yPlus, yMinus);
    }
    // Walers are always drawn (W still gets its own two primary walers
    // in LW mode), but the side pair and corner braces are gated.
    addWaler(yPlus, yMinus, "z");
    if (!noCornerBraces) {
      // corner at zs=+1 follows +z waler (offset = dy_full); zs=-1 stays at y.
      addCornerBraces(y, y-0.3, 1.2, 0.25, 0xffa64d, (xs, zs) => zs > 0 ? dy_full : 0);
    }
  } else {
    dy_full  = soil_w * sI;
    yPlus    = y + dy_full;
    yMinus   = y;
    yShift    = (soil_w / 2) * sI;
    axisShift = (soil_w / 2) * (cI - 1);
    const N  = Math.max(1, Math.round(soil_d / safeS));
    const dz = soil_d / N;
    for (let i = 0; i < N; i++) {
      const z = -soil_d/2 + dz/2 + i*dz;
      bar(0, z, soil_w, 0.3, y, 'z', yShift, axisShift);
      addPlanBraces(0, z, "x", soil_w, yPlus, yMinus);
    }
    addWaler(yPlus, yMinus, "x");
    if (!noCornerBraces) {
      addCornerBraces(y, y-0.3, 1.2, 0.25, 0xffa64d, (xs, zs) => xs > 0 ? dy_full : 0);
    }
  }
  strutGroup.add(setGroup); strutSets.push({ id: setId, group: setGroup });
}

// Anchor set: at each spacing position along the wall, draw a thin tendon
// piercing the wall outward into the retained soil, plus a small cap block
// flush with the inside (excavation-side) wall face.  The tendon tilts
// downward by `incl` degrees.  Anchors are placed on BOTH opposing walls
// of the analysed direction (mirroring the BUT placement).
function addAnchorSet(y, s, setId, forcedDirection=null, incl=30) {
  const setGroup = new THREE.Group(); setGroup.userData.setId = setId;
  const direction = forcedDirection || (window.model && window.model.wall && window.model.wall.direction)
                    || (typeof model !== 'undefined' && model.wall && model.wall.direction)
                    || 'L';
  const safeS    = (s && s > 0) ? s : Math.max(soil_w, soil_d);
  const incl_rad = (Number(incl) || 0) * Math.PI / 180;
  const L_tendon = Math.max(2.0, Math.min(soil_w, soil_d) * 0.55);
  const tendonSz = 0.10;
  const capSz    = 0.6;
  const tendonMat = new THREE.MeshLambertMaterial({ color: 0x335577 });
  const capMat    = new THREE.MeshLambertMaterial({ color: 0x223344 });

  function placeAnchor(capPos, outDir) {
    // outDir: unit vector pointing OUTWARD from the wall (away from pit).
    // Tendon direction = outDir·cos(I) + (-Y)·sin(I), tilted down.
    const dir = new THREE.Vector3(
      outDir.x * Math.cos(incl_rad),
      -Math.sin(incl_rad),
       outDir.z * Math.cos(incl_rad),
    );
    const mid = capPos.clone().add(dir.clone().multiplyScalar(L_tendon / 2));
    const tendon = new THREE.Mesh(
      new THREE.BoxGeometry(L_tendon, tendonSz, tendonSz), tendonMat);
    tendon.position.copy(mid);
    tendon.setRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(1, 0, 0), dir.clone().normalize()));
    setGroup.add(tendon);
    // Cap block: short along the outward direction, tall in y.
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(capSz * 0.4, capSz, capSz), capMat);
    cap.position.copy(capPos);
    const flatOut = new THREE.Vector3(outDir.x, 0, outDir.z).normalize();
    cap.setRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(1, 0, 0), flatOut));
    setGroup.add(cap);
  }

  if (direction === 'L') {
    // Analysed walls run along x at z=±soil_d/2; tendons extend in ±z.
    const N  = Math.max(1, Math.round(soil_w / safeS));
    const dx = soil_w / N;
    for (let i = 0; i < N; i++) {
      const x = -soil_w/2 + dx/2 + i*dx;
      placeAnchor(new THREE.Vector3(x, -y,  soil_d/2 - 0.05), new THREE.Vector3(0, 0,  1));
      placeAnchor(new THREE.Vector3(x, -y, -soil_d/2 + 0.05), new THREE.Vector3(0, 0, -1));
    }
  } else {
    const N  = Math.max(1, Math.round(soil_d / safeS));
    const dz = soil_d / N;
    for (let i = 0; i < N; i++) {
      const z = -soil_d/2 + dz/2 + i*dz;
      placeAnchor(new THREE.Vector3( soil_w/2 - 0.05, -y, z), new THREE.Vector3( 1, 0, 0));
      placeAnchor(new THREE.Vector3(-soil_w/2 + 0.05, -y, z), new THREE.Vector3(-1, 0, 0));
    }
  }
  strutGroup.add(setGroup);
  strutSets.push({ id: setId, group: setGroup });
}

function rebuildWalls() {
  clearWalls(); if (!showWall) return;
  function addWall(x, z, w, d) {
    const w2 = new THREE.Mesh(new THREE.BoxGeometry(w, wall_h, d), wallMat);
    w2.position.set(x, -wall_h/2, z); wallGroup.add(w2);
  }
  addWall(soil_w/2 + wall_t/2, 0, wall_t, soil_d + 2*wall_t);
  addWall(-(soil_w/2 + wall_t/2), 0, wall_t, soil_d + 2*wall_t);
  addWall(0,  soil_d/2 + wall_t/2, soil_w, wall_t);
  addWall(0, -(soil_d/2 + wall_t/2), soil_w, wall_t);
}

window.removeStrutSet = function(setId) {
  const ids = Array.isArray(setId) ? setId : [setId];
  for (const id of ids) {
    for (let i = strutSets.length - 1; i >= 0; i--) {
      if (strutSets[i].id !== id) continue;
      const g = strutSets[i].group;
      strutGroup.remove(g);
      disposeObjectDeep(g);
      strutSets.splice(i, 1);
    }
  }
};
window.setWallHeight = function(h) { soil_h = Number(h); wall_h = soil_h; rescaleCamera(); };
window.addStrutsAt = function(y, s, setId, forcedDirection=null, kind='BUT', incl=0, opts={}) {
  if (kind === 'ANC') addAnchorSet(y, s, setId, forcedDirection, incl);   // ANC has no walers/corners; opts is a no-op
  else                addDefaultStruts(y, s, setId, forcedDirection, incl, opts);
};

let showWall = true;
document.getElementById("toggleWall").onclick = () => {
  showWall = !showWall; if (showWall) rebuildWalls(); else clearWalls();
};

window.resetModel = function() {
  currentDredgeDepth = 0;
  createSoil(0); clearStruts(); clearLayerSoils(); rebuildWalls(); clearRemSoils();
};
window.resetModel();

(function animate() {
  requestAnimationFrame(animate);
  controls.update(); renderer.render(scene, camera);
})();

window.addEventListener('resize', () => {
  camera.aspect = viewer3DEl.clientWidth / viewer3DEl.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(viewer3DEl.clientWidth, viewer3DEl.clientHeight);
  // builder_main.js installs window.renderProfile2D after this file loads;
  // guard so the first resize before that point doesn't throw.
  if (window.renderProfile2D) window.renderProfile2D();
});

