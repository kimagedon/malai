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
  dimAmount: 1.0,
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
  textParticles: false,
  textString: 'MALAI',
  textLayout: 1,           // 0=random, 1=sequential (repeating text)
  textMaskString: 'MALAI',
  atlasFont: 'monospace',
  maskFont: 'sans-serif',
  particlePreset: 'Default',
  particleScale: 1.0,
  particleAngle: 0.0,
  layoutRandomMode: 'Auto',
  highDetailedMode: false,
  lowDetailedMode: false,
  spiralSpeed: 3.0,
  flowSpeedX: 0.15,
  flowSpeedY: 0.1,
  pulseAmplitude: 0.15,
  pulseFrequency: 1.2,
  waveAmplitude: 0.1,
  waveFrequency: 0.8,
  colorScheme: 'Thermal',
  gradientEnabled: false,
  gradientPreset: 'Monochrome',
  rippleEnabled: true,
  rippleStrength: 2.5,
  rippleSpeed: 7.5,
  rippleDecay: 2.0,
  rippleWidth: 1.5,
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
  uFontAtlas: { value: null },
  uTextEnabled: { value: 0 },
  uAtlasCols: { value: 1 },
  uAtlasRows: { value: 1 },
  uParticleTex: { value: null },
  uImageParticleEnabled: { value: 0 },
  uFlowSpeed: { value: new THREE.Vector2(0.15, 0.1) },
  uPulseAmp: { value: 0.15 },
  uPulseFreq: { value: 1.2 },
  uWaveAmp: { value: 0.1 },
  uWaveFreq: { value: 0.8 },
  uRipples: { value: [
    new THREE.Vector4(0, 0, -100, 0),
    new THREE.Vector4(0, 0, -100, 0),
    new THREE.Vector4(0, 0, -100, 0),
    new THREE.Vector4(0, 0, -100, 0),
    new THREE.Vector4(0, 0, -100, 0),
  ]},
  uRippleStrength: { value: 2.5 },
  uRippleSpeed: { value: 7.5 },
  uRippleDecay: { value: 2.0 },
  uRippleWidth: { value: 1.5 },
  uGradientEnabled: { value: 0 },
  uGradColorA: { value: new THREE.Color('#ffffff') },
  uGradColorB: { value: new THREE.Color('#888888') },
  uGradColorC: { value: new THREE.Color('#222222') },
  uGradientMode: { value: 0 },
  uParticleRotation: { value: 0 },
  uParticleScale: { value: 1.0 },
  uParticleAngle: { value: 0.0 },
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
  uniform vec2 uFlowSpeed;
  uniform float uPulseAmp;
  uniform float uPulseFreq;
  uniform float uWaveAmp;
  uniform float uWaveFreq;
  uniform vec4 uRipples[5];
  uniform float uRippleStrength;
  uniform float uRippleSpeed;
  uniform float uRippleDecay;
  uniform float uRippleWidth;
  uniform float uParticleScale;

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
    vec2 drift = uTime * uFlowSpeed;
    vec2 halfGrid = uGridSize * 0.5;
    // Shift to 0..gridSize range, add drift, wrap, shift back to centered
    vec2 wrappedPos = wrapMod(worldPos + halfGrid + drift, uGridSize) - halfGrid;

    vWorldPos = wrappedPos;

    float dist = distance(wrappedPos, uMouse);
    float influence = 1.0 - smoothstep(0.0, uRadius, dist);

    // Ambient pulse: slow breathing based on position
    float phase = wrappedPos.x * 0.8 + wrappedPos.y * 0.6;
    float pulse = sin(uTime * uPulseFreq + phase) * uPulseAmp + 1.0;

    // Traveling wave
    float wave = sin(uTime * uWaveFreq - length(wrappedPos) * 0.5) * uWaveAmp + 1.0;

    // Click ripple waves
    float ripple = 0.0;
    for (int i = 0; i < 5; i++) {
      vec4 rp = uRipples[i];
      if (rp.w < 0.5) continue; // inactive
      float age = uTime - rp.z;
      float d = distance(wrappedPos, rp.xy);
      float front = age * uRippleSpeed;
      float ring = exp(-pow((d - front) / uRippleWidth, 2.0));
      float decay = exp(-age * uRippleDecay);
      ripple += ring * decay * uRippleStrength;
    }

    float scale = aScale * pulse * wave * (1.0 + influence * uScaleBoost + ripple) * uParticleScale;
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
  uniform sampler2D uFontAtlas;
  uniform float uTextEnabled;
  uniform float uAtlasCols;
  uniform float uAtlasRows;
  uniform sampler2D uParticleTex;
  uniform float uImageParticleEnabled;
  uniform float uGradientEnabled;
  uniform vec3 uGradColorA;
  uniform vec3 uGradColorB;
  uniform vec3 uGradColorC;
  uniform float uGradientMode;
  uniform vec2 uGridSize;
  uniform float uParticleRotation;
  uniform float uParticleAngle;
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
    float ca = cos(uParticleAngle);
    float sa = sin(uParticleAngle);
    vec2 p = vUv - 0.5;
    if (abs(uParticleAngle) > 0.001) {
       p = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);
    }
    float pat = floor(vPattern + 0.5);

    // Animated size modulation per shape
    float phase = vWorldPos.x * 1.3 - vWorldPos.y * 0.9;
    float sizeAnim = 0.35 + sin(uTime * 0.6 + phase) * 0.08;

    float shape = 1.0;
    vec3 baseCol = vColor;

    // Brightness wave across grid
    float brightWave = sin(uTime * 0.5 + vWorldPos.x * 0.4 + vWorldPos.y * 0.3) * 0.15;

    if (uImageParticleEnabled > 0.5) {
      // Particle preset mode — sample shape from canvas texture, keep instance color
      vec2 pUv = vUv;
      float totalAngle = uParticleAngle;
      if (abs(uParticleRotation) > 0.001) {
        totalAngle += uTime * uParticleRotation;
      }
      if (abs(totalAngle) > 0.001) {
        vec2 center = pUv - 0.5;
        float cs = cos(totalAngle);
        float sn = sin(totalAngle);
        pUv = vec2(center.x * cs - center.y * sn, center.x * sn + center.y * cs) + 0.5;
      }
      float alpha = texture2D(uParticleTex, pUv).a;
      shape = step(0.1, alpha);

    } else if (uTextEnabled > 0.5) {
      // Text particle mode — sample character from font atlas
      float charIdx = pat;
      float col = mod(charIdx, uAtlasCols);
      float row = floor(charIdx / uAtlasCols);
      vec2 cellUV = vUv; // 0..1 within particle quad
      if (abs(uParticleAngle) > 0.001) {
         vec2 center = cellUV - 0.5;
         cellUV = vec2(center.x * ca - center.y * sa, center.x * sa + center.y * ca) + 0.5;
      }
      vec2 atlasUV = vec2(
        (col + cellUV.x) / uAtlasCols,
        (row + (1.0 - cellUV.y)) / uAtlasRows
      );
      float alpha = texture2D(uFontAtlas, atlasUV).r;
      shape = step(0.3, alpha);

    } else if (pat < 0.5) {
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

    // --- Gradient overlay ---
    if (uGradientEnabled > 0.5) {
      vec2 normPos = vWorldPos / (uGridSize * 0.5);
      float gradMode = floor(uGradientMode + 0.5);
      float t;
      if (gradMode < 0.5) {
        t = normPos.x * 0.5 + 0.5;          // horizontal
      } else if (gradMode < 1.5) {
        t = normPos.y * 0.5 + 0.5;          // vertical
      } else if (gradMode < 2.5) {
        t = length(normPos) * 0.707;         // radial
      } else {
        t = (normPos.x + normPos.y) * 0.25 + 0.5; // diagonal
      }
      t = clamp(t, 0.0, 1.0);
      vec3 gradCol = t < 0.5
        ? mix(uGradColorA, uGradColorB, t * 2.0)
        : mix(uGradColorB, uGradColorC, (t - 0.5) * 2.0);
      baseCol = gradCol;
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

// --- Color Schemes ---
const colorSchemes = {
  Thermal: [
    0xff3b30, 0xff6b35, 0xffcc00, 0xff2d55, 0xf5a0c0,
    0x4cd964, 0x30d158, 0x5ac8fa, 0xaf52de, 0xff9500,
    0xe8d44d, 0xc75050,
  ],
  'Neon Magenta': [
    0xff00ff, 0x00ffff, 0xffff00, 0xff0066, 0x6600ff,
    0x00ff99, 0xff3399, 0x33ffcc, 0xcc00ff, 0x00ccff,
  ],
  'Retro Sunset': [
    0xff6b35, 0xf7c59f, 0xef8354, 0x2d6a4f, 0x1a535c,
    0xbc4749, 0xf2cc8f, 0xe07a5f, 0x3d405b, 0x81b29a,
  ],
  Forest: [
    0x2d6a4f, 0x40916c, 0x52b788, 0x74c69d, 0x95d5b2,
    0xb7e4c7, 0xd8f3dc, 0x1b4332, 0x345e3b, 0x588157,
  ],
  Monochrome: [
    0xffffff, 0xdddddd, 0xbbbbbb, 0x999999, 0x777777,
    0x555555, 0x333333, 0xaaaaaa, 0xcccccc, 0x666666,
  ],
  Ocean: [
    0x03045e, 0x023e8a, 0x0077b6, 0x0096c7, 0x00b4d8,
    0x48cae4, 0x90e0ef, 0xade8f4, 0xcaf0f8, 0x0466c8,
  ],
  Neon: [
    0xff006e, 0xfb5607, 0xffbe0b, 0x8338ec, 0x3a86ff,
    0x06d6a0, 0xff4cc3, 0x7209b7, 0xf72585, 0x4cc9f0,
  ],
  Lava: [
    0xff0000, 0xff4400, 0xff8800, 0xffaa00, 0xffcc00,
    0xffee00, 0xcc3300, 0x991100, 0xff6600, 0xffdd33,
  ],
  Pastel: [
    0xffadad, 0xffd6a5, 0xfdffb6, 0xcaffbf, 0x9bf6ff,
    0xa0c4ff, 0xbdb2ff, 0xffc6ff, 0xfffffc, 0xfee2e2,
  ],
  Arctic: [
    0xe0f7fa, 0xb2ebf2, 0x80deea, 0x4dd0e1, 0x26c6da,
    0x00bcd4, 0x00acc1, 0x0097a7, 0x00838f, 0x006064,
  ],
  Candy: [
    0xff6f91, 0xff9671, 0xffc75f, 0xf9f871, 0xd65db1,
    0x845ec2, 0x2c73d2, 0x0089ba, 0x008e9b, 0x00c9a7,
  ],
  Rust: [
    0x6e3b3b, 0x8b4513, 0xa0522d, 0xb8733e, 0xcd853f,
    0xd2a679, 0xdeb887, 0xc97f4f, 0x964b00, 0x7a3b2e,
  ],
  Vaporwave: [
    0xff71ce, 0x01cdfe, 0x05ffa1, 0xb967ff, 0xfffb96,
    0xff6eb4, 0x7afcff, 0xfeff9c, 0xc774e8, 0x00f5d4,
  ],
  Galaxy: [
    0x1a0533, 0x2d1b69, 0x4b0082, 0x6a0dad, 0x8b00ff,
    0x9b30ff, 0xba55d3, 0xda70d6, 0xee82ee, 0x4169e1,
  ],
  Autumn: [
    0x8b0000, 0xb22222, 0xcc5500, 0xd2691e, 0xdaa520,
    0xe8b830, 0xf0c040, 0x556b2f, 0x6b8e23, 0x8b4513,
  ],
};

let palette = colorSchemes[params.colorScheme];

// --- Font System (Google Fonts + Custom) ---
const googleFonts = [
  'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Oswald', 'Raleway', 'Poppins',
  'Noto Sans', 'Ubuntu', 'Nunito', 'Playfair Display', 'Merriweather', 'PT Sans',
  'Rubik', 'Work Sans', 'Fira Sans', 'Quicksand', 'Barlow', 'Mulish', 'Karla',
  'Inter', 'Josefin Sans', 'Cabin', 'DM Sans', 'Outfit', 'Space Grotesk',
  'IBM Plex Sans', 'Archivo', 'Manrope', 'Red Hat Display', 'Sora', 'Lexend',
  'Plus Jakarta Sans', 'Albert Sans', 'Figtree',
  'Bebas Neue', 'Anton', 'Teko', 'Russo One', 'Orbitron', 'Black Ops One',
  'Bungee', 'Permanent Marker', 'Bangers', 'Righteous', 'Passion One',
  'Fredoka One', 'Pacifico', 'Lobster', 'Dancing Script', 'Caveat', 'Satisfy',
  'Great Vibes', 'Sacramento', 'Kaushan Script', 'Cookie',
  'Roboto Mono', 'Fira Code', 'JetBrains Mono', 'Source Code Pro', 'Space Mono',
  'IBM Plex Mono', 'Inconsolata', 'Ubuntu Mono',
  'Noto Sans JP', 'Noto Sans KR', 'Noto Sans SC', 'Noto Sans TC',
  'Noto Sans Arabic', 'Noto Sans Hebrew', 'Noto Sans Thai', 'Noto Sans Devanagari',
  'Press Start 2P', 'VT323', 'Silkscreen', 'Pixelify Sans',
  'Cormorant Garamond', 'Libre Baskerville', 'EB Garamond', 'Lora', 'Crimson Text',
  'Abril Fatface', 'Cinzel', 'Bodoni Moda',
  'Comfortaa', 'Varela Round', 'Baloo 2', 'Fredoka', 'Sniglet',
  'Titan One', 'Lilita One', 'Bungee Shade', 'Bungee Inline',
  'Special Elite', 'Courier Prime', 'Cutive Mono', 'Major Mono Display',
].sort();

const systemFonts = ['monospace', 'sans-serif', 'serif', 'cursive', 'fantasy'];
const allFontChoices = {};
allFontChoices['Custom font file…'] = '__custom__';
allFontChoices['─── System ───'] = '__sep_sys__';
systemFonts.forEach(f => { allFontChoices[f] = f; });
allFontChoices['─── Google Fonts ───'] = '__sep_gf__';
googleFonts.forEach(f => { allFontChoices[f] = f; });

const loadedGoogleFonts = new Set();

async function loadGoogleFont(fontName) {
  if (loadedGoogleFonts.has(fontName)) return;
  loadedGoogleFonts.add(fontName);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;700&display=swap`;
  document.head.appendChild(link);
  await new Promise(r => { link.onload = r; link.onerror = r; });
  await document.fonts.load(`bold 96px "${fontName}"`);
}

const fontFileInput = document.createElement('input');
fontFileInput.type = 'file';
fontFileInput.accept = '.ttf,.otf,.woff,.woff2';
fontFileInput.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;';
document.body.appendChild(fontFileInput);

let pendingFontApply = null;

fontFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  const pending = pendingFontApply;
  pendingFontApply = null;
  if (!file || !pending) {
    fontFileInput.value = '';
    return;
  }
  const fontName = file.name.replace(/\.[^.]+$/, '');
  const buffer = await file.arrayBuffer();
  const face = new FontFace(fontName, buffer);
  await face.load();
  document.fonts.add(face);
  params[pending.paramKey] = fontName;
  pending.rebuild();
  pending.btnCtrl.show(false);
  fontFileInput.value = '';
});

fontFileInput.addEventListener('cancel', () => {
  if (pendingFontApply) pendingFontApply.btnCtrl.show(false);
  pendingFontApply = null;
  fontFileInput.value = '';
});

function setupFontControl(folder, paramKey, rebuild) {
  const ctrl = folder.add(params, paramKey, allFontChoices).name('Font');
  const btnObj = { choose() { pendingFontApply = { paramKey, rebuild, ctrl, btnCtrl }; fontFileInput.click(); } };
  const btnCtrl = folder.add(btnObj, 'choose').name('Choose file…');
  btnCtrl.show(false);

  ctrl.onChange(v => {
    if (v === '__sep_sys__' || v === '__sep_gf__') {
      ctrl.setValue(params[paramKey]);
      return;
    }
    if (v === '__custom__') {
      ctrl.setValue(params[paramKey]);
      btnCtrl.show(true);
      return;
    }
    btnCtrl.show(false);
    if (!systemFonts.includes(v)) {
      loadGoogleFont(v).then(() => { params[paramKey] = v; rebuild(); });
      return;
    }
    params[paramKey] = v;
    rebuild();
  });

  return { ctrl, btnCtrl };
}

// --- Font Atlas Generator ---
let fontAtlasTexture = null;
let fontAtlasChars = '';

function buildFontAtlas(str) {
  const uniqueChars = [...new Set(str)];
  fontAtlasChars = uniqueChars.join('');
  const numChars = uniqueChars.length;
  const cols = Math.ceil(Math.sqrt(numChars));
  const rows = Math.ceil(numChars / cols);
  const cellPx = 128;
  const atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = cols * cellPx;
  atlasCanvas.height = rows * cellPx;
  const ctx = atlasCanvas.getContext('2d');
  ctx.clearRect(0, 0, atlasCanvas.width, atlasCanvas.height);
  ctx.fillStyle = '#ffffff';
  const atlasF = systemFonts.includes(params.atlasFont) ? params.atlasFont : `"${params.atlasFont}"`;
  ctx.font = `bold ${cellPx * 0.75}px ${atlasF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < numChars; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = c * cellPx + cellPx * 0.5;
    const y = r * cellPx + cellPx * 0.5;
    ctx.fillText(uniqueChars[i], x, y);
  }
  if (fontAtlasTexture) fontAtlasTexture.dispose();
  fontAtlasTexture = new THREE.CanvasTexture(atlasCanvas);
  fontAtlasTexture.flipY = false;
  fontAtlasTexture.minFilter = THREE.LinearFilter;
  fontAtlasTexture.magFilter = THREE.LinearFilter;
  uniforms.uFontAtlas.value = fontAtlasTexture;
  uniforms.uAtlasCols.value = cols;
  uniforms.uAtlasRows.value = rows;
  return numChars;
}

function buildTextMaskTexture(str) {
  const maskCanvas = document.createElement('canvas');
  const pxWidth = 1024;
  const pxHeight = 512;
  maskCanvas.width = pxWidth;
  maskCanvas.height = pxHeight;
  const ctx = maskCanvas.getContext('2d');
  ctx.clearRect(0, 0, pxWidth, pxHeight);
  ctx.fillStyle = '#ffffff';
  // Auto-size font to fit canvas width
  const maskF = systemFonts.includes(params.maskFont) ? params.maskFont : `"${params.maskFont}"`;
  let fontSize = pxHeight * 0.8;
  ctx.font = `bold ${fontSize}px ${maskF}`;
  let textW = ctx.measureText(str).width;
  if (textW > pxWidth * 0.9) {
    fontSize *= (pxWidth * 0.9) / textW;
    ctx.font = `bold ${fontSize}px ${maskF}`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, pxWidth * 0.5, pxHeight * 0.5);
  const tex = new THREE.CanvasTexture(maskCanvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

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

  // Build font atlas if text particles enabled
  let numChars = 0;
  if (params.textParticles && params.textString.length > 0) {
    numChars = buildFontAtlas(params.textString);
    uniforms.uTextEnabled.value = 1;
  } else {
    uniforms.uTextEnabled.value = 0;
  }

  for (let i = 0; i < total; i++) {
    const c = i % totalCols;
    const r = Math.floor(i / totalCols);
    const hash = rand();
    if (params.textParticles && numChars > 0) {
      if (params.textLayout === 1) {
        // Sequential: repeat text string across grid left-to-right, bottom-to-top
        const seqIdx = i % params.textString.length;
        const ch = params.textString[seqIdx];
        patternArray[i] = fontAtlasChars.indexOf(ch);
      } else {
        patternArray[i] = Math.floor(hash * numChars);
      }
    } else {
      patternArray[i] = Math.floor(hash * 8);
    }

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

// --- Particle Shape Presets ---
let particleTexture = null;

function buildParticlePresetTexture(name) {
  // Handle Text and Default — no particle texture needed
  params.textParticles = (name === 'Text');
  uniforms.uTextEnabled.value = params.textParticles ? 1 : 0;

  uniforms.uParticleRotation.value = (name === 'Spiral') ? params.spiralSpeed : 0;

  if (name === 'Default' || name === 'Text') {
    if (particleTexture) { particleTexture.dispose(); particleTexture = null; }
    uniforms.uParticleTex.value = null;
    uniforms.uImageParticleEnabled.value = 0;
    return;
  }
  const sz = 128;
  const c = document.createElement('canvas');
  c.width = sz; c.height = sz;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, sz, sz);
  const cx = sz / 2, cy = sz / 2;

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = sz * 0.06;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (name === 'Lightning') {
    ctx.beginPath();
    ctx.moveTo(cx + sz * 0.1, cy - sz * 0.4);
    ctx.lineTo(cx - sz * 0.05, cy - sz * 0.05);
    ctx.lineTo(cx + sz * 0.08, cy - sz * 0.05);
    ctx.lineTo(cx - sz * 0.1, cy + sz * 0.4);
    ctx.lineTo(cx + sz * 0.05, cy + sz * 0.05);
    ctx.lineTo(cx - sz * 0.08, cy + sz * 0.05);
    ctx.closePath();
    ctx.fill();

  } else if (name === 'Hexagon') {
    const r = sz * 0.4;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI / 3) - Math.PI / 6;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

  } else if (name === 'Flower') {
    const petalR = sz * 0.18;
    const centerR = sz * 0.12;
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI / 3);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * petalR, cy + Math.sin(a) * petalR, petalR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, centerR, 0, Math.PI * 2);
    ctx.fill();

  } else if (name === 'Spiral') {
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 6; a += 0.1) {
      const r = (a / (Math.PI * 6)) * sz * 0.4;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.lineWidth = sz * 0.06;
    ctx.stroke();

  } else if (name === 'Eye') {
    // Almond shape
    ctx.beginPath();
    ctx.moveTo(cx - sz * 0.4, cy);
    ctx.quadraticCurveTo(cx, cy - sz * 0.3, cx + sz * 0.4, cy);
    ctx.quadraticCurveTo(cx, cy + sz * 0.3, cx - sz * 0.4, cy);
    ctx.fill();
    // Pupil (cut out and redraw)
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(cx, cy, sz * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    ctx.arc(cx, cy, sz * 0.13, 0, Math.PI * 2);
    ctx.fill();
    // Iris ring
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(cx, cy, sz * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  if (particleTexture) particleTexture.dispose();
  particleTexture = new THREE.CanvasTexture(c);
  particleTexture.flipY = false;
  particleTexture.minFilter = THREE.LinearFilter;
  particleTexture.magFilter = THREE.LinearFilter;
  uniforms.uParticleTex.value = particleTexture;
  uniforms.uImageParticleEnabled.value = 1;
}

const particlePresetNames = [
  'Default', 'Text', 'Lightning', 'Hexagon', 'Flower', 'Spiral', 'Eye'
];

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
  textMaskFolder.show(false);

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
  } else if (mode === 6) {
    // Text mask
    textMaskFolder.show(true);
    mediaSettingsFolder.show(true);
    loadFileBtn.show(false);
    const tex = buildTextMaskTexture(params.textMaskString);
    setMediaTexture(tex);
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

// --- Default Config (snapshot of initial params) ---
const defaultConfig = { ...params };

async function randomizeParams() {
  const schemeKeys = Object.keys(colorSchemes);
  const gradKeys = Object.keys(gradientPresets);
  
  if (params.highDetailedMode) {
    params.cellSize = 0.02 + Math.random() * 0.03;
    params.gap = Math.random() * 0.01;
    params.cols = 600;
    params.rows = 500;
  } else if (params.lowDetailedMode) {
    params.cellSize = 0.3 + Math.random() * 0.3;
    params.gap = Math.random() * 0.05 + 0.02;
    params.cols = 15 + Math.floor(Math.random() * 20);
    params.rows = 15 + Math.floor(Math.random() * 20);
  } else {
    if (params.layoutRandomMode === 'None') {
      params.cellSize = 0.1 + Math.random() * 0.2;
      params.gap = Math.random() * 0.06;
      params.cols = 30 + Math.floor(Math.random() * 100);
      params.rows = 30 + Math.floor(Math.random() * 100);
    } else if (params.layoutRandomMode === 'Freeze All') {
      // Freeze All -> do nothing to layout
    } else {
      // Auto (default)
      params.cellSize = 0.1 + Math.random() * 0.2;
      params.gap = Math.random() * 0.06;
      // cols/rows unchanged
    }
  }

  const bgRoll = Math.random();
  if (bgRoll < 0.85) {
    params.bgColor = ['#000000', '#050505', '#080808', '#0a0a0a', '#0c0c0c'][Math.floor(Math.random() * 5)];
  } else if (bgRoll < 0.95) {
    params.bgColor = ['#f5f5f5', '#fefefe', '#f0f0f0', '#e8e8e8'][Math.floor(Math.random() * 4)];
  } else {
    params.bgColor = ['#0a0000', '#020824', '#0a1a0a', '#1a0a1a', '#1a0a2e'][Math.floor(Math.random() * 5)];
  }
  // Keep dimAmount unchanged
  params.colorScheme = schemeKeys[Math.floor(Math.random() * schemeKeys.length)];
  params.gradientEnabled = Math.random() > 0.4;
  params.gradientPreset = gradKeys[Math.floor(Math.random() * gradKeys.length)];
  params.animSpeed = 0.2 + Math.random() * 3.0;
  params.flowSpeedX = (Math.random() - 0.3) * 0.4;
  params.flowSpeedY = (Math.random() - 0.3) * 0.4;
  params.pulseAmplitude = Math.random() * 0.3;
  params.pulseFrequency = 0.2 + Math.random() * 2.5;
  params.waveAmplitude = Math.random() * 0.25;
  params.waveFrequency = 0.2 + Math.random() * 2.0;
  params.particlePreset = particlePresetNames[Math.floor(Math.random() * particlePresetNames.length)];

  // Randomize fonts
  const randAtlas = googleFonts[Math.floor(Math.random() * googleFonts.length)];
  const randMask = googleFonts[Math.floor(Math.random() * googleFonts.length)];
  await Promise.all([loadGoogleFont(randAtlas), loadGoogleFont(randMask)]);
  params.atlasFont = randAtlas;
  params.maskFont = randMask;

  params.mouseEnabled = true;
  params.radius = 2.0 + Math.random() * 5.0;
  params.scaleBoost = 0.5 + Math.random() * 2.5;
  // Keep ripple and inputMode unchanged
  applyConfig(params);
}

// --- State Management (export/import config) ---
function exportConfig() {
  const json = JSON.stringify(params, null, 2);
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const filename = `malai-${stamp}.json`;

  // Use showSaveFilePicker when available (Chrome/Edge), fallback to blob link
  if (window.showSaveFilePicker) {
    window.showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    }).then(handle => handle.createWritable())
      .then(writable => writable.write(json).then(() => writable.close()))
      .catch(() => {});
  } else {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }
}

const configInput = document.createElement('input');
configInput.type = 'file';
configInput.accept = '.json';
configInput.style.display = 'none';
document.body.appendChild(configInput);

function importConfig() {
  configInput.click();
}

configInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const config = JSON.parse(reader.result);
      applyConfig(config);
    } catch (err) {
      console.warn('Invalid config file:', err);
    }
  };
  reader.readAsText(file);
  configInput.value = '';
});

function applyConfig(config) {
  for (const key in config) {
    if (key in params) params[key] = config[key];
  }
  // Sync uniforms
  uniforms.uRadius.value = params.radius;
  uniforms.uScaleBoost.value = params.scaleBoost;
  uniforms.uDim.value = params.dimAmount;
  const bgc = new THREE.Color(params.bgColor);
  renderer.setClearColor(bgc);
  uniforms.uBgColor.value.copy(bgc);
  uniforms.uCrossArm.value.set(params.crossThickness, params.crossBarWidth, params.crossBarPos);
  uniforms.uStarParams.value.set(params.starPoints, params.starInnerRatio);
  uniforms.uMediaThreshold.value = params.imageThreshold;
  uniforms.uMediaContrast.value = params.imageContrast;
  uniforms.uMediaBrightness.value = params.imageBrightness;
  uniforms.uMediaSoftness.value = params.imageSoftness;
  uniforms.uMediaInvert.value = params.imageInvert ? 1 : 0;
  uniforms.uParticleScale.value = params.particleScale;
  uniforms.uParticleAngle.value = params.particleAngle;
  buildParticlePresetTexture(params.particlePreset);
  textSettingsFolder.show(params.particlePreset === 'Text');
  spiralSettingsFolder.show(params.particlePreset === 'Spiral');

  if (colorSchemes[params.colorScheme]) palette = colorSchemes[params.colorScheme];
  applyGradientPreset(params.gradientPreset);
  uniforms.uRippleStrength.value = params.rippleStrength;
  uniforms.uRippleSpeed.value = params.rippleSpeed;
  uniforms.uRippleDecay.value = params.rippleDecay;
  uniforms.uRippleWidth.value = params.rippleWidth;
  uniforms.uFlowSpeed.value.set(params.flowSpeedX, params.flowSpeedY);
  uniforms.uPulseAmp.value = params.pulseAmplitude;
  uniforms.uPulseFreq.value = params.pulseFrequency;
  uniforms.uWaveAmp.value = params.waveAmplitude;
  uniforms.uWaveFreq.value = params.waveFrequency;
  if (!params.mouseEnabled) uniforms.uMouse.value.set(9999, 9999);
  // Rebuild grid and activate input mode
  buildGrid();
  activateInput(params.inputMode);
  // Refresh all GUI controllers
  gui.controllersRecursive().forEach(c => c.updateDisplay());
}

// --- lil-gui ---
const gui = new GUI({ title: 'MALAI' }).close();

// --- Input ---
const inputFolder = gui.addFolder('Input').close();
inputFolder.add(params, 'inputMode', {
  Rectangle: 0, Star: 1, Cross: 2, Image: 3, Video: 4, Webcam: 5, Text: 6
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

const textMaskFolder = inputFolder.addFolder('Text Mask');
textMaskFolder.add(params, 'textMaskString').name('Text').onFinishChange(v => {
  if (params.inputMode === 6 && v.length > 0) {
    const tex = buildTextMaskTexture(v);
    setMediaTexture(tex);
  }
});
setupFontControl(textMaskFolder, 'maskFont', () => {
  if (params.inputMode === 6 && params.textMaskString.length > 0) {
    const tex = buildTextMaskTexture(params.textMaskString);
    setMediaTexture(tex);
  }
});
textMaskFolder.show(false);

// --- Particle Shape ---
const particleFolder = gui.addFolder('Particle Shape').close();
particleFolder.add(params, 'particlePreset', particlePresetNames).name('Preset').onChange(v => {
  buildParticlePresetTexture(v);
  textSettingsFolder.show(v === 'Text');
  spiralSettingsFolder.show(v === 'Spiral');
  buildGrid();
});
particleFolder.add(params, 'particleScale', 0.1, 5.0, 0.01).name('Scale').onChange(v => { uniforms.uParticleScale.value = v; });
particleFolder.add(params, 'particleAngle', 0.0, Math.PI * 2, 0.01).name('Angle').onChange(v => { uniforms.uParticleAngle.value = v; });

const spiralSettingsFolder = particleFolder.addFolder('Spiral Settings');
spiralSettingsFolder.add(params, 'spiralSpeed', -10, 10, 0.1).name('Rotation Speed').onChange(v => {
  uniforms.uParticleRotation.value = v;
});
spiralSettingsFolder.show(params.particlePreset === 'Spiral');

const textSettingsFolder = particleFolder.addFolder('Text Settings');
textSettingsFolder.add(params, 'textLayout', { Random: 0, Sequential: 1 }).name('Text Layout').onChange(v => {
  params.textLayout = Number(v);
  buildGrid();
});
textSettingsFolder.add(params, 'textString').name('Characters').onFinishChange(buildGrid);
setupFontControl(textSettingsFolder, 'atlasFont', buildGrid);
textSettingsFolder.show(params.particlePreset === 'Text');

// --- Layout / Grid ---
const layoutFolder = gui.addFolder('Layout').close();
layoutFolder.add(params, 'cols', 10, 600, 1).name('Columns').onFinishChange(buildGrid);
layoutFolder.add(params, 'rows', 10, 600, 1).name('Rows').onFinishChange(buildGrid);
layoutFolder.add(params, 'cellSize', 0.02, 0.5, 0.01).name('Cell Size').onFinishChange(buildGrid);
layoutFolder.add(params, 'gap', 0.0, 0.15, 0.005).name('Gap').onFinishChange(buildGrid);
layoutFolder.add(params, 'layoutRandomMode', ['Auto', 'Freeze All', 'None']).name('Random Mode');

// --- Animation ---
const animFolder = gui.addFolder('Animation').close();
animFolder.add(params, 'animSpeed', -10.0, 10.0, 0.1).name('Speed');
const flowFolder = animFolder.addFolder('Flow');
flowFolder.add(params, 'flowSpeedX', -1.0, 1.0, 0.01).name('Drift X').onChange(v => {
  uniforms.uFlowSpeed.value.x = v;
});
flowFolder.add(params, 'flowSpeedY', -1.0, 1.0, 0.01).name('Drift Y').onChange(v => {
  uniforms.uFlowSpeed.value.y = v;
});
const pulseFolder = animFolder.addFolder('Pulse');
pulseFolder.add(params, 'pulseAmplitude', 0.0, 0.5, 0.01).name('Amplitude').onChange(v => {
  uniforms.uPulseAmp.value = v;
});
pulseFolder.add(params, 'pulseFrequency', 0.0, 5.0, 0.1).name('Frequency').onChange(v => {
  uniforms.uPulseFreq.value = v;
});
pulseFolder.add(params, 'waveAmplitude', 0.0, 0.5, 0.01).name('Wave Amp').onChange(v => {
  uniforms.uWaveAmp.value = v;
});
pulseFolder.add(params, 'waveFrequency', 0.0, 5.0, 0.1).name('Wave Freq').onChange(v => {
  uniforms.uWaveFreq.value = v;
});

// --- Gradient Presets (20) ---
const gradientPresets = {
  Monochrome: ['#ffffff', '#888888', '#222222'],
  Sunset: ['#ff512f', '#f09819', '#ff5e62'],
  'Blue Flame': ['#0000ff', '#00aaff', '#00ffff'],
  'Purple Haze': ['#7b2ff7', '#c471ed', '#f64f59'],
  'Green Neon': ['#00ff87', '#60efff', '#00ff87'],
  'Golden Hour': ['#f7971e', '#ffd200', '#f7971e'],
  'Cherry Blossom': ['#ffc3a0', '#ffafbd', '#ffc3a0'],
  'Deep Ocean': ['#000428', '#004e92', '#000428'],
  'Fire Ice': ['#ff0000', '#ffffff', '#0000ff'],
  'Midnight': ['#0f0c29', '#302b63', '#24243e'],
  'Emerald': ['#11998e', '#38ef7d', '#11998e'],
  'Blood Moon': ['#360033', '#8b0000', '#ff4444'],
  'Cotton Candy': ['#ee9ca7', '#ffdde1', '#c3cfe2'],
  'Electric': ['#fc00ff', '#00dbde', '#fc00ff'],
  'Sahara': ['#c2b280', '#deb887', '#d2691e'],
  'Northern Lights': ['#43cea2', '#185a9d', '#43cea2'],
  'Magma': ['#ff0844', '#ffb199', '#ff0844'],
  'Frost': ['#e0eafc', '#cfdef3', '#c9d6ff'],
  'Toxic': ['#a8ff78', '#78ffd6', '#a8ff78'],
  'Copper': ['#b79891', '#94716b', '#b79891'],
};

function applyGradientPreset(name) {
  const colors = gradientPresets[name];
  if (!colors) return;
  uniforms.uGradColorA.value.set(colors[0]);
  uniforms.uGradColorB.value.set(colors[1]);
  uniforms.uGradColorC.value.set(colors[2]);
}
// Initialize gradient colors from default preset
applyGradientPreset(params.gradientPreset);

// --- Colors ---
const colorsFolder = gui.addFolder('Colors').close();
colorsFolder.add(params, 'colorScheme', Object.keys(colorSchemes)).name('Color Scheme').onChange(v => {
  params.colorScheme = v;
  palette = colorSchemes[v];
  buildGrid();
});
colorsFolder.addColor(params, 'bgColor').name('Background').onChange(v => {
  const c = new THREE.Color(v);
  renderer.setClearColor(c);
  uniforms.uBgColor.value.copy(c);
});
colorsFolder.add(params, 'dimAmount', 0.0, 1.0, 0.05).name('Dim Amount').onChange(v => {
  uniforms.uDim.value = v;
});

const gradientFolder = colorsFolder.addFolder('Gradient');
gradientFolder.add(params, 'gradientPreset', Object.keys(gradientPresets)).name('Preset').onChange(v => {
  params.gradientPreset = v;
  applyGradientPreset(v);
  gui.controllersRecursive().forEach(c => c.updateDisplay());
});
gradientFolder.add(params, 'gradientEnabled').name('Enabled').onChange(v => {
  uniforms.uGradientEnabled.value = v ? 1 : 0;
});

// --- Interaction ---
const interactionFolder = gui.addFolder('Interaction').close();
interactionFolder.add(params, 'mouseEnabled').name('Mouse Enabled').onChange(v => {
  if (!v) uniforms.uMouse.value.set(9999, 9999);
});
interactionFolder.add(params, 'radius', 0.5, 10, 0.1).name('Radius').onChange(v => {
  uniforms.uRadius.value = v;
});
interactionFolder.add(params, 'scaleBoost', 0.0, 4.0, 0.1).name('Scale Boost').onChange(v => {
  uniforms.uScaleBoost.value = v;
});

const rippleFolder = interactionFolder.addFolder('Ripple');
rippleFolder.add(params, 'rippleEnabled').name('Enabled');
rippleFolder.add(params, 'rippleStrength', 0.1, 5.0, 0.1).name('Strength').onChange(v => {
  uniforms.uRippleStrength.value = v;
});
rippleFolder.add(params, 'rippleSpeed', 1.0, 15.0, 0.5).name('Speed').onChange(v => {
  uniforms.uRippleSpeed.value = v;
});
rippleFolder.add(params, 'rippleDecay', 0.5, 8.0, 0.1).name('Decay').onChange(v => {
  uniforms.uRippleDecay.value = v;
});
rippleFolder.add(params, 'rippleWidth', 0.3, 5.0, 0.1).name('Width').onChange(v => {
  uniforms.uRippleWidth.value = v;
});

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

// --- Config (bottom of GUI) ---
let savedLayoutBeforeDetail = null;

function applyDetailMode(mode) {
  if (mode === 'high') {
    savedLayoutBeforeDetail = { cols: params.cols, rows: params.rows, cellSize: params.cellSize, gap: params.gap };
    params.cols = 600;
    params.rows = 500;
    params.cellSize = 0.02;
    params.gap = 0.005;
  } else if (mode === 'low') {
    savedLayoutBeforeDetail = { cols: params.cols, rows: params.rows, cellSize: params.cellSize, gap: params.gap };
    params.cols = 20;
    params.rows = 20;
    params.cellSize = 0.45;
    params.gap = 0.04;
  } else if (savedLayoutBeforeDetail) {
    params.cols = savedLayoutBeforeDetail.cols;
    params.rows = savedLayoutBeforeDetail.rows;
    params.cellSize = savedLayoutBeforeDetail.cellSize;
    params.gap = savedLayoutBeforeDetail.gap;
    savedLayoutBeforeDetail = null;
  }
  buildGrid();
  gui.controllersRecursive().forEach(c => c.updateDisplay());
}

const configFolder = gui.addFolder('Config').close();
configFolder.add(params, 'highDetailedMode').name('High Detailed Mode').onChange(v => {
  if (v) {
    params.lowDetailedMode = false;
    applyDetailMode('high');
  } else {
    applyDetailMode('off');
  }
});
configFolder.add(params, 'lowDetailedMode').name('Low Detailed Mode').onChange(v => {
  if (v) {
    params.highDetailedMode = false;
    applyDetailMode('low');
  } else {
    applyDetailMode('off');
  }
});
configFolder.add({ fn: () => {
  const cfg = { ...defaultConfig };
  // Preserve input, text, and particle preset settings
  delete cfg.inputMode;
  delete cfg.textMaskString;
  delete cfg.textParticles;
  delete cfg.textString;
  delete cfg.textLayout;
  delete cfg.particlePreset;
  applyConfig(cfg);
}}, 'fn').name('↩ Back to Default');
configFolder.add({ fn: randomizeParams }, 'fn').name('🎲 Randomize');
configFolder.add({ fn: exportConfig }, 'fn').name('Export Config');
configFolder.add({ fn: importConfig }, 'fn').name('Import Config');

// --- Ripple system ---
let rippleIndex = 0;

canvas.addEventListener('pointerdown', (e) => {
  if (!params.rippleEnabled) return;
  const pos = screenToWorld(e.clientX, e.clientY);
  const slot = uniforms.uRipples.value[rippleIndex % 5];
  slot.set(pos.x, pos.y, accumulatedTime, 1.0);
  rippleIndex++;
});

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
