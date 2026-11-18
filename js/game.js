// PRIVATE MODULE K-12 — 主観視点で歩ける個室のプロトタイプ
// 素材はすべてコードで生成（three.js r170）。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createAudio } from './audio.js';
const audio = createAudio();

const DEBUG = location.hash === '#debug';
const COARSE = matchMedia('(pointer:coarse)').matches;
const $ = id => document.getElementById(id);
const canvas = $('view');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 300);
camera.rotation.order = 'YXZ';

// ---------------------------------------------------------------- helpers
let seed = 20261118;
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const FONT = '"Rajdhani","Zen Kaku Gothic New","Hiragino Sans","Yu Gothic UI",sans-serif';

function canvasTex(w, h, draw, { srgb = true, repeat } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function mesh(geo, mat, parent, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
  if (shadow && mat.isMeshStandardMaterial && !mat.transparent) { m.castShadow = true; m.receiveShadow = true; }
  parent.add(m); return m;
}
const box = (p, w, h, d, x, y, z, mat, sh) => mesh(new THREE.BoxGeometry(w, h, d), mat, p, x, y, z, sh);
const rbox = (p, w, h, d, x, y, z, mat, r = 0.02, sh) => mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat, p, x, y, z, sh);
const cyl = (p, rt, rb, h, x, y, z, mat, seg = 40, sh) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, p, x, y, z, sh);

// ---------------------------------------------------------------- textures
const texBrushed = canvasTex(256, 256, (g, w, h) => {
  const id = g.createImageData(w, h);
  for (let y = 0; y < h; y++) { const row = 165 + rnd() * 50; for (let x = 0; x < w; x++) { const v = row + rnd() * 34; const i = (y * w + x) * 4; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; } }
  g.putImageData(id, 0, 0);
}, { srgb: false, repeat: [1, 3] });
const texWeave = canvasTex(128, 128, (g, w, h) => {
  const id = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = 128 + ((x + y) % 4 < 2 ? 40 : -40) * ((x - y + 400) % 4 < 2 ? 1 : .4) + rnd() * 50 - 25; const i = (y * w + x) * 4; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  g.putImageData(id, 0, 0);
}, { srgb: false, repeat: [10, 10] });
// 床：1m角のスラブ、継ぎ目、拭き跡（粗さのむら）
const floorCol = canvasTex(1024, 1024, (g, w, h) => {
  g.fillStyle = '#2b2e34'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 16; i++) { g.fillStyle = `rgba(${rnd() < .5 ? '255,255,255' : '0,0,0'},${.02 + rnd() * .04})`; g.fillRect((i % 4) * 256, (i >> 2) * 256, 256, 256); }
  g.strokeStyle = 'rgba(0,0,0,.75)'; g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 256, 0); g.lineTo(i * 256, h); g.moveTo(0, i * 256); g.lineTo(w, i * 256); g.stroke(); }
});
const floorRough = canvasTex(1024, 1024, (g, w, h) => {
  g.fillStyle = 'rgb(58,58,58)'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * w, y = rnd() * h, r = 30 + rnd() * 150, a = .05 + rnd() * .1, c = rnd() < .6 ? 255 : 0;
    for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      gr.addColorStop(0, `rgba(${c},${c},${c},${a})`); gr.addColorStop(1, `rgba(${c},${c},${c},0)`);
      g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  g.strokeStyle = 'rgb(200,200,200)'; g.lineWidth = 4;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 256, 0); g.lineTo(i * 256, h); g.moveTo(0, i * 256); g.lineTo(w, i * 256); g.stroke(); }
}, { srgb: false });

// ---------------------------------------------------------------- materials
const Std = o => new THREE.MeshStandardMaterial(o);
const Basic = o => new THREE.MeshBasicMaterial(o);
const M = {
  wall: Std({ color: 0x0c0d10, roughness: .75, metalness: .3 }),
  wallIn: Std({ color: 0x0c0d10, roughness: .75, metalness: .3, side: THREE.BackSide }),
  panel: Std({ color: 0x1c1f25, roughness: .62, metalness: .7, roughnessMap: texBrushed }),
  panel2: Std({ color: 0x2a2e36, roughness: .55, metalness: .7, roughnessMap: texBrushed }),
  gloss: Std({ color: 0x060607, roughness: .07, metalness: .25 }),
  copper: Std({ color: 0xc07a48, roughness: .28, metalness: 1 }),
  chrome: Std({ color: 0xd0d5db, roughness: .08, metalness: 1 }),
  door: Std({ color: 0x40454e, roughness: .42, metalness: .85, roughnessMap: texBrushed }),
  fabric: Std({ color: 0x2c2d31, roughness: .95, metalness: 0, bumpMap: texWeave, bumpScale: 1.2 }),
  fabricWarm: Std({ color: 0x7b7064, roughness: .95, metalness: 0, bumpMap: texWeave, bumpScale: 1.2 }),
  fabricLight: Std({ color: 0xa39e95, roughness: .9, metalness: 0, bumpMap: texWeave, bumpScale: .8 }),
  white: Std({ color: 0xdad6ce, roughness: .55, metalness: 0 }),
  cushion: Std({ color: 0xb4572b, roughness: .9, metalness: 0, bumpMap: texWeave, bumpScale: 1 }),
  rug: Std({ color: 0x1b1a1b, roughness: 1, metalness: 0, bumpMap: texWeave, bumpScale: 1.5 }),
  strip: Basic({ color: 0xffffff, side: THREE.DoubleSide }),   // 壁の間接照明（モードで変わる）
  ring: Basic({ color: 0xffffff, side: THREE.DoubleSide }),    // 天井リング（モードで変わる）
  accent: Basic({ color: new THREE.Color(.28, .95, 1.15).multiplyScalar(2.0), side: THREE.DoubleSide }),
  accentDim: Basic({ color: new THREE.Color(.28, .95, 1.15).multiplyScalar(.7), side: THREE.DoubleSide }),
  cool: Basic({ color: new THREE.Color(.75, .88, 1).multiplyScalar(1.7) }),
  red: Basic({ color: new THREE.Color(1, .14, .08).multiplyScalar(2.6) }),
  black: Basic({ color: 0x010203 }),
  plate: Basic({ color: 0x0b0c0e }),
  // ガラスは映りこみだけを加算で重ねる（点光源の鋭いハイライトを拾わないよう、環境マップのみ）
  glass: Basic({ color: 0x000000, reflectivity: .2, combine: THREE.AddOperation, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  glassDS: Basic({ color: 0x000000, reflectivity: .16, combine: THREE.AddOperation, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
};
const floorMat = Std({ map: floorCol, roughnessMap: floorRough, roughness: 1, metalness: .55, color: 0xffffff });

function decal(parent, lines, wM, hM, x, y, z, { size = 64, align = 'left', color = 'rgba(205,212,220,.9)', opacity = .5, px = 512 } = {}) {
  const ph = Math.round(px * hM / wM);
  const t = canvasTex(px, ph, (g, w, h) => {
    g.fillStyle = color; g.textBaseline = 'top'; g.textAlign = align;
    let yy = 6;
    for (const ln of lines) {
      const s = (ln.s || 1) * size; g.font = `${ln.w || 500} ${s}px ${FONT}`;
      try { g.letterSpacing = (ln.ls ?? .12) * s + 'px'; } catch (e) { }
      g.fillText(ln.t, align === 'left' ? 6 : align === 'center' ? w / 2 : w - 6, yy); yy += s * 1.18;
    }
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(wM, hM), Std({ map: t, transparent: true, opacity, roughness: .9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.position.set(x, y, z); parent.add(m); return m;
}

// ---------------------------------------------------------------- room metrics
const N = 12, R = 4.4, RC = R / Math.cos(Math.PI / N), W = 2 * R * Math.tan(Math.PI / N), H = 3.0;
const SIDE = { SHELF: 0, WIN_A: 2, WIN_B: 3, WIN_C: 4, BED: 6, TERM: 8, DOOR: 9 };

const segs = [], circles = [];
function sideGroup(i) {
  const th = i * TAU / N, g = new THREE.Group();
  g.position.set(R * Math.cos(th), 0, R * Math.sin(th));
  g.rotation.y = Math.atan2(-Math.cos(th), -Math.sin(th));   // ローカル +z が部屋の内側
  scene.add(g); g.updateMatrixWorld(true); return g;
}
function segLocal(g, x1, z1, x2, z2) {
  g.updateMatrixWorld(true);
  const a = new THREE.Vector3(x1, 0, z1).applyMatrix4(g.matrixWorld), b = new THREE.Vector3(x2, 0, z2).applyMatrix4(g.matrixWorld);
  const s = { ax: a.x, az: a.z, bx: b.x, bz: b.z, on: true }; segs.push(s); return s;
}
function rectLocal(g, x1, z1, x2, z2) { segLocal(g, x1, z1, x2, z1); segLocal(g, x2, z1, x2, z2); segLocal(g, x2, z2, x1, z2); segLocal(g, x1, z2, x1, z1); }
const worldOf = (g, x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld);

// ---------------------------------------------------------------- shell
function buildShell() {
  // 床
  const fg = new THREE.CircleGeometry(RC, N, Math.PI / N); fg.rotateX(-Math.PI / 2);
  floorCol.wrapS = floorCol.wrapT = floorRough.wrapS = floorRough.wrapT = THREE.RepeatWrapping;
  floorCol.repeat.set(2 * RC / 4, 2 * RC / 4); floorRough.repeat.copy(floorCol.repeat);
  const floor = new THREE.Mesh(fg, floorMat); floor.receiveShadow = true; scene.add(floor);
  // ラグ
  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.3, 64).rotateX(-Math.PI / 2), M.rug);
  rug.position.y = .006; rug.receiveShadow = true; scene.add(rug);
  const rugEdge = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.318, 96).rotateX(-Math.PI / 2), M.copper); rugEdge.position.y = .007; scene.add(rugEdge);
  const inlay = new THREE.Mesh(new THREE.RingGeometry(3.28, 3.292, 96).rotateX(-Math.PI / 2), M.accentDim); inlay.position.y = .004; scene.add(inlay);
  // 天井
  const ceil = new THREE.Mesh(new THREE.CircleGeometry(RC + .2, 48).rotateX(Math.PI / 2), M.wall); ceil.position.y = H; scene.add(ceil);
  const soffit = new THREE.Mesh(new THREE.RingGeometry(3.55, RC + .2, 64).rotateX(Math.PI / 2), M.panel); soffit.position.y = 2.72; soffit.castShadow = true; scene.add(soffit);
  mesh(new THREE.CylinderGeometry(3.55, 3.55, .28, 64, 1, true), M.wallIn, scene, 0, 2.86, 0, false);
  mesh(new THREE.CylinderGeometry(3.546, 3.546, .03, 64, 1, true), M.strip, scene, 0, 2.79, 0);
  // 吊り天板とリング照明
  cyl(scene, 1.62, 1.62, .05, 0, 2.94, 0, M.plate, 64, false);
  mesh(new THREE.RingGeometry(1.66, 1.76, 96).rotateX(Math.PI / 2), M.ring, scene, 0, 2.985, 0);
  mesh(new THREE.TorusGeometry(1.62, .012, 8, 96).rotateX(Math.PI / 2), M.copper, scene, 0, 2.915, 0, false);
  // 天井の投影器
  cyl(scene, .15, .11, .16, 0, 2.84, 0, M.plate, 32, false);
  mesh(new THREE.CircleGeometry(.07, 24).rotateX(Math.PI / 2), M.accent, scene, 0, 2.758, 0);
  for (let k = 0; k < 6; k++) { const a = k * TAU / 6; box(scene, .5, .012, .035, Math.cos(a) * .95, 2.912, Math.sin(a) * .95, M.plate, false).rotation.y = -a; }

  // 柱（頂点ごと）と縦の光
  for (let i = 0; i < N; i++) {
    const ph = (i + .5) * TAU / N, g = new THREE.Group();
    g.position.set((RC - .06) * Math.cos(ph), 0, (RC - .06) * Math.sin(ph));
    g.rotation.y = Math.atan2(-Math.cos(ph), -Math.sin(ph)); scene.add(g);
    box(g, .3, H, .22, 0, H / 2, 0, M.panel2);
    box(g, .1, 2.2, .03, 0, 1.45, .115, M.wall, false);
    box(g, .026, 2.1, .012, 0, 1.45, .128, M.strip);
    box(g, .3, .12, .26, 0, .06, 0, M.panel, false);
  }
}

// 壁の標準パネル
function stdPanels(g, { lower = true, upperFrom = 1.14, upperTo = 2.66, split = 2 } = {}) {
  const pw = W - .44;
  if (lower) {
    rbox(g, pw, .74, .1, 0, .63, .05, M.panel2, .018);
    box(g, pw - .1, .03, .02, 0, .2, .03, M.strip);                 // 足元の間接光
    box(g, pw, .012, .012, 0, 1.07, .012, M.copper, false);
  }
  const uh = upperTo - upperFrom, each = pw / split;
  for (let k = 0; k < split; k++) rbox(g, each - .02, uh, .07, -pw / 2 + each * (k + .5), upperFrom + uh / 2, .035, M.panel, .014);
}
function backWall(g) { box(g, W + .04, H, .12, 0, H / 2, -.06, M.wall); }

function buildPlainSide(i, label) {
  const g = sideGroup(i); backWall(g); stdPanels(g);
  if (label) decal(g, label, .9, .34, -.42, 2.28, .075, { size: 46, opacity: .42 });
  return g;
}

// ---------------------------------------------------------------- window
function buildWindowSide(i) {
  const g = sideGroup(i);
  rbox(g, W + .02, .86, .36, 0, .43, .04, M.panel2, .02);
  box(g, W - .5, .03, .02, 0, .2, .225, M.strip);
  box(g, W - .36, .008, .016, 0, .864, .19, M.accentDim);
  box(g, W + .04, .32, .14, 0, 2.86, -.05, M.wall);
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(W, 1.9), M.glass); gl.position.set(0, 1.8, -.03); g.add(gl);
  return g;
}
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { time: { value: 0 }, sunDir: { value: new THREE.Vector3(.8, .5, -.22).normalize() } },
  vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `
    precision highp float; varying vec3 vW; uniform float time; uniform vec3 sunDir;
    float hash(vec3 p){ p=fract(p*.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    float noise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
      return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                 mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
    float fbm(vec3 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*noise(p); p=p*2.03+7.1; a*=.5; } return s; }
    void main(){
      vec3 ro=vec3(0.,1.6,0.); vec3 d=normalize(vW-ro); vec3 col=vec3(0.);
      vec3 g=d*150.; vec3 id=floor(g); vec3 f=fract(g)-.5; float h=hash(id);
      float star=step(.982,h)*smoothstep(.38,.0,length(f))*(.4+2.8*fract(h*91.7));
      col+=star*mix(vec3(.7,.82,1.),vec3(1.,.85,.7),fract(h*37.));
      col+=vec3(.05,.03,.09)*pow(fbm(d*3.+2.),3.)*1.6;
      vec3 pc=vec3(15.,-60.,80.); float pr=70.;
      vec3 oc=ro-pc; float b=dot(oc,d); float disc=b*b-(dot(oc,oc)-pr*pr);
      float closest=sqrt(max(dot(oc,oc)-b*b,0.));
      if(disc>0.&&b<0.){
        vec3 p=ro+d*(-b-sqrt(disc)); vec3 n=normalize(p-pc);
        float ndl=dot(n,sunDir); float day=smoothstep(-.18,.3,ndl);
        vec3 q=n*4.2+vec3(time*.003,0.,0.);
        float land=fbm(q); float cloud=fbm(q*2.4+9.+vec3(time*.006,0.,0.));
        vec3 surf=mix(vec3(.015,.06,.11),vec3(.11,.09,.065),smoothstep(.5,.6,land));
        surf=mix(surf,vec3(.6,.64,.68),smoothstep(.5,.74,cloud)*.85);
        col=surf*day*(.55+.9*max(ndl,0.));
        float city=step(.56,land)*step(.86,hash(floor(n*130.)))*(1.-day)*(1.-smoothstep(.5,.7,cloud));
        col+=vec3(1.,.62,.28)*city*.8;
        float rim=pow(1.-max(dot(n,-d),0.),3.2);
        col+=vec3(.22,.5,1.)*rim*(.12+day)*1.5;
        col+=vec3(1.,.45,.2)*rim*smoothstep(.25,.0,abs(ndl))*.5;
      } else if(b<0.){
        float hh=closest-pr; vec3 pn=normalize(ro+d*(-b)-pc);
        float day=smoothstep(-.3,.3,dot(pn,sunDir));
        col+=vec3(.2,.48,1.)*exp(-hh*1.3)*(.1+day)*1.1;
      }
      gl_FragColor=vec4(col,1.);
    }`
});
let navLights;
function buildExterior() {
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(120, 48, 32), skyMat));
  // 居住リングの骨組み（シルエット）
  const ring = new THREE.Mesh(new THREE.TorusGeometry(15, .28, 8, 120), M.black);
  ring.position.set(-3, -3.5, 13); ring.rotation.set(1.22, 0, .18); scene.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(15.9, .1, 6, 120), M.black); ring2.position.copy(ring.position); ring2.rotation.copy(ring.rotation); scene.add(ring2);
  for (let k = 0; k < 14; k++) { const a = k / 14 * TAU, s = new THREE.Mesh(new THREE.BoxGeometry(.08, .08, 1.0), M.black); s.position.set(Math.cos(a) * 15.45, Math.sin(a) * 15.45, 0); s.rotation.z = a; s.scale.set(1, 1, .1); s.scale.x = 11; ring.add(s); }
  const pos = [], col = [];
  for (let k = 0; k < 90; k++) { const a = k / 90 * TAU; pos.push(Math.cos(a) * 15, Math.sin(a) * 15, .3); const red = k % 9 === 0; col.push(red ? 2.6 : 1.6, red ? .25 : 1.25, red ? .15 : .85); }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); pg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  navLights = new THREE.Points(pg, new THREE.PointsMaterial({ size: .16, vertexColors: true })); ring.add(navLights);
}

// ---------------------------------------------------------------- door + vestibule
const door = { open: 0, want: 0, leaves: [], seg: null, pos: new THREE.Vector3() };
function buildDoorSide() {
  const g = sideGroup(SIDE.DOOR), ow = 1.3, oh = 2.25, s = (W - ow) / 2;
  for (const sx of [-1, 1]) {
    box(g, s + .04, H, .12, sx * (ow / 2 + s / 2), H / 2, -.06, M.wall);
    rbox(g, s - .2, 1.9, .07, sx * (ow / 2 + s / 2 + .04), 1.3, .035, M.panel, .014);
    box(g, .014, oh, .014, sx * (ow / 2 + .02), oh / 2, .008, M.accent);
    box(g, s - .26, .03, .02, sx * (ow / 2 + s / 2 + .04), .2, .03, M.strip);
  }
  box(g, ow + .04, H - oh, .12, 0, oh + (H - oh) / 2, -.06, M.wall);
  box(g, ow + .054, .014, .014, 0, oh + .02, .008, M.accent);
  rbox(g, ow, .3, .06, 0, 2.48, .03, M.panel2, .012);
  decal(g, [{ t: 'EXIT', w: 600 }, { t: '通路 07-C', s: .5, ls: .3 }], .7, .22, 0, 2.48, .065, { size: 52, align: 'center', opacity: .7 });
  for (const sx of [-1, 1]) {
    const lf = new THREE.Group(); lf.position.set(sx * ow / 4, 0, -.15); g.add(lf);
    rbox(lf, ow / 2, oh, .05, 0, oh / 2, 0, M.door, .008, false);
    box(lf, ow / 2 - .1, .012, .012, 0, 1.25, .028, M.copper, false);
    box(lf, .012, .5, .012, -sx * (ow / 4 - .05), 1.25, .028, M.accentDim);
    lf.userData.sx = sx; lf.userData.x0 = sx * ow / 4; door.leaves.push(lf);
  }
  segLocal(g, -W / 2, 0, -ow / 2, 0); segLocal(g, ow / 2, 0, W / 2, 0);
  door.seg = segLocal(g, -ow / 2, 0, ow / 2, 0);
  door.pos.copy(worldOf(g, 0, 0, -.1));
  // 前室
  const vw = 2.0, vd = 3.0, vh = 2.5, z0 = -.12, zc = z0 - vd / 2;
  box(g, vw, .1, vd, 0, -.05, zc, M.panel);
  const vf = new THREE.Mesh(new THREE.PlaneGeometry(vw, vd).rotateX(-Math.PI / 2), floorMat); vf.position.set(0, .002, zc); g.add(vf);
  box(g, vw, .1, vd, 0, vh + .05, zc, M.wall, false);
  for (const sx of [-1, 1]) {
    box(g, .1, vh, vd, sx * (vw / 2 + .05), vh / 2, zc, M.wall, false);
    for (let k = 0; k < 3; k++) rbox(g, .05, 1.9, .86, sx * (vw / 2 - .02), 1.2, z0 - .5 - k * .96, M.panel, .012, false);
    box(g, .012, .012, vd - .3, sx * .52, .006, zc, M.accent);
    box(g, .02, .03, vd - .3, sx * (vw / 2 - .012), .15, zc, M.strip);
  }
  box(g, .14, .02, vd - .9, 0, vh - .012, zc, M.cool);
  box(g, vw, vh, .1, 0, vh / 2, z0 - vd - .05, M.wall, false);
  rbox(g, 1.3, 2.25, .06, 0, 1.125, z0 - vd + .03, M.door, .008, false);
  box(g, .012, 2.25, .012, 0, 1.125, z0 - vd + .065, M.wall, false);
  box(g, .16, .028, .012, 0, 2.36, z0 - vd + .02, M.red);
  decal(g, [{ t: 'LOCKED', w: 600 }, { t: '外部通路 閉鎖中', s: .46, ls: .25 }], .7, .22, 0, 1.55, z0 - vd + .066, { size: 52, align: 'center', opacity: .75, color: 'rgba(255,150,120,.95)' });
  const vl = new THREE.PointLight(0xbfdcff, 5, 6, 2); vl.position.set(0, 2.1, zc); g.add(vl);
  segLocal(g, -vw / 2, z0, -vw / 2, z0 - vd); segLocal(g, vw / 2, z0, vw / 2, z0 - vd);
  segLocal(g, -vw / 2, z0 - vd + .08, vw / 2, z0 - vd + .08);
  segLocal(g, -vw / 2, z0, -ow / 2, z0); segLocal(g, ow / 2, z0, vw / 2, z0);
  // 床の区画番号
  const d = decal(scene, [{ t: 'K-12', w: 600, ls: .2 }], 1.5, .5, 0, .008, -3.55, { size: 150, align: 'center', opacity: .28, px: 768 });
  d.rotation.set(-Math.PI / 2, 0, Math.PI);
}

// ---------------------------------------------------------------- shelf
function buildShelfSide() {
  const g = sideGroup(SIDE.SHELF), nw = 1.64, y0 = .56, y1 = 2.36, nd = .4, s = (W - nw) / 2;
  for (const sx of [-1, 1]) { box(g, s + .04, H, .12, sx * (nw / 2 + s / 2), H / 2, -.06, M.wall); rbox(g, s - .12, 2.1, .07, sx * (nw / 2 + s / 2 + .03), 1.46, .035, M.panel, .012); }
  rbox(g, nw + .1, y0 - .02, .12, 0, y0 / 2, 0, M.panel2, .016);
  box(g, nw, .03, .02, 0, .16, .07, M.strip);
  box(g, nw + .04, H - y1, .12, 0, y1 + (H - y1) / 2, -.06, M.wall);
  rbox(g, nw + .1, .26, .07, 0, y1 + .16, .035, M.panel, .012);
  // くぼみ
  const backT = canvasTex(256, 256, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5a3a22'); gr.addColorStop(.5, '#2a1a10'); gr.addColorStop(1, '#3d2616');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1; for (let x = 0; x < w; x += 16) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
  });
  mesh(new THREE.PlaneGeometry(nw, y1 - y0), Basic({ map: backT }), g, 0, (y0 + y1) / 2, -nd);
  for (const sx of [-1, 1]) box(g, .03, y1 - y0, nd, sx * (nw / 2 + .015), (y0 + y1) / 2, -nd / 2, M.panel);
  box(g, nw, .03, nd, 0, y1 + .015, -nd / 2, M.panel); box(g, nw, .03, nd, 0, y0 - .015, -nd / 2, M.panel);
  const lv = [y0, 1.16, 1.76];
  for (let k = 1; k < 3; k++) { box(g, nw, .028, nd - .02, 0, lv[k] - .014, -nd / 2, M.panel2); box(g, nw - .06, .008, .012, 0, lv[k] - .034, -.03, M.strip); }
  box(g, nw - .06, .008, .012, 0, y1 - .008, -.03, M.strip);
  // 置き物
  const put = (fn, x, k, z = -.2) => { const o = new THREE.Group(); o.position.set(x, lv[k], z); g.add(o); fn(o); };
  const canister = (o, h = .24, r = .065) => { cyl(o, r, r, h, 0, h / 2, 0, M.panel2, 24); cyl(o, r + .004, r + .004, .03, 0, h - .05, 0, M.copper, 24, false); cyl(o, r + .002, r + .002, .012, 0, h * .35, 0, M.accent, 24, false); cyl(o, r * .6, r * .6, .02, 0, h + .01, 0, M.gloss, 16, false); };
  const orb = o => { cyl(o, .05, .065, .02, 0, .01, 0, M.gloss, 24, false); mesh(new THREE.SphereGeometry(.085, 32, 24), M.chrome, o, 0, .105, 0); };
  const crate = o => { rbox(o, .26, .15, .2, 0, .075, 0, M.panel2, .012); box(o, .262, .02, .202, 0, .11, 0, M.cushion, false); box(o, .06, .03, .006, .07, .05, .101, M.accentDim); };
  const plates = o => { for (let k = 0; k < 5; k++) rbox(o, .2 - (k % 2) * .02, .022, .15, (k % 2) * .008, .012 + k * .024, 0, k === 3 ? M.copper : M.white, .004, false); };
  const vials = o => { for (let k = 0; k < 5; k++) { mesh(new THREE.CapsuleGeometry(.018, .09, 4, 12), k === 2 ? M.accent : M.chrome, o, -.1 + k * .05, .075, 0, false); } rbox(o, .28, .02, .06, 0, .01, 0, M.gloss, .006, false); };
  const model = o => { cyl(o, .06, .07, .015, 0, .008, 0, M.gloss, 24, false); const w = new THREE.Mesh(new THREE.IcosahedronGeometry(.1, 1), new THREE.MeshStandardMaterial({ color: 0xc07a48, metalness: 1, roughness: .3, wireframe: true })); w.position.y = .15; o.add(w); o.userData.spin = w; spinners.push(w); };
  const helmet = o => { mesh(new THREE.SphereGeometry(.11, 32, 20, 0, TAU, 0, Math.PI * .62), M.white, o, 0, .1, 0); mesh(new THREE.SphereGeometry(.112, 32, 12, -.9, 1.8, Math.PI * .28, Math.PI * .26), M.gloss, o, 0, .1, 0, false).rotation.y = Math.PI / 2 + Math.PI; cyl(o, .08, .09, .03, 0, .015, 0, M.panel2, 24, false); };
  put(crate, -.52, 0); put(o => canister(o, .3, .075), -.1, 0); put(o => canister(o, .22, .06), .08, 0, -.24); put(plates, .5, 0);
  put(orb, -.56, 1); put(vials, -.08, 1); put(helmet, .5, 1);
  put(model, -.5, 2); put(o => canister(o, .2, .055), -.05, 2); put(o => canister(o, .26, .055), .1, 2, -.25); put(orb, .55, 2);
  const pl = new THREE.PointLight(0xffb070, 1.6, 3.5, 2); pl.position.set(0, 2.2, .1); g.add(pl);
  decal(g, [{ t: 'ARCHIVE 03', w: 600 }, { t: '私物保管', s: .5, ls: .3 }], .5, .16, -nw / 2 + .28, y1 + .16, .072, { size: 50, opacity: .5 });
  segLocal(g, -W / 2, 0, W / 2, 0);
}
const spinners = [];

// ---------------------------------------------------------------- bed
let bedLight;
function buildBedSide() {
  const g = sideGroup(SIDE.BED); backWall(g);
  for (let k = 0; k < 3; k++) rbox(g, .64, .92, .09, -.66 + k * .66, 1.22, .045, M.fabricWarm, .035);
  box(g, 2.0, .014, .014, 0, 1.74, .02, M.copper, false);
  box(g, 1.96, .022, .02, 0, 1.79, .02, M.strip);
  rbox(g, (W - .44) / 2 - .02, .8, .07, -(W - .44) / 4, 2.25, .035, M.panel, .014); rbox(g, (W - .44) / 2 - .02, .8, .07, (W - .44) / 4, 2.25, .035, M.panel, .014);
  rbox(g, W - .44, .6, .1, 0, .42, .05, M.panel2, .018);
  // 寝台
  rbox(g, 2.12, .26, 1.3, 0, .2, .8, M.panel, .03);
  box(g, 2.0, .018, .018, 0, .06, 1.44, M.strip); box(g, .018, .018, 1.2, -1.05, .06, .82, M.strip); box(g, .018, .018, 1.2, 1.05, .06, .82, M.strip);
  rbox(g, 2.02, .2, 1.2, 0, .43, .8, M.fabricLight, .07);
  rbox(g, 1.3, .215, 1.22, .37, .437, .8, M.fabric, .07);
  rbox(g, 1.3, .03, .22, .37, .548, .28, M.fabricLight, .014);
  rbox(g, .4, .12, .66, -.74, .59, .8, M.white, .055).rotation.z = .06;
  rbox(g, .3, .1, .3, -.34, .58, .42, M.cushion, .045).rotation.y = .3;
  bedLight = new THREE.PointLight(0xffc48a, 5, 5.5, 2); bedLight.position.set(-.3, 1.55, .5); g.add(bedLight);
  decal(g, [{ t: 'REST', w: 600 }, { t: '07 / K-12', s: .5 }], .4, .16, .78, 2.5, .072, { size: 50, opacity: .4 });
  segLocal(g, -W / 2, 0, W / 2, 0); rectLocal(g, -1.07, 0, 1.07, 1.46);
}

// ---------------------------------------------------------------- terminal
const term = { pos: new THREE.Vector3(), main: null, ctx: null, mats: [] };
function buildTerminalSide() {
  const g = sideGroup(SIDE.TERM); backWall(g); stdPanels(g, { lower: false, upperFrom: .3, upperTo: 2.66, split: 3 });
  rbox(g, 1.76, .045, .64, 0, .77, .36, M.gloss, .012);
  box(g, 1.7, .012, .012, 0, .745, .675, M.copper, false);
  for (const sx of [-1, 1]) rbox(g, .05, .75, .5, sx * .78, .375, .32, M.panel2, .012);
  box(g, 1.1, .02, .05, 0, .803, .16, M.panel2, false); box(g, 1.04, .006, .012, 0, .816, .16, M.accent);
  const scr = (w, h, x, y, z, ry, draw, px = 512) => {
    const c = document.createElement('canvas'); c.width = px; c.height = Math.round(px * h / w);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const mat = Basic({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color(1.5, 1.5, 1.5) });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.set(-.08, ry, 0); g.add(m);
    term.mats.push(mat); const ctx = c.getContext('2d'); draw && draw(ctx, c.width, c.height); return { ctx, t, c };
  };
  term.main = scr(.92, .56, 0, 1.36, .2, 0, null, 640);
  scr(.5, .56, -.76, 1.36, .3, .45, (c, w, h) => {
    c.strokeStyle = 'rgba(127,227,255,.5)'; c.strokeRect(2, 2, w - 4, h - 4); c.fillStyle = 'rgba(127,227,255,.85)'; c.font = `600 26px ${FONT}`; c.fillText('SYS LOG', 18, 40);
    c.font = `500 17px ${FONT}`; for (let k = 0; k < 20; k++) { c.fillStyle = `rgba(127,227,255,${.25 + rnd() * .55})`; c.fillText((1000 + k * 37).toString(16).toUpperCase() + '  ' + Array.from({ length: 3 }, () => Math.floor(rnd() * 65535).toString(16).padStart(4, '0')).join(' ').toUpperCase() + (rnd() < .2 ? '  OK' : ''), 18, 76 + k * 24); }
  });
  scr(.5, .56, .76, 1.36, .3, -.45, (c, w, h) => {
    c.strokeStyle = 'rgba(255,176,112,.5)'; c.strokeRect(2, 2, w - 4, h - 4); c.fillStyle = 'rgba(255,176,112,.9)'; c.font = `600 26px ${FONT}`; c.fillText('RING POSITION', 18, 40);
    c.translate(w / 2, h / 2 + 30); c.strokeStyle = 'rgba(255,176,112,.55)';
    for (let r = 40; r <= 200; r += 40) { c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); }
    for (let k = 0; k < 12; k++) { c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(k * TAU / 12) * 200, Math.sin(k * TAU / 12) * 200); c.globalAlpha = .4; c.stroke(); c.globalAlpha = 1; }
    c.fillStyle = 'rgba(127,227,255,1)'; c.beginPath(); c.arc(Math.cos(-2.1) * 160, Math.sin(-2.1) * 160, 9, 0, TAU); c.fill(); c.font = `600 22px ${FONT}`; c.fillText('K-12', Math.cos(-2.1) * 160 + 16, Math.sin(-2.1) * 160 + 6);
  });
  // キー面
  const keys = canvasTex(512, 160, (c, w, h) => { for (let r = 0; r < 4; r++) for (let k = 0; k < 14; k++) { c.fillStyle = `rgba(127,227,255,${rnd() < .1 ? .9 : .28})`; c.fillRect(8 + k * 35.6 + r * 6, 8 + r * 37, 28, 28); } });
  const km = new THREE.Mesh(new THREE.PlaneGeometry(.6, .19).rotateX(-Math.PI / 2), Basic({ map: keys, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); km.position.set(0, .796, .44); g.add(km);
  // 椅子
  cyl(g, .19, .19, .06, 0, .47, 1.1, M.fabric, 32); cyl(g, .035, .035, .42, 0, .23, 1.1, M.chrome, 16); cyl(g, .16, .18, .03, 0, .015, 1.1, M.panel2, 32);
  const sl = new THREE.PointLight(0x7fe3ff, 1.4, 3.5, 2); sl.position.set(0, 1.3, .7); g.add(sl);
  decal(g, [{ t: 'ENV CONTROL', w: 600 }, { t: '環境制御端末', s: .5, ls: .3 }], .6, .18, -.5, 2.42, .075, { size: 48, opacity: .45 });
  segLocal(g, -W / 2, 0, W / 2, 0); rectLocal(g, -.92, 0, .92, .72);
  const c = worldOf(g, 0, 0, 1.1); circles.push({ x: c.x, z: c.z, r: .22 });
  term.pos.copy(worldOf(g, 0, 0, .75));
}
function drawTerminal(t) {
  const { ctx: c, c: cv, t: tex } = term.main, w = cv.width, h = cv.height;
  c.clearRect(0, 0, w, h);
  const cy = 'rgba(127,227,255,', am = 'rgba(255,176,112,';
  c.strokeStyle = cy + '.55)'; c.lineWidth = 2;
  for (const [x, y, sx, sy] of [[4, 4, 1, 1], [w - 4, 4, -1, 1], [4, h - 4, 1, -1], [w - 4, h - 4, -1, -1]]) { c.beginPath(); c.moveTo(x + sx * 34, y); c.lineTo(x, y); c.lineTo(x, y + sy * 34); c.stroke(); }
  c.fillStyle = cy + '.9)'; c.font = `600 24px ${FONT}`; c.fillText('K-12 / ENV CONTROL', 26, 44);
  const d = new Date(), p = n => String(n).padStart(2, '0');
  c.textAlign = 'right'; c.fillText(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`, w - 26, 44); c.textAlign = 'left';
  c.fillStyle = am + '.95)'; c.font = `300 76px ${FONT}`; c.fillText(MOODS[mood.target].name, 26, 136);
  c.font = `500 18px ${FONT}`; c.fillStyle = cy + '.6)'; c.fillText('LIGHTING PRESET', 28, 164);
  MOODS.forEach((m, i) => { c.fillStyle = i === mood.target ? am + '1)' : cy + '.3)'; c.fillRect(28 + i * 62, 180, 50, 8); });
  c.beginPath(); c.strokeStyle = cy + '.9)'; c.lineWidth = 2;
  for (let x = 0; x <= 300; x += 4) { const y = 290 + Math.sin(x * .05 + t * 2.2) * 22 * Math.sin(x * .011 + t * .5) + Math.sin(x * .21 + t * 5) * 5; x ? c.lineTo(28 + x, y) : c.moveTo(28 + x, y); }
  c.stroke(); c.strokeStyle = cy + '.25)'; c.strokeRect(28, 240, 300, 100);
  ['O2', 'TEMP', 'PWR', 'HUM'].forEach((n, i) => {
    const v = .55 + .3 * Math.sin(t * (.4 + i * .13) + i * 2); const x = 370, y = 132 + i * 54;
    c.fillStyle = cy + '.7)'; c.font = `600 18px ${FONT}`; c.fillText(n, x, y);
    c.fillStyle = cy + '.18)'; c.fillRect(x, y + 10, 240, 10); c.fillStyle = i === 2 ? am + '.9)' : cy + '.85)'; c.fillRect(x, y + 10, 240 * v, 10);
  });
  tex.needsUpdate = true;
}

// ---------------------------------------------------------------- shower pod
const pod = { pos: new THREE.Vector3(), on: false, power: 0, mat: null, light: null };
function buildPod() {
  const a = 300 * Math.PI / 180, g = new THREE.Group(); g.position.set(Math.cos(a) * 3.4, 0, Math.sin(a) * 3.4); scene.add(g); g.updateMatrixWorld(true);
  cyl(g, .68, .7, .12, 0, .06, 0, M.panel2, 48); cyl(g, .7, .68, .2, 0, 2.36, 0, M.panel2, 48);
  mesh(new THREE.CylinderGeometry(.62, .62, 2.12, 48, 1, true), M.glassDS, g, 0, 1.2, 0);
  const frost = canvasTex(16, 256, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(160,220,235,0)'); gr.addColorStop(.3, 'rgba(160,220,235,.5)'); gr.addColorStop(.7, 'rgba(160,220,235,.5)'); gr.addColorStop(1, 'rgba(160,220,235,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
  mesh(new THREE.CylinderGeometry(.615, .615, 1.2, 48, 1, true), Basic({ map: frost, transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide }), g, 0, 1.15, 0);
  mesh(new THREE.TorusGeometry(.63, .012, 8, 64).rotateX(Math.PI / 2), M.accent, g, 0, .135, 0); mesh(new THREE.TorusGeometry(.63, .012, 8, 64).rotateX(Math.PI / 2), M.accent, g, 0, 2.25, 0);
  mesh(new THREE.CircleGeometry(.5, 32).rotateX(Math.PI / 2), M.accentDim, g, 0, 2.255, 0);
  cyl(g, .05, .05, 1.9, 0, 1.2, -.48, M.chrome, 16); cyl(g, .1, .1, .03, 0, 2.05, -.34, M.chrome, 24);
  for (const sx of [-1, 1]) box(g, .05, 2.12, .05, sx * .6, 1.2, .16, M.panel2, false);
  const pl = new THREE.PointLight(0x66e0ff, 4.5, 4.5, 2); pl.position.set(0, 1.9, 0); g.add(pl);
  circles.push({ x: g.position.x, z: g.position.z, r: .72 });
  pod.pos.copy(g.position); pod.light = pl;
  // シャワーの水（落ちる粒）
  const n = 700, p = new Float32Array(n * 3), sd = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = rnd() * TAU, r = Math.sqrt(rnd()) * .4; p.set([Math.cos(a) * r, 0, Math.sin(a) * r - .05], i * 3); sd[i] = rnd(); }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.BufferAttribute(p, 3)); wg.setAttribute('sd', new THREE.BufferAttribute(sd, 1));
  pod.mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { time: { value: 0 }, power: { value: 0 }, vh: { value: 720 } },
    vertexShader: `attribute float sd; uniform float time; uniform float vh; uniform float power; varying float vA;
      void main(){ vec3 p=position; float f=fract(sd*7.31+time*(1.25+sd*.5)); p.y=2.02-f*f*1.88; p.xz*=1.+f*.12;
        vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
        float px=.011*projectionMatrix[1][1]*vh*.5/max(-mv.z,.05); float k=min(px/1.2,1.); gl_PointSize=max(px,1.2); vA=power*k*k*(.35+.65*step(sd,power))*step(sd,power*1.2); }`,
    fragmentShader: `varying float vA; void main(){ vec2 c=gl_PointCoord-.5; float d=length(c*vec2(2.4,1.)); gl_FragColor=vec4(vec3(.55,.9,1.)*1.3*vA*smoothstep(.5,.1,d),1.); }` });
  const w = new THREE.Points(wg, pod.mat); w.frustumCulled = false; g.add(w);
}

// ---------------------------------------------------------------- lounge + hologram
const holo = { pos: new THREE.Vector3(0, 0, 0), form: 0, w: new THREE.Vector3(1, 0, 0), power: 1, group: null, mat: null, beam: null, light: null };
function buildLounge() {
  // ソファ（弧）
  for (let k = 0; k < 5; k++) {
    const a = (222 + k * 24) * Math.PI / 180, g = new THREE.Group();
    g.position.set(Math.cos(a) * 1.66, 0, Math.sin(a) * 1.66); g.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a)); scene.add(g);
    rbox(g, .71, .12, .78, 0, .09, -.02, M.panel, .02);
    rbox(g, .69, .22, .68, 0, .27, .03, M.fabric, .06);
    rbox(g, .69, .44, .18, 0, .58, -.3, M.fabric, .06);
    if (k === 0 || k === 4) rbox(g, .12, .3, .7, (k === 0 ? -1 : 1) * -.3, .5, .02, M.fabric, .05);
    if (k === 1) rbox(g, .34, .3, .12, .05, .52, -.16, M.cushion, .05).rotation.x = -.25;
    if (k === 3) rbox(g, .36, .3, .12, -.04, .52, -.16, M.fabricLight, .05).rotation.x = -.22;
    circles.push({ x: Math.cos(a) * 1.72, z: Math.sin(a) * 1.72, r: .46 });
  }
  // テーブル
  cyl(scene, .5, .5, .05, 0, .405, 0, M.gloss, 64); cyl(scene, .16, .22, .38, 0, .19, 0, M.panel2, 32);
  mesh(new THREE.TorusGeometry(.5, .008, 8, 96).rotateX(Math.PI / 2), M.copper, scene, 0, .43, 0, false);
  mesh(new THREE.RingGeometry(.3, .312, 64).rotateX(-Math.PI / 2), M.accent, scene, 0, .432, 0);
  mesh(new THREE.CircleGeometry(.07, 24).rotateX(-Math.PI / 2), M.accent, scene, 0, .432, 0);
  cyl(scene, .034, .028, .075, .33, .468, -.2, M.white, 20); rbox(scene, .2, .012, .14, -.3, .437, .22, M.panel2, .004, false).rotation.y = .5;
  circles.push({ x: 0, z: 0, r: .56 });

  // ホログラム（粒子が3つの形を行き来する）
  const NP = 6400, p0 = new Float32Array(NP * 3), p1 = new Float32Array(NP * 3), p2 = new Float32Array(NP * 3), sd = new Float32Array(NP);
  for (let i = 0; i < NP; i++) {
    sd[i] = rnd();
    // 0: 惑星と軌道
    if (i < NP * .78) { const y = 1 - 2 * (i + .5) / (NP * .78), r = Math.sqrt(1 - y * y), a = i * 2.399963; const lat = Math.round(y * 9) / 9, onLine = (i % 5 === 0); const yy = onLine ? lat : y, rr = onLine ? Math.sqrt(1 - lat * lat) : r; p0.set([Math.cos(a) * rr * .3, yy * .3, Math.sin(a) * rr * .3], i * 3); }
    else { const a = rnd() * TAU, rr = (i % 2 ? .44 : .52) + (rnd() - .5) * .012, tl = i % 2 ? .35 : -.2; p0.set([Math.cos(a) * rr, Math.sin(a) * rr * Math.sin(tl), Math.sin(a) * rr * Math.cos(tl)], i * 3); }
    // 1: 地形
    const gx = i % 80, gz = Math.floor(i / 80), x = (gx / 79 - .5) * 1.0, z = (gz / 79 - .5) * 1.0;
    const hgt = Math.sin(x * 7 + 1) * Math.cos(z * 6) * .07 + Math.sin(x * 15 + z * 11) * .025 + Math.exp(-((x - .15) ** 2 + (z + .1) ** 2) * 30) * .2;
    p1.set([x, hgt - .12, z], i * 3);
    // 2: 渦
    const rr = Math.pow(rnd(), .7) * .52, arm = i % 3, an = rr * 8 + arm * TAU / 3 + (rnd() - .5) * (.9 - rr), th = (rnd() - .5) * .1 * (1 - rr * 1.5);
    p2.set([Math.cos(an) * rr, th, Math.sin(an) * rr], i * 3);
  }
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.BufferAttribute(p0, 3)); hg.setAttribute('p1', new THREE.BufferAttribute(p1, 3)); hg.setAttribute('p2', new THREE.BufferAttribute(p2, 3)); hg.setAttribute('sd', new THREE.BufferAttribute(sd, 1));
  holo.mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, w: { value: holo.w }, vh: { value: 720 }, power: { value: 1 } },
    vertexShader: `attribute vec3 p1; attribute vec3 p2; attribute float sd; uniform float time; uniform vec3 w; uniform float vh; uniform float power; varying vec3 vC;
      void main(){ vec3 p=position*w.x+p1*w.y+p2*w.z;
        float sp=time*(.18+.25*w.z); float c=cos(sp), s=sin(sp); p.xz=mat2(c,-s,s,c)*p.xz;
        float mix01=1.-max(max(w.x,w.y),w.z); p+= (vec3(fract(sd*13.1),fract(sd*71.7),fract(sd*29.3))-.5)*mix01*.5;
        p.y+=sin(time*1.4+p.x*16.+sd*6.)*.004;
        float scan=smoothstep(.04,.0,abs(p.y-(fract(time*.12)*1.-.5)));
        vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
        float px=.0065*(.6+sd*.9)*projectionMatrix[1][1]*vh*.5/max(-mv.z,.05);
        float k=min(px/1.3,1.); gl_PointSize=max(px,1.3);
        vC=mix(vec3(.18,.75,1.),vec3(1.,.72,.4),smoothstep(.0,.25,p.y)*w.y+step(.93,sd))*(.75+scan*1.8)*k*k*power*1.5; }`,
    fragmentShader: `varying vec3 vC; void main(){ float d=length(gl_PointCoord-.5); gl_FragColor=vec4(vC*smoothstep(.5,.15,d),1.); }`
  });
  holo.group = new THREE.Group(); holo.group.position.set(0, 1.22, 0); scene.add(holo.group);
  const pts = new THREE.Points(hg, holo.mat); pts.frustumCulled = false; holo.group.add(pts);
  const beamT = canvasTex(8, 128, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(120,220,255,0)'); gr.addColorStop(1, 'rgba(120,220,255,1)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
  holo.beam = new THREE.Mesh(new THREE.CylinderGeometry(.5, .07, .8, 48, 1, true), Basic({ map: beamT, transparent: true, opacity: .1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  holo.beam.position.set(0, .84, 0); scene.add(holo.beam);
  holo.light = new THREE.PointLight(0x7fe3ff, 2.2, 4, 2); holo.light.position.set(0, 1.1, 0); scene.add(holo.light);
}

// ---------------------------------------------------------------- dust
let dust;
function buildDust() {
  const n = 420, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const a = rnd() * TAU, r = Math.sqrt(rnd()) * 4; p.set([Math.cos(a) * r, .2 + rnd() * 2.5, Math.sin(a) * r], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const dt = canvasTex(32, 32, (c) => { const gr = c.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 32, 32); });
  dust = new THREE.Points(g, new THREE.PointsMaterial({ size: .014, map: dt, color: 0xffe6cc, transparent: true, opacity: .16, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);
}

// ---------------------------------------------------------------- lights + moods
const MOODS = [
  { name: 'AMBER', jp: 'アンバー', strip: [1, .5, .2], sI: 2.5, ring: [1, .8, .58], rI: 2.8, key: [1, .82, .64], kI: 30, bed: 5, exp: 1.0 },
  { name: 'GLACIER', jp: 'グレイシャー', strip: [.42, .74, 1], sI: 2.4, ring: [.84, .93, 1], rI: 3.0, key: [.8, .9, 1], kI: 32, bed: 3, exp: 1.0 },
  { name: 'NIGHT', jp: 'ナイト', strip: [1, .22, .07], sI: .9, ring: [1, .42, .2], rI: .22, key: [1, .55, .32], kI: 1.6, bed: 1.2, exp: 1.25 },
];
const mood = { target: 0, cur: JSON.parse(JSON.stringify(MOODS[0])), t: 1, envTimer: 0 };
let keyLight, hemi, winLight;
function buildLights() {
  hemi = new THREE.HemisphereLight(0x8a94a8, 0x1a1410, .25); scene.add(hemi);
  keyLight = new THREE.PointLight(0xffffff, 30, 14, 2); keyLight.position.set(0, 2.78, 0);
  keyLight.castShadow = true; keyLight.shadow.mapSize.set(1024, 1024); keyLight.shadow.bias = -.003; keyLight.shadow.normalBias = .03; keyLight.shadow.radius = 4;
  keyLight.shadow.camera.near = .1; keyLight.shadow.camera.far = 12; scene.add(keyLight);
  winLight = new THREE.SpotLight(0x86b4ff, 60, 16, .75, 1, 2); winLight.position.set(1.5, 3.4, 7.2); winLight.target.position.set(-.3, .2, 0); scene.add(winLight, winLight.target);
}
function applyMood() {
  const c = mood.cur;
  M.strip.color.setRGB(c.strip[0] * c.sI, c.strip[1] * c.sI, c.strip[2] * c.sI);
  M.ring.color.setRGB(c.ring[0] * c.rI, c.ring[1] * c.rI, c.ring[2] * c.rI);
  keyLight.color.setRGB(c.key[0], c.key[1], c.key[2]); keyLight.intensity = c.kI;
  bedLight.intensity = c.bed; bedLight.color.setRGB(c.strip[0] * .6 + .4, c.strip[1] * .6 + .35, c.strip[2] * .6 + .3);
  renderer.toneMappingExposure = c.exp;
}
function setMood(i, instant) {
  mood.target = i; mood.t = instant ? 1 : 0; mood.from = JSON.parse(JSON.stringify(mood.cur));
  if (instant) { mood.cur = JSON.parse(JSON.stringify(MOODS[i])); applyMood(); captureEnv(); captureEnv(); }
}
function updateMood(dt) {
  if (mood.t >= 1) return;
  mood.t = Math.min(1, mood.t + dt / 1.4); const k = mood.t * mood.t * (3 - 2 * mood.t), a = mood.from, b = MOODS[mood.target], c = mood.cur;
  for (const key of ['sI', 'rI', 'kI', 'bed', 'exp']) c[key] = lerp(a[key], b[key], k);
  for (const key of ['strip', 'ring', 'key']) for (let j = 0; j < 3; j++) c[key][j] = lerp(a[key][j], b[key][j], k);
  applyMood();
  mood.envTimer += dt; if (mood.envTimer > .22 || mood.t >= 1) { mood.envTimer = 0; captureEnv(); if (mood.t >= 1) captureEnv(); }
}

// ---------------------------------------------------------------- environment map（発光面と一次反射を室内から撮る）
const cubeRT = new THREE.WebGLCubeRenderTarget(COARSE ? 128 : 256, { type: THREE.HalfFloatType });
const cubeCam = new THREE.CubeCamera(.1, 200, cubeRT); cubeCam.position.set(0, 1.5, .2);
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;
function captureEnv() {
  holo.group.visible = false; holo.beam.visible = false; dust.visible = false; pod.mat.uniforms.power.value = 0;
  const exp = renderer.toneMappingExposure; cubeCam.update(renderer, scene); renderer.toneMappingExposure = exp;
  holo.group.visible = true; holo.beam.visible = holo.power > .02; dust.visible = true;
  const rt = pmrem.fromCubemap(cubeRT.texture); scene.environment = rt.texture;
  for (const m of [M.glass, M.glassDS]) { if (!m.envMap) m.needsUpdate = true; m.envMap = rt.texture; }
  if (envRT) envRT.dispose(); envRT = rt;
}

// ---------------------------------------------------------------- post
let composer, bloom, finalPass, quality = COARSE ? 'low' : 'high';
const FinalShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, res: { value: new THREE.Vector2(1, 1) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform vec2 res; varying vec2 vUv;
    void main(){ vec2 c=vUv-.5; float r2=dot(c,c); vec2 off=c*r2*.010;
      vec3 col=vec3(texture2D(tDiffuse,vUv+off).r,texture2D(tDiffuse,vUv).g,texture2D(tDiffuse,vUv-off).b);
      col*=mix(1.,.5,smoothstep(.12,.62,r2));
      float n=fract(sin(dot(floor(vUv*res)+time*61.,vec2(12.9898,78.233)))*43758.5453);
      col+=(n-.5)*.022; gl_FragColor=vec4(col,1.); }`
};
function buildComposer() {
  const dpr = Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : 1.25);
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: quality === 'high' ? 4 : 0 });
  if (composer) composer.dispose();
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), quality === 'high' ? .42 : .36, .7, 1.0);
  composer.addPass(bloom); composer.addPass(new OutputPass());
  finalPass = new ShaderPass(FinalShader); finalPass.uniforms.res.value.set(size.x, size.y); composer.addPass(finalPass);
  camera.aspect = w / h; camera.fov = w < h ? 82 : 68; camera.updateProjectionMatrix();
  holo.mat.uniforms.vh.value = size.y; pod.mat.uniforms.vh.value = size.y;
  keyLight.shadow.mapSize.setScalar(quality === 'high' ? 1024 : 512);
  if (keyLight.shadow.map) { keyLight.shadow.map.dispose(); keyLight.shadow.map = null; }
  renderer.shadowMap.needsUpdate = true;
}

// ---------------------------------------------------------------- player
const player = { x: 0, z: -3.4, yaw: Math.PI, pitch: -.02, vx: 0, vz: 0, bob: 0 };
const keys = new Set(); const stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 }; const lookT = { id: -1, x: 0, y: 0 };
let state = 'menu', hadLock = false, time = 0;
const PR = .3;
function collide(p) {
  for (let it = 0; it < 3; it++) {
    for (const s of segs) {
      if (!s.on) continue; const dx = s.bx - s.ax, dz = s.bz - s.az;
      const t = clamp(((p.x - s.ax) * dx + (p.z - s.az) * dz) / (dx * dx + dz * dz), 0, 1), cx = s.ax + dx * t, cz = s.az + dz * t;
      const ox = p.x - cx, oz = p.z - cz, d = Math.hypot(ox, oz); if (d < PR && d > 1e-6) { p.x = cx + ox / d * PR; p.z = cz + oz / d * PR; }
    }
    for (const c of circles) { const ox = p.x - c.x, oz = p.z - c.z, d = Math.hypot(ox, oz), m = c.r + PR; if (d < m && d > 1e-6) { p.x = c.x + ox / d * m; p.z = c.z + oz / d * m; } }
  }
}
function updatePlayer(dt) {
  let fx = 0, fz = 0;
  if (state === 'play') {
    if (keys.has('KeyW') || keys.has('ArrowUp')) fz += 1; if (keys.has('KeyS') || keys.has('ArrowDown')) fz -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) fx += 1; if (keys.has('KeyA') || keys.has('ArrowLeft')) fx -= 1;
    fx += stick.x; fz -= stick.y;
  }
  const l = Math.hypot(fx, fz); if (l > 1) { fx /= l; fz /= l; }
  const sp = (keys.has('ShiftLeft') || keys.has('ShiftRight') || l > 1.01) ? 3.6 : 2.3;
  const sn = Math.sin(player.yaw), cs = Math.cos(player.yaw);
  const tx = (-sn * fz + cs * fx) * sp, tz = (-cs * fz - sn * fx) * sp;
  const k = 1 - Math.exp(-dt * 11); player.vx += (tx - player.vx) * k; player.vz += (tz - player.vz) * k;
  player.x += player.vx * dt; player.z += player.vz * dt; collide(player);
  const v = Math.hypot(player.vx, player.vz), b0 = player.bob; player.bob += v * dt * 2.6;
  if (v > .8 && Math.floor(b0 / Math.PI + .25) !== Math.floor(player.bob / Math.PI + .25)) audio.step(Math.hypot(player.x, player.z) < 2.3);
  camera.position.set(player.x, 1.62 + Math.sin(player.bob * 2) * .012 * Math.min(v / 2.3, 1), player.z);
  camera.rotation.set(player.pitch, player.yaw, Math.sin(player.bob) * .0025 * Math.min(v / 2.3, 1));
}
function look(dx, dy, s) { player.yaw -= dx * s; player.pitch = clamp(player.pitch - dy * s, -1.35, 1.35); }

// ---------------------------------------------------------------- interaction
const interactables = [];
let focus = null, toastTimer = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); toastTimer = 2.4; }
function updateFocus() {
  focus = null; let best = 1e9; const sn = Math.sin(player.yaw), cs = Math.cos(player.yaw);
  for (const it of interactables) {
    const dx = it.pos.x - player.x, dz = it.pos.z - player.z, d = Math.hypot(dx, dz); if (d > it.r) continue;
    const facing = (dx * -sn + dz * -cs) / (d || 1); if (facing < .35 && d > .5) continue;
    if (d < best) { best = d; focus = it; }
  }
  const p = $('prompt'), on = !!focus && state === 'play';
  if (on) p.innerHTML = (COARSE ? '' : '<kbd>E</kbd>') + focus.label();
  p.classList.toggle('on', on); $('actBtn').classList.toggle('on', on && COARSE);
}
function interact() { if (state === 'play' && focus) focus.act(); }

// ---------------------------------------------------------------- build
async function build() {
  try { await Promise.race([Promise.all([document.fonts.load(`600 40px "Rajdhani"`), document.fonts.load(`500 40px "Zen Kaku Gothic New"`, '通路')]), new Promise(r => setTimeout(r, 1800))]); } catch (e) { }
  buildShell(); buildExterior(); buildLights();
  buildShelfSide(); buildDoorSide(); buildBedSide(); buildTerminalSide();
  for (const i of [SIDE.WIN_A, SIDE.WIN_B, SIDE.WIN_C]) { const g = buildWindowSide(i); segLocal(g, -W / 2, 0, W / 2, 0); }
  const labels = { 1: [{ t: 'SECTOR 07', w: 600 }, { t: '居住リング 外周', s: .5, ls: .3 }], 5: [{ t: 'AIR 21.4%', w: 600 }, { t: '循環 正常', s: .5, ls: .3 }], 7: null, 10: [{ t: 'HYGIENE', w: 600 }, { t: '洗浄ポッド', s: .5, ls: .3 }], 11: [{ t: 'K-12', w: 600 }, { t: 'PRIVATE MODULE', s: .5 }] };
  for (const i of [1, 5, 7, 10, 11]) { const g = buildPlainSide(i, labels[i]); segLocal(g, -W / 2, 0, W / 2, 0); }
  buildPod(); buildLounge(); buildDust();

  interactables.push({ pos: term.pos, r: 1.5, label: () => `照明を切り替える ― ${MOODS[(mood.target + 1) % MOODS.length].jp}`, act: () => { setMood((mood.target + 1) % MOODS.length); audio.mood(mood.target); toast('LIGHTING : ' + MOODS[mood.target].name); } });
  const HN = ['PLANET', 'TERRAIN', 'GALAXY', 'OFF'];
  interactables.push({ pos: holo.pos, r: 1.75, label: () => `投影を切り替える ― ${HN[(holo.form + 1) % 4]}`, act: () => { holo.form = (holo.form + 1) % 4; audio.holo(holo.form); toast('PROJECTION : ' + HN[holo.form]); } });
  interactables.push({ pos: pod.pos, r: 1.75, label: () => pod.on ? 'シャワーを止める' : 'シャワーを出す', act: () => { pod.on = !pod.on; audio.shower(pod.on); toast('HYGIENE POD : ' + (pod.on ? 'ON' : 'OFF')); } });

  setMood(0, true); buildComposer(); drawTerminal(0);
  window.addEventListener('resize', buildComposer);
  requestAnimationFrame(t => { last = t; tick(t); });
}

// ---------------------------------------------------------------- loop
let last = 0, termTimer = 0, fpsAcc = 0, fpsN = 0;
function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min((now - last) / 1000, .05); last = now; time += dt;
  if (state === 'menu') { player.yaw = Math.PI + Math.sin(time * .16) * .32; player.pitch = -.03 + Math.sin(time * .11) * .03; }
  updatePlayer(dt); updateMood(dt); updateFocus();
  // 扉
  const dd = Math.hypot(player.x - door.pos.x, player.z - door.pos.z), want = (state === 'play' && dd < 2.1) ? 1 : 0;
  if (want !== door.want) { door.want = want; audio.door(!!want); }
  door.open = clamp(door.open + (want ? 1 : -1) * dt * 1.6, 0, 1); const e = door.open * door.open * (3 - 2 * door.open);
  for (const lf of door.leaves) lf.position.x = lf.userData.x0 + lf.userData.sx * e * .66;
  door.seg.on = door.open < .75;
  // ホログラム
  const tw = [holo.form === 0 ? 1 : 0, holo.form === 1 ? 1 : 0, holo.form === 2 ? 1 : 0];
  const hk = 1 - Math.exp(-dt * 2.6); holo.w.x += (tw[0] - holo.w.x) * hk; holo.w.y += (tw[1] - holo.w.y) * hk; holo.w.z += (tw[2] - holo.w.z) * hk;
  holo.power += ((holo.form === 3 ? 0 : 1) - holo.power) * (1 - Math.exp(-dt * 4));
  if (holo.form === 3) { const s = holo.w.x + holo.w.y + holo.w.z; if (s < .02) holo.w.set(0, 0, 0); }
  const flick = .9 + .1 * Math.sin(time * 31) * Math.sin(time * 7.3);
  holo.mat.uniforms.time.value = time; holo.mat.uniforms.power.value = holo.power * flick;
  holo.beam.material.opacity = .1 * holo.power * flick; holo.beam.visible = holo.power > .02; holo.light.intensity = 2.2 * holo.power * flick;
  pod.power += ((pod.on ? 1 : 0) - pod.power) * (1 - Math.exp(-dt * 2.2)); pod.mat.uniforms.power.value = pod.power; pod.mat.uniforms.time.value = time; pod.light.intensity = 4.5 + pod.power * 3;
  audio.listener(camera.position.x, camera.position.y, camera.position.z, player.yaw);
  for (const s of spinners) { s.rotation.y = time * .5; s.rotation.x = time * .23; }
  for (const m of term.mats) m.opacity = .92 + .08 * Math.sin(time * 40 + m.id);
  termTimer += dt; if (termTimer > .12) { termTimer = 0; drawTerminal(time); }
  dust.rotation.y = time * .012; dust.position.y = Math.sin(time * .2) * .05;
  skyMat.uniforms.time.value = time; finalPass.uniforms.time.value = time % 100;
  if (navLights) navLights.material.opacity = 1;
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').classList.remove('on'); }
  composer.render(dt);
  if (DEBUG) { fpsAcc += dt; fpsN++; if (fpsAcc > .5) { $('dbg').textContent = `${(fpsN / fpsAcc).toFixed(0)} fps  x ${player.x.toFixed(2)} z ${player.z.toFixed(2)}  yaw ${player.yaw.toFixed(2)}  ${quality}  calls ${renderer.info.render.calls}`; fpsAcc = fpsN = 0; } }
}

// ---------------------------------------------------------------- input / ui
function lock() { if (COARSE) return; try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch (e) { } }
function start() { audio.init({ podP: new THREE.Vector3(pod.pos.x, 1.2, pod.pos.z), termP: new THREE.Vector3(term.pos.x, 1.3, term.pos.z), doorP: new THREE.Vector3(door.pos.x, 1.2, door.pos.z), tableP: new THREE.Vector3(0, 1.1, 0) });
  state = 'play'; $('menu').classList.add('hide'); $('hud').classList.add('on'); if (!start.once) { start.once = true; player.yaw = Math.PI; player.pitch = -.02; } lock(); canvas.focus(); }
function pause() { state = 'menu'; keys.clear(); stick.x = stick.y = 0; stick.id = -1; lookT.id = -1; $('stick').style.display = 'none'; $('menu').classList.remove('hide'); $('hud').classList.remove('on'); $('startBtn').firstChild.textContent = 'RESUME'; $('startSub').textContent = '戻る'; if (document.pointerLockElement) document.exitPointerLock(); pause.yaw = player.yaw; }
$('startBtn').addEventListener('click', start);
$('qualBtn').addEventListener('click', () => { quality = quality === 'high' ? 'low' : 'high'; $('qualSub').textContent = quality === 'high' ? '高' : '軽量'; buildComposer(); });
$('qualSub').textContent = quality === 'high' ? '高' : '軽量';
$('pauseBtn').addEventListener('click', pause);
$('sndBtn').addEventListener('click', () => { $('sndSub').textContent = audio.toggle() ? '入' : '切'; });
// 音量つまみ（BGM / SE）。値はこのブラウザに覚えておく。
for (const k of ['bgm', 'se']) {
  const el = $(k + 'Vol'), out = $(k + 'Val'); let v = k === 'bgm' ? 15 : 60;   // 初期値：BGM 15% / SE 60%
  try { const sv = localStorage.getItem('k12.vol.' + k); if (sv !== null && isFinite(+sv)) v = clamp(+sv, 0, 100); } catch (e) { }
  const set = (n, save) => { el.value = n; out.textContent = n + '%'; el.style.setProperty('--p', n + '%'); audio.volume(k, n / 100); if (save) try { localStorage.setItem('k12.vol.' + k, n); } catch (e) { } };
  set(v, false); el.addEventListener('input', () => set(+el.value, true));
}
$('actBtn').addEventListener('pointerdown', e => { e.stopPropagation(); interact(); });
document.addEventListener('pointerlockchange', () => { const l = document.pointerLockElement === canvas; if (l) hadLock = true; else if (hadLock && state === 'play') pause(); });
addEventListener('keydown', e => {
  if (e.code === 'Escape') { state === 'play' ? pause() : 0; return; }
  if (state !== 'play') return; keys.add(e.code);
  if (e.code === 'KeyE' || e.code === 'Enter') interact();
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => keys.delete(e.code)); addEventListener('blur', () => keys.clear());
canvas.addEventListener('pointerdown', e => {
  if (state !== 'play') return;
  if (e.pointerType === 'touch') {
    e.preventDefault();
    if (e.clientX < innerWidth * .45 && stick.id < 0) { stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; const s = $('stick'); s.style.display = 'block'; s.style.left = e.clientX + 'px'; s.style.top = e.clientY + 'px'; s.firstChild.style.transform = ''; }
    else if (lookT.id < 0) { lookT.id = e.pointerId; lookT.x = e.clientX; lookT.y = e.clientY; }
  } else if (document.pointerLockElement === canvas) { if (e.button === 0) interact(); } else lock();
});
addEventListener('pointermove', e => {
  if (state !== 'play') return;
  if (e.pointerType === 'touch') {
    if (e.pointerId === stick.id) { let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy; const l = Math.hypot(dx, dy), mx = 52; if (l > mx) { dx *= mx / l; dy *= mx / l; } stick.x = dx / mx; stick.y = dy / mx; $('stick').firstChild.style.transform = `translate(${dx}px,${dy}px)`; }
    else if (e.pointerId === lookT.id) { look(e.clientX - lookT.x, e.clientY - lookT.y, .0048); lookT.x = e.clientX; lookT.y = e.clientY; }
  } else if (document.pointerLockElement === canvas || (e.buttons & 1)) look(e.movementX || 0, e.movementY || 0, .0022);
});
const endTouch = e => { if (e.pointerId === stick.id) { stick.id = -1; stick.x = stick.y = 0; $('stick').style.display = 'none'; } if (e.pointerId === lookT.id) lookT.id = -1; };
addEventListener('pointerup', endTouch); addEventListener('pointercancel', endTouch);
canvas.addEventListener('contextmenu', e => e.preventDefault());

// 確認用の窓口
window.ROOM = {
  pose(x, z, yaw, pitch = 0) { player.x = x; player.z = z; player.yaw = yaw; player.pitch = pitch; player.vx = player.vz = 0; state = 'play'; $('menu').classList.add('hide'); $('hud').classList.add('on'); },
  mood(i) { setMood(i, true); }, holo(i) { holo.form = i; holo.w.set(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0); holo.power = i === 3 ? 0 : 1; },
  door(v) { door.open = v; }, shower(v) { pod.on = v; pod.power = v ? 1 : 0; audio.shower(v); }, audio, quality(q) { quality = q; buildComposer(); },
  get state() { return { x: player.x, z: player.z, yaw: player.yaw, door: door.open, mood: mood.target, holo: holo.form, pod: pod.on, audio: audio.ready, state, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; },
  ready: false
};
build().then(() => { window.ROOM.ready = true; }).catch(e => { console.error(e); $('startSub').textContent = '起動に失敗しました'; });
