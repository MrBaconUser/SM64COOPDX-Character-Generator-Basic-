// ============================================================
//  rig.js — Rigging por segmentos + export estático / animado
//  Se carga DESPUÉS de script.js (usa MARIO_PARTS, marioBones, etc.)
//
//  Idea:
//   1) Cada pieza de Mario es un SEGMENTO (hueso → siguiente hueso).
//      Cada vértice/triángulo se asigna al segmento más cercano
//      (mucho mejor que "hueso-punto más cercano").
//   2) Cada pieza tiene un FRAME local: +X a lo largo del miembro
//      (como el rig de Mario: ver sm64Local en MARIO_PARTS),
//      +Y = frente del personaje, +Z = izquierda del personaje.
//   3) Export animado: los vértices de cada pieza se guardan en el
//      espacio local de su hueso y el geo lleva GEO_ANIMATED_PART con
//      la jerarquía de Mario, así las animaciones del juego la mueven.
//
//  IMPORTANTE: el frame (ejes) está deducido de la tabla de offsets
//  de Mario, no verificado dentro del juego. Si el personaje sale
//  girado/torcido, el modo "Estático" sigue siendo el fallback seguro.
// ============================================================

const RIG_MAIN_CHILD = {
  Butt: 'Torso', Torso: 'Head',
  L_Arm: 'L_Forearm', L_Forearm: 'L_Hand',
  R_Arm: 'R_Forearm', R_Forearm: 'R_Hand',
  L_Thigh: 'L_Leg', L_Leg: 'L_Foot',
  R_Thigh: 'R_Leg', R_Leg: 'R_Foot',
};
// piezas sin hijo: su eje X sale de (padre → ella)
const RIG_LEAF_FROM = {
  Head: 'Torso', L_Hand: 'L_Forearm', R_Hand: 'R_Forearm',
  L_Foot: 'L_Leg', R_Foot: 'R_Leg',
};

// El geo de Mario usa GEO_SCALE(0x00, 16384) = 0.25: sus offsets/vértices están en
// "unidades de geo" = 4 × unidades de mundo. Las animaciones del juego (traslación
// de la raíz) asumen esas unidades, así que el modo animado las respeta.
const ANIM_GEO_SCALE = 16384;
const ANIM_UNIT_MUL = 65536 / ANIM_GEO_SCALE;   // 4

// hijos en orden de MARIO_PARTS (= orden de recorrido del geo de Mario)
const MARIO_CHILDREN = {};
MARIO_PARTS.forEach(function (p) {
  if (!p.parent) return;
  if (!MARIO_CHILDREN[p.parent]) MARIO_CHILDREN[p.parent] = [];
  MARIO_CHILDREN[p.parent].push(p.name);
});

// ---------- utilidades ----------

/** Ejecuta fn con todos los huesos en pose de reposo (rotación 0). */
function withRestPose(fn) {
  const saved = marioBones.map(function (b) { return b.quaternion.clone(); });
  marioBones.forEach(function (b) { b.quaternion.identity(); });
  skeletonHelper.updateMatrixWorld(true);
  try {
    return fn();
  } finally {
    marioBones.forEach(function (b, i) { b.quaternion.copy(saved[i]); });
    skeletonHelper.updateMatrixWorld(true);
  }
}

function rigRestPositions() {
  const P = {};
  marioBones.forEach(function (b) {
    P[b.name] = b.getWorldPosition(new THREE.Vector3());
  });
  return P;
}

/** Frames locales de cada pieza (en espacio mundo del visor). */
function rigFrames(P) {
  const U = P.Head.clone().sub(P.Butt).normalize();           // arriba
  const L = P.L_Arm.clone().sub(P.R_Arm)
    .add(P.L_Thigh.clone().sub(P.R_Thigh));                    // izquierda del personaje
  L.addScaledVector(U, -L.dot(U));
  if (L.lengthSq() < 1e-10) L.set(1, 0, 0);
  L.normalize();
  const Fw = new THREE.Vector3().crossVectors(L, U).normalize(); // frente

  const frames = {};
  MARIO_PARTS.forEach(function (part) {
    const n = part.name;
    let dir;
    if (RIG_MAIN_CHILD[n]) dir = P[RIG_MAIN_CHILD[n]].clone().sub(P[n]);
    else dir = P[n].clone().sub(P[RIG_LEAF_FROM[n]]);
    if (dir.lengthSq() < 1e-12) dir.copy(U);
    const X = dir.normalize();
    const Y = Fw.clone().addScaledVector(X, -Fw.dot(X));
    if (Y.lengthSq() < 1e-6) Y.copy(U).addScaledVector(X, -U.dot(X));
    Y.normalize();
    const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
    const basis = new THREE.Matrix4().makeBasis(X, Y, Z);
    frames[n] = { origin: P[n].clone(), X: X, Y: Y, Z: Z, basis: basis };
  });
  frames._up = U; frames._left = L; frames._fwd = Fw;
  return frames;
}

/** Segmentos de hueso (índice i == marioBones[i] == MARIO_PARTS[i]). */
function rigSegments(P, frames) {
  const Fw = frames._fwd;
  const segEnd = {};
  segEnd.Butt = P.Torso;
  segEnd.Torso = P.Head;
  segEnd.Head = P.Head.clone().addScaledVector(P.Head.clone().sub(P.Torso), 0.45);
  if (typeof window !== 'undefined' && window.__rigTopY && window.__rigTopY > P.Head.y) {
    // rig auto-ajustado: la cabeza llega hasta la cima del modelo (chibi: cabeza enorme)
    segEnd.Head = new THREE.Vector3(P.Head.x, window.__rigTopY, P.Head.z);
  }
  ['L', 'R'].forEach(function (s) {
    segEnd[s + '_Arm'] = P[s + '_Forearm'];
    segEnd[s + '_Forearm'] = P[s + '_Hand'];
    segEnd[s + '_Hand'] = P[s + '_Hand'].clone()
      .addScaledVector(P[s + '_Hand'].clone().sub(P[s + '_Forearm']), 0.5);
    segEnd[s + '_Thigh'] = P[s + '_Leg'];
    segEnd[s + '_Leg'] = P[s + '_Foot'];
    const legLen = P[s + '_Leg'].distanceTo(P[s + '_Foot']);
    segEnd[s + '_Foot'] = P[s + '_Foot'].clone().addScaledVector(Fw, legLen * 0.6);
  });
  // Los segmentos de brazo/antebrazo/mano solo pueden quedarse con vertices cercanos a su eje
  // (RIG_ARM_REACH x altura del rig). Sin esto, en modelos chibi (cabeza enorme pegada a los
  // brazos) los cachetes/menton quedaban mas cerca del brazo que de la cabeza y viajaban con la mano.
  const feetY = Math.min(P.L_Foot.y, P.R_Foot.y);
  const rigH = Math.max(1e-3, P.Head.y - feetY);
  const reach = rigH * armReachValue();
  return MARIO_PARTS.map(function (part, i) {
    const isArm = /_(Arm|Forearm|Hand)$/.test(part.name);
    return { name: part.name, index: i, a: P[part.name].clone(), b: segEnd[part.name].clone(),
             reach2: isArm ? reach * reach : 0 };
  });
}

const RIG_ARM_REACH = 0.14;   // valor por defecto; el slider «Alcance de brazos» (id armReach) lo sobrescribe
function armReachValue() {
  const el = (typeof document !== 'undefined') ? document.getElementById('armReach') : null;
  const v = el ? parseFloat(el.value) : NaN;
  return (isFinite(v) && v > 0) ? v : RIG_ARM_REACH;
}
const _sa = new THREE.Vector3();
const _sb = new THREE.Vector3();
function distSqToSegment(p, a, b) {
  _sa.copy(b).sub(a);
  _sb.copy(p).sub(a);
  const len2 = _sa.lengthSq();
  let t = len2 > 1e-12 ? _sb.dot(_sa) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  _sb.copy(a).addScaledVector(_sa, t);
  return p.distanceToSquared(_sb);
}

/** Devuelve [{i, d}, {i, d}] (los 2 segmentos más cercanos, d = distancia). */
function nearestTwoSegments(p, segs) {
  let i1 = 0, i2 = 0, d1 = Infinity, d2 = Infinity;
  for (let i = 0; i < segs.length; i++) {
    let d = distSqToSegment(p, segs[i].a, segs[i].b);
    if (segs[i].reach2 && d > segs[i].reach2) d *= 10000;   // fuera del alcance del brazo
    if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = i; }
    else if (d < d2) { d2 = d; i2 = i; }
  }
  return [{ i: i1, d: Math.sqrt(d1) }, { i: i2, d: Math.sqrt(d2) }];
}

// ---------- auto-rig (vista previa con skinning) ----------

const RIG_DEBUG_COLORS = [
  0xe6194b, 0x3cb44b, 0xffe119, 0x4363d8, 0xf58231, 0x911eb4, 0x46f0f0, 0xf032e6,
  0xbcf60c, 0xfabebe, 0x008080, 0xe6beff, 0x9a6324, 0xfffac8, 0x800000,
];
let rigDebugColors = false;

function unskinModel() {
  if (!currentModel) return;
  const list = [];
  currentModel.traverse(function (c) { if (c.isSkinnedMesh) list.push(c); });
  list.forEach(function (sk) {
    const geo = sk.geometry;
    if (geo.attributes.skinIndex) geo.deleteAttribute('skinIndex');
    if (geo.attributes.skinWeight) geo.deleteAttribute('skinWeight');
    const fix = function (m) { const c = m.clone(); c.skinning = false; return c; };
    const mat = Array.isArray(sk.material) ? sk.material.map(fix) : fix(sk.material);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = sk.name;
    mesh.position.copy(sk.position);
    mesh.quaternion.copy(sk.quaternion);
    mesh.scale.copy(sk.scale);
    const parent = sk.parent;
    if (parent) { parent.add(mesh); parent.remove(sk); }
  });
  isRigged = false;
}

function setRigDebugColors(on) {
  rigDebugColors = !!on;
  if (!currentModel) return;
  currentModel.traverse(function (c) {
    if (!c.isSkinnedMesh || !c.geometry.attributes.color) return;
    const apply = function (m) { m.vertexColors = rigDebugColors; m.needsUpdate = true; };
    if (Array.isArray(c.material)) c.material.forEach(apply); else apply(c.material);
  });
  const btn = document.getElementById('btnBoneColors');
  if (btn) btn.textContent = rigDebugColors ? 'Quitar colores' : 'Colorear por hueso';
}

function autoRigModel() {
  if (!currentModel) { alert('Primero sube un modelo'); return; }
  if (!marioSkeleton || marioBones.length === 0) { alert('Rig de Mario no listo'); return; }

  // re-riggear: volver a mallas normales primero
  unskinModel();

  skeletonHelper.visible = true;
  showSkeleton = true;
  const btnSk = document.getElementById('btnToggleSkeleton');
  if (btnSk) btnSk.textContent = 'Ocultar rig Mario';

  // 1) pies del modelo al suelo y centrado XZ
  currentModel.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(currentModel);
  const c2 = b2.getCenter(new THREE.Vector3());
  currentModel.position.x -= c2.x;
  currentModel.position.z -= c2.z;
  currentModel.position.y -= b2.min.y;
  currentModel.userData.baseY = currentModel.position.y;
  currentModel.updateMatrixWorld(true);

  // rig auto-ajustado de OTRO modelo: volver a las posiciones por defecto de Mario
  if (window.__rigFitUUID && window.__rigFitUUID !== currentModel.uuid) {
    resetRigBonesToDefault();
    window.__rigFitUUID = null; window.__rigTopY = null;
  }
  const rigIsFitted = window.__rigFitUUID === currentModel.uuid;

  // 2) escalar y colocar el rig sobre el modelo (si ya esta auto-ajustado, se respeta tal cual)
  if (!rigIsFitted) {
  skeletonHelper.scale.set(1, 1, 1);
  skeletonHelper.position.set(0, 0, 0);
  skeletonHelper.updateMatrixWorld(true);
  const rigBox0 = new THREE.Box3().setFromObject(skeletonHelper);
  const rigH0 = Math.max(0.01, rigBox0.max.y - rigBox0.min.y);
  const modelBox = new THREE.Box3().setFromObject(currentModel);
  const modelH = Math.max(0.01, modelBox.max.y - modelBox.min.y);
  const sf = Math.min(50, Math.max(0.02, modelH / rigH0));
  skeletonHelper.scale.setScalar(sf);
  skeletonHelper.updateMatrixWorld(true);
  const rigBox1 = new THREE.Box3().setFromObject(skeletonHelper);
  skeletonHelper.position.x = (modelBox.min.x + modelBox.max.x) / 2 - (rigBox1.min.x + rigBox1.max.x) / 2;
  skeletonHelper.position.z = (modelBox.min.z + modelBox.max.z) / 2 - (rigBox1.min.z + rigBox1.max.z) / 2;
  skeletonHelper.position.y = modelBox.min.y - rigBox1.min.y;
  skeletonHelper.updateMatrixWorld(true);
  }

  // 3) skinning con segmentos
  const info = withRestPose(function () {
    const P = rigRestPositions();
    const frames = rigFrames(P);
    return { segs: rigSegments(P, frames) };
  });
  const segs = info.segs;

  const meshes = [];
  currentModel.traverse(function (c) { if (c.isMesh && !c.isSkinnedMesh) meshes.push(c); });
  if (!meshes.length) { alert('No se encontraron meshes para riggear'); return; }

  const wp = new THREE.Vector3();
  let skinnedCount = 0;
  const counts = new Array(segs.length).fill(0);

  meshes.forEach(function (mesh) {
    mesh.updateMatrixWorld(true);
    const geo = mesh.geometry.clone();
    const pos = geo.attributes.position;
    const n = pos.count;
    const sIdx = new Uint16Array(n * 4);
    const sW = new Float32Array(n * 4);
    const col = new Float32Array(n * 3);
    const tc = new THREE.Color();

    for (let i = 0; i < n; i++) {
      wp.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      const two = nearestTwoSegments(wp, segs);
      let w1 = 1 / (two[0].d + 1e-4), w2 = 1 / (two[1].d + 1e-4);
      if (two[1].d > two[0].d * 3) { w1 = 1; w2 = 0; }
      const sum = w1 + w2;
      sIdx[i * 4] = two[0].i; sIdx[i * 4 + 1] = two[1].i;
      sW[i * 4] = w1 / sum; sW[i * 4 + 1] = w2 / sum;
      tc.setHex(RIG_DEBUG_COLORS[two[0].i % RIG_DEBUG_COLORS.length]);
      col[i * 3] = tc.r; col[i * 3 + 1] = tc.g; col[i * 3 + 2] = tc.b;
      counts[two[0].i]++;
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sIdx, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sW, 4));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));

    const fix = function (m) { const c = m.clone(); c.skinning = true; c.vertexColors = rigDebugColors; return c; };
    const mat = Array.isArray(mesh.material) ? mesh.material.map(fix) : fix(mesh.material);

    const skinned = new THREE.SkinnedMesh(geo, mat);
    skinned.name = mesh.name || 'skinned';
    skinned.position.copy(mesh.position);
    skinned.quaternion.copy(mesh.quaternion);
    skinned.scale.copy(mesh.scale);
    skinned.frustumCulled = false;
    const parent = mesh.parent;
    parent.add(skinned);
    parent.remove(mesh);
    skinned.updateMatrixWorld(true);
    skinned.bind(marioSkeleton);      // bindMatrix = matrixWorld actual → reposo = malla original
    skinnedCount++;
  });

  isRigged = true;
  const status = document.getElementById('rigStatus');
  if (status) {
    const empty = MARIO_PARTS.filter(function (p, i) { return counts[i] === 0; }).map(function (p) { return p.name; });
    status.textContent = '✓ Riggeado (' + skinnedCount + ' mesh). ' +
      (empty.length ? 'Sin vértices en: ' + empty.join(', ') + '. Ajusta el rig con «Hueso». ' : '') +
      'Para recolocar el modelo, muévelo y pulsa Riggear otra vez.';
    status.style.color = empty.length ? '#fc6' : '#5f5';
  }
  console.log('[rig] vértices por pieza:', MARIO_PARTS.map(function (p, i) { return p.name + '=' + counts[i]; }).join(' '));
}

// ---------- líneas del rig (reemplaza SkeletonHelper) ----------
// SkeletonHelper hereda la matriz del mundo y se dobla al estar dentro
// del grupo escalado; estas líneas se calculan en espacio local del grupo.

let rigLines = null;
function createRigLines(group) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MARIO_PARTS.length * 6), 3));
  const mat = new THREE.LineBasicMaterial({ color: 0x00ffaa, depthTest: false, transparent: true });
  rigLines = new THREE.LineSegments(geo, mat);
  rigLines.frustumCulled = false;
  rigLines.renderOrder = 999;
  group.add(rigLines);
  return rigLines;
}

const _lp = new THREE.Vector3();
function updateRigLines() {
  if (!rigLines || !skeletonHelper || !skeletonHelper.visible) return;
  skeletonHelper.updateMatrixWorld(true);
  const arr = rigLines.geometry.attributes.position.array;
  let k = 0;
  marioBones.forEach(function (b) {
    const par = b.parent && b.parent.isBone ? b.parent : null;
    if (!par) { arr[k++] = 0; arr[k++] = 0; arr[k++] = 0; arr[k++] = 0; arr[k++] = 0; arr[k++] = 0; return; }
    b.getWorldPosition(_lp); skeletonHelper.worldToLocal(_lp);
    arr[k++] = _lp.x; arr[k++] = _lp.y; arr[k++] = _lp.z;
    par.getWorldPosition(_lp); skeletonHelper.worldToLocal(_lp);
    arr[k++] = _lp.x; arr[k++] = _lp.y; arr[k++] = _lp.z;
  });
  rigLines.geometry.attributes.position.needsUpdate = true;
}

// ---------- recolección de geometría para export ----------

function exportOptions() {
  const modeEl = document.getElementById('exportMode');
  const hEl = document.getElementById('exportHeight');
  const yEl = document.getElementById('exportYAdjust');
  const h = hEl ? parseFloat(hEl.value) : 160;
  const y = yEl ? parseFloat(yEl.value) : 0;
  const jEl = document.getElementById('exportJointPad');
  const j = jEl ? parseFloat(jEl.value) : 0.04;
  return {
    mode: modeEl && modeEl.value === 'static' ? 'static' : 'animated',
    height: isFinite(h) && h > 10 ? h : 160,
    yAdjust: isFinite(y) ? y : 0,
    // fracción de la altura del modelo: si el 2º hueso está cerca, se duplica el tri
    jointPad: isFinite(j) ? Math.max(0, Math.min(0.25, j)) : 0.04,
  };
}

/** Triángulos del modelo en espacio MUNDO del visor, en reposo. */
function gatherWorldTriangles() {
  const tris = [];
  const meshReport = [];
  currentModel.updateMatrixWorld(true);
  currentModel.traverse(function (child) {
    if (!child.isMesh || !child.geometry || !child.geometry.attributes.position) return;
    let geo = child.geometry;
    if (!geo.attributes.normal) { geo = geo.clone(); geo.computeVertexNormals(); }
    const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
    child.updateMatrixWorld(true);
    const skinned = !!(child.isSkinnedMesh && typeof child.boneTransform === 'function' && child.geometry.attributes.skinIndex);
    const nm = new THREE.Matrix3().getNormalMatrix(child.matrixWorld);

    const wpos = new Array(pos.count), wnor = new Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i);
      if (skinned) child.boneTransform(i, v);       // v entra en local, sale skinneado (reposo = original)
      wpos[i] = v.applyMatrix4(child.matrixWorld);
      wnor[i] = new THREE.Vector3().fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
    }
    const index = geo.index;
    const triCount = index ? Math.floor(index.count / 3) : Math.floor(pos.count / 3);
    let added = 0;
    for (let t = 0; t < triCount; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      if (i0 >= pos.count || i1 >= pos.count || i2 >= pos.count) continue;
      const a = wpos[i0], b = wpos[i1], c = wpos[i2];
      if (![a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z].every(Number.isFinite)) continue;
      const uvs = function (i) { return uv ? [uv.getX(i) * 1024, uv.getY(i) * 1024] : [0, 0]; };
      // orden a,c,b (mismo winding que el export anterior)
      tris.push({
        p: [a, c, b],
        n: [wnor[i0], wnor[i2], wnor[i1]],
        uv: [uvs(i0), uvs(i2), uvs(i1)],
        meshName: child.name || '',
        meshUuid: child.uuid,
      });
      added++;
    }
    meshReport.push({ name: child.name || child.type, tris: added, skinned: skinned });
  });
  return { tris: tris, meshReport: meshReport };
}

const _clamp16 = function (n) { return Math.max(-32000, Math.min(32000, Math.round(n))); };
const _clamp8 = function (n) { return Math.max(-128, Math.min(127, Math.round(n * 127))); };


/** Si el modelo YA viene partido (toro_head, toro_larm…), asignar por nombre. */
function guessBoneFromMeshName(name) {
  const n = (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  if (!n) return null;
  if (/(^|_)(head|face|cara|cap|hair|pelo|ears?|oreja|eyes?|ojos?|nose|nariz|mouth|boca|cheeks?|mejilla|whiskers?|bigotes?|brows?|ceja|snout|hocico|hat|gorro)(_|$)/.test(n)) return 'Head';
  if (/(^|_)(tail|cola)(_|$)/.test(n)) return 'Butt';
  if (/(l|left|izq).*(fore|forearm|lower)|forearm.*(l|left|izq)|lfore/.test(n)) return 'L_Forearm';
  if (/(r|right|der).*(fore|forearm|lower)|forearm.*(r|right|der)|rfore/.test(n)) return 'R_Forearm';
  if (/(l|left|izq).*(hand|mano|wrist)|hand.*(l|left|izq)|lhand/.test(n)) return 'L_Hand';
  if (/(r|right|der).*(hand|mano|wrist)|hand.*(r|right|der)|rhand/.test(n)) return 'R_Hand';
  if (/(l|left|izq).*(arm|brazo|shoulder|upper)|(^|_)larm(_|$)|arm.*(l|left|izq)/.test(n)) return 'L_Arm';
  if (/(r|right|der).*(arm|brazo|shoulder|upper)|(^|_)rarm(_|$)|arm.*(r|right|der)/.test(n)) return 'R_Arm';
  if (/(l|left|izq).*(leg|shin|calf|lower)|lleg|leg.*(l|left|izq)/.test(n) && !/arm/.test(n)) return 'L_Leg';
  if (/(r|right|der).*(leg|shin|calf|lower)|rleg|leg.*(r|right|der)/.test(n) && !/arm/.test(n)) return 'R_Leg';
  if (/(l|left|izq).*(thigh|hip|upper)|lthigh|thigh.*(l|left)/.test(n)) return 'L_Thigh';
  if (/(r|right|der).*(thigh|hip|upper)|rthigh|thigh.*(r|right)/.test(n)) return 'R_Thigh';
  if (/(l|left|izq).*(foot|feet|shoe|boot|pie)|lfoot|foot.*(l|left)/.test(n)) return 'L_Foot';
  if (/(r|right|der).*(foot|feet|shoe|boot|pie)|rfoot|foot.*(r|right)/.test(n)) return 'R_Foot';
  if (/(body|torso|chest|cuerpo|spine|pelvis|hip|belly)/.test(n)) return 'Torso';
  if (/(root|butt|hips|base)/.test(n)) return 'Butt';
  return null;
}

function detectMeshPartMap(model) {
  const map = {};
  let hits = 0, total = 0;
  if (!model) return { map: map, hits: 0, total: 0, usable: false };
  let modelCx = null, modelSpanX = 1;
  try {
    model.updateMatrixWorld(true);
    const mb = new THREE.Box3().setFromObject(model);
    modelCx = (mb.min.x + mb.max.x) / 2;
    modelSpanX = Math.max(1e-6, mb.max.x - mb.min.x);
  } catch (e) { modelCx = null; }
  model.traverse(function (c) {
    if (!c.isMesh && !c.isSkinnedMesh) return;
    if (!c.geometry) return;
    total++;
    let bone = guessBoneFromMeshName(c.name);
    if (bone) {
      // Si el nombre dice izquierda pero la pieza esta del lado contrario, invertir el lado
      // (el hueso L_* vive en +X; depende de hacia donde mire el modelo).
      if (/^[LR]_/.test(bone) && modelCx !== null) {
        const cx = new THREE.Box3().setFromObject(c).getCenter(new THREE.Vector3()).x;
        const dead = modelSpanX * 0.03;
        if (bone[0] === 'L' && cx < modelCx - dead) { bone = 'R_' + bone.slice(2); console.log('[parts] lado invertido:', c.name); }
        else if (bone[0] === 'R' && cx > modelCx + dead) { bone = 'L_' + bone.slice(2); console.log('[parts] lado invertido:', c.name); }
      }
      map[c.uuid] = bone;
      hits++;
      console.log('[parts]', c.name, '→', bone);
    } else {
      console.log('[parts]', c.name, '→ ? (sin match)');
    }
  });
  return { map: map, hits: hits, total: total, usable: hits >= 2 && hits >= total * 0.4 };
}

function collectVertsByBone() {
  const opts = exportOptions();
  const buckets = {};
  MARIO_PARTS.forEach(function (p) { buckets[p.name] = []; });
  if (!currentModel) { console.warn('[export] no currentModel'); return buckets; }

  if (opts.mode === 'animated' && !isRigged) autoRigModel();   // el modo animado necesita el rig ajustado

  const result = withRestPose(function () {
    const g = gatherWorldTriangles();
    if (!g.tris.length) return { empty: true, meshReport: g.meshReport };

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    g.tris.forEach(function (t) {
      t.p.forEach(function (v) {
        if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
        if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
        if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
      });
    });
    const sizeY = Math.max(1e-4, maxY - minY);
    const scale = opts.height / sizeY;
    const out = { meshReport: g.meshReport, scale: scale, sizeY: sizeY };

    if (opts.mode === 'static') {
      // todo el modelo en la pieza Butt, ejes del visor (frente = +Z, arriba = +Y)
      const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, FOOT_LIFT = 8;
      const list = buckets.Butt;
      g.tris.forEach(function (t) {
        for (let k = 0; k < 3; k++) {
          const v = t.p[k], n = t.n[k];
          list.push({
            x: _clamp16((v.x - cx) * scale), y: _clamp16((v.y - minY) * scale + FOOT_LIFT), z: _clamp16((v.z - cz) * scale),
            nx: _clamp8(n.x), ny: _clamp8(n.y), nz: _clamp8(n.z),
            u: _clamp16(t.uv[k][0]), v: _clamp16(t.uv[k][1]),
            r: 220, g: 220, b: 220, a: 255,
          });
        }
      });
      out.offsets = null;
      return out;
    }

    // ---- animado: vértices al espacio local de su hueso ----
    const P = rigRestPositions();
    const frames = rigFrames(P);
    const segs = rigSegments(P, frames);
    const gscale = scale * ANIM_UNIT_MUL;          // mundo → unidades de geo
    const inv = {};
    MARIO_PARTS.forEach(function (p) { inv[p.name] = frames[p.name].basis.clone().invert(); });

    const cen = new THREE.Vector3(), tmp = new THREE.Vector3();
    const partTris = {};
    MARIO_PARTS.forEach(function (p) { partTris[p.name] = 0; });

    // ---- Solape FUERTE en juntas ----
    // 1) Esferas en cada articulación (origen del hueso hijo = junta con el padre)
    // 2) Cualquier tri dentro del radio se copia al padre Y al hijo
    // 3) Además, si los 2 segmentos más cercanos están "empatados", también se duplica
    let modelSpan = 1;
    try {
      const bb = new THREE.Box3().setFromObject(currentModel);
      const sz = new THREE.Vector3(); bb.getSize(sz);
      modelSpan = Math.max(sz.x, sz.y, sz.z, 0.01);
    } catch (e) {}
    const pad = (opts.jointPad != null ? opts.jointPad : 0.08);
    // radio de junta más generoso (antes era solo diferencia de dist. entre segs)
    const jointR = modelSpan * Math.max(0.03, pad);
    const jointR2 = jointR * jointR;

    // lista de juntas: { pos, parentIdx, childIdx }
    const joints = [];
    const nameToIdx = {};
    MARIO_PARTS.forEach(function (p, i) { nameToIdx[p.name] = i; });
    MARIO_PARTS.forEach(function (part) {
      if (!part.parent) return;
      const pos = frames[part.name] && frames[part.name].origin;
      if (!pos) return;
      joints.push({
        pos: pos.clone(),
        parentIdx: nameToIdx[part.parent],
        childIdx: nameToIdx[part.name],
      });
    });

    let dupCount = 0;
    let jointHits = 0;

    function pushTriToBone(t, boneIdx) {
      if (boneIdx == null || boneIdx < 0) return;
      const name = MARIO_PARTS[boneIdx].name;
      const fr = frames[name], M = inv[name];
      if (!fr || !M) return;
      partTris[name]++;
      for (let k = 0; k < 3; k++) {
        tmp.copy(t.p[k]).sub(fr.origin).applyMatrix4(M).multiplyScalar(gscale);
        const nn = t.n[k].clone().transformDirection(M);
        buckets[name].push({
          x: _clamp16(tmp.x), y: _clamp16(tmp.y), z: _clamp16(tmp.z),
          nx: _clamp8(nn.x), ny: _clamp8(nn.y), nz: _clamp8(nn.z),
          u: _clamp16(t.uv[k][0]), v: _clamp16(t.uv[k][1]),
          r: 220, g: 220, b: 220, a: 255,
        });
      }
    }

    // --- Asignación por NOMBRE DE MESH (si el modelo viene partido) ---
    const partDetect = detectMeshPartMap(currentModel);
    const useMeshParts = partDetect.usable;
    console.log('[export] mesh parts:', partDetect.hits + '/' + partDetect.total,
      useMeshParts ? '→ USANDO NOMBRES' : '→ fallback distancia');

    let byNameCount = 0, byDistCount = 0;

    g.tris.forEach(function (t) {
      cen.set(0, 0, 0).add(t.p[0]).add(t.p[1]).add(t.p[2]).multiplyScalar(1 / 3);

      let primary = null;
      // 1) nombre del mesh
      if (useMeshParts && t.meshUuid && partDetect.map[t.meshUuid]) {
        primary = nameToIdx[partDetect.map[t.meshUuid]];
        byNameCount++;
      } else if (t.meshName) {
        const gname = guessBoneFromMeshName(t.meshName);
        if (gname && nameToIdx[gname] != null) {
          primary = nameToIdx[gname];
          byNameCount++;
        }
      }
      // 2) fallback: segmento más cercano
      const two = nearestTwoSegments(cen, segs);
      if (primary == null) {
        primary = two[0].i;
        byDistCount++;
      }

      pushTriToBone(t, primary);

      const extra = {};
      extra[primary] = true;

      // Con piezas por nombre: NO solapar (duplicar a forearm/hand rompía brazos/cuerpo).
      // Solo solape si el usuario sube el slider Y no hay mapa de partes, o fuerza > 0.15
      const doJoint = (!useMeshParts && pad > 0.001) || (useMeshParts && pad >= 0.15);
      if (doJoint) {
        for (let j = 0; j < joints.length; j++) {
          const jt = joints[j];
          if (cen.distanceToSquared(jt.pos) <= jointR2) {
            if (!extra[jt.parentIdx]) { pushTriToBone(t, jt.parentIdx); extra[jt.parentIdx] = true; dupCount++; }
            if (!extra[jt.childIdx]) { pushTriToBone(t, jt.childIdx); extra[jt.childIdx] = true; dupCount++; }
            jointHits++;
          }
        }
        if (!useMeshParts && two[1] && !extra[two[1].i] && two[1].d <= two[0].d + jointR) {
          pushTriToBone(t, two[1].i);
          dupCount++;
        }
      }
    });
    console.log('[export] assign byName', byNameCount, 'byDist', byDistCount,
      'joint dups', dupCount, 'hits', jointHits);

    // offsets de cada pieza respecto a su padre, en el frame del padre
    const offsets = {};
    MARIO_PARTS.forEach(function (part) {
      if (!part.parent) { offsets[part.name] = [0, _clamp16(opts.yAdjust * ANIM_UNIT_MUL), 0]; return; }
      const d = frames[part.name].origin.clone().sub(frames[part.parent].origin)
        .applyMatrix4(inv[part.parent]).multiplyScalar(gscale);
      offsets[part.name] = [_clamp16(d.x), _clamp16(d.y), _clamp16(d.z)];
    });
    out.offsets = offsets;
    out.partTris = partTris;
    return out;
  });

  if (result.empty) {
    window._lastExportReport = { meshes: result.meshReport, totalTris: 0, mode: opts.mode };
    console.warn('[export] sin triángulos');
    return buckets;
  }

  let total = 0;
  Object.keys(buckets).forEach(function (k) { total += buckets[k].length; });
  window._lastExportReport = {
    meshes: result.meshReport, totalTris: total / 3, mode: opts.mode,
    scale: result.scale, sizeY: result.sizeY, offsets: result.offsets, partTris: result.partTris,
    geoScale: result.offsets ? ANIM_GEO_SCALE : 65536,
    height: opts.height, yAdjust: opts.yAdjust,
  };
  console.log('[export]', opts.mode, 'tris', total / 3, 'scale', result.scale.toFixed(2),
    result.partTris ? JSON.stringify(result.partTris) : '');
  return buckets;
}

// ---------- geo ----------

function buildGeoIncC(folderName) {
  const rep = window._lastExportReport || {};
  const animated = rep.mode === 'animated' && rep.offsets;
  let s = '';
  s += '/* geo.inc.c - ' + folderName + (animated ? ' (ANIMADO, jerarquía Mario)' : ' (estático + shadow)') + ' */\n\n';
  s += 'const GeoLayout ' + folderName + '_geo[] = {\n';
  s += '    GEO_SHADOW(SHADOW_CIRCLE_4_VERTS, 0xB4, 100),\n';
  s += '    GEO_OPEN_NODE(),\n';
  s += '        GEO_SCALE(0x00, ' + (animated ? ANIM_GEO_SCALE : 65536) + '),\n';
  s += '        GEO_OPEN_NODE(),\n';
  if (!animated) {
    s += '            GEO_DISPLAY_LIST(LAYER_OPAQUE, body_dl),\n';
  } else {
    // El geo real de Mario tiene 20 GEO_ANIMATED_PART (verificado leyendo mario_geo.bin):
    //   1 raiz vacia (recibe la traslacion de la animacion) + 15 piezas + 4 pivotes vacios
    //   (hombro L/R y cadera L/R). Las animaciones guardan UNA rotacion por nodo, en orden de
    //   recorrido: con 15 nodos cada rotacion caia en la pieza equivocada.
    const PIVOT = { L_Arm: 1, R_Arm: 1, L_Thigh: 1, R_Thigh: 1 };
    const part = function (pad, o, dl) {
      return pad + 'GEO_ANIMATED_PART(LAYER_OPAQUE, ' + o[0] + ', ' + o[1] + ', ' + o[2] + ', ' + dl + '),\n';
    };
    const emitKids = function (name, pad, ind) {
      const kids = MARIO_CHILDREN[name] || [];
      if (kids.length) {
        s += pad + 'GEO_OPEN_NODE(),\n';
        kids.forEach(function (k) { emit(k, ind + 1); });
        s += pad + 'GEO_CLOSE_NODE(),\n';
      }
    };
    const emit = function (name, ind) {
      const pad = new Array(ind + 1).join('    ');
      const o = rep.offsets[name];
      const dl = MARIO_PART_BY_NAME[name].dl;
      if (PIVOT[name]) {
        s += part(pad, o, 'NULL');                       // pivote vacio en el offset
        s += pad + 'GEO_OPEN_NODE(),\n';
        s += part(pad + '    ', [0, 0, 0], dl);          // pieza real en (0,0,0)
        emitKids(name, pad + '    ', ind + 1);
        s += pad + 'GEO_CLOSE_NODE(),\n';
      } else {
        s += part(pad, o, dl);
        emitKids(name, pad, ind);
      }
    };
    s += part('            ', [0, 0, 0], 'NULL');         // raiz vacia
    s += '            GEO_OPEN_NODE(),\n';
    emit('Butt', 4);
    s += '            GEO_CLOSE_NODE(),\n';
  }
  s += '        GEO_CLOSE_NODE(),\n';
  s += '    GEO_CLOSE_NODE(),\n';
  s += '    GEO_END(),\n';
  s += '};\n';
  return s;
}


// ---------- auto-ajuste del rig al modelo ----------
// Calcula las articulaciones a partir de la geometria (modelo en T-pose, de frente a +Z,
// izquierda del personaje = +X). Es una heuristica: sirve para dejar el rig CERCA de las
// articulaciones reales; despues se afina con el gizmo.
function computeFitRig(pts) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
  }
  const H = Math.max(1e-6, maxY - minY);
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const halfSpan = Math.max(1e-6, (maxX - minX) / 2);
  const notes = [];

  // brazos: los vertices mas alejados del centro en X (puntas de las manos)
  let sy = 0, n = 0, aMin = Infinity, aMax = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    if (Math.abs(pts[i].x - cx) > 0.82 * halfSpan) {
      sy += pts[i].y; n++;
      if (pts[i].y < aMin) aMin = pts[i].y; if (pts[i].y > aMax) aMax = pts[i].y;
    }
  }
  let armY = minY + 0.45 * H;
  if (n >= 3 && (aMax - aMin) < 0.22 * H) armY = sy / n;
  else notes.push('No detecte brazos en T-pose; use una altura de hombros por defecto.');

  // torso: ancho justo debajo de los brazos (sin brazos ni cabeza)
  let w = 0, cnt = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.y < armY - 0.06 * H && p.y > armY - 0.20 * H && Math.abs(p.x - cx) < 0.5 * halfSpan) {
      w = Math.max(w, Math.abs(p.x - cx)); cnt++;
    }
  }
  if (cnt < 3 || w < 0.01 * H) w = 0.10 * halfSpan;
  const shoulderX = Math.max(0.02 * H, 0.75 * w);

  // pies: parte baja del modelo, izquierda (+X) y derecha (-X)
  let lx = 0, ln = 0, rx = 0, rn = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.y < minY + 0.12 * H) {
      if (p.x > cx) { lx += p.x; ln++; } else { rx += p.x; rn++; }
    }
  }
  const legL = ln ? lx / ln - cx : 0.4 * w;
  const legR = rn ? cx - rx / rn : 0.4 * w;
  const legX = Math.max(0.01 * H, (legL + legR) / 2);

  const ankleY = minY + 0.05 * H;
  const hipY = minY + 0.40 * (armY - minY);
  const kneeY = hipY + (ankleY - hipY) * 0.57;
  const headY = armY + 0.06 * H;
  const buttY = hipY + 0.06 * (headY - hipY);
  const torsoY = buttY + 0.44 * (headY - buttY);

  const V = function (x, y) { return new THREE.Vector3(x, y, cz); };
  const tipX = halfSpan;
  const along = function (t) { return shoulderX + (tipX - shoulderX) * t; };
  const P = {
    Butt: V(cx, buttY), Torso: V(cx, torsoY), Head: V(cx, headY),
    L_Arm: V(cx + shoulderX, armY), L_Forearm: V(cx + along(0.42), armY), L_Hand: V(cx + along(0.81), armY),
    R_Arm: V(cx - shoulderX, armY), R_Forearm: V(cx - along(0.42), armY), R_Hand: V(cx - along(0.81), armY),
    L_Thigh: V(cx + legX, hipY), L_Leg: V(cx + legX, kneeY), L_Foot: V(cx + legX, ankleY),
    R_Thigh: V(cx - legX, hipY), R_Leg: V(cx - legX, kneeY), R_Foot: V(cx - legX, ankleY),
  };
  return { P: P, topY: maxY, notes: notes, info: { H: H, armY: armY, hipY: hipY, headY: headY, shoulderX: shoulderX, legX: legX } };
}

function resetRigBonesToDefault() {
  marioBones.forEach(function (b) {
    const part = MARIO_PART_BY_NAME[b.name];
    if (part) b.position.set(part.display[0], part.display[1], part.display[2]);
    b.quaternion.identity();
  });
  skeletonHelper.scale.set(1, 1, 1);
  skeletonHelper.position.set(0, 0, 0);
  skeletonHelper.updateMatrixWorld(true);
}

function fitRigToModel() {
  if (!currentModel) { alert('Primero sube un modelo'); return; }
  if (!marioSkeleton || marioBones.length === 0) { alert('Rig de Mario no listo'); return; }
  unskinModel();

  // pies al suelo y centrado XZ (igual que Riggear)
  currentModel.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(currentModel);
  const c2 = b2.getCenter(new THREE.Vector3());
  currentModel.position.x -= c2.x; currentModel.position.z -= c2.z; currentModel.position.y -= b2.min.y;
  currentModel.userData.baseY = currentModel.position.y;
  currentModel.updateMatrixWorld(true);

  // vertices en espacio mundo
  const pts = [];
  const tmp = new THREE.Vector3();
  currentModel.traverse(function (c) {
    if (!c.isMesh || !c.geometry || !c.geometry.attributes.position) return;
    const pos = c.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pts.push(tmp.fromBufferAttribute(pos, i).applyMatrix4(c.matrixWorld).clone());
  });
  if (pts.length < 10) { alert('El modelo no tiene suficientes vertices'); return; }

  const fit = computeFitRig(pts);

  // colocar los huesos (padres primero): posicion local = inversa del mundo del padre
  resetRigBonesToDefault();
  MARIO_PARTS.forEach(function (part) {
    const b = marioBones.find(function (x) { return x.name === part.name; });
    if (!b) return;
    skeletonHelper.updateMatrixWorld(true);
    const target = fit.P[part.name].clone();
    if (b.parent) b.position.copy(b.parent.worldToLocal(target)); else b.position.copy(target);
  });
  skeletonHelper.updateMatrixWorld(true);

  window.__rigFitUUID = currentModel.uuid;
  window.__rigTopY = fit.topY;
  skeletonHelper.visible = true; showSkeleton = true;
  const btnSk = document.getElementById('btnToggleSkeleton');
  if (btnSk) btnSk.textContent = 'Ocultar rig Mario';

  autoRigModel();   // riggear ya con el rig ajustado

  const status = document.getElementById('rigStatus');
  if (status) {
    status.textContent = '✓ Rig auto-ajustado al modelo (hombros a ' + Math.round(100 * (fit.info.armY / fit.info.H)) +
      '% de la altura). Revisa con «Colorear por hueso» y afina con el gizmo (Hueso). ' +
      (fit.notes.length ? fit.notes.join(' ') : '') + ' Si tocas el rig, pulsa «Riggear al Mario» (ya no lo reinicia).';
    status.style.color = fit.notes.length ? '#fc6' : '#5f5';
  }
  console.log('[rig] auto-ajuste', fit.info);
}

(function bindFitRig() {
  const b = document.getElementById('btnFitRig');
  if (b) b.addEventListener('click', function () {
    if (typeof playSfx === 'function' && typeof sfxClick !== 'undefined') playSfx(sfxClick);
    fitRigToModel();
  });
})();

// ---------- botones ----------
(function bindArmReach() {
  const el = document.getElementById('armReach'), lb = document.getElementById('armReachVal');
  if (!el) return;
  const upd = function () { if (lb) lb.textContent = parseFloat(el.value).toFixed(2); };
  el.addEventListener('input', upd); upd();
})();

(function bindRigButtons() {
  const b = document.getElementById('btnBoneColors');
  if (b) b.addEventListener('click', function () {
    if (typeof playSfx === 'function') playSfx(sfxClick);
    if (!isRigged) { alert('Primero pulsa «Riggear al Mario»'); return; }
    setRigDebugColors(!rigDebugColors);
  });
})();
