// planner/js/scene3d.js — Three.js 3D 보기 (지연 로딩)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { cabDims, bbox, curvature } from './engine.js';
import { screenEnvelope } from './plan2d.js';

const BAR_COLORS = ['#f5f5f5', '#f5e663', '#5fe3e3', '#5fd36b', '#e35fd8', '#e35f5f', '#5f6be3', '#202020'];

function patternTexture(screen, sum, label) {
  const W = Math.max(64, Math.min(2048, sum.resW || 512));
  const H = Math.max(64, Math.min(2048, Math.round(W * (sum.resH / Math.max(1, sum.resW)) || 256)));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const bw = W / BAR_COLORS.length;
  BAR_COLORS.forEach((c, i) => { g.fillStyle = c; g.fillRect(i * bw, 0, bw + 1, H * 0.62); });
  const grad = g.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, '#000'); grad.addColorStop(1, '#fff');
  g.fillStyle = grad; g.fillRect(0, H * 0.62, W, H * 0.14);
  g.fillStyle = '#111'; g.fillRect(0, H * 0.76, W, H * 0.24);
  g.fillStyle = '#fff';
  g.font = `700 ${Math.round(H * 0.1)}px "Gothic A1", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, W / 2, H * 0.84);
  g.font = `400 ${Math.round(H * 0.06)}px "IBM Plex Mono", monospace`;
  g.fillText(`${sum.resW} × ${sum.resH}`, W / 2, H * 0.94);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function setPlaneUV(geo, u0, v0, u1, v1) {
  const uv = geo.attributes.uv;
  // PlaneGeometry 순서: 왼위, 오위, 왼아래, 오아래
  uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
  uv.needsUpdate = true;
}

function buildPerson() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a94a6, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 1.05, 4, 12), mat);
  body.position.y = 0.18 + 1.05 / 2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), mat);
  head.position.y = 1.62;
  g.add(body, head);
  return g;
}

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 2000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.1));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(4, 8, 6);
  scene.add(dir);
  let floor = null;
  const root = new THREE.Group();
  scene.add(root);
  const person = buildPerson();
  scene.add(person);
  let framed = false;
  let lastBox = null;
  let disposed = false;

  function resize() {
    const w = container.clientWidth || 600, h = container.clientHeight || 360;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  function loop() {
    if (disposed) return;
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  loop();

  function clear() {
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); }
    });
    root.clear();
  }

  function frame(box) {
    const size = new THREE.Vector3(), center = new THREE.Vector3();
    box.getSize(size); box.getCenter(center);
    const r = Math.max(size.x, size.y, size.z, 2);
    const dist = r / (2 * Math.tan((camera.fov * Math.PI) / 360)) * 1.35;
    camera.position.set(center.x + r * 0.35, center.y + r * 0.25, center.z + dist);
    controls.target.copy(center);
    controls.update();
  }

  function update(project, panels, sums, opts = {}) {
    clear();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.6, metalness: 0.3 });
    const lineMat = new THREE.LineBasicMaterial({ color: 0x0b0d10 });
    const selLine = new THREE.LineBasicMaterial({ color: 0x2563eb });
    for (const s of project.screens) {
      const sum = sums[s.id];
      if (!s.cabs.length) continue;
      const env = screenEnvelope(s, panels, sum);
      const b = bbox(s.cabs, panels);
      const grp = new THREE.Group();
      const tex = opts.pattern !== false ? patternTexture(s, sum, s.name || opts.typeLabel(s.type)) : null;
      const faceMat = tex ? new THREE.MeshBasicMaterial({ map: tex }) : new THREE.MeshStandardMaterial({ color: 0x0f1724, roughness: 0.4 });
      const panel = panels[s.panelId];
      const curv = env.curv;
      const depthM = 0.08;
      for (const c of s.cabs) {
        const d = cabDims(c, panels[c.p]);
        const w = d.w / 1000, h = d.h / 1000;
        const cab = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, depthM), bodyMat);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), s.id === opts.selectedId ? selLine : lineMat);
        const plane = new THREE.PlaneGeometry(w * 0.985, h * 0.985);
        const u0 = (c.x - b.x) / b.w, u1 = (c.x - b.x + d.w) / b.w;
        const v1 = 1 - (c.y - b.y) / b.h, v0 = 1 - (c.y - b.y + d.h) / b.h;
        setPlaneUV(plane, u0, v0, u1, v1);
        const face = new THREE.Mesh(plane, faceMat);
        face.position.z = depthM / 2 + 0.002;
        cab.add(box, edges, face);
        const yC = (b.h - (c.y - b.y + d.h / 2)) / 1000;
        const sMm = c.x - b.x + d.w / 2 - b.w / 2; // 전개 기준 중심에서의 거리
        if (curv && panel) {
          const R = curv.radius / 1000;
          const theta = (sMm / panel.w) * (curv.jointAngle * Math.PI / 180);
          const sign = curv.inward ? 1 : -1;
          cab.position.set(R * Math.sin(theta), yC, sign * R * (1 - Math.cos(theta)));
          cab.rotation.y = -sign * theta;
        } else {
          cab.position.set(sMm / 1000, yC, 0);
        }
        grp.add(cab);
      }
      const holder = new THREE.Group();
      holder.add(grp);
      holder.position.set((s.pos.x + env.frontW / 2) / 1000, (s.pos.y || 0) / 1000, -(s.pos.z || 0) / 1000);
      holder.rotation.order = 'YXZ';
      holder.rotation.y = -((s.pos.yaw || 0) * Math.PI) / 180;
      holder.rotation.x = -((s.pos.tilt || 0) * Math.PI) / 180;
      root.add(holder);
    }
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) box.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2, 1));
    const size = new THREE.Vector3(); box.getSize(size);
    if (floor) { scene.remove(floor); floor.geometry.dispose(); floor.material.dispose(); }
    const fsz = Math.ceil(Math.max(size.x, size.z, 6) * 2);
    floor = new THREE.GridHelper(fsz, fsz, 0x6b7280, opts.dark ? 0x30343c : 0xd5d9e0);
    const center = new THREE.Vector3(); box.getCenter(center);
    floor.position.set(Math.round(center.x), 0, Math.round(center.z));
    scene.add(floor);
    scene.background = new THREE.Color(opts.dark ? 0x14161a : 0xf3f4f6);
    person.visible = opts.person !== false;
    person.position.set(box.min.x - 0.7, 0, box.max.z + 0.3);
    const key = [box.min.toArray(), box.max.toArray()].flat().map((v) => v.toFixed(2)).join(',');
    if (!framed || key !== lastBox && opts.reframe) { frame(box); framed = true; }
    lastBox = key;
  }

  return {
    update,
    resetView() { const box = new THREE.Box3().setFromObject(root); if (!box.isEmpty()) frame(box); },
    snapshot() { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); },
    resize,
    dispose() { disposed = true; ro.disconnect(); clear(); renderer.dispose(); renderer.domElement.remove(); },
  };
}
