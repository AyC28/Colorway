/**
 * The Home story's 3D view (three.js, lazy-loaded). Every pixel of one photo
 * is a point: it starts in its place in the photo, flies to its place in OKLab
 * colour space (lightness up, hue around, chroma out), then takes its palette
 * colour. The visitor can turn the cloud by dragging or with the arrow keys.
 */
import * as THREE from "three";
import { linearToOklab, SRGB_TO_LINEAR } from "@/analysis/color";

export interface CloudData { w: number; h: number; rgb: Uint8Array; group: Uint8Array; palette: { hex: string }[] }
export interface CloudView { setProgress(p: number): void; resize(): void; dispose(): void }
/** Where each axis end lands on screen (CSS px within the canvas), for HTML labels. */
export interface AxisLabel { id: "light" | "dark" | "red" | "green" | "yellow" | "blue"; x: number; y: number }
const AXIS_ENDS: [AxisLabel["id"], number, number, number][] = [
  ["light", 0, 1.5, 0], ["dark", 0, -1.5, 0], ["red", 1.45, 0, 0], ["green", -1.45, 0, 0], ["yellow", 0, 0, 1.45], ["blue", 0, 0, -1.45],
];

const VERT = /* glsl */ `
  attribute vec3 aLab; attribute vec3 aColor; attribute vec3 aGroup; attribute float aDelay;
  uniform float uMorph; uniform float uGroup; uniform float uSize; uniform float uScale; uniform float uReveal;
  varying vec3 vColor;
  void main() {
    float t = clamp(uMorph * 1.5 - aDelay * 0.5, 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);
    vec3 p = mix(position, aLab, t);
    vColor = mix(aColor, aGroup, uGroup);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uReveal * uSize * mix(1.9, 1.0, t) * uScale / -mv.z; // grows in as the sharp photo fades; bigger while it is still a photo
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */ `
  varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;
    gl_FragColor = vec4(vColor, 1.0);
  }`;

const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createCloud(canvas: HTMLCanvasElement, d: CloudData, onAxes?: (labels: AxisLabel[], visible: number) => void, photoUrl?: string): CloudView {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.set(0, 0, 5.2);

  const n = d.w * d.h, aspect = d.w / d.h;
  const photo = new Float32Array(n * 3), lab = new Float32Array(n * 3), col = new Float32Array(n * 3), grp = new Float32Array(n * 3), delay = new Float32Array(n);
  const pal = d.palette.map((p) => hexToRgb(p.hex));
  const o = new Float32Array(3);
  for (let i = 0; i < n; i++) {
    const x = i % d.w, y = Math.floor(i / d.w);
    photo.set([(x / (d.w - 1) - 0.5) * 2.6 * aspect / 1.5, -(y / (d.h - 1) - 0.5) * 2.6 / 1.5, 0], i * 3);
    const r = d.rgb[i * 3], g = d.rgb[i * 3 + 1], b = d.rgb[i * 3 + 2];
    linearToOklab(SRGB_TO_LINEAR[r], SRGB_TO_LINEAR[g], SRGB_TO_LINEAR[b], o);
    lab.set([o[1] * 9, (o[0] - 0.5) * 2.8, o[2] * 9], i * 3);
    col.set([r / 255, g / 255, b / 255], i * 3);
    grp.set(pal[d.group[i]] ?? [r / 255, g / 255, b / 255], i * 3);
    delay[i] = (x / d.w) * 0.6 + ((i * 2654435761) % 1000) / 1000 * 0.4; // a left-to-right sweep with jitter
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(photo, 3));
  geo.setAttribute("aLab", new THREE.BufferAttribute(lab, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aGroup", new THREE.BufferAttribute(grp, 3));
  geo.setAttribute("aDelay", new THREE.BufferAttribute(delay, 1));
  const uniforms = { uMorph: { value: 0 }, uGroup: { value: 0 }, uSize: { value: 5 }, uScale: { value: 1 }, uReveal: { value: photoUrl ? 0 : 1 } };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms });
  const points = new THREE.Points(geo, mat);
  const rig = new THREE.Group();
  rig.add(points);
  // the lightness axis, so the vertical direction reads as "light to dark"
  const axisMat = new THREE.LineBasicMaterial({ color: 0x6b6b6b, transparent: true, opacity: 0 });
  // three axes: lightness (vertical), green–red (OKLab a) and blue–yellow (OKLab b)
  const axisGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -1.4, 0), new THREE.Vector3(0, 1.4, 0),
    new THREE.Vector3(-1.35, 0, 0), new THREE.Vector3(1.35, 0, 0),
    new THREE.Vector3(0, 0, -1.35), new THREE.Vector3(0, 0, 1.35),
  ]);
  const axis = new THREE.LineSegments(axisGeo, axisMat);
  rig.add(axis);
  const v = new THREE.Vector3();
  scene.add(rig);
  // the sharp photo, exactly where its pixels sit, so the story starts from the real image
  let photoMesh: THREE.Mesh | null = null, photoMat: THREE.MeshBasicMaterial | null = null, photoTex: THREE.Texture | null = null;
  if (photoUrl) {
    photoTex = new THREE.TextureLoader().load(photoUrl, () => request());
    photoTex.colorSpace = THREE.SRGBColorSpace;
    photoMat = new THREE.MeshBasicMaterial({ map: photoTex, transparent: true });
    photoMesh = new THREE.Mesh(new THREE.PlaneGeometry((2.6 * aspect) / 1.5 * (1 + 1 / (d.w - 1)), (2.6 / 1.5) * (1 + 1 / (d.h - 1))), photoMat);
    photoMesh.position.z = -0.01;
    rig.add(photoMesh);
  }

  let progress = 0, dragYaw = 0, dragPitch = 0, frame = 0;
  const draw = () => {
    frame = 0;
    const morph = smooth(0.15, 0.6, progress);
    uniforms.uMorph.value = morph;
    uniforms.uGroup.value = smooth(0.62, 0.8, progress);
    if (photoMat) {
      const reveal = smooth(0.03, 0.12, progress);
      uniforms.uReveal.value = reveal;
      photoMat.opacity = 1 - smooth(0.06, 0.14, progress);
      photoMesh!.visible = photoMat.opacity > 0.001;
    }
    axisMat.opacity = morph * 0.8;
    rig.rotation.y = morph * 0.75 + dragYaw;
    rig.rotation.x = morph * 0.3 + dragPitch;
    renderer.render(scene, camera);
    if (onAxes) {
      rig.updateMatrixWorld();
      const w = canvas.clientWidth, h = canvas.clientHeight;
      onAxes(AXIS_ENDS.map(([id, x, y, z]) => { v.set(x, y, z).applyMatrix4(rig.matrixWorld).project(camera); return { id, x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h }; }), morph);
    }
  };
  const request = () => { if (!frame) frame = requestAnimationFrame(draw); };

  // drag and keys turn the cloud once it has formed
  let last: { x: number; y: number } | null = null;
  const down = (e: PointerEvent) => { last = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); };
  const move = (e: PointerEvent) => {
    if (!last) return;
    dragYaw += (e.clientX - last.x) * 0.01; dragPitch = Math.max(-1.2, Math.min(1.2, dragPitch + (e.clientY - last.y) * 0.01));
    last = { x: e.clientX, y: e.clientY }; request();
  };
  const up = () => { last = null; };
  const key = (e: KeyboardEvent) => {
    const k = { ArrowLeft: [-0.15, 0], ArrowRight: [0.15, 0], ArrowUp: [0, -0.15], ArrowDown: [0, 0.15] }[e.key];
    if (!k) return;
    e.preventDefault(); dragYaw += k[0]; dragPitch = Math.max(-1.2, Math.min(1.2, dragPitch + k[1])); request();
  };
  canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up); canvas.addEventListener("keydown", key);

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    uniforms.uScale.value = (h * renderer.getPixelRatio()) / 260;
    request();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  return {
    setProgress(p) { progress = p; request(); },
    resize,
    dispose() {
      if (frame) cancelAnimationFrame(frame);
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up); canvas.removeEventListener("keydown", key);
      ro.disconnect();
      geo.dispose(); mat.dispose(); axisMat.dispose(); axisGeo.dispose(); photoMesh?.geometry.dispose(); photoMat?.dispose(); photoTex?.dispose(); renderer.dispose();
    },
  };
}
