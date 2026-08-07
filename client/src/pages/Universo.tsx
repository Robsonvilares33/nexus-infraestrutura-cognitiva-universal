import { useEffect, useRef } from "react";
import * as THREE from "three";

const AGENT_NAMES = [
  "Sincronia", "Pesquisa", "Memória", "Código",
  "Planejamento", "Crítica", "Síntese", "Execução", "Comunicação"
];
const TIER_NAMES = ["Ativa", "Relevante", "Histórica", "Arquivada"];
const TIER_COLORS = ["#3fe7b0", "#7cf3ff", "#c9b8ff", "#7684a0"];

export default function Universo() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020308);

    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 30, 50);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Center - Law Field
    const center = new THREE.Mesh(
      new THREE.SphereGeometry(2, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x7cf3ff, wireframe: true, transparent: true, opacity: 0.6 })
    );
    scene.add(center);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3, 0.1, 16, 64),
      new THREE.MeshBasicMaterial({ color: 0x7cf3ff, transparent: true, opacity: 0.3 })
    );
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);

    // Agents in K9
    const agentRadius = 18;
    const agentMeshes: THREE.Mesh[] = [];
    AGENT_NAMES.forEach((_, i) => {
      const angle = (i / AGENT_NAMES.length) * Math.PI * 2;
      const x = Math.cos(angle) * agentRadius;
      const z = Math.sin(angle) * agentRadius;
      const colors = [0x7cf3ff, 0xc9b8ff, 0x9fd8ff];
      const mesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.2, 1),
        new THREE.MeshBasicMaterial({ color: colors[i % 3], wireframe: true, transparent: true, opacity: 0.8 })
      );
      mesh.position.set(x, 0, z);
      scene.add(mesh);
      agentMeshes.push(mesh);

      // Connection to center
      scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(x,0,z)]),
        new THREE.LineBasicMaterial({ color: 0x7cf3ff, transparent: true, opacity: 0.15 })
      ));
    });

    // K9 edges
    for (let i = 0; i < AGENT_NAMES.length; i++) {
      for (let j = i + 1; j < AGENT_NAMES.length; j++) {
        const ai = (i / AGENT_NAMES.length) * Math.PI * 2;
        const aj = (j / AGENT_NAMES.length) * Math.PI * 2;
        scene.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(Math.cos(ai)*agentRadius, 0, Math.sin(ai)*agentRadius),
            new THREE.Vector3(Math.cos(aj)*agentRadius, 0, Math.sin(aj)*agentRadius),
          ]),
          new THREE.LineBasicMaterial({ color: 0xc9b8ff, transparent: true, opacity: 0.06 })
        ));
      }
    }

    // Memory layers
    TIER_NAMES.forEach((_, idx) => {
      const tierRing = new THREE.Mesh(
        new THREE.TorusGeometry(24 + idx * 4, 0.08, 8, 64),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(TIER_COLORS[idx]), transparent: true, opacity: 0.15 })
      );
      tierRing.rotation.x = Math.PI / 2;
      scene.add(tierRing);
    });

    // Particles
    const pc = 50;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(pc * 3);
    const pVel: {x:number;z:number}[] = [];
    for (let i = 0; i < pc; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 5 + Math.random() * 30;
      pPos[i*3] = Math.cos(a)*r;
      pPos[i*3+1] = (Math.random()-0.5)*2;
      pPos[i*3+2] = Math.sin(a)*r;
      pVel.push({ x: (Math.random()-0.5)*0.05, z: (Math.random()-0.5)*0.05 });
    }
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0x7cf3ff, size: 0.15, transparent: true, opacity: 0.6 }));
    scene.add(particles);

    // Stars
    const sc = 500;
    const sGeo = new THREE.BufferGeometry();
    const sPos = new Float32Array(sc * 3);
    for (let i = 0; i < sc; i++) {
      sPos[i*3] = (Math.random()-0.5)*200;
      sPos[i*3+1] = (Math.random()-0.5)*200;
      sPos[i*3+2] = (Math.random()-0.5)*200;
    }
    sGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
    scene.add(new THREE.Points(sGeo, new THREE.PointsMaterial({ color: 0xaab4d6, size: 0.08, transparent: true, opacity: 0.3 })));

    let mx = 0, my = 0;
    const onMove = (e: MouseEvent) => { mx = (e.clientX/window.innerWidth)*2-1; my = -(e.clientY/window.innerHeight)*2+1; };
    container.addEventListener("mousemove", onMove);

    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      center.rotation.y += 0.005;
      center.rotation.x += 0.002;
      ring.rotation.z += 0.003;
      agentMeshes.forEach((m, i) => {
        m.rotation.y += 0.01;
        const s = 1 + Math.sin(Date.now()*0.003+i)*0.1;
        m.scale.set(s, s, s);
      });
      const pos = pGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < pc; i++) {
        pos[i*3] += pVel[i].x;
        pos[i*3+2] += pVel[i].z;
        const d = Math.sqrt(pos[i*3]**2 + pos[i*3+2]**2);
        if (d > 35 || d < 3) { pVel[i].x *= -1; pVel[i].z *= -1; }
      }
      pGeo.attributes.position.needsUpdate = true;
      camera.position.x += (mx*5 - camera.position.x)*0.02;
      camera.position.y += (30 + my*3 - camera.position.y)*0.02;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animId);
      container.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", onResize);
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-[#e2e8f4] flex items-center gap-2">
          <span className="text-[#7cf3ff]">&#9672;</span>
          Universo Cognitivo
        </h2>
        <p className="text-[10px] font-mono text-[#7684a0] tracking-wider uppercase">
          Visualização 3D do campo de leis e ecossistema de agentes
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        {AGENT_NAMES.map((n, i) => (
          <span key={n} className="nexus-chip" style={{ color: i%3===0?"#7cf3ff":i%3===1?"#c9b8ff":"#9fd8ff" }}>{n}</span>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {TIER_NAMES.map((n, i) => (
          <span key={n} className="nexus-chip" style={{ color: TIER_COLORS[i], borderColor: TIER_COLORS[i]+"40" }}>Memória: {n}</span>
        ))}
      </div>
      <div ref={containerRef} className="w-full rounded-lg overflow-hidden border border-[rgba(150,175,220,0.08)]" style={{ height: "calc(100vh - 240px)", minHeight: "400px" }} />
    </div>
  );
}
