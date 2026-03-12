import * as THREE from 'three';
import { Timer } from 'three';
import GUI from 'lil-gui';

// --- Core Setup ---
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x0a0a0a);

// --- Orthographic Camera ---
let aspect = window.innerWidth / window.innerHeight;
const viewSize = 10;
const camera = new THREE.OrthographicCamera(
  -viewSize * aspect, viewSize * aspect,
  viewSize, -viewSize,
  0.1, 100
);
camera.position.z = 10;

const scene = new THREE.Scene();

// --- GUI Params ---
const params = {
  cols: 100,
  rows: 100,
  cellSize: 0.18,
  gap: 0.02,
  radius: 3.5,
  scaleBoost: 1.8,
  mouseEnabled: true,
  bgColor: '#080808',
  dimAmount: 0.55,
  animSpeed: 1.0,
  inputMode: 0,          // 0=rectangle, 1=star, 2=cross, 3=image, 4=video, 5=webcam
  crossThickness: 0.2,
  crossBarWidth: 0.5,
  crossBarPos: 0.65,
  starPoints: 5,
  starInnerRatio: 0.4,
  imageThreshold: 0.5,
  imageInvert: false,
  imageContrast: 1.0,
  imageBrightness: 0.0,
  imageSoftness: 0.1,
};

// --- Shader Uniforms (must be before resize handler) ---
const uniforms = {
  uMouse:      { value: new THREE.Vector2(9999, 9999) },
  uRadius:     { value: params.radius },
  uTime:       { value: 0.0 },
  uScaleBoost: { value: params.scaleBoost },
  uDim:        { value: params.dimAmount },
  uGridSize:   { value: new THREE.Vector2(1, 1) },
  uViewport:   { value: new THREE.Vector2(1, 1) },
  uFadeEdge:   { value: 3.5 },
  uBgColor:    { value: new THREE.Color(params.bgColor) },
  uContentSize: { value: new THREE.Vector2(1, 1) },
  uGridShape:   { value: 0 },
  uCrossArm:    { value: new THREE.Vector3(0.2, 0.5, 0.65) }, // x=thickness, y=barWidth, z=barPos
  uStarParams:  { value: new THREE.Vector2(5, 0.4) },    // x=points, y=innerRatio
  uMediaTex:    { value: null },
  uMediaEnabled: { value: 0 },
  uMediaThreshold: { value: 0.5 },
  uMediaInvert: { value: 0 },
  uMediaContrast: { value: 1.0 },
  uMediaBrightness: { value: 0.0 },
  uMediaSoftness: { value: 0.1 },
};

// --- Resize Handler ---
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  aspect = w / h;
  camera.left   = -viewSize * aspect;
  camera.right  =  viewSize * aspect;
  camera.top    =  viewSize;
  camera.bottom = -viewSize;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  uniforms.uViewport.value.set(viewSize * aspect, viewSize);
}
window.addEventListener('resize', onResize);
onResize();

// 8 pattern types:
// 0 = filled square
// 1 = filled circle
// 2 = cross
// 3 = diamond
// 4 = ring (circle outline)
// 5 = circle in square (nested)
// 6 = vertical lines
// 7 = dot grid

const vertexShader = /* glsl */ `
  attribute float aPattern;
  attribute float aScale;

  uniform vec2 uMouse;
  uniform float uRadius;
  uniform float uTime;
  uniform float uScaleBoost;
  uniform vec2 uGridSize;
  uniform vec2 uViewport;

  varying vec3 vColor;
  varying float vDist;
  varying vec2 vUv;
  varying float vPattern;
  varying vec2 vWorldPos;

  // GLSL mod that always returns positive (like fract behavior)
  vec2 wrapMod(vec2 v, vec2 s) {
    return mod(mod(v, s) + s, s);
  }

  void main() {
    vUv = uv;

    vec2 worldPos = vec2(instanceMatrix[3][0], instanceMatrix[3][1]);

    // Diagonal drift with wrapping — infinite scroll
    vec2 drift = vec2(uTime * 0.15, uTime * 0.1);
    vec2 halfGrid = uGridSize * 0.5;
    // Shift to 0..gridSize range, add drift, wrap, shift back to centered
    vec2 wrappedPos = wrapMod(worldPos + halfGrid + drift, uGridSize) - halfGrid;

    vWorldPos = wrappedPos;

    float dist = distance(wrappedPos, uMouse);
    float influence = 1.0 - smoothstep(0.0, uRadius, dist);

    // Ambient pulse: slow breathing based on position
    float phase = wrappedPos.x * 0.8 + wrappedPos.y * 0.6;
    float pulse = sin(uTime * 1.2 + phase) * 0.15 + 1.0;

    // Traveling wave
    float wave = sin(uTime * 0.8 - length(wrappedPos) * 0.5) * 0.1 + 1.0;

    float scale = aScale * pulse * wave * (1.0 + influence * uScaleBoost);
    vec3 scaled = position * scale;

    // Place at wrapped position (bypass original instanceMatrix position)
    vec4 worldVert = vec4(scaled.xy + wrappedPos, 0.0, 1.0);
    vec4 mvPosition = modelViewMatrix * worldVert;
    gl_Position = projectionMatrix * mvPosition;

    #ifdef USE_INSTANCING_COLOR
      vColor = instanceColor;
    #else
      vColor = vec3(1.0);
    #endif
    vDist = influence;
    vPattern = aPattern;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uDim;
  uniform float uTime;
  uniform vec2 uViewport;
  uniform float uFadeEdge;
  uniform vec3 uBgColor;
  uniform vec2 uContentSize;
  uniform float uGridShape;
  uniform vec3 uCrossArm;
  uniform vec2 uStarParams;
  uniform sampler2D uMediaTex;
  uniform float uMediaEnabled;
  uniform float uMediaThreshold;
  uniform float uMediaInvert;
  uniform float uMediaContrast;
  uniform float uMediaBrightness;
  uniform float uMediaSoftness;

  varying vec3 vColor;
  varying float vDist;
  varying vec2 vUv;
  varying float vPattern;
  varying vec2 vWorldPos;

  float sdCircle(vec2 p, float r) {
    return length(p) - r;
  }

  float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }

  float sdCross(vec2 p, float w, float h) {
    return min(sdBox(p, vec2(w, h)), sdBox(p, vec2(h, w)));
  }

  float sdDiamond(vec2 p, float s) {
    vec2 r = vec2(p.x + p.y, p.x - p.y) * 0.7071;
    return sdBox(r, vec2(s));
  }

  void main() {
    vec2 p = vUv - 0.5;
    float pat = floor(vPattern + 0.5);

    // Animated size modulation per shape
    float phase = vWorldPos.x * 1.3 - vWorldPos.y * 0.9;
    float sizeAnim = 0.35 + sin(uTime * 0.6 + phase) * 0.08;

    float shape = 1.0;
    vec3 baseCol = vColor;

    // Brightness wave across grid
    float brightWave = sin(uTime * 0.5 + vWorldPos.x * 0.4 + vWorldPos.y * 0.3) * 0.15;

    if (pat < 0.5) {
      // 0: Filled square
      shape = 1.0 - step(0.0, sdBox(p, vec2(sizeAnim + 0.07)));

    } else if (pat < 1.5) {
      // 1: Filled circle
      shape = 1.0 - step(0.0, sdCircle(p, sizeAnim + 0.07));

    } else if (pat < 2.5) {
      // 2: Cross — arms width animated
      float armW = 0.1 + sin(uTime * 0.9 + phase) * 0.03;
      shape = 1.0 - step(0.0, sdCross(p, armW, sizeAnim + 0.07));

    } else if (pat < 3.5) {
      // 3: Diamond
      shape = 1.0 - step(0.0, sdDiamond(p, sizeAnim));

    } else if (pat < 4.5) {
      // 4: Ring — thickness pulses
      float r = sizeAnim + 0.04;
      float thickness = 0.08 + sin(uTime * 1.1 + phase) * 0.03;
      float circle = sdCircle(p, r);
      shape = step(-thickness, circle) * (1.0 - step(0.0, circle));

    } else if (pat < 5.5) {
      // 5: Circle inside square
      float outerSize = sizeAnim + 0.08;
      float innerSize = sizeAnim * 0.6;
      float sq = 1.0 - step(0.0, sdBox(p, vec2(outerSize)));
      float circ = 1.0 - step(0.0, sdCircle(p, innerSize));
      float border = sq * (1.0 - (1.0 - step(0.0, sdBox(p, vec2(outerSize - 0.07)))));
      shape = max(border, circ);
      baseCol = mix(baseCol * 0.7, baseCol * 1.4, circ);

    } else if (pat < 6.5) {
      // 6: Stripes — scroll animation
      float sq = 1.0 - step(0.0, sdBox(p, vec2(sizeAnim + 0.07)));
      float scroll = uTime * 0.3 + phase * 0.2;
      float stripes = step(0.4, fract(p.x * 8.0 + scroll));
      shape = sq * stripes;

    } else {
      // 7: Dot grid — dots pulse
      float sq = 1.0 - step(0.0, sdBox(p, vec2(sizeAnim + 0.07)));
      vec2 gp = fract(p * 3.0 + 0.5) - 0.5;
      float dotR = 0.22 + sin(uTime * 1.4 + phase) * 0.06;
      float dots = 1.0 - step(0.0, sdCircle(gp, dotR));
      shape = sq * dots;
    }

    if (shape < 0.01) discard;

    // --- Grid shape mask ---
    vec2 absPos = abs(vWorldPos);
    float edgeFade = 1.0;
    float gridShapeId = floor(uGridShape + 0.5);

    if (gridShapeId < 0.5) {
      // 0: Rectangle
      vec2 fadeLimit = min(uViewport, uContentSize);
      float fadeX = smoothstep(fadeLimit.x + uFadeEdge, fadeLimit.x - uFadeEdge * 0.3, absPos.x);
      float fadeY = smoothstep(fadeLimit.y + uFadeEdge, fadeLimit.y - uFadeEdge * 0.3, absPos.y);
      edgeFade = fadeX * fadeY;

    } else if (gridShapeId < 1.5) {
      // 1: Latin (Catholic) cross — crossbar offset upward
      float sz = min(uContentSize.x, uContentSize.y);
      float thickness = sz * uCrossArm.x;    // half-thickness of bars
      float barHalfW = sz * uCrossArm.y;     // half-width of horizontal bar
      float barY = sz * (uCrossArm.z * 2.0 - 1.0); // vertical offset (-sz..+sz)
      // Vertical bar: full height
      float dV = sdBox(vWorldPos, vec2(thickness, sz));
      // Horizontal bar: offset upward
      float dH = sdBox(vWorldPos - vec2(0.0, barY), vec2(barHalfW, thickness));
      float crossDist = min(dH, dV);
      edgeFade = smoothstep(uFadeEdge, -uFadeEdge * 0.3, crossDist);

    } else {
      // 2: Star
      float nPoints = uStarParams.x;
      float innerRatio = uStarParams.y;
      float sz = min(uContentSize.x, uContentSize.y);
      // Star SDF
      vec2 sp = vWorldPos;
      float angle = atan(sp.y, sp.x);
      float r = length(sp);
      float sliceAngle = 3.14159265 / nPoints;
      float a = mod(angle + sliceAngle, 2.0 * sliceAngle) - sliceAngle;
      // Outer and inner radius
      float outerR = sz;
      float innerR = sz * innerRatio;
      // Star boundary via alternating radii
      float cosA = cos(a);
      float starR = outerR * innerR / mix(innerR, outerR, (cos(a * nPoints) * 0.5 + 0.5));
      // Simpler: use polygon-based star SDF
      float segAngle = 3.14159265 * 2.0 / nPoints;
      float halfSeg = segAngle * 0.5;
      float ma = mod(angle + halfSeg, segAngle) - halfSeg;
      float outerEdge = outerR * cos(halfSeg) / cos(ma);
      // Interpolate between outer and inner for star shape
      float t = abs(ma) / halfSeg; // 0 at tip, 1 at valley
      float starEdge = mix(outerR, innerR, t);
      float starDist = r - starEdge;
      edgeFade = smoothstep(uFadeEdge, -uFadeEdge * 0.3, starDist);
    }

    edgeFade = edgeFade * edgeFade * (3.0 - 2.0 * edgeFade);
    if (edgeFade < 0.005) discard;

    // --- Media threshold mask (image/video/webcam) ---
    if (uMediaEnabled > 0.5) {
      vec2 imgUV = vWorldPos / (uContentSize * 2.0) + 0.5;
      if (imgUV.x < 0.0 || imgUV.x > 1.0 || imgUV.y < 0.0 || imgUV.y > 1.0) discard;
      vec3 imgCol = texture2D(uMediaTex, imgUV).rgb;
      float imgBright = dot(imgCol, vec3(0.299, 0.587, 0.114));
      imgBright = clamp((imgBright - 0.5) * uMediaContrast + 0.5 + uMediaBrightness, 0.0, 1.0);
      float mask = uMediaInvert > 0.5 ? 1.0 - imgBright : imgBright;
      float imgFade = smoothstep(uMediaThreshold - uMediaSoftness, uMediaThreshold + uMediaSoftness, mask);
      if (imgFade < 0.005) discard;
      edgeFade *= imgFade;
    }

    float brightness = mix(uDim, 1.0, 0.3 + vDist * 0.7) + brightWave;
    vec3 col = baseCol * brightness;
    col = mix(uBgColor, col, edgeFade);

    gl_FragColor = vec4(col, 1.0);
  }
`;

const baseMat = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms,
  transparent: true,
});

// --- Warm Palette (inspired by refs) ---
const palette = [
  0xff3b30, // red
  0xff6b35, // orange
  0xffcc00, // yellow
  0xff2d55, // hot pink
  0xf5a0c0, // soft pink
  0x4cd964, // green
  0x30d158, // bright green
  0x5ac8fa, // sky blue
  0xaf52de, // purple
  0xff9500, // amber
  0xe8d44d, // warm yellow
  0xc75050, // dark red
];

// --- Seeded pseudo-random for deterministic patterns ---
function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// --- Grid Builder ---
let grid = null;
const dummy = new THREE.Matrix4();
const color = new THREE.Color();

function buildGrid() {
  if (grid) {
    grid.geometry.dispose();
    scene.remove(grid);
  }

  const { cols, rows, cellSize, gap } = params;
  const step = cellSize + gap;
  // Add padding for smooth edge fade
  const padding = Math.ceil(4.0 / step);
  const totalCols = cols + padding * 2;
  const totalRows = rows + padding * 2;
  const total = totalCols * totalRows;

  const geo = new THREE.PlaneGeometry(cellSize, cellSize);

  const patternArray = new Float32Array(total);
  const scaleArray = new Float32Array(total);
  const rand = mulberry32(42); // deterministic seed

  for (let i = 0; i < total; i++) {
    const c = i % totalCols;
    const r = Math.floor(i / totalCols);
    const hash = rand();
    patternArray[i] = Math.floor(hash * 8);

    const sizeRoll = rand();
    if (sizeRoll > 0.92) {
      scaleArray[i] = 1.3 + rand() * 0.7;
    } else if (sizeRoll > 0.7) {
      scaleArray[i] = 0.9 + rand() * 0.3;
    } else {
      scaleArray[i] = 0.5 + rand() * 0.4;
    }
  }

  geo.setAttribute('aPattern', new THREE.InstancedBufferAttribute(patternArray, 1));
  geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(scaleArray, 1));

  grid = new THREE.InstancedMesh(geo, baseMat, total);

  // Wrapping domain = the padded grid size
  const gridW = totalCols * step;
  const gridH = totalRows * step;
  uniforms.uGridSize.value.set(gridW, gridH);
  // Content size = user-defined grid (without padding) for edge fade
  uniforms.uContentSize.value.set(cols * step * 0.5, rows * step * 0.5);

  const offsetX = (totalCols - 1) * step * 0.5;
  const offsetY = (totalRows - 1) * step * 0.5;

  for (let i = 0; i < total; i++) {
    const c = i % totalCols;
    const r = Math.floor(i / totalCols);

    dummy.makeScale(1, 1, 1);
    dummy.setPosition(c * step - offsetX, r * step - offsetY, 0);
    grid.setMatrixAt(i, dummy);

    const cx = c / totalCols;
    const cy = r / totalRows;
    const noiseVal = Math.sin(cx * 12.0 + cy * 8.0) * Math.cos(cy * 15.0 - cx * 6.0);
    const palIdx = Math.floor((noiseVal * 0.5 + 0.5) * palette.length) % palette.length;
    // Add slight variation
    const variation = rand();
    const baseColor = palette[(palIdx + Math.floor(variation * 3)) % palette.length];
    color.set(baseColor);
    // Slight HSL variation for richness
    const hsl = {};
    color.getHSL(hsl);
    hsl.l = Math.max(0.15, Math.min(0.85, hsl.l + (variation - 0.5) * 0.2));
    hsl.s = Math.max(0.3, Math.min(1.0, hsl.s + (variation - 0.5) * 0.15));
    color.setHSL(hsl.h, hsl.s, hsl.l);

    grid.setColorAt(i, color);
  }

  grid.instanceMatrix.needsUpdate = true;
  grid.instanceColor.needsUpdate = true;
  scene.add(grid);
}

buildGrid();

// --- Media sources ---
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = 'image/*';
fileInput.style.display = 'none';
document.body.appendChild(fileInput);

const videoInput = document.createElement('input');
videoInput.type = 'file';
videoInput.accept = 'video/*';
videoInput.style.display = 'none';
document.body.appendChild(videoInput);

const videoEl = document.createElement('video');
videoEl.playsInline = true;
videoEl.muted = true;
videoEl.loop = true;
videoEl.style.display = 'none';

let mediaTexture = null;
let webcamStream = null;

function disposeMedia() {
  if (webcamStream) {
    webcamStream.getTracks().forEach(t => t.stop());
    webcamStream = null;
  }
  videoEl.pause();
  videoEl.srcObject = null;
  videoEl.src = '';
  if (mediaTexture) {
    mediaTexture.dispose();
    mediaTexture = null;
  }
  uniforms.uMediaTex.value = null;
  uniforms.uMediaEnabled.value = 0;
}

function setMediaTexture(tex) {
  if (mediaTexture) mediaTexture.dispose();
  mediaTexture = tex;
  uniforms.uMediaTex.value = tex;
  uniforms.uMediaEnabled.value = 1;
}

function activateInput(mode) {
  disposeMedia();
  uniforms.uGridShape.value = 0;

  // Hide all sub-folders
  crossFolder.show(false);
  starFolder.show(false);
  mediaSettingsFolder.show(false);

  if (mode === 0) {
    // Rectangle — default shape
    uniforms.uGridShape.value = 0;
  } else if (mode === 1) {
    // Star
    uniforms.uGridShape.value = 2;
    starFolder.show(true);
  } else if (mode === 2) {
    // Cross
    uniforms.uGridShape.value = 1;
    crossFolder.show(true);
  } else if (mode === 3) {
    // Image
    mediaSettingsFolder.show(true);
    loadFileBtn.show(true);
    fileInput.click();
  } else if (mode === 4) {
    // Video
    mediaSettingsFolder.show(true);
    loadFileBtn.show(true);
    videoInput.click();
  } else if (mode === 5) {
    // Webcam
    loadFileBtn.show(false);
    startWebcam();
  }
}

function startWebcam() {
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
    .then(stream => {
      webcamStream = stream;
      videoEl.srcObject = stream;
      videoEl.play();
      const tex = new THREE.VideoTexture(videoEl);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      setMediaTexture(tex);
      mediaSettingsFolder.show(true);
      loadFileBtn.show(false);
    })
    .catch(err => console.warn('Webcam access denied:', err));
}

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    const tex = new THREE.Texture(img);
    tex.needsUpdate = true;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    setMediaTexture(tex);
    mediaSettingsFolder.show(true);
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(file);
  fileInput.value = '';
});

videoInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  videoEl.src = url;
  videoEl.play();
  const tex = new THREE.VideoTexture(videoEl);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  setMediaTexture(tex);
  mediaSettingsFolder.show(true);
  videoInput.value = '';
});

// --- lil-gui ---
const gui = new GUI({ title: 'MALAI Controls' });

// --- Input (first folder) ---
const inputFolder = gui.addFolder('Input');
inputFolder.add(params, 'inputMode', {
  Rectangle: 0, Star: 1, Cross: 2, Image: 3, Video: 4, Webcam: 5
}).name('Mode').onChange(v => {
  params.inputMode = Number(v);
  activateInput(params.inputMode);
});

const crossFolder = inputFolder.addFolder('Cross');
crossFolder.add(params, 'crossThickness', 0.05, 0.5, 0.01).name('Thickness').onChange(v => {
  uniforms.uCrossArm.value.x = v;
});
crossFolder.add(params, 'crossBarWidth', 0.2, 1.0, 0.01).name('Bar Width').onChange(v => {
  uniforms.uCrossArm.value.y = v;
});
crossFolder.add(params, 'crossBarPos', 0.3, 0.9, 0.01).name('Bar Position').onChange(v => {
  uniforms.uCrossArm.value.z = v;
});
crossFolder.show(false);

const starFolder = inputFolder.addFolder('Star');
starFolder.add(params, 'starPoints', 3, 12, 1).name('Points').onChange(v => {
  uniforms.uStarParams.value.x = v;
});
starFolder.add(params, 'starInnerRatio', 0.1, 0.9, 0.01).name('Inner Ratio').onChange(v => {
  uniforms.uStarParams.value.y = v;
});
starFolder.show(false);

const mediaSettingsFolder = inputFolder.addFolder('Media Settings');
const loadFileBtn = mediaSettingsFolder.add({ load: () => {
  if (params.inputMode === 3) fileInput.click();
  else if (params.inputMode === 4) videoInput.click();
}}, 'load').name('Load File');
mediaSettingsFolder.add(params, 'imageThreshold', 0.0, 1.0, 0.01).name('Threshold').onChange(v => {
  uniforms.uMediaThreshold.value = v;
});
mediaSettingsFolder.add(params, 'imageContrast', 0.5, 5.0, 0.1).name('Contrast').onChange(v => {
  uniforms.uMediaContrast.value = v;
});
mediaSettingsFolder.add(params, 'imageBrightness', -0.5, 0.5, 0.01).name('Brightness').onChange(v => {
  uniforms.uMediaBrightness.value = v;
});
mediaSettingsFolder.add(params, 'imageSoftness', 0.0, 0.5, 0.01).name('Softness').onChange(v => {
  uniforms.uMediaSoftness.value = v;
});
mediaSettingsFolder.add(params, 'imageInvert').name('Invert').onChange(v => {
  uniforms.uMediaInvert.value = v ? 1 : 0;
});
mediaSettingsFolder.show(false);

const gridFolder = gui.addFolder('Grid');
gridFolder.add(params, 'cols', 10, 600, 1).name('Columns').onFinishChange(buildGrid);
gridFolder.add(params, 'rows', 10, 600, 1).name('Rows').onFinishChange(buildGrid);
gridFolder.add(params, 'cellSize', 0.1, 0.5, 0.01).name('Cell Size').onFinishChange(buildGrid);
gridFolder.add(params, 'gap', 0.0, 0.15, 0.005).name('Gap').onFinishChange(buildGrid);

const fxFolder = gui.addFolder('Mouse Interaction');
fxFolder.add(params, 'mouseEnabled').name('Enabled').onChange(v => {
  if (!v) uniforms.uMouse.value.set(9999, 9999);
});
fxFolder.add(params, 'radius', 0.5, 10, 0.1).name('Radius').onChange(v => {
  uniforms.uRadius.value = v;
});
fxFolder.add(params, 'scaleBoost', 0.0, 4.0, 0.1).name('Scale Boost').onChange(v => {
  uniforms.uScaleBoost.value = v;
});

const styleFolder = gui.addFolder('Style');
styleFolder.addColor(params, 'bgColor').name('Background').onChange(v => {
  const c = new THREE.Color(v);
  renderer.setClearColor(c);
  uniforms.uBgColor.value.copy(c);
});
styleFolder.add(params, 'dimAmount', 0.0, 1.0, 0.05).name('Dim Amount').onChange(v => {
  uniforms.uDim.value = v;
});
styleFolder.add(params, 'animSpeed', -10.0, 10.0, 0.1).name('Anim Speed');

// --- Pointer → World ---
function screenToWorld(clientX, clientY) {
  const ndcX = (clientX / window.innerWidth) * 2 - 1;
  const ndcY = -(clientY / window.innerHeight) * 2 + 1;
  return new THREE.Vector2(ndcX * viewSize * aspect, ndcY * viewSize);
}

canvas.addEventListener('pointermove', (e) => {
  if (params.mouseEnabled) {
    uniforms.uMouse.value.copy(screenToWorld(e.clientX, e.clientY));
  }
});

canvas.addEventListener('pointerleave', () => {
  uniforms.uMouse.value.set(9999, 9999);
});

canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

// --- Render Loop ---
const timer = new Timer();
let accumulatedTime = 0;

function animate() {
  timer.update();
  accumulatedTime += timer.getDelta() * params.animSpeed;
  uniforms.uTime.value = accumulatedTime;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
