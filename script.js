// ===== SM64 Coop DX Character Mod Generator - Fase 2 (3D) =====

const bgMusic = document.getElementById('bgMusic');
const sfxClick = document.getElementById('sfxClick');
const sfxHover = document.getElementById('sfxHover');
const sfxSuccess = document.getElementById('sfxSuccess');

let musicOn = true;

document.addEventListener('click', () => {
  if (musicOn && bgMusic.paused) {
    const mv = document.getElementById('musicVolume');
    bgMusic.volume = mv ? parseInt(mv.value, 10) / 100 : 0.4;
    bgMusic.play().catch(() => {});
  }
}, { once: true });

document.getElementById('btnMusic').addEventListener('click', () => {
  playSfx(sfxClick);
  musicOn = !musicOn;
  if (musicOn) {
    bgMusic.play().catch(() => {});
    document.getElementById('btnMusic').textContent = 'Música: ON';
  } else {
    bgMusic.pause();
    document.getElementById('btnMusic').textContent = 'Música: OFF';
  }
});

function playSfx(audio) {
  if (!audio) return;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

document.querySelectorAll('button').forEach(btn => {
  btn.addEventListener('mouseenter', () => playSfx(sfxHover));
});

function setupPreview(inputId, previewId) {
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  input.addEventListener('change', () => {
    preview.innerHTML = '';
    const file = input.files[0];
    if (!file) return;
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    preview.appendChild(img);
  });
}
setupPreview('lifeIcon', 'lifePreview');
setupPreview('menuIcon', 'menuPreview');

// ==================== THREE.JS ====================

let scene, camera, renderer, controls;
let transformControls = null;
let gizmoTarget = 'model'; // model | rig | bone
let currentModel = null;
let skeletonHelper = null;
let marioBones = [];
let marioSkeleton = null;
let marioRoot = null;
let isRigged = false;
let originalModelBackup = null;
let showSkeleton = false;
let zipFiles = {};          // nombre -> Blob/File
let zipTextures = [];       // {name, url, blob}
let appliedTexture = null;

const canvas = document.getElementById('threeCanvas');
const placeholder = document.getElementById('viewerPlaceholder');
const viewerContainer = document.getElementById('viewer3d');


// ===== Gizmo / TransformControls helpers =====
function fillBoneSelect() {
  const sel = document.getElementById('boneSelect');
  if (!sel || !marioBones) return;
  sel.innerHTML = '';
  marioBones.forEach((b) => {
    const opt = document.createElement('option');
    opt.value = b.name;
    opt.textContent = b.name;
    sel.appendChild(opt);
  });
}

function syncSlidersFromModel() {
  // reserved: keep orbit in sync if needed
}

function attachGizmoTo(obj) {
  if (!transformControls || !obj) return;
  transformControls.attach(obj);
  transformControls.visible = true;
}

function detachGizmo() {
  if (!transformControls) return;
  transformControls.detach();
  transformControls.visible = false;
}

function applyGizmoTarget() {
  if (gizmoTarget === 'model') {
    const wrap = document.getElementById('boneSelectWrap');
    if (wrap) wrap.style.display = 'none';
    if (currentModel) attachGizmoTo(currentModel);
    else detachGizmo();
  } else if (gizmoTarget === 'rig') {
    const wrap = document.getElementById('boneSelectWrap');
    if (wrap) wrap.style.display = 'none';
    if (skeletonHelper) {
      skeletonHelper.visible = true;
      showSkeleton = true;
      const btn = document.getElementById('btnToggleSkeleton');
      if (btn) btn.textContent = 'Ocultar rig Mario';
      attachGizmoTo(skeletonHelper);
    } else detachGizmo();
  } else if (gizmoTarget === 'bone') {
    const wrap = document.getElementById('boneSelectWrap');
    if (wrap) wrap.style.display = 'block';
    if (skeletonHelper) {
      skeletonHelper.visible = true;
      showSkeleton = true;
    }
    const sel = document.getElementById('boneSelect');
    const name = sel ? sel.value : '';
    const bone = marioBones && marioBones.find((b) => b.name === name);
    if (bone) attachGizmoTo(bone);
    else detachGizmo();
  }
}

function setGizmoMode(mode) {
  if (!transformControls) return;
  transformControls.setMode(mode);
  const t = document.getElementById('gizmoModeTranslate');
  const r = document.getElementById('gizmoModeRotate');
  const s = document.getElementById('gizmoModeScale');
  if (t) t.classList.toggle('active-mode', mode === 'translate');
  if (r) r.classList.toggle('active-mode', mode === 'rotate');
  if (s) s.classList.toggle('active-mode', mode === 'scale');
}

function setupGizmoUI() {
  const setTarget = (t, btnId) => {
    gizmoTarget = t;
    ['gizmoTargetModel', 'gizmoTargetRig', 'gizmoTargetBone'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('active', id === btnId);
    });
    applyGizmoTarget();
  };

  document.getElementById('gizmoTargetModel')?.addEventListener('click', () => {
    playSfx(sfxClick);
    setTarget('model', 'gizmoTargetModel');
  });
  document.getElementById('gizmoTargetRig')?.addEventListener('click', () => {
    playSfx(sfxClick);
    setTarget('rig', 'gizmoTargetRig');
  });
  document.getElementById('gizmoTargetBone')?.addEventListener('click', () => {
    playSfx(sfxClick);
    setTarget('bone', 'gizmoTargetBone');
  });
  document.getElementById('gizmoModeTranslate')?.addEventListener('click', () => {
    playSfx(sfxClick);
    setGizmoMode('translate');
  });
  document.getElementById('gizmoModeRotate')?.addEventListener('click', () => {
    playSfx(sfxClick);
    setGizmoMode('rotate');
  });
  document.getElementById('gizmoModeScale')?.addEventListener('click', () => {
    playSfx(sfxClick);
    setGizmoMode('scale');
  });
  document.getElementById('gizmoDetach')?.addEventListener('click', () => {
    playSfx(sfxClick);
    detachGizmo();
  });
  document.getElementById('boneSelect')?.addEventListener('change', () => {
    if (gizmoTarget === 'bone') applyGizmoTarget();
  });
}

function initThree() {
  const width = viewerContainer.clientWidth;
  const height = viewerContainer.clientHeight;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1117);

  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(0, 1.2, 3.5);

  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
  dirLight.position.set(3, 5, 4);
  scene.add(dirLight);

  const dirLight2 = new THREE.DirectionalLight(0xa0c4ff, 0.4);
  dirLight2.position.set(-3, 2, -2);
  scene.add(dirLight2);

  const grid = new THREE.GridHelper(4, 20, 0x4a90d9, 0x1a1a2e);
  scene.add(grid);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.8, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1;
  controls.maxDistance = 12;

  transformControls = new THREE.TransformControls(camera, renderer.domElement);
  transformControls.setSize(0.85);
  transformControls.addEventListener('dragging-changed', function (event) {
    controls.enabled = !event.value;
  });
  transformControls.addEventListener('change', function () {
    syncSlidersFromModel();
  });
  scene.add(transformControls);

  createMarioGuide();
  setupGizmoUI();
  fillBoneSelect();
  window.addEventListener('resize', onResize);
  animate();
}

// ============================================================
// Tabla oficial de piezas Mario (geo SM64 / Character Select)
// sm64Local: offset respecto al padre en espacio local del hueso
//   (+X a lo largo del miembro, según medición de bambi_geo.bin)
// display: posición en el preview Three.js (Y-up, de pie)
// dl: nombre base de display list que pide el geo oficial
// ============================================================
const SM64_UNIT = 1 / 120; // ~160u de altura Mario → ~1.33 unidades Three

const MARIO_PARTS = [
  // name, parent, sm64Local[x,y,z], display[x,y,z], dl, aliases
  { name: 'Butt',       parent: null,    sm64: [0, 0, 0],      display: [0, 0, 0],           dl: 'mario_butt',              aliases: ['Root'] },
  { name: 'Torso',      parent: 'Butt',  sm64: [68, 0, 0],     display: [0, 68 * SM64_UNIT, 0], dl: 'mario_torso',           aliases: [] },
  { name: 'Head',       parent: 'Torso', sm64: [87, 0, 0],     display: [0, 87 * SM64_UNIT, 0], dl: 'mario_cap_on_eyes_front', aliases: [] },

  // Brazo izquierdo (Z+ en SM64 = lado izquierdo del personaje)
  { name: 'L_Arm',      parent: 'Torso', sm64: [67, -10, 79],  display: [0.22, 0.12, 0], dl: 'mario_left_arm',          aliases: ['L_Shoulder'] },
  { name: 'L_Forearm',  parent: 'L_Arm', sm64: [65, 0, 0],     display: [0.20, -0.06, 0],   dl: 'mario_left_forearm_shared_dl', aliases: [] },
  { name: 'L_Hand',     parent: 'L_Forearm', sm64: [60, 0, 0], display: [0.18, -0.04, 0],   dl: 'mario_left_hand_closed',  aliases: [] },

  // Brazo derecho
  { name: 'R_Arm',      parent: 'Torso', sm64: [68, -10, -79], display: [-0.22, 0.12, 0], dl: 'mario_right_arm',         aliases: ['R_Shoulder'] },
  { name: 'R_Forearm',  parent: 'R_Arm', sm64: [65, 0, 0],     display: [-0.20, -0.06, 0],    dl: 'mario_right_forearm_shared_dl', aliases: [] },
  { name: 'R_Hand',     parent: 'R_Forearm', sm64: [60, 0, 0], display: [-0.18, -0.04, 0],    dl: 'mario_right_hand_closed', aliases: [] },

  // Pierna izquierda
  { name: 'L_Thigh',    parent: 'Butt',  sm64: [13, -8, 42],   display: [0.12, -0.02, 0], dl: 'mario_left_thigh',        aliases: ['L_Hip'] },
  { name: 'L_Leg',      parent: 'L_Thigh', sm64: [89, 0, 0],   display: [0, -0.30, 0],        dl: 'mario_left_leg_shared_dl', aliases: [] },
  { name: 'L_Foot',     parent: 'L_Leg', sm64: [67, 0, 0],     display: [0, -0.28, 0.04],     dl: 'mario_left_foot',         aliases: [] },

  // Pierna derecha
  { name: 'R_Thigh',    parent: 'Butt',  sm64: [13, -8, -42],  display: [-0.12, -0.02, 0], dl: 'mario_right_thigh',       aliases: ['R_Hip'] },
  { name: 'R_Leg',      parent: 'R_Thigh', sm64: [89, 0, 0],   display: [0, -0.30, 0],        dl: 'mario_right_leg_shared_dl', aliases: [] },
  { name: 'R_Foot',     parent: 'R_Leg', sm64: [67, 0, 0],     display: [0, -0.28, 0.04],     dl: 'mario_right_foot',        aliases: [] },
];

// Lookup rápido
const MARIO_PART_BY_NAME = {};
MARIO_PARTS.forEach((p) => {
  MARIO_PART_BY_NAME[p.name] = p;
  (p.aliases || []).forEach((a) => { MARIO_PART_BY_NAME[a] = p; });
});

function createMarioGuide() {
  const bones = [];
  const byName = {};

  function makeBone(part) {
    const b = new THREE.Bone();
    b.name = part.name;
    b.position.set(part.display[0], part.display[1], part.display[2]);
    // Datos oficiales para el exportador futuro (sin Blender)
    b.userData.sm64Local = part.sm64.slice();
    b.userData.dl = part.dl;
    b.userData.partName = part.name;
    bones.push(b);
    byName[part.name] = b;
    return b;
  }

  // Crear todos los huesos
  MARIO_PARTS.forEach((part) => makeBone(part));

  // Jerarquía
  MARIO_PARTS.forEach((part) => {
    const b = byName[part.name];
    if (part.parent && byName[part.parent]) {
      byName[part.parent].add(b);
    }
  });

  const root = byName['Butt'];

  // Dummy mesh para SkeletonHelper
  const dummyGeo = new THREE.BoxGeometry(0.01, 0.01, 0.01);
  const dummyMat = new THREE.MeshBasicMaterial({ visible: false });
  const dummy = new THREE.SkinnedMesh(dummyGeo, dummyMat);

  const skeleton = new THREE.Skeleton(bones);
  dummy.add(root);
  dummy.bind(skeleton);

  const group = new THREE.Group();
  group.name = 'marioRig';
  group.add(dummy);
  createRigLines(group);   // rig.js (SkeletonHelper se doblaba dentro del grupo escalado)

  // Altura visual ~ Butt→Head + piernas ≈ 1.3–1.5
  // Levantar el grupo para que los pies queden cerca de y=0
  // L_Foot está a ~ -0.02-0.30-0.28 = -0.60 desde Butt
  group.position.y = 0.60;

  const jointMat = new THREE.MeshStandardMaterial({
    color: 0x00ff88,
    emissive: 0x003322,
    transparent: true,
    opacity: 0.85,
  });
  bones.forEach((bone) => {
    const joint = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), jointMat);
    bone.add(joint);
  });

  group.visible = false;
  scene.add(group);
  skeletonHelper = group;
  marioBones = bones;
  marioSkeleton = skeleton;
  marioRoot = root;

  console.log('Mario rig OFICIAL (15 piezas). Huesos:', bones.map((b) => b.name));
  console.log('Offsets SM64 guardados en bone.userData.sm64Local / .dl');
}

function findMarioBone(nameOrAlias) {
  if (!marioBones) return null;
  const part = MARIO_PART_BY_NAME[nameOrAlias];
  const target = part ? part.name : nameOrAlias;
  return marioBones.find((b) => b.name === target) || null;
}



function getBoneWorldPositions() {
  const positions = [];
  marioBones.forEach((bone) => {
    const v = new THREE.Vector3();
    bone.getWorldPosition(v);
    positions.push(v);
  });
  return positions;
}

function testPose(boneName, axis, angleDeg) {
  if (!marioBones.length) return;
  const bone = (typeof findMarioBone === 'function')
    ? findMarioBone(boneName)
    : marioBones.find((b) => b.name === boneName);
  if (!bone) return;
  const rad = THREE.MathUtils.degToRad(angleDeg);
  if (axis === 'x') bone.rotation.x = rad;
  if (axis === 'y') bone.rotation.y = rad;
  if (axis === 'z') bone.rotation.z = rad;
  bone.updateMatrixWorld(true);
}

function resetPose() {
  marioBones.forEach((b) => {
    b.rotation.set(0, 0, 0);
    b.updateMatrixWorld(true);
  });
  ['poseArmL', 'poseArmR', 'poseLegL', 'poseHead'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = 0;
  });
  ['poseArmLNum', 'poseArmRNum', 'poseLegLNum', 'poseHeadNum'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = 0;
  });
}


function onResize() {
  if (!renderer || !camera) return;
  const width = viewerContainer.clientWidth;
  const height = viewerContainer.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function animate() {
  requestAnimationFrame(animate);
  if (controls) controls.update();
  if (typeof updateRigLines === 'function') updateRigLines();
  if (renderer && scene && camera) renderer.render(scene, camera);
}

document.getElementById('modelFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  playSfx(sfxClick);
  placeholder.classList.add('hidden');

  // reset zip UI
  document.getElementById('zipInfo').classList.add('hidden');
  /* texturesPanel visible */
  document.getElementById('textureList').innerHTML = '';
  zipFiles = {};
  zipTextures = [];
  appliedTexture = null;

  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'zip') {
    await handleZip(file);
  } else {
    const buf = await file.arrayBuffer();
    loadModelFromBuffer(buf, ext, file.name);
  }
});

async function handleZip(file) {
  try {
    const zip = await JSZip.loadAsync(file);
    const modelExts = ['fbx', 'glb', 'gltf', 'obj', 'dae'];
    const imageExts = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tga'];

    const models = [];
    zipTextures = [];
    zipFiles = {};

    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const name = path.split('/').pop();
      const e = name.split('.').pop().toLowerCase();
      const blob = await entry.async('blob');
      zipFiles[name.toLowerCase()] = { blob, name, path };

      if (modelExts.includes(e)) {
        const buf = await entry.async('arraybuffer');
        models.push({ name, path, ext: e, blob, buffer: buf, size: buf.byteLength });
      } else if (imageExts.includes(e)) {
        const url = URL.createObjectURL(blob);
        zipTextures.push({ name, path, url, blob });
      }
    }

    // Preferir formatos más fiables en el navegador
    const rank = { glb: 0, gltf: 1, fbx: 2, obj: 3, dae: 4 };
    models.sort((a, b) => (rank[a.ext] ?? 9) - (rank[b.ext] ?? 9) || b.size - a.size);

    console.log('ZIP modelos:', models.map(m => m.name + ' (' + m.ext + ', ' + m.size + ' bytes)'));
    console.log('ZIP texturas:', zipTextures.map(t => t.name));

    if (models.length === 0) {
      alert('No se encontró ningún modelo 3D en el ZIP (.fbx .glb .dae .obj)');
      placeholder.classList.remove('hidden');
      return;
    }

    // Llenar selector de modelos
    const sel = document.getElementById('zipModelSelect');
    sel.innerHTML = '';
    models.forEach((m, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = m.name + ' (' + Math.round(m.size / 1024) + ' KB)';
      sel.appendChild(opt);
    });
    document.getElementById('zipInfo').classList.remove('hidden');

    // Mostrar texturas
    if (zipTextures.length > 0) {
      const list = document.getElementById('textureList');
      list.innerHTML = '';
      zipTextures.forEach((tex, i) => {
        const div = document.createElement('div');
        div.className = 'tex-item';
        div.dataset.index = i;
        div.innerHTML = '<img src="' + tex.url + '" alt="' + tex.name + '"><span>' + tex.name + '</span>';
        div.addEventListener('click', () => applyTextureManual(i));
        list.appendChild(div);
      });
      document.getElementById('texturesPanel').classList.remove('hidden');
    }

    // Cargar el mejor modelo (no siempre el primero del zip)
    const first = models[0];
    loadModelFromBuffer(first.buffer, first.ext, first.name);

    document.getElementById('btnLoadZipModel').onclick = () => {
      playSfx(sfxClick);
      const idx = parseInt(sel.value, 10);
      const m = models[idx];
      if (m) loadModelFromBuffer(m.buffer, m.ext, m.name);
    };

  } catch (err) {
    console.error(err);
    alert('Error al leer el ZIP');
    placeholder.classList.remove('hidden');
  }
}

function loadModelFromURL(url, ext, displayName) {
  if (currentModel) {
    scene.remove(currentModel);
    currentModel = null;
  }

  // Resolver texturas del ZIP por nombre de archivo (evita blob:null/...)
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((texUrl) => {
    // CRÍTICO: no tocar data:/blob: — son texturas embebidas del GLB/GLTF
    if (!texUrl) return texUrl;
    if (texUrl.indexOf('data:') === 0) return texUrl;
    if (texUrl.indexOf('blob:') === 0) return texUrl;
    try {
      const base = decodeURIComponent(texUrl.split('/').pop().split('?')[0]).toLowerCase();
      if (typeof zipTextures !== 'undefined' && zipTextures.length) {
        const found = zipTextures.find((t) => {
          const n = (t.name || '').toLowerCase();
          return n === base || n.endsWith('/' + base) || n.split('/').pop() === base;
        });
        if (found) {
          if (found.url) return found.url;
          if (found.blob) return URL.createObjectURL(found.blob);
          if (found.dataUrl) return found.dataUrl;
        }
      }
    } catch (e) {}
    // Solo file: rotos → pixel 1x1; el resto se deja (http, rutas relativas)
    if (texUrl.indexOf('file:') === 0) {
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    }
    return texUrl;
  });

  const onSuccess = (obj) => {
    currentModel = obj;
    prepareModel(currentModel);
    scene.add(currentModel);
    fitCameraToModel(currentModel);
    if (typeof attachGizmoTo === 'function' && gizmoTarget === 'model') {
      attachGizmoTo(currentModel);
    }
    console.log('Modelo cargado:', displayName, currentModel);
    placeholder.classList.add('hidden');
  };

  const onError = (err) => {
    console.error(err);
    alert('Error al cargar: ' + displayName + '\nAbre F12 para ver detalles.\nSi es FBX/DAE problemático, conviértelo a GLB en Blender.');
    placeholder.classList.remove('hidden');
  };

  if (ext === 'glb' || ext === 'gltf') {
    new THREE.GLTFLoader(manager).load(url, (gltf) => onSuccess(gltf.scene), undefined, onError);
  } else if (ext === 'fbx') {
    new THREE.FBXLoader(manager).load(url, onSuccess, undefined, onError);
  } else if (ext === 'dae') {
    new THREE.ColladaLoader(manager).load(url, (collada) => onSuccess(collada.scene), undefined, onError);
  } else if (ext === 'obj') {
    new THREE.OBJLoader(manager).load(url, (obj) => {
      obj.traverse((child) => {
        if (child.isMesh && !child.material) {
          child.material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        }
      });
      onSuccess(obj);
    }, undefined, onError);
  } else {
    alert('Formato no soportado: ' + ext);
    placeholder.classList.remove('hidden');
  }
}


function loadModelFromBuffer(buffer, ext, displayName) {
  if (!buffer || buffer.byteLength < 16) {
    alert('Archivo vacío o corrupto: ' + displayName);
    return;
  }

  // Detectar si el "dae" no es XML o el fbx no parece fbx
  const head = new Uint8Array(buffer.slice(0, 64));
  const asText = String.fromCharCode.apply(null, head);
  if (ext === 'dae' && asText.indexOf('<') === -1) {
    console.warn('DAE no parece XML, se omite:', displayName);
    alert('Este .dae no es XML válido (¿binario o corrupto?): ' + displayName + '\\nPrueba el .fbx del mismo ZIP o exporta a GLB.');
    return;
  }
  if (ext === 'fbx' && asText.indexOf('Kaydara') === -1 && asText.indexOf('FBX') === -1) {
    // binary FBX starts with "Kaydara FBX Binary"
    // if neither, might still be binary with different header - try anyway if size > 100
    if (buffer.byteLength < 100) {
      alert('FBX inválido: ' + displayName);
      return;
    }
  }

  if (currentModel) {
    scene.remove(currentModel);
    currentModel = null;
  }

  const manager = new THREE.LoadingManager();
  manager.setURLModifier((texUrl) => {
    // CRÍTICO: no tocar data:/blob: — son texturas embebidas del GLB/GLTF
    if (!texUrl) return texUrl;
    if (texUrl.indexOf('data:') === 0) return texUrl;
    if (texUrl.indexOf('blob:') === 0) return texUrl;
    try {
      const base = decodeURIComponent(texUrl.split('/').pop().split('?')[0]).toLowerCase();
      if (typeof zipTextures !== 'undefined' && zipTextures.length) {
        const found = zipTextures.find((t) => {
          const n = (t.name || '').toLowerCase();
          return n === base || n.endsWith('/' + base) || n.split('/').pop() === base;
        });
        if (found) {
          if (found.url) return found.url;
          if (found.blob) return URL.createObjectURL(found.blob);
          if (found.dataUrl) return found.dataUrl;
        }
      }
    } catch (e) {}
    // Solo file: rotos → pixel 1x1; el resto se deja (http, rutas relativas)
    if (texUrl.indexOf('file:') === 0) {
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    }
    return texUrl;
  });

  const onSuccess = (obj) => {
    if (!obj) {
      alert('El loader no devolvió modelo: ' + displayName);
      return;
    }
    currentModel = obj;
    prepareModel(currentModel);
    scene.add(currentModel);
    fitCameraToModel(currentModel);
    if (typeof attachGizmoTo === 'function' && gizmoTarget === 'model') {
      attachGizmoTo(currentModel);
    }
    console.log('Modelo cargado:', displayName, currentModel);
    placeholder.classList.add('hidden');
    // Auto-detectar texturas embebidas (GLB/GLTF) si la opción está activa
    try {
      const autoEl = document.getElementById('chkAutoTex');
      const doAuto = !autoEl || autoEl.checked;
      if (typeof autoDetectModelTextures === 'function') {
        setTimeout(function () { autoDetectModelTextures(currentModel, doAuto); }, 100);
      }
    } catch (e) { console.warn(e); }
  };

  const onError = (err) => {
    console.error(err);
    alert('Error al cargar: ' + displayName + '\\n' + (err && err.message ? err.message : err) + '\\n\\nTip: en Blender exporta como GLB (File → Export → glTF 2.0).');
    placeholder.classList.remove('hidden');
  };

  try {
    if (ext === 'glb' || ext === 'gltf') {
      new THREE.GLTFLoader(manager).parse(
        buffer,
        '',
        (gltf) => onSuccess(gltf.scene),
        onError
      );
    } else if (ext === 'fbx') {
      const loader = new THREE.FBXLoader(manager);
      const obj = loader.parse(buffer, '');
      onSuccess(obj);
    } else if (ext === 'dae') {
      const text = new TextDecoder().decode(buffer);
      if (text.trim()[0] !== '<') {
        alert('DAE inválido (no es XML): ' + displayName);
        return;
      }
      const loader = new THREE.ColladaLoader(manager);
      const result = loader.parse(text, '');
      if (!result || !result.scene) {
        alert('No se pudo parsear DAE: ' + displayName);
        return;
      }
      onSuccess(result.scene);
    } else if (ext === 'obj') {
      const text = new TextDecoder().decode(buffer);
      const loader = new THREE.OBJLoader(manager);
      const obj = loader.parse(text);
      obj.traverse((child) => {
        if (child.isMesh && !child.material) {
          child.material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        }
      });
      onSuccess(obj);
    } else {
      alert('Formato no soportado: ' + ext);
    }
  } catch (err) {
    onError(err);
  }
}


/** Extrae texturas/colores de materiales del modelo ya cargado (GLB embebido, etc.) */
function extractTexturesFromModel(model) {
  const found = [];
  if (!model) return found;
  const seen = new Set();

  function pushTex(tex, label, matName) {
    if (!tex || !tex.image) return;
    const key = tex.uuid || (tex.image.src || '') + label;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ texture: tex, label: label || 'map', matName: matName || '', image: tex.image });
  }

  model.traverse(function (child) {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach(function (mat) {
      if (!mat) return;
      const mn = mat.name || child.name || 'mat';
      pushTex(mat.map, 'map', mn);
      pushTex(mat.emissiveMap, 'emissive', mn);
      pushTex(mat.normalMap, 'normal', mn);
      pushTex(mat.roughnessMap, 'roughness', mn);
      pushTex(mat.metalnessMap, 'metalness', mn);
      pushTex(mat.aoMap, 'ao', mn);
      // Color sólido sin textura → generar swatch 64x64
      if (!mat.map && mat.color) {
        const c = mat.color;
        const key = 'color:' + c.getHexString() + ':' + mn;
        if (!seen.has(key)) {
          seen.add(key);
          const cv = document.createElement('canvas');
          cv.width = 64; cv.height = 64;
          const ctx = cv.getContext('2d');
          ctx.fillStyle = '#' + c.getHexString();
          ctx.fillRect(0, 0, 64, 64);
          found.push({ texture: null, label: 'color', matName: mn, image: cv, solidColor: '#' + c.getHexString() });
        }
      }
    });
  });
  return found;
}

function imageToBlob(image, cb) {
  try {
    const cv = document.createElement('canvas');
    const w = image.naturalWidth || image.width || 64;
    const h = image.naturalHeight || image.height || 64;
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.drawImage(image, 0, 0);
    cv.toBlob(function (blob) { cb(blob); }, 'image/png');
  } catch (e) {
    console.warn('imageToBlob', e);
    cb(null);
  }
}

/** Rellena la lista de texturas y opcionalmente asigna body/face */
function ingestExtractedTextures(extracted, autoAssign) {
  if (!extracted || !extracted.length) {
    console.log('[tex] modelo sin texturas/colores detectados');
    return;
  }
  const list = document.getElementById('textureList');
  const panel = document.getElementById('texturesPanel');
  if (panel) panel.classList.remove('hidden');

  extracted.forEach(function (item, i) {
    const baseName = (item.matName || 'mat') + '_' + (item.label || 'map');
    const safeName = baseName.replace(/[^a-zA-Z0-9._-]+/g, '_') + '.png';

    function addEntry(blob, url) {
      const idx = zipTextures.length;
      zipTextures.push({
        name: safeName,
        url: url,
        blob: blob,
        file: blob ? new File([blob], safeName, { type: 'image/png' }) : null,
        fromModel: true,
        matName: item.matName,
        label: item.label,
      });
      if (list) {
        const div = document.createElement('div');
        div.className = 'tex-item';
        div.dataset.index = String(idx);
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        const span = document.createElement('span');
        span.textContent = safeName + (item.fromModel !== false ? ' (auto)' : '');
        div.appendChild(img);
        div.appendChild(span);
        div.addEventListener('click', function () { applyTextureManual(idx); });
        list.appendChild(div);
      }
      // Solo texturas de COLOR pueden auto-asignarse (no normal/roughness/metalness/ao/emissive)
      if (autoAssign && (item.label === 'map' || item.label === 'color')) {
        const n = (safeName + ' ' + (item.matName || '')).toLowerCase();
        let slot = 'body';
        if (/eye|ojo/.test(n)) slot = 'eyes';
        else if (/face|head|cara/.test(n)) slot = 'face';
        const isSolid = item.label === 'color';
        window._texAssignments = window._texAssignments || {};
        const cur = window._texAssignments[slot];
        // una textura real reemplaza a un color liso, sin importar quien termine de cargar primero
        if (!cur || (cur.solid && !isSolid)) {
          window._texAssignments[slot] = {
            index: idx, name: safeName, url: url, solid: isSolid,
            file: blob ? new File([blob], safeName, { type: 'image/png' }) : null,
          };
          console.log('[tex] auto-asignado', slot, '←', safeName, isSolid ? '(color liso)' : '');
        }
      }
    }

    if (item.image) {
      // si ya es canvas o tiene src usable
      if (item.image.toDataURL && item.label === 'color') {
        item.image.toBlob(function (blob) {
          const url = URL.createObjectURL(blob);
          addEntry(blob, url);
        }, 'image/png');
      } else if (item.image.src && item.image.src.indexOf('blob:') === 0) {
        // ya hay blob URL
        fetch(item.image.src).then(function (r) { return r.blob(); }).then(function (blob) {
          addEntry(blob, item.image.src);
        }).catch(function () {
          imageToBlob(item.image, function (blob) {
            if (!blob) return;
            addEntry(blob, URL.createObjectURL(blob));
          });
        });
      } else {
        imageToBlob(item.image, function (blob) {
          if (!blob) return;
          addEntry(blob, URL.createObjectURL(blob));
        });
      }
    }
  });
  console.log('[tex] extraídas del modelo:', extracted.length);
}

function autoDetectModelTextures(model, doAssign) {
  const extracted = extractTexturesFromModel(model);
  ingestExtractedTextures(extracted, !!doAssign);
  return extracted;
}


window._texAssignments = window._texAssignments || {};

function getSelectedTexType() {
  const active = document.querySelector('.tex-slot.active');
  if (active) return active.getAttribute('data-type') || 'body';
  const el = document.querySelector('input[name="texType"]:checked');
  return el ? el.value : 'body';
}

function setTexSlotType(type) {
  document.querySelectorAll('.tex-slot').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-type') === type);
  });
  document.querySelectorAll('input[name="texType"]').forEach(function (r) {
    r.checked = (r.value === type);
  });
}

function updateTexSlotLabels() {
  const asg = window._texAssignments || {};
  ['body', 'face', 'eyes', 'full'].forEach(function (t) {
    const label = document.querySelector('.tex-slot-name[data-for="' + t + '"]');
    const slot = document.querySelector('.tex-slot[data-type="' + t + '"]');
    if (!label) return;
    if (asg[t] && asg[t].name) {
      label.textContent = asg[t].name;
      if (slot) slot.classList.add('filled');
    } else {
      label.textContent = '—';
      if (slot) slot.classList.remove('filled');
    }
  });
  document.querySelectorAll('.tex-item').forEach(function (el) {
    el.classList.remove('assigned-body', 'assigned-face', 'assigned-eyes', 'assigned-full');
  });
  Object.keys(asg).forEach(function (t) {
    if (!asg[t] || asg[t].index == null) return;
    const item = document.querySelector('.tex-item[data-index="' + asg[t].index + '"]');
    if (item) item.classList.add('assigned-' + t);
  });
}

document.addEventListener('click', function (e) {
  const slot = e.target.closest && e.target.closest('.tex-slot');
  if (!slot) return;
  const type = slot.getAttribute('data-type');
  if (!type) return;
  setTexSlotType(type);
  if (typeof playSfx === 'function' && typeof sfxClick !== 'undefined') playSfx(sfxClick);
});


function applyTextureManual(index) {
  if (!currentModel || !zipTextures[index]) return;
  playSfx(sfxClick);

  const texType = getSelectedTexType();
  const tex = zipTextures[index];
  const loader = new THREE.TextureLoader();

  loader.load(tex.url, (texture) => {
    texture.encoding = THREE.sRGBEncoding;
    texture.flipY = false;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    // Guardar ref para ajustes de cara
    currentModel.userData.lastTexture = texture;
    currentModel.userData.lastTexType = texType;

    let targetMeshes = [];
    const allMeshes = typeof listModelMeshes === 'function' ? listModelMeshes() : [];
    function byName(re) {
      return allMeshes.filter(function (m) {
        return re.test((m.name || '').toLowerCase());
      });
    }
    if (texType === 'full') {
      targetMeshes = allMeshes;
    } else if (texType === 'face') {
      targetMeshes = byName(/face|head|cara/);
      if (!targetMeshes.length && typeof getFaceTargetMeshes === 'function') {
        targetMeshes = getFaceTargetMeshes() || [];
      }
      if (!targetMeshes.length) targetMeshes = allMeshes.length === 1 ? allMeshes : byName(/head/);
      if (!targetMeshes.length) {
        alert('No se detectó mesh de cara. Prueba slot “Todo” o renombra el mesh (face/head).');
        return;
      }
      currentModel.userData.faceTargetUuids = targetMeshes.map(function (m) { return m.uuid; });
    } else if (texType === 'eyes') {
      targetMeshes = byName(/eye|ojo|pupil/);
      if (!targetMeshes.length) targetMeshes = byName(/face|head/);
      if (!targetMeshes.length) targetMeshes = allMeshes;
    } else if (texType === 'body' || texType === 'mask') {
      targetMeshes = byName(/body|torso|leg|arm|tail|cuerpo|mano|pie/);
      // excluir cara si hay otras piezas
      const noFace = targetMeshes.filter(function (m) {
        return !/face|head|eye|cara|ojo/.test((m.name || '').toLowerCase());
      });
      if (noFace.length) targetMeshes = noFace;
      if (!targetMeshes.length) {
        targetMeshes = allMeshes.filter(function (m) {
          return typeof isFaceLikeMesh === 'function' ? !isFaceLikeMesh(m) : true;
        });
      }
      if (!targetMeshes.length) targetMeshes = allMeshes;
    } else {
      targetMeshes = allMeshes;
    }

    // Guardar asignación del slot
    


window._texAssignments = window._texAssignments || {};
    window._texAssignments[texType] = { index: index, name: tex.name, url: tex.url, file: tex.file || null };


    targetMeshes.forEach((child) => {
      const applyToMat = (mat) => {
        const m = mat.clone();
        m.map = texture;
        if (texType === 'mask') m.color = new THREE.Color(0xffffff);
        m.needsUpdate = true;
        return m;
      };
      if (Array.isArray(child.material)) {
        child.material = child.material.map(applyToMat);
      } else if (child.material) {
        child.material = applyToMat(child.material);
      } else {
        child.material = new THREE.MeshStandardMaterial({ map: texture });
      }
    });

    appliedTexture = tex;

    document.querySelectorAll('.tex-item').forEach(el => el.classList.remove('selected'));
    const item = document.querySelector('.tex-item[data-index="' + index + '"]');
    if (item) item.classList.add('selected');
    if (typeof updateTexSlotLabels === 'function') updateTexSlotLabels();

    // Mostrar ajustes solo si es cara
    const faceAdj = document.getElementById('faceAdjust');
    if (texType === 'face') {
      faceAdj.classList.remove('hidden');
      // reset sliders
      document.getElementById('faceOffX').value = 0;
      document.getElementById('faceOffY').value = 0;
      document.getElementById('faceScale').value = 1;
      document.getElementById('faceOffXVal').textContent = '0.00';
      document.getElementById('faceOffYVal').textContent = '0.00';
      document.getElementById('faceScaleVal').textContent = '1.00';
    } else {
      faceAdj.classList.add('hidden');
    }

    console.log('Textura aplicada:', tex.name, 'tipo:', texType);
  });
}

function updateFaceUV() {
  if (!currentModel || !currentModel.userData.lastTexture) return;
  if (currentModel.userData.lastTexType !== 'face') return;

  const ox = parseFloat(document.getElementById('faceOffX').value);
  const oy = parseFloat(document.getElementById('faceOffY').value);
  const sc = parseFloat(document.getElementById('faceScale').value);

  document.getElementById('faceOffXVal').textContent = ox.toFixed(2);
  document.getElementById('faceOffYVal').textContent = oy.toFixed(2);
  document.getElementById('faceScaleVal').textContent = sc.toFixed(2);

  const texture = currentModel.userData.lastTexture;
  texture.offset.set(ox, oy);
  texture.repeat.set(sc, sc);
  texture.needsUpdate = true;
}

document.getElementById('faceOffX').addEventListener('input', updateFaceUV);
document.getElementById('faceOffY').addEventListener('input', updateFaceUV);
document.getElementById('faceScale').addEventListener('input', updateFaceUV);


document.getElementById('btnClearTexture').addEventListener('click', () => {
  playSfx(sfxClick);
  window._texAssignments = {};
  if (typeof updateTexSlotLabels === 'function') updateTexSlotLabels();
  if (!currentModel) return;
  alert('Asignaciones borradas. Para quitar del 3D, vuelve a cargar el modelo del ZIP.');
});


function prepareModel(model) {
  // Centrar
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  model.position.x = -center.x;
  model.position.z = -center.z;
  model.position.y = -box.min.y;

  // Auto-escalar si el modelo es gigante o minúsculo
  const maxDim = Math.max(size.x, size.y, size.z);
  let autoScale = 1;

  if (maxDim > 5) {
    // Modelo muy grande (típico de FBX de Mario)
    autoScale = 1.8 / maxDim;
  } else if (maxDim < 0.3 && maxDim > 0) {
    // Modelo muy pequeño
    autoScale = 1.5 / maxDim;
  }

  if (autoScale !== 1) {
    model.scale.setScalar(autoScale);
    // Recalcular después de escalar
    const box2 = new THREE.Box3().setFromObject(model);
    model.position.y = -box2.min.y;
    console.log("Auto-escala aplicada:", autoScale, "tamaño original:", maxDim);
  }

  // Re-anclar pies al grid (y=0) tras escala
  model.updateMatrixWorld(true);
  const box3 = new THREE.Box3().setFromObject(model);
  model.position.y -= box3.min.y;
  model.updateMatrixWorld(true);

  model.userData.baseY = model.position.y;
  model.userData.autoScale = autoScale;

  // Reset visual del rig al cargar modelo nuevo
  if (typeof skeletonHelper !== 'undefined' && skeletonHelper) {
    skeletonHelper.scale.set(1, 1, 1);
    skeletonHelper.position.set(0, 0.6, 0);
  }

  const scaleSlider = document.getElementById("scale");
  if (scaleSlider) {
    scaleSlider.value = autoScale;
    const sv = document.getElementById("scaleVal");
    if (sv) sv.textContent = autoScale.toFixed(2);
  }
}

function fitCameraToModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.5);
  const dist = Math.max(maxDim * 2.5, 2.5);

  camera.position.set(dist * 0.8, Math.max(size.y * 0.5, 0.8) + 0.3, dist);
  controls.target.set(center.x, Math.max(center.y, 0.5), center.z);
  controls.update();

  console.log("Cámara ajustada. Tamaño modelo:", size, "dist:", dist);
}

const posYSlider = document.getElementById('posY');
const scaleSlider = document.getElementById('scale');
const rotYSlider = document.getElementById('rotY');

posYSlider.addEventListener('input', () => {
  const v = parseFloat(posYSlider.value);
  document.getElementById('posYVal').textContent = v.toFixed(2);
  if (currentModel) currentModel.position.y = (currentModel.userData.baseY || 0) + v;
});

scaleSlider.addEventListener('input', () => {
  const v = parseFloat(scaleSlider.value);
  document.getElementById('scaleVal').textContent = v.toFixed(2);
  if (currentModel) currentModel.scale.setScalar(v);
});

rotYSlider.addEventListener('input', () => {
  const v = parseFloat(rotYSlider.value);
  document.getElementById('rotYVal').textContent = v + '°';
  if (currentModel) currentModel.rotation.y = THREE.MathUtils.degToRad(v);
});

document.getElementById('btnResetView').addEventListener('click', () => {
  playSfx(sfxClick);
  posYSlider.value = 0;
  scaleSlider.value = 1;
  rotYSlider.value = 0;
  document.getElementById('posYVal').textContent = '0.00';
  document.getElementById('scaleVal').textContent = '1.00';
  document.getElementById('rotYVal').textContent = '0°';
  if (currentModel) {
    currentModel.position.y = currentModel.userData.baseY || 0;
    currentModel.scale.setScalar(1);
    currentModel.rotation.y = 0;
    fitCameraToModel(currentModel);
  }
});

document.getElementById('btnToggleSkeleton').addEventListener('click', () => {
  playSfx(sfxClick);
  showSkeleton = !showSkeleton;
  if (skeletonHelper) skeletonHelper.visible = showSkeleton;
  document.getElementById('btnToggleSkeleton').textContent =
    showSkeleton ? 'Ocultar rig Mario' : 'Mostrar rig Mario';
});

document.getElementById('btnAutoRig').addEventListener('click', () => {
  playSfx(sfxClick);
  autoRigModel();
});

document.getElementById('btnResetPose').addEventListener('click', () => {
  playSfx(sfxClick);
  resetPose();
});

const poseBindings = [
  { id: 'poseArmL', numId: 'poseArmLNum', bone: 'L_Arm', axis: 'z', invert: false },
  { id: 'poseArmR', numId: 'poseArmRNum', bone: 'R_Arm', axis: 'z', invert: true },
  { id: 'poseLegL', numId: 'poseLegLNum', bone: 'L_Thigh', axis: 'x', invert: false },
  { id: 'poseHead', numId: 'poseHeadNum', bone: 'Head', axis: 'y', invert: false },
];

poseBindings.forEach(({ id, numId, bone, axis, invert }) => {
  const el = document.getElementById(id);
  const num = document.getElementById(numId);
  const apply = (raw) => {
    let v = parseFloat(raw) || 0;
    if (el) el.value = v;
    if (num) num.value = v;
    const poseV = invert ? -v : v;
    if (typeof isRigged !== 'undefined' && !isRigged) {
      // still try — bones exist even without skin
    }
    testPose(bone, axis, poseV);
  };
  if (el) el.addEventListener('input', () => apply(el.value));
  if (num) {
    num.addEventListener('input', () => apply(num.value));
    num.addEventListener('change', () => apply(num.value));
  }
});


window.addEventListener('load', initThree);



// ==================== EXPORT ACTORS (C / DynOS) ====================
// Genera model.inc.c con Vtx/Gfx por cada pieza del geo Mario.
// Geo oficial se documenta; se incluye un geo mínimo de prueba.

function guessMarioPartFromMeshName(name) {
  const n = (name || '').toLowerCase();
  if (/head|face|cara|cap|hair/.test(n)) return 'Head';
  if (/tail|cola/.test(n)) return 'Butt'; // cola al root por ahora
  if (/(l|left|izq).*arm|arm.*(l|left|izq)|larm|brazo.*izq/.test(n)) return 'L_Arm';
  if (/(r|right|der).*arm|arm.*(r|right|der)|rarm|brazo.*der/.test(n)) return 'R_Arm';
  if (/(l|left|izq).*leg|leg.*(l|left|izq)|lleg|pierna.*izq|lfoot|foot.*l/.test(n)) return 'L_Thigh';
  if (/(r|right|der).*leg|leg.*(r|right|der)|rleg|pierna.*der|rfoot|foot.*r/.test(n)) return 'R_Thigh';
  if (/hand.*l|lhand|mano.*izq/.test(n)) return 'L_Hand';
  if (/hand.*r|rhand|mano.*der/.test(n)) return 'R_Hand';
  if (/body|torso|chest|cuerpo|hip|pelvis/.test(n)) return 'Torso';
  return null;
}


function vtxLine(p) {
  // Con color de textura: {{{x,y,z},0,{s,t},{r,g,b,a}}}
  // Sin color: normales
  if (p.r != null) {
    const r = Math.max(0, Math.min(255, p.r|0));
    const g = Math.max(0, Math.min(255, p.g|0));
    const b = Math.max(0, Math.min(255, p.b|0));
    const a = p.a != null ? Math.max(0, Math.min(255, p.a|0)) : 255;
    return '    {{{' + p.x + ', ' + p.y + ', ' + p.z + '}, 0, {' + (p.u|0) + ', ' + (p.v|0) + '}, {' +
      r + ', ' + g + ', ' + b + ', ' + a + '}}},';
  }
  const nx = Math.max(-128, Math.min(127, p.nx|0));
  const ny = Math.max(-128, Math.min(127, p.ny|0));
  const nz = Math.max(-128, Math.min(127, p.nz|0));
  return '    {{{' + p.x + ', ' + p.y + ', ' + p.z + '}, 0, {' + (p.u|0) + ', ' + (p.v|0) + '}, {' +
    nx + ', ' + ny + ', ' + nz + ', 255}}},';
}

function loadImageFromUrl(url) {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () { resolve(img); };
    img.onerror = function (e) { reject(e || new Error('img load fail')); };
    img.src = url;
  });
}

function sampleTexAt(imgData, w, h, u, v) {
  let fu = (u / 1024);
  let fv = (v / 1024);
  fu = fu - Math.floor(fu);
  fv = fv - Math.floor(fv);
  if (fu < 0) fu += 1;
  if (fv < 0) fv += 1;
  const x = Math.min(w - 1, Math.max(0, Math.floor(fu * w)));
  const y = Math.min(h - 1, Math.max(0, Math.floor((1 - fv) * h)));
  const i = (y * w + x) * 4;
  return { r: imgData[i], g: imgData[i + 1], b: imgData[i + 2], a: imgData[i + 3] };
}

/** Colorea verts desde texturas asignadas (body/face). Si falla, deja sin color. */
async function bakeVertexColorsFromAssignments(buckets) {
  try {
    const asg = window._texAssignments || {};
    const bodyAsg = asg.body || asg.full;
    if (!bodyAsg || !bodyAsg.url) {
      console.log('[export] sin textura body/full → sin bake de color');
      return { buckets: buckets, textured: false };
    }
    const img = await loadImageFromUrl(bodyAsg.url);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;

    let faceData = null, fw = 0, fh = 0;
    if (asg.face && asg.face.url) {
      try {
        const fimg = await loadImageFromUrl(asg.face.url);
        fw = fimg.naturalWidth || fimg.width;
        fh = fimg.naturalHeight || fimg.height;
        const fc = document.createElement('canvas');
        fc.width = fw; fc.height = fh;
        fc.getContext('2d').drawImage(fimg, 0, 0);
        faceData = fc.getContext('2d').getImageData(0, 0, fw, fh).data;
      } catch (e) { console.warn('[export] face bake', e); }
    }

    Object.keys(buckets).forEach(function (partName) {
      const verts = buckets[partName] || [];
      for (let i = 0; i < verts.length; i++) {
        const p = verts[i];
        let col;
        if (faceData && partName === 'Head') {
          col = sampleTexAt(faceData, fw, fh, p.u, p.v);
        } else {
          col = sampleTexAt(data, c.width, c.height, p.u, p.v);
        }
        p.r = col.r; p.g = col.g; p.b = col.b; p.a = 255;
      }
    });
    console.log('[export] vertex colors baked from', bodyAsg.name || 'texture');
    return { buckets: buckets, textured: true };
  } catch (err) {
    console.warn('[export] bake textura falló, export sin color', err);
    return { buckets: buckets, textured: false };
  }
}


function buildModelIncC(folderName, buckets, opts) {
  opts = opts || {};
  let s = '';
  s += '/* model.inc.c — por hueso Mario (rig)\n';
  s += ' * Personaje: ' + folderName + '\n';
  s += ' */\n\n';

  s += 'static const Lights1 body_lights = gdSPDefLights1(\n';
  s += '    0x7f, 0x7f, 0x7f,\n';
  s += '    0xff, 0xff, 0xff, 0x28, 0x28, 0x28\n';
  s += ');\n\n';

  function emitPartDL(dlName, verts) {
    let out = '';
    if (!verts || verts.length < 3) {
      out += 'const Gfx ' + dlName + '[] = {\n';
      out += '    gsSPEndDisplayList(),\n';
      out += '};\n\n';
      return out;
    }
    while (verts.length % 3 !== 0) verts = verts.slice(0, verts.length - 1);

    // index unique
    const keyOf = function (p) { return p.x + ',' + p.y + ',' + p.z + ',' + p.nx + ',' + p.ny + ',' + p.nz + ',' + p.u + ',' + p.v + ',' + p.r + ',' + p.g + ',' + p.b; };
    const useColor = verts.length > 0 && verts[0].r != null;
    const unique = [];
    const keyToIdx = {};
    const indices = [];
    for (let i = 0; i < verts.length; i++) {
      const p = verts[i];
      const k = keyOf(p);
      let idx = keyToIdx[k];
      if (idx === undefined) {
        idx = unique.length;
        keyToIdx[k] = idx;
        unique.push(p);
      }
      indices.push(idx);
    }

    const BATCH = 15; // igual que los DL oficiales de Mario (F3D)
    const batches = [];
    let curVerts = [], curMap = {}, curTris = [];
    function flush() {
      if (!curTris.length) return;
      batches.push({ verts: curVerts.slice(), tris: curTris.slice() });
      curVerts = []; curMap = {}; curTris = [];
    }
    for (let t = 0; t < indices.length; t += 3) {
      const need = [indices[t], indices[t+1], indices[t+2]];
      let newCount = 0;
      need.forEach(function (g) { if (curMap[g] === undefined) newCount++; });
      if (curVerts.length + newCount > BATCH) flush();
      const local = need.map(function (g) {
        if (curMap[g] === undefined) {
          curMap[g] = curVerts.length;
          curVerts.push(unique[g]);
        }
        return curMap[g];
      });
      curTris.push(local);
    }
    flush();

    batches.forEach(function (batch, bi) {
      out += 'static const Vtx ' + dlName + '_vtx_' + bi + '[' + batch.verts.length + '] = {\n';
      batch.verts.forEach(function (p) { out += vtxLine(useColor ? { x: p.x, y: p.y, z: p.z, u: p.u, v: p.v, r: p.r, g: p.g, b: p.b, a: p.a } : { x: p.x, y: p.y, z: p.z, u: p.u, v: p.v, nx: p.nx, ny: p.ny, nz: p.nz }) + '\n'; });
      out += '};\n\n';
    });

    out += 'const Gfx ' + dlName + '[] = {\n';
    out += '    gsDPPipeSync(),\n';
    out += '    gsDPSetCombineMode(G_CC_SHADEFADEA, G_CC_SHADEFADEA),\n';
    out += '    gsSPClearGeometryMode(G_CULL_BACK),\n';
    if (useColor) {
      out += '    gsSPClearGeometryMode(G_LIGHTING),\n';
    } else {
      out += '    gsSPLight(&body_lights.l, 1),\n';
      out += '    gsSPLight(&body_lights.a, 2),\n';
    }
    batches.forEach(function (batch, bi) {
      out += '    gsSPVertex(' + dlName + '_vtx_' + bi + ', ' + batch.verts.length + ', 0),\n';
      for (let ti = 0; ti < batch.tris.length; ti += 2) {
        const t0 = batch.tris[ti];
        if (ti + 1 < batch.tris.length) {
          const t1 = batch.tris[ti + 1];
          out += '    gsSP2Triangles(' + t0[0] + ', ' + t0[1] + ', ' + t0[2] + ', 0x0, ' +
            t1[0] + ', ' + t1[1] + ', ' + t1[2] + ', 0x0),\n';
        } else {
          out += '    gsSP1Triangle(' + t0[0] + ', ' + t0[1] + ', ' + t0[2] + ', 0x0),\n';
        }
      }
    });
    if (useColor) out += '    gsSPSetGeometryMode(G_LIGHTING),\n';
    out += '    gsSPEndDisplayList(),\n';
    out += '};\n\n';
    return out;
  }

  // Una DL por pieza Mario
  MARIO_PARTS.forEach(function (part) {
    s += emitPartDL(part.dl, (buckets[part.name] || []).slice());
  });

  // body_dl dibuja el mesh completo (mario_butt)
  s += 'const Gfx body_dl[] = {\n';
  s += '    gsSPDisplayList(mario_butt),\n';
  s += '    gsSPEndDisplayList(),\n';
  s += '};\n\n';

  return s;
}

function buildGeoHeader(folderName) {
  let s = '/* geo_header.h */\n#pragma once\n\n';
  s += 'extern const GeoLayout ' + folderName + '_geo[];\n';
  s += 'extern const Gfx body_dl[];\n';
  MARIO_PARTS.forEach((p) => {
    s += 'extern const Gfx ' + p.dl + '[];\n';
  });
  return s;
}


async function exportActorsZip() {
  const name = document.getElementById('charName').value.trim() || 'custom_character';
  const folderName = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'custom_character';
  const status = document.getElementById('status');

  if (!currentModel) {
    alert('Sube y (opcional) riggea un modelo primero');
    return;
  }
  if (!marioBones || !marioBones.length) {
    alert('Rig Mario no listo');
    return;
  }

  status.className = 'status';
  status.textContent = 'Exportando actors/ (C)...';

  try {
    // asegurar matrices de huesos
    if (marioRoot) marioRoot.updateMatrixWorld(true);

    let buckets = collectVertsByBone();
    let total = 0;
    Object.values(buckets).forEach((a) => { total += a.length; });
    if (total < 3) {
      alert('No se obtuvieron vértices del modelo. ¿Se cargó bien?');
      status.textContent = '';
      return;
    }

    const zip = new JSZip();
    const actors = zip.folder('actors').folder(folderName);
    let baked1 = { buckets: buckets, textured: false };
    if (typeof bakeVertexColorsFromAssignments === 'function') {
      try { baked1 = await bakeVertexColorsFromAssignments(buckets); }
      catch (be) { console.warn(be); }
    }
    buckets = baked1.buckets;
    actors.file('model.inc.c', buildModelIncC(folderName, buckets, { textured: true }));
    actors.file('geo.inc.c', buildGeoIncC(folderName));
    actors.file('geo_header.h', buildGeoHeader(folderName));
    actors.file('README_EXPORT.txt',
      'Export experimental sin Blender\n' +
      '==============================\n\n' +
      '1. Copia la carpeta actors/' + folderName + ' dentro de:\n' +
      '   sm64coopdx/mods/TU_MOD/actors/' + folderName + '\n\n' +
      '2. Arranca Coop DX (sin otros .bin en esa carpeta) para que DynOS\n' +
      '   compile → debería aparecer ' + folderName + '_geo.bin\n\n' +
      '3. En main.lua usa:\n' +
      '   smlua_model_util_get_id("' + folderName + '_geo")\n\n' +
      'NOTAS:\n' +
      '- geo.inc.c es MÍNIMO (prueba). Ideal: geo oficial del Character Template\n' +
      '  y solo reemplazar model.inc.c.\n' +
      '- Ejes SM64 todavía experimentales; si sale torcido, avisa y calibramos.\n' +
      '- Vértices totales: ' + total + '\n' +
      '- Generado por Character Mod Generator\n'
    );

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, folderName + '_actors_export.zip');

    status.textContent = 'actors/ exportado (' + total + ' verts). Revisa descargas.';
    playSfx(sfxSuccess);
  } catch (err) {
    console.error(err);
    status.className = 'status error';
    status.textContent = 'Error al exportar actors/: ' + (err.message || err);
  }
}

document.getElementById('btnExportActors')?.addEventListener('click', () => {
  playSfx(sfxClick);
  exportActorsZip();
});


// ==================== GENERAR MOD ====================

document.getElementById('btnGenerate').addEventListener('click', async () => {
  playSfx(sfxClick);

  const name = document.getElementById('charName').value.trim() || 'Custom Character';
  const desc = document.getElementById('charDesc').value.trim() || 'A custom character';
  const author = document.getElementById('charAuthor').value.trim() || 'Unknown';
  let color = document.getElementById('charColor').value.trim() || '#FF0000';
  if (color.charAt(0) !== '#') color = '#' + color;
  // CS espera "#RRGGBB" 

  const lifeEl = document.getElementById('lifeIcon');
  const menuEl = document.getElementById('menuIcon');
  const lifeFile = lifeEl && lifeEl.files && lifeEl.files[0] ? lifeEl.files[0] : null;
  const menuFile = menuEl && menuEl.files && menuEl.files[0] ? menuEl.files[0] : null;

  const soundInputs = {
    jump1: document.getElementById('soundJump1'),
    jump2: document.getElementById('soundJump2'),
    jump3: document.getElementById('soundJump3'),
    doubleJump: document.getElementById('soundDoubleJump'),
    tripleJump: document.getElementById('soundTripleJump'),
    longJump: document.getElementById('soundLongJump'),
    hurt: document.getElementById('soundHurt'),
    burn: document.getElementById('soundBurn'),
    fall: document.getElementById('soundFall'),
    death: document.getElementById('soundDeath'),
    drown: document.getElementById('soundDrown'),
    groundPound: document.getElementById('soundGroundPound'),
    punch1: document.getElementById('soundPunch1'),
    punch2: document.getElementById('soundPunch2'),
    punch3: document.getElementById('soundPunch3'),
    star: document.getElementById('soundStar'),
    letsGo: document.getElementById('soundLetsGo'),
  };
  const soundFiles = {};
  Object.keys(soundInputs).forEach(function (k) {
    const el = soundInputs[k];
    soundFiles[k] = el && el.files && el.files[0] ? el.files[0] : null;
  });

  const status = document.getElementById('status');
  if (status) {
    status.className = 'status';
    status.textContent = 'Generando mod...';
  }
  // Asegurar categoría export visible para feedback
  if (typeof setCategory === 'function') setCategory('export');

  try {
    const zip = new JSZip();
    // Carpeta estilo CS: cs_nombre-personaje
    // C/geo usa underscore (toro_inoue_geo); el pack usa cs_toro-inoue
    const slugHyphen = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom';
    const folderName = slugHyphen.replace(/-/g, '_') || 'custom_character'; // actors + geo C (sin espacios)
    // Nombre visible en la lista de mods de Coop DX = nombre de carpeta
    // Estilo comunidad: [CS] Nombre del personaje
    const packName = 'cs_' + slugHyphen;
    const root = zip.folder(packName);

    const mainLua = generateMainLua({
      name: name,
      desc: desc,
      author: author,
      color: color,
      folderName: folderName,
      hasLifeIcon: true,  // siempre hay icon (user o placeholder)
      hasMenuIcon: true,
      soundFiles: soundFiles,
    });

    root.file('main.lua', mainLua);

    const textures = root.folder('textures');
    // Estilo Bambi/Dave: nombre-icon.png (CS lo busca con get_texture_info)
    // menuIcon = icono del selector; lifeIcon = HUD / fallback
    const iconBase = folderName + '-icon';
    // Icono: el del usuario o un placeholder 64x64 para que CS no tire error
    async function makePlaceholderIcon() {
      const cv = document.createElement('canvas');
      cv.width = 64; cv.height = 64;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = color || '#FF6B9D';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const letter = (name || 'C').trim().charAt(0).toUpperCase() || 'C';
      ctx.fillText(letter, 32, 34);
      return await new Promise(function (res) {
        cv.toBlob(function (b) { res(b); }, 'image/png');
      });
    }
    if (menuFile) {
      textures.file(iconBase + '.png', menuFile);
    } else if (lifeFile) {
      textures.file(iconBase + '.png', lifeFile);
    } else {
      try {
        const ph = await makePlaceholderIcon();
        if (ph) textures.file(iconBase + '.png', ph);
      } catch (e) { console.warn('placeholder icon', e); }
    }
    if (lifeFile && menuFile) {
      textures.file(folderName + '-life.png', lifeFile);
    } else if (lifeFile && !menuFile) {
      // ya se uso como icon CS
    }
    if (menuFile && !lifeFile) {
      // solo menu
    }

    // HUD PNGs (sección UI)
    const dataUrlToBlob = async (dataUrl) => {
      const res = await fetch(dataUrl);
      return await res.blob();
    };
    // Expresiones de ojos/cara
    if (typeof faceStateData !== 'undefined' && typeof FACE_STATES !== 'undefined') {
      for (const s of FACE_STATES) {
        const d = faceStateData[s.id];
        if (!d || !d.dataUrl) continue;
        const url = await getTransformedFaceDataUrl(s.id);
        if (url) textures.file(s.file, await dataUrlToBlob(url));
      }
    }

    if (typeof hudFiles !== 'undefined') {
      if (hudFiles.powerMeter) {
        textures.file(hudFiles.powerMeter.name, await dataUrlToBlob(hudFiles.powerMeter.dataUrl));
      }
      if (hudFiles.lifeIcon && !lifeFile) {
        textures.file(hudFiles.lifeIcon.name, await dataUrlToBlob(hudFiles.lifeIcon.dataUrl));
      } else if (hudFiles.lifeIcon && lifeFile) {
        textures.file('life_icon_hud.png', await dataUrlToBlob(hudFiles.lifeIcon.dataUrl));
      }
      if (hudFiles.courseIcon) {
        textures.file(hudFiles.courseIcon.name, await dataUrlToBlob(hudFiles.courseIcon.dataUrl));
      }
      if (hudFiles.transition) {
        textures.file(hudFiles.transition.name, await dataUrlToBlob(hudFiles.transition.dataUrl));
      }
    }

    let actorsNote = '';
    const actors = root.folder('actors');

    if (currentModel && typeof marioBones !== 'undefined' && marioBones && marioBones.length &&
        typeof collectVertsByBone === 'function') {
      try {
        if (marioRoot) marioRoot.updateMatrixWorld(true);
        let buckets = collectVertsByBone();
        let totalVerts = 0;
        Object.values(buckets).forEach(function (a) { totalVerts += a.length; });

        if (totalVerts >= 3) {
          const actorFolder = actors.folder(folderName);
          let baked2 = { buckets: buckets, textured: false };
          if (typeof bakeVertexColorsFromAssignments === 'function') {
            try { baked2 = await bakeVertexColorsFromAssignments(buckets); }
            catch (be) { console.warn(be); }
          }
          buckets = baked2.buckets;
          actorFolder.file('model.inc.c', buildModelIncC(folderName, buckets, { textured: true }));
          actorFolder.file('geo.inc.c', buildGeoIncC(folderName));
          actorFolder.file('geo_header.h', buildGeoHeader(folderName));
          actorFolder.file('README_DYNOS.txt',
            'Si no aparece el modelo:\n' +
            '1) Borra cualquier ' + folderName + '_geo.bin viejo\n' +
            '2) Asegurate que model.inc.c y geo.inc.c estan aqui\n' +
            '3) Reinicia el juego completo (DynOS compila al arrancar)\n' +
            '4) El id del modelo es: ' + folderName + '_geo\n'
          );
          const rep = window._lastExportReport;
          let meshLines = '';
          if (rep && rep.meshes) {
            meshLines = rep.meshes.map(function(m){ return '- ' + m.name + ': ' + m.tris + ' tris'; }).join('\n') + '\n';
            meshLines += 'TOTAL: ' + rep.totalTris + ' tris\n';
          }
          actorsNote =
            '\nMODELO 3D (experimental):\n' + (rep && rep.mode ? '- Tipo: ' + (rep.mode === 'animated' ? 'ANIMADO (rig Mario)' : 'ESTATICO') + '\n' : '') + meshLines +
            '- Incluido actors/' + folderName + '/ (model.inc.c + geo.inc.c)\n' +
            '- Vértices: ' + totalVerts + '\n' +
            '- Abre Coop DX una vez para compilar → ' + folderName + '_geo.bin\n';
        } else {
          actors.file('SIN_GEOMETRIA.txt', 'Pocos vértices. Carga un modelo y pulsa Riggear antes de generar.\n');
          actorsNote = '\nSin geometría suficiente en el export.\n';
        }
      } catch (e) {
        console.error(e);
        actors.file('ERROR_EXPORT.txt', String(e && e.message ? e.message : e));
        actorsNote = '\nError exportando modelo: ' + e + '\n';
      }
    } else {
      actors.file('PON_MODELO.txt',
        'No había modelo al generar.\n' +
        'Sube modelo → Riggear → Generar Mod de nuevo.\n'
      );
      actorsNote = '\nSin modelo 3D. Vuelve a generar con el modelo cargado.\n';
    }

    // Texturas asignadas (slots)
    const asg = window._texAssignments || {};
    const slotFiles = [
      ['body', 'body.png'],
      ['face', 'face.png'],
      ['eyes', 'eyes.png'],
      ['full', 'full.png'],
    ];
    for (let si = 0; si < slotFiles.length; si++) {
      const key = slotFiles[si][0];
      const fname = slotFiles[si][1];
      const a = asg[key];
      if (!a) continue;
      try {
        if (a.file) {
          textures.file(fname, a.file);
        } else if (a.url) {
          const blob = await fetch(a.url).then(function (r) { return r.blob(); });
          textures.file(fname, blob);
        } else if (a.index != null && typeof zipTextures !== 'undefined' && zipTextures[a.index]) {
          const zt = zipTextures[a.index];
          if (zt.file) textures.file(fname, zt.file);
          else if (zt.url) {
            const blob = await fetch(zt.url).then(function (r) { return r.blob(); });
            textures.file(fname, blob);
          }
        }
      } catch (e) { console.warn('tex pack', key, e); }
    }

    const sounds = root.folder('sound');
    const soundNameMap = {
      jump1: 'jump1.ogg', jump2: 'jump2.ogg', jump3: 'jump3.ogg',
      doubleJump: 'double_jump.ogg', tripleJump: 'triple_jump.ogg', longJump: 'long_jump.ogg',
      hurt: 'hurt.ogg', burn: 'burn.ogg', fall: 'fall.ogg',
      death: 'death.ogg', drown: 'drown.ogg', groundPound: 'ground_pound.ogg',
      punch1: 'punch1.ogg', punch2: 'punch2.ogg', punch3: 'punch3.ogg',
      star: 'star.ogg', letsGo: 'lets_go.ogg',
    };
    Object.keys(soundNameMap).forEach(function (k) {
      if (soundFiles[k]) sounds.file(soundNameMap[k], soundFiles[k]);
    });

    let modelNote = '';
    if (currentModel) {
      var scEl = document.getElementById('scale');
      var pyEl = document.getElementById('posY');
      var ryEl = document.getElementById('rotY');
      var scale = scEl ? parseFloat(scEl.value) : 1;
      var posY = pyEl ? parseFloat(pyEl.value) : 0;
      var rotY = ryEl ? parseFloat(ryEl.value) : 0;
      modelNote = '\nAjustes 3D del visor:\n- Escala: ' + scale + '\n- Posición Y: ' + posY + '\n- Rotación Y: ' + rotY + '°\n';
    }

    root.file('README.txt',
      'Mod Character Select — Character Mod Generator\n' +
      '==============================================\n\n' +
      'Personaje: ' + name + '\n' +
      'Autor: ' + author + '\n\n' +
      'INSTALACIÓN (como packs CS / Bambi)\n' +
      '1. Character Select instalado y activo.\n' +
      '2. Extrae ESTA carpeta en sm64coopdx/mods/\n' +
      '3. Arranca el juego una vez (DynOS puede crear el .bin desde los .c).\n' +
      '4. Activa el mod y reinicia la sala si hace falta.\n\n' +
      'Contiene: main.lua, actors/, textures/, sound/\n' +
      actorsNote + modelNote + '\n' +
      'Export 3D experimental (sin Blender). Si sale torcido, lo calibramos.\n'
    );

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, packName + '.zip');

    const rep2 = window._lastExportReport;
    let extra = '';
    if (rep2) extra = ' Meshes: ' + (rep2.meshes ? rep2.meshes.length : 0) + ' | Tris: ' + (rep2.totalTris || 0);
    status.textContent = '¡Mod completo generado!' + extra + ' Revisa descargas.';
    playSfx(sfxSuccess);
  } catch (err) {
    console.error(err);
    status.className = 'status error';
    status.textContent = 'Error al generar: ' + (err && err.message ? err.message : err);
    alert('Error al generar el mod:\n' + (err && err.message ? err.message : err) + '\n\nMira F12 → Consola');
  }
});

function generateMainLua(opts) {
  const safeName = String(opts.name || 'Custom').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const safeDesc = String(opts.desc || 'Custom character').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const safeAuthor = String(opts.author || 'Unknown').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const folderName = opts.folderName || 'custom_character';
  const geoName = folderName + '_geo';
  const iconName = folderName + '-icon';
  const hasIcon = !!(opts.hasMenuIcon || opts.hasLifeIcon);

  let hex = (opts.color || '#FF0000').replace('#', '');
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  const r = parseInt(hex.slice(0, 2), 16) || 255;
  const g = parseInt(hex.slice(2, 4), 16) || 0;
  const b = parseInt(hex.slice(4, 6), 16) || 0;

  const sf = opts.soundFiles || {};
  const hasAnySound = Object.keys(sf).some(function (k) { return !!sf[k]; });

  const descLines = safeDesc.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
  if (!descLines.length) descLines.push('Custom character');
  const descLua = '{ ' + descLines.map(function (l) { return '"' + l + '"'; }).join(', ') + ' }';

  let s = '';
  s += '-- name: [CS] ' + safeName + '\n';
  s += '-- description: ' + descLines[0] + '\n';
  s += '-- author: ' + safeAuthor + '\n';
  s += '-- category: cs\n\n';

  s += 'local TEXT_MOD_NAME = "[CS] ' + safeName + '"\n';
  s += 'local GEO_NAME = "' + geoName + '"\n\n';

  // Model — sin pcall raro; get_id suele devolver nil si falta
  s += 'local E_MODEL_CHAR = nil\n';
  s += 'local _mok, _mid = pcall(smlua_model_util_get_id, GEO_NAME)\n';
  s += 'if _mok then E_MODEL_CHAR = _mid end\n\n';

  s += 'local CHAR_COLOR = {r = ' + r + ', g = ' + g + ', b = ' + b + '}\n\n';

  // Icono SOLO si el pack trae el PNG (si no, get_texture_info tira error en consola)
  if (hasIcon) {
    s += 'local TEX_CHAR_ICON = get_texture_info("' + iconName + '")\n\n';
  } else {
    s += 'local TEX_CHAR_ICON = nil\n';
    s += '-- Sin icono en el pack (sube uno en la web para el selector)\n\n';
  }

  if (hasAnySound) {
    s += 'local VOICETABLE_CHAR = {\n';
    const jumps = [];
    if (sf.jump1) jumps.push('"jump1.ogg"');
    if (sf.jump2) jumps.push('"jump2.ogg"');
    if (sf.jump3) jumps.push('"jump3.ogg"');
    if (jumps.length === 1) s += '    [CHAR_SOUND_YAH_WAH_HOO] = ' + jumps[0] + ',\n';
    else if (jumps.length > 1) s += '    [CHAR_SOUND_YAH_WAH_HOO] = { ' + jumps.join(', ') + ' },\n';
    if (sf.doubleJump) s += '    [CHAR_SOUND_HOOHOO] = "double_jump.ogg",\n';
    if (sf.tripleJump) s += '    [CHAR_SOUND_YAHOO_WAHA_YIPPEE] = { "triple_jump.ogg" },\n';
    if (sf.longJump) s += '    [CHAR_SOUND_YAHOO] = "long_jump.ogg",\n';
    if (sf.hurt) {
      s += '    [CHAR_SOUND_ATTACKED] = "hurt.ogg",\n';
      s += '    [CHAR_SOUND_OOOF] = "hurt.ogg",\n';
      s += '    [CHAR_SOUND_OOOF2] = "hurt.ogg",\n';
    }
    if (sf.burn) s += '    [CHAR_SOUND_ON_FIRE] = "burn.ogg",\n';
    if (sf.fall) s += '    [CHAR_SOUND_WAAAOOOW] = "fall.ogg",\n';
    if (sf.death) s += '    [CHAR_SOUND_DYING] = "death.ogg",\n';
    if (sf.drown) s += '    [CHAR_SOUND_DROWNING] = "drown.ogg",\n';
    if (sf.groundPound) s += '    [CHAR_SOUND_GROUND_POUND_WAH] = "ground_pound.ogg",\n';
    if (sf.punch1) s += '    [CHAR_SOUND_PUNCH_YAH] = "punch1.ogg",\n';
    if (sf.punch2) s += '    [CHAR_SOUND_PUNCH_WAH] = "punch2.ogg",\n';
    if (sf.punch3) s += '    [CHAR_SOUND_PUNCH_HOO] = "punch3.ogg",\n';
    if (sf.star) s += '    [CHAR_SOUND_HERE_WE_GO] = "star.ogg",\n';
    if (sf.letsGo) {
      s += '    [CHAR_SOUND_LETS_A_GO] = "lets_go.ogg",\n';
      s += '    [CHAR_SOUND_OKEY_DOKEY] = "lets_go.ogg",\n';
    }
    s += '}\n\n';
  }

  s += 'if _G.charSelect == nil then\n';
  s += '    djui_popup_create(TEXT_MOD_NAME .. " necesita Character Select", 4)\n';
  s += '    return\n';
  s += 'end\n\n';

  s += 'if E_MODEL_CHAR == nil then\n';
  s += '    djui_popup_create(TEXT_MOD_NAME .. ": no se encontro " .. GEO_NAME, 5)\n';
  s += '    return\n';
  s += 'end\n\n';

  // character_add - API clasica CS
  s += '_G.charSelect.character_add(\n';
  s += '    "' + safeName + '",\n';
  s += '    ' + descLua + ',\n';
  s += '    "' + safeAuthor + '",\n';
  s += '    CHAR_COLOR,\n';
  s += '    E_MODEL_CHAR,\n';
  s += '    CT_MARIO,\n';
  s += '    TEX_CHAR_ICON\n';
  s += ')\n\n';

  if (hasAnySound) {
    s += 'if _G.charSelect.character_add_voice ~= nil then\n';
    s += '    _G.charSelect.character_add_voice(E_MODEL_CHAR, VOICETABLE_CHAR)\n';
    s += 'end\n\n';
    s += 'hook_event(HOOK_CHARACTER_SOUND, function(m, sound)\n';
    s += '    if _G.charSelect == nil then return end\n';
    s += '    if _G.charSelect.character_get_voice == nil then return end\n';
    s += '    if _G.charSelect.voice == nil then return end\n';
    s += '    local vt = _G.charSelect.character_get_voice(m)\n';
    s += '    if vt == VOICETABLE_CHAR then\n';
    s += '        return _G.charSelect.voice.sound(m, sound)\n';
    s += '    end\n';
    s += 'end)\n';
  }

  return s;
}


function setLayout(mode) {
  document.body.classList.remove('layout-classic', 'layout-studio');
  document.body.classList.add(mode === 'studio' ? 'layout-studio' : 'layout-classic');
  document.getElementById('btnLayoutClassic').classList.toggle('active', mode !== 'studio');
  document.getElementById('btnLayoutStudio').classList.toggle('active', mode === 'studio');
  try { localStorage.setItem('cmg-layout', mode); } catch (e) {}
  // resize three.js canvas
  setTimeout(() => { if (typeof onResize === 'function') onResize(); }, 50);
}

document.getElementById('btnLayoutClassic').addEventListener('click', () => {
  playSfx(sfxClick);
  setLayout('classic');
});
document.getElementById('btnLayoutStudio').addEventListener('click', () => {
  playSfx(sfxClick);
  setLayout('studio');
});

// restore saved layout
(function () {
  let mode = 'studio';
  try { mode = localStorage.getItem('cmg-layout') || 'studio'; } catch (e) {}
  setLayout(mode);
})();


// ===== Settings panel =====
const settingsOverlay = document.getElementById('settingsOverlay');

function openSettings() {
  settingsOverlay.classList.remove('hidden');
}
function closeSettings() {
  settingsOverlay.classList.add('hidden');
}

document.getElementById('btnSettings').addEventListener('click', () => {
  playSfx(sfxClick);
  openSettings();
});
document.getElementById('btnCloseSettings').addEventListener('click', () => {
  playSfx(sfxClick);
  closeSettings();
});
settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) closeSettings();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSettings();
});

// Volume
function applyMusicVolume() {
  const v = parseInt(document.getElementById('musicVolume').value, 10) / 100;
  document.getElementById('bgMusic').volume = v;
  document.getElementById('musicVolumeVal').textContent = Math.round(v * 100) + '%';
  try { localStorage.setItem('cmg-music-vol', String(Math.round(v * 100))); } catch (e) {}
}
function applySfxVolume() {
  const v = parseInt(document.getElementById('sfxVolume').value, 10) / 100;
  [sfxClick, sfxHover, sfxSuccess].forEach((a) => { if (a) a.volume = v; });
  document.getElementById('sfxVolumeVal').textContent = Math.round(v * 100) + '%';
  try { localStorage.setItem('cmg-sfx-vol', String(Math.round(v * 100))); } catch (e) {}
}

document.getElementById('musicVolume').addEventListener('input', applyMusicVolume);
document.getElementById('sfxVolume').addEventListener('input', applySfxVolume);

// restore volumes
(function () {
  try {
    const mv = localStorage.getItem('cmg-music-vol');
    const sv = localStorage.getItem('cmg-sfx-vol');
    if (mv != null) document.getElementById('musicVolume').value = mv;
    if (sv != null) document.getElementById('sfxVolume').value = sv;
  } catch (e) {}
  applyMusicVolume();
  applySfxVolume();
})();



// ===== Expresiones de cara / ojos =====
const FACE_STATES = [
  { id: 'normal', label: 'Normal', file: 'eyes_normal.png' },
  { id: 'half', label: 'Medio cerrados', file: 'eyes_half.png' },
  { id: 'closed', label: 'Cerrados', file: 'eyes_closed.png' },
  { id: 'dead', label: 'Muerto / KO', file: 'eyes_dead.png' },
];

const faceStateData = {};
let selectedFaceStateId = 'normal';
let faceBackupMaterials = null; // restore on clear

FACE_STATES.forEach((s) => {
  faceStateData[s.id] = {
    dataUrl: null,
    rotation: 0,
    flipH: false,
    flipV: false,
    eyeOffX: 0,
    eyeOffY: 0,
    eyeScale: 1,
  };
});

function buildFaceStatesUI() {
  const grid = document.getElementById('faceStatesGrid');
  if (!grid) return;
  grid.innerHTML = '';
  FACE_STATES.forEach((s) => {
    const slot = document.createElement('div');
    slot.className = 'face-state-slot' + (s.id === selectedFaceStateId ? ' active' : '');
    slot.dataset.id = s.id;
    slot.innerHTML =
      '<span class="face-label">' + s.label + '</span>' +
      '<div class="face-thumb placeholder" data-thumb="' + s.id + '">Sin imagen</div>' +
      '<input type="file" accept="image/*" data-face="' + s.id + '">';
    slot.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') return;
      selectFaceState(s.id);
    });
    const input = slot.querySelector('input');
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const d = faceStateData[s.id];
        d.dataUrl = reader.result;
        d.rotation = 0;
        d.flipH = false;
        d.flipV = false;
        updateFaceThumb(s.id);
        selectFaceState(s.id);
      };
      reader.readAsDataURL(file);
    });
    grid.appendChild(slot);
  });
}

function selectFaceState(id) {
  selectedFaceStateId = id;
  document.querySelectorAll('.face-state-slot').forEach((el) => {
    el.classList.toggle('active', el.dataset.id === id);
  });
  const sel = document.getElementById('faceStatePreview');
  if (sel) sel.value = id;
  const label = (FACE_STATES.find((s) => s.id === id) || {}).label || id;
  const hint = document.getElementById('faceEditHint');
  if (hint) hint.textContent = 'Editando: ' + label;

  // load eye sliders for this state
  const d = faceStateData[id];
  if (!d) return;
  const set = (id, val, valId, suffix) => {
    const el = document.getElementById(id);
    const v = document.getElementById(valId);
    if (el) el.value = val;
    if (v) v.textContent = typeof val === 'number' ? val.toFixed(2) + (suffix || '') : val;
  };
  const eox = document.getElementById('eyeOffX');
  const eoy = document.getElementById('eyeOffY');
  const esc = document.getElementById('eyeScale');
  const eoxn = document.getElementById('eyeOffXNum');
  const eoyn = document.getElementById('eyeOffYNum');
  const escn = document.getElementById('eyeScaleNum');
  if (eox) eox.value = d.eyeOffX;
  if (eoy) eoy.value = d.eyeOffY;
  if (esc) esc.value = d.eyeScale;
  if (eoxn) eoxn.value = d.eyeOffX;
  if (eoyn) eoyn.value = d.eyeOffY;
  if (escn) escn.value = d.eyeScale;
}

function updateFaceThumb(id) {
  const data = faceStateData[id];
  const el = document.querySelector('[data-thumb="' + id + '"]');
  if (!el || !data) return;
  if (!data.dataUrl) {
    el.className = 'face-thumb placeholder';
    el.textContent = 'Sin imagen';
    el.style.backgroundImage = '';
    return;
  }
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const rot = ((data.rotation % 360) + 360) % 360;
    const swap = rot === 90 || rot === 270;
    canvas.width = swap ? img.height : img.width;
    canvas.height = swap ? img.width : img.height;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.scale(data.flipH ? -1 : 1, data.flipV ? -1 : 1);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    el.className = 'face-thumb';
    el.textContent = '';
    el.style.backgroundImage = 'url(' + canvas.toDataURL('image/png') + ')';
  };
  img.src = data.dataUrl;
}

function getTransformedFaceDataUrl(id) {
  return new Promise((resolve) => {
    const data = faceStateData[id];
    if (!data || !data.dataUrl) return resolve(null);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const rot = ((data.rotation % 360) + 360) % 360;
      const swap = rot === 90 || rot === 270;
      canvas.width = swap ? img.height : img.width;
      canvas.height = swap ? img.width : img.height;
      const ctx = canvas.getContext('2d');
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.scale(data.flipH ? -1 : 1, data.flipV ? -1 : 1);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = data.dataUrl;
  });
}

function backupFaceMaterials() {
  if (!currentModel || faceBackupMaterials) return;
  faceBackupMaterials = [];
  currentModel.traverse((child) => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((mat, i) => {
      if (!mat) return;
      faceBackupMaterials.push({
        mesh: child,
        index: i,
        map: mat.map || null,
        isArray: Array.isArray(child.material),
      });
    });
  });
}


function listModelMeshes() {
  const meshes = [];
  if (!currentModel) return meshes;
  currentModel.traverse((child) => {
    if (child.isMesh) {
      meshes.push(child);
    }
  });
  return meshes;
}

function refreshFaceMeshSelect() {
  const sel = document.getElementById('faceMeshSelect');
  if (!sel) return;
  const meshes = listModelMeshes();
  sel.innerHTML = '';
  meshes.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = (m.name || ('Mesh_' + i)) + ' (' + (m.geometry?.attributes?.position?.count || '?') + ' verts)';
    sel.appendChild(opt);
  });
  if (!meshes.length) {
    const opt = document.createElement('option');
    opt.textContent = 'No hay meshes — sube un modelo';
    sel.appendChild(opt);
  }
}

function isFaceLikeMesh(mesh) {
  const n = ((mesh.name || '') + ' ' + (mesh.parent && mesh.parent.name || '')).toLowerCase();
  const keys = ['face', 'head', 'eye', 'eyes', 'cara', 'cabeza', 'mouth', 'boca', 'hair_face', 'facial'];
  return keys.some((k) => n.indexOf(k) !== -1);
}

function getFaceTargetMeshes() {
  const mode = document.getElementById('faceTargetMode')?.value || 'auto';
  const meshes = listModelMeshes();
  if (!meshes.length) return [];

  if (mode === 'all') return meshes;

  if (mode === 'pick') {
    const sel = document.getElementById('faceMeshSelect');
    const idx = sel ? parseInt(sel.value, 10) : 0;
    if (meshes[idx]) return [meshes[idx]];
    return [];
  }

  // auto
  const liked = meshes.filter(isFaceLikeMesh);
  if (liked.length) return liked;

  // fallback: mesh más pequeño (a menudo la cara es menos polígonos que el cuerpo)
  // o el que tenga "body" excluido
  const nonBody = meshes.filter((m) => {
    const n = (m.name || '').toLowerCase();
    return n.indexOf('body') === -1 && n.indexOf('cuerpo') === -1 && n.indexOf('torso') === -1;
  });
  if (nonBody.length === 1) return nonBody;
  if (nonBody.length > 1) {
    nonBody.sort((a, b) => {
      const ca = a.geometry?.attributes?.position?.count || 0;
      const cb = b.geometry?.attributes?.position?.count || 0;
      return ca - cb;
    });
    return [nonBody[0]];
  }
  // último recurso: no aplicar a todo — pedir pick
  return [];
}

async function applyFaceStateToModel(id) {
  if (!currentModel) {
    alert('Sube un modelo primero');
    return;
  }
  const url = await getTransformedFaceDataUrl(id);
  if (!url) {
    alert('Esa expresión no tiene imagen todavía');
    return;
  }

  let targets = getFaceTargetMeshes();
  if (!targets.length) {
    refreshFaceMeshSelect();
    const modeEl = document.getElementById('faceTargetMode');
    if (modeEl) modeEl.value = 'pick';
    document.getElementById('faceMeshSelect')?.classList.remove('hidden');
    alert('No encontré un mesh de cara/cabeza por nombre.\\nElige el mesh a mano en “Elegir mesh…” y vuelve a Aplicar.');
    return;
  }

  backupFaceMaterials();
  const loader = new THREE.TextureLoader();
  loader.load(url, (texture) => {
    if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    const d = faceStateData[id];
    texture.offset.set(d.eyeOffX, d.eyeOffY);
    texture.repeat.set(d.eyeScale, d.eyeScale);
    currentModel.userData.lastTexture = texture;
    currentModel.userData.lastTexType = 'face';
    currentModel.userData.activeFaceState = id;
    currentModel.userData.faceTargetUuids = targets.map((m) => m.uuid);

    targets.forEach((mesh) => {
      // Clonar material para no pintar otros meshes que compartan el mismo material
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((mat) => {
          const nm = mat.clone();
          nm.map = texture;
          nm.needsUpdate = true;
          return nm;
        });
      } else if (mesh.material) {
        mesh.material = mesh.material.clone();
        mesh.material.map = texture;
        mesh.material.needsUpdate = true;
      }
    });

    console.log('Cara aplicada a', targets.map((t) => t.name || t.uuid));
  });
}

function applyEyeUVFromState(id) {
  const d = faceStateData[id] || { eyeOffX: 0, eyeOffY: 0, eyeScale: 1 };
  if (!currentModel) return;
  const uuids = currentModel.userData.faceTargetUuids;
  const ox = d.eyeOffX || 0;
  const oy = d.eyeOffY || 0;
  const sc = d.eyeScale || 1;
  currentModel.traverse((child) => {
    if (!child.isMesh) return;
    if (uuids && uuids.length && uuids.indexOf(child.uuid) === -1) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((mat) => {
      if (!mat || !mat.map) return;
      mat.map.wrapS = THREE.RepeatWrapping;
      mat.map.wrapT = THREE.RepeatWrapping;
      mat.map.offset.set(ox, oy);
      mat.map.repeat.set(sc, sc);
      mat.map.needsUpdate = true;
      mat.needsUpdate = true;
    });
  });
  // también lastTexture ref
  if (currentModel.userData.lastTexture) {
    const t = currentModel.userData.lastTexture;
    t.offset.set(ox, oy);
    t.repeat.set(sc, sc);
    t.needsUpdate = true;
  }
}

function clearFaceFromModel() {
  if (!currentModel) return;
  if (faceBackupMaterials && faceBackupMaterials.length) {
    faceBackupMaterials.forEach((entry) => {
      const mats = Array.isArray(entry.mesh.material) ? entry.mesh.material : null;
      if (entry.isArray && mats) {
        if (mats[entry.index]) {
          mats[entry.index].map = entry.map;
          mats[entry.index].needsUpdate = true;
        }
      } else if (entry.mesh.material) {
        entry.mesh.material.map = entry.map;
        entry.mesh.material.needsUpdate = true;
      }
    });
  }
  faceBackupMaterials = null;
  currentModel.userData.activeFaceState = null;
}

function readEyeSlidersToState(fromNum) {
  const d = faceStateData[selectedFaceStateId];
  if (!d) return;
  if (fromNum) {
    d.eyeOffX = parseFloat(document.getElementById('eyeOffXNum').value) || 0;
    d.eyeOffY = parseFloat(document.getElementById('eyeOffYNum').value) || 0;
    d.eyeScale = parseFloat(document.getElementById('eyeScaleNum').value) || 1;
    document.getElementById('eyeOffX').value = d.eyeOffX;
    document.getElementById('eyeOffY').value = d.eyeOffY;
    document.getElementById('eyeScale').value = d.eyeScale;
  } else {
    d.eyeOffX = parseFloat(document.getElementById('eyeOffX').value) || 0;
    d.eyeOffY = parseFloat(document.getElementById('eyeOffY').value) || 0;
    d.eyeScale = parseFloat(document.getElementById('eyeScale').value) || 1;
    const nx = document.getElementById('eyeOffXNum');
    const ny = document.getElementById('eyeOffYNum');
    const ns = document.getElementById('eyeScaleNum');
    if (nx) nx.value = d.eyeOffX;
    if (ny) ny.value = d.eyeOffY;
    if (ns) ns.value = d.eyeScale;
  }
  // También sincronizar faceOff viejos si existen
  const fox = document.getElementById('faceOffX');
  const foy = document.getElementById('faceOffY');
  const fsc = document.getElementById('faceScale');
  if (fox) fox.value = d.eyeOffX;
  if (foy) foy.value = d.eyeOffY;
  if (fsc) fsc.value = d.eyeScale;

  if (currentModel) {
    // aplicar UV siempre que haya textura de cara activa o lastTexture
    if (currentModel.userData.activeFaceState || currentModel.userData.lastTexture) {
      applyEyeUVFromState(selectedFaceStateId);
    }
  }
}

function bindFaceButtons() {
  document.getElementById('btnFaceRotL')?.addEventListener('click', () => {
    playSfx(sfxClick);
    const d = faceStateData[selectedFaceStateId];
    if (!d || !d.dataUrl) return;
    d.rotation = (d.rotation - 90 + 360) % 360;
    updateFaceThumb(selectedFaceStateId);
  });
  document.getElementById('btnFaceRotR')?.addEventListener('click', () => {
    playSfx(sfxClick);
    const d = faceStateData[selectedFaceStateId];
    if (!d || !d.dataUrl) return;
    d.rotation = (d.rotation + 90) % 360;
    updateFaceThumb(selectedFaceStateId);
  });
  document.getElementById('btnFaceFlipH')?.addEventListener('click', () => {
    playSfx(sfxClick);
    const d = faceStateData[selectedFaceStateId];
    if (!d || !d.dataUrl) return;
    d.flipH = !d.flipH;
    updateFaceThumb(selectedFaceStateId);
  });
  document.getElementById('btnFaceFlipV')?.addEventListener('click', () => {
    playSfx(sfxClick);
    const d = faceStateData[selectedFaceStateId];
    if (!d || !d.dataUrl) return;
    d.flipV = !d.flipV;
    updateFaceThumb(selectedFaceStateId);
  });
  document.getElementById('btnApplyFaceState')?.addEventListener('click', () => {
    playSfx(sfxClick);
    const id = document.getElementById('faceStatePreview')?.value || selectedFaceStateId;
    selectedFaceStateId = id;
    applyFaceStateToModel(id);
  });
  document.getElementById('btnClearFaceState')?.addEventListener('click', () => {
    playSfx(sfxClick);
    clearFaceFromModel();
  });
  document.getElementById('faceStatePreview')?.addEventListener('change', (e) => {
    selectFaceState(e.target.value);
    // auto preview if has image
    if (faceStateData[e.target.value]?.dataUrl) {
      applyFaceStateToModel(e.target.value);
    }
  });
  ['eyeOffX', 'eyeOffY', 'eyeScale'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', () => readEyeSlidersToState(false));
  });
  ['eyeOffXNum', 'eyeOffYNum', 'eyeScaleNum'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', () => readEyeSlidersToState(true));
    document.getElementById(id)?.addEventListener('change', () => readEyeSlidersToState(true));
  });
  document.getElementById('btnResetEyes')?.addEventListener('click', () => {
    playSfx(sfxClick);
    const d = faceStateData[selectedFaceStateId];
    if (!d) return;
    d.eyeOffX = 0;
    d.eyeOffY = 0;
    d.eyeScale = 1;
    selectFaceState(selectedFaceStateId);
    if (currentModel && currentModel.userData.activeFaceState === selectedFaceStateId) {
      applyEyeUVFromState(selectedFaceStateId);
    }
  });

  document.getElementById('faceTargetMode')?.addEventListener('change', (e) => {
    const pick = e.target.value === 'pick';
    const ms = document.getElementById('faceMeshSelect');
    if (ms) ms.classList.toggle('hidden', !pick);
    if (pick) refreshFaceMeshSelect();
  });
  document.getElementById('btnRefreshMeshes')?.addEventListener('click', () => {
    playSfx(sfxClick);
    refreshFaceMeshSelect();
    document.getElementById('faceMeshSelect')?.classList.remove('hidden');
  });
}

buildFaceStatesUI();
bindFaceButtons();


(function syncMusicBtn() {
  const b = document.getElementById('btnMusic');
  if (b) b.textContent = musicOn ? 'Música: ON' : 'Música: OFF';
})();


// ===== HUD PNG uploads =====
const hudFiles = {
  powerMeter: null,
  lifeIcon: null,
  courseIcon: null,
  transition: null,
};

const HUD_RECOMMENDED = {
  hudPowerMeter: { w: 64, h: 64, key: 'powerMeter', prev: 'prevPowerMeter', size: 'sizePowerMeter', name: 'power_meter.png' },
  hudLifeIcon: { w: [32, 64], h: [32, 64], key: 'lifeIcon', prev: 'prevLifeIcon', size: 'sizeLifeIcon', name: 'life_icon.png' },
  hudCourseIcon: { w: 64, h: 64, key: 'courseIcon', prev: 'prevCourseIcon', size: 'sizeCourseIcon', name: 'course_icon.png' },
  hudTransition: { w: null, h: null, key: 'transition', prev: 'prevTransition', size: 'sizeTransition', name: 'transition.png' },
};

function bindHudUpload(inputId, meta) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        hudFiles[meta.key] = { dataUrl, file, w, h, name: meta.name };
        const prev = document.getElementById(meta.prev);
        if (prev) {
          prev.textContent = '';
          prev.style.backgroundImage = 'url(' + dataUrl + ')';
        }
        const sizeEl = document.getElementById(meta.size);
        if (sizeEl) {
          sizeEl.textContent = w + '×' + h + ' px';
          sizeEl.className = 'hud-size';
          if (meta.w != null) {
            const okW = Array.isArray(meta.w) ? meta.w.includes(w) : w === meta.w;
            const okH = Array.isArray(meta.h) ? meta.h.includes(h) : h === meta.h;
            if (okW && okH) {
              sizeEl.textContent += ' ✓ tamaño recomendado';
            } else {
              sizeEl.className = 'hud-size warn';
              const rec = Array.isArray(meta.w)
                ? meta.w.map((x, i) => x + '×' + meta.h[i]).join(' o ')
                : meta.w + '×' + meta.h;
              sizeEl.textContent += ' (recomendado: ' + rec + ')';
            }
          }
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

Object.keys(HUD_RECOMMENDED).forEach((id) => bindHudUpload(id, HUD_RECOMMENDED[id]));


// ===== Categorías (rail izquierdo) =====
function setCategory(cat) {
  document.querySelectorAll('.cat-btn').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-cat') === cat);
  });
  // Visor 3D siempre
  document.querySelectorAll('.cat-panel').forEach(function (p) {
    const pc = p.getAttribute('data-cat');
    if (pc === 'model') {
      p.classList.add('active');
      return;
    }
    p.classList.toggle('active', pc === cat);
  });
  // Solo en model/textures: paneles izq/der (archivo, rig, texturas, pose)
  // En info/icons/sounds/export: solo el canvas 3D
  const clean = (cat !== 'model' && cat !== 'textures');
  document.body.classList.toggle('cat-mode-clean', clean);
  // En texturas, asegurar panel de texturas visible
  const tp = document.getElementById('texturesPanel');
  if (tp && cat === 'textures') {
    // si hay zip textures o no, mostrar panel de slots
    tp.classList.remove('hidden');
  }
  try { localStorage.setItem('cmg-cat', cat); } catch (e) {}
  setTimeout(function () {
    if (typeof onResize === 'function') onResize();
  }, 30);
}

document.querySelectorAll('.cat-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    const cat = btn.getAttribute('data-cat');
    if (!cat) return;
    if (typeof playSfx === 'function' && typeof sfxClick !== 'undefined') playSfx(sfxClick);
    setCategory(cat);
  });
});

(function initCategory() {
  let cat = 'model';
  try { cat = localStorage.getItem('cmg-cat') || 'model'; } catch (e) {}
  setCategory(cat);
})();


// ===== Boot screen + disclaimer =====
(function bootFlow() {
  const boot = document.getElementById('bootScreen');
  const bar = document.getElementById('bootBar');
  const hint = document.getElementById('bootHint');
  const disc = document.getElementById('disclaimerOverlay');
  if (!boot) return;

  const steps = [
    { p: 15, t: 'Cargando interfaz…' },
    { p: 35, t: 'Preparando visor 3D…' },
    { p: 55, t: 'Cargando Three.js…' },
    { p: 75, t: 'Listo casi…' },
    { p: 100, t: '¡Hecho!' },
  ];
  let i = 0;
  function tick() {
    if (i >= steps.length) {
      setTimeout(finishBoot, 280);
      return;
    }
    const s = steps[i++];
    if (bar) bar.style.width = s.p + '%';
    if (hint) hint.textContent = s.t;
    setTimeout(tick, 280 + Math.random() * 180);
  }
  function finishBoot() {
    boot.classList.add('fade-out');
    setTimeout(function () {
      boot.remove();
      // disclaimer una vez por navegador
      let ok = false;
      try { ok = localStorage.getItem('cmg-disclaimer') === '1'; } catch (e) {}
      if (!ok && disc) {
        disc.classList.remove('hidden');
      }
    }, 480);
  }
  // start after DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(tick, 100); });
  } else {
    setTimeout(tick, 100);
  }

  const btn = document.getElementById('btnAcceptDisclaimer');
  if (btn) {
    btn.addEventListener('click', function () {
      try { localStorage.setItem('cmg-disclaimer', '1'); } catch (e) {}
      if (disc) disc.classList.add('hidden');
      if (typeof playSfx === 'function' && typeof sfxClick !== 'undefined') playSfx(sfxClick);
    });
  }
})();


// Textura desde archivo local (no solo ZIP)
(function setupLocalTex() {
  const input = document.getElementById('localTexFile');
  if (!input) return;
  input.addEventListener('change', function () {
    const file = input.files && input.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    // zipTextures es el array global del script
    if (typeof zipTextures === 'undefined') {
      window.zipTextures = window.zipTextures || [];
    }
    const arr = (typeof zipTextures !== 'undefined') ? zipTextures : window.zipTextures;
    const index = arr.length;
    arr.push({ name: file.name, url: url, file: file, local: true });
    const list = document.getElementById('textureList');
    if (list) {
      const div = document.createElement('div');
      div.className = 'tex-item';
      div.dataset.index = String(index);
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      const span = document.createElement('span');
      span.textContent = file.name;
      div.appendChild(img);
      div.appendChild(span);
      div.addEventListener('click', function () {
        applyTextureManual(index);
      });
      list.appendChild(div);
    }
    const panel = document.getElementById('texturesPanel');
    if (panel) panel.classList.remove('hidden');
    applyTextureManual(index);
    if (typeof playSfx === 'function' && typeof sfxClick !== 'undefined') playSfx(sfxClick);
  });
})();

document.addEventListener('DOMContentLoaded', function () {
  const btn = document.getElementById('btnDetectTex');
  if (btn) {
    btn.addEventListener('click', function () {
      if (!currentModel) { alert('Sube un modelo primero'); return; }
      autoDetectModelTextures(currentModel, true);
      if (typeof playSfx === 'function' && typeof sfxClick !== 'undefined') playSfx(sfxClick);
    });
  }
});

(function wireJointPad() {
  const el = document.getElementById('exportJointPad');
  const val = document.getElementById('exportJointPadVal');
  if (!el || !val) return;
  const sync = function () { val.textContent = el.value; };
  el.addEventListener('input', sync);
  sync();
})();
