/**
 * A 3D colour graph (three.js, lazy-loaded): every sampled pixel is a dot at its
 * place in OKLab (lightness up, hue around, colourfulness out), drawn in its own colour.
 * Layers: "cloud" (small, translucent: a family) and "focus" (larger, ringed: one photo).
 * Turn it by dragging or with the arrow keys; it renders only when something changes.
 */
import * as THREE from "three";
import { oklabToSrgb } from "@/analysis/color";

export interface Layer { id: string; lab: Float32Array; style: "cloud" | "focus"; visible: boolean }
export interface AxisLabel { id: "light" | "dark" | "red" | "green" | "yellow" | "blue"; x: number; y: number }
export interface ColorSpaceView { setLayers(layers: Layer[]): void; reset(): void; dispose(): void }

const K = 9; // OKLab a/b → scene units (same scale as the Home story)
const toScene = (L: number, a: number, b: number): [number, number, number] => [a * K, (L - 0.5) * 2.8, b * K];
const AXIS_ENDS: [AxisLabel["id"], number, number, number][] = [
  ["light", 0, 1.5, 0], ["dark", 0, -1.5, 0], ["red", 1.45, 0, 0], ["green", -1.45, 0, 0], ["yellow", 0, 0, 1.45], ["blue", 0, 0, -1.45],
];
const VERT = /* glsl */ `
  attribute vec3 aColor; uniform float uSize; uniform float uScale; varying vec3 vColor;
  void main() { vColor = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = uSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`;
const FRAG = /* glsl */ `
  varying vec3 vColor; uniform float uAlpha; uniform float uRing;
  void main() {
    vec2 c = gl_PointCoord - 0.5; float d = dot(c, c);
    if (d > 0.25) discard;
    vec3 col = (uRing > 0.5 && d > 0.13) ? vec3(0.08) : vColor; // a dark rim marks "your photo"
    gl_FragColor = vec4(col, uAlpha);
  }`;

export function createColorSpace(canvas: HTMLCanvasElement, onAxes?: (labels: AxisLabel[]) => void): ColorSpaceView {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.set(0, 0, 4.9);
  const rig = new THREE.Group();
  scene.add(rig);
  const axisGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -1.4, 0), new THREE.Vector3(0, 1.4, 0),
    new THREE.Vector3(-1.35, 0, 0), new THREE.Vector3(1.35, 0, 0),
    new THREE.Vector3(0, 0, -1.35), new THREE.Vector3(0, 0, 1.35),
  ]);
  const axisMat = new THREE.LineBasicMaterial({ color: 0x777777 });
  rig.add(new THREE.LineSegments(axisGeo, axisMat));

  let scale = 1, yaw = 0.7, pitch = 0.32, frame = 0;
  const objects = new Map<string, { pts: THREE.Points; geo: THREE.BufferGeometry; mat: THREE.ShaderMaterial }>();
  const v = new THREE.Vector3();
  const draw = () => {
    frame = 0;
    rig.rotation.set(pitch, yaw, 0);
    renderer.render(scene, camera);
    if (onAxes) {
      rig.updateMatrixWorld();
      const w = canvas.clientWidth, h = canvas.clientHeight;
      onAxes(AXIS_ENDS.map(([id, x, y, z]) => { v.set(x, y, z).applyMatrix4(rig.matrixWorld).project(camera); const pad = 14; return { id, x: Math.min(w - 2 * pad, Math.max(2 * pad, ((v.x + 1) / 2) * w)), y: Math.min(h - pad, Math.max(pad, ((1 - v.y) / 2) * h)) }; })); // labels stay inside the frame
    }
  };
  const request = () => { if (!frame) frame = requestAnimationFrame(draw); };

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    scale = (h * renderer.getPixelRatio()) / 260;
    for (const o of objects.values()) o.mat.uniforms.uScale.value = scale;
    request();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  let last: { x: number; y: number } | null = null;
  const down = (e: PointerEvent) => { last = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); };
  const move = (e: PointerEvent) => {
    if (!last) return;
    yaw += (e.clientX - last.x) * 0.01; pitch = Math.max(-1.3, Math.min(1.3, pitch + (e.clientY - last.y) * 0.01));
    last = { x: e.clientX, y: e.clientY }; request();
  };
  const up = () => { last = null; };
  const key = (e: KeyboardEvent) => {
    const k = ({ ArrowLeft: [-0.15, 0], ArrowRight: [0.15, 0], ArrowUp: [0, -0.15], ArrowDown: [0, 0.15] } as Record<string, number[]>)[e.key];
    if (!k) return;
    e.preventDefault(); yaw += k[0]; pitch = Math.max(-1.3, Math.min(1.3, pitch + k[1])); request();
  };
  canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up); canvas.addEventListener("keydown", key);
  resize();

  const rgb = new Float32Array(3);
  return {
    setLayers(layers) {
      for (const [id, o] of objects) if (!layers.some((l) => l.id === id)) { rig.remove(o.pts); o.geo.dispose(); o.mat.dispose(); objects.delete(id); }
      for (const l of layers) {
        let o = objects.get(l.id);
        if (!o) {
          const n = l.lab.length / 3, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) {
            pos.set(toScene(l.lab[i * 3], l.lab[i * 3 + 1], l.lab[i * 3 + 2]), i * 3);
            oklabToSrgb(l.lab[i * 3], l.lab[i * 3 + 1], l.lab[i * 3 + 2], rgb);
            col.set(rgb, i * 3);
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
          geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
          const focus = l.style === "focus";
          const mat = new THREE.ShaderMaterial({
            vertexShader: VERT, fragmentShader: FRAG, transparent: !focus, depthWrite: focus,
            uniforms: { uSize: { value: focus ? 20 : 11 }, uScale: { value: scale }, uAlpha: { value: focus ? 1 : 0.55 }, uRing: { value: focus ? 1 : 0 } },
          });
          const pts = new THREE.Points(geo, mat);
          pts.renderOrder = focus ? 2 : 1;
          rig.add(pts);
          o = { pts, geo, mat };
          objects.set(l.id, o);
        }
        o.pts.visible = l.visible;
      }
      request();
    },
    reset() { yaw = 0.7; pitch = 0.32; request(); },
    dispose() {
      if (frame) cancelAnimationFrame(frame);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up); canvas.removeEventListener("keydown", key);
      for (const o of objects.values()) { o.geo.dispose(); o.mat.dispose(); }
      axisGeo.dispose(); axisMat.dispose(); renderer.dispose();
    },
  };
}
