import { useEffect, useRef } from "react";
import * as THREE from "three";

const heightAt = (x, z) => {
  const ridge = 0.31 * Math.exp(-((x + 0.45) ** 2 + (z - 0.1) ** 2) * 2.4);
  const hill = 0.22 * Math.exp(-((x - 0.65) ** 2 + (z + 0.35) ** 2) * 4.2);
  return ridge + hill + Math.sin(x * 4.6) * Math.cos(z * 5.2) * 0.055;
};

/** Interactive, isometric sector terrain inspired by a live border command map. */
export default function TacticalGlobe({ variant = "card" }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 100);
    camera.position.set(3.25, 3.05, 4.05);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const rig = new THREE.Group();
    rig.rotation.y = -0.38;
    scene.add(rig);
    scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(2.5, 5, 3);
    scene.add(keyLight);

    const terrainGeometry = new THREE.PlaneGeometry(3.65, 2.7, 38, 28);
    const position = terrainGeometry.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = -position.getY(i);
      position.setZ(i, heightAt(x, z));
    }
    terrainGeometry.computeVertexNormals();
    terrainGeometry.rotateX(-Math.PI / 2);

    const terrain = new THREE.Mesh(
      terrainGeometry,
      new THREE.MeshStandardMaterial({ color: 0x5f5f5f, roughness: 0.88, metalness: 0.08, transparent: true, opacity: 0.82 })
    );
    rig.add(terrain);
    rig.add(new THREE.LineSegments(
      new THREE.WireframeGeometry(terrainGeometry),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15 })
    ));

    const boundary = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-1.75, 0.02, -0.72), new THREE.Vector3(-0.9, 0.12, -0.34),
        new THREE.Vector3(-0.18, 0.23, -0.08), new THREE.Vector3(0.58, 0.19, 0.2),
        new THREE.Vector3(1.72, 0.08, 0.83),
      ]),
      new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.11, gapSize: 0.06, transparent: true, opacity: 0.72 })
    );
    boundary.computeLineDistances();
    rig.add(boundary);

    const nodeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pulses = [];
    [[-0.85, -0.15], [0.15, 0.36], [0.93, -0.32]].forEach(([x, z], index) => {
      const y = heightAt(x, z);
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.045, 0.38, 8), nodeMaterial);
      tower.position.set(x, y + 0.19, z);
      rig.add(tower);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), nodeMaterial);
      beacon.position.set(x, y + 0.43, z);
      rig.add(beacon);
      const pulse = new THREE.Mesh(
        new THREE.RingGeometry(0.1, 0.125, 32),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })
      );
      pulse.rotation.x = -Math.PI / 2;
      pulse.position.set(x, y + 0.025, z);
      rig.add(pulse);
      pulses.push({ mesh: pulse, phase: index * 1.75 });
    });

    const satellite = new THREE.Group();
    satellite.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.16), nodeMaterial));
    const panelMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.52 });
    const leftPanel = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.012, 0.12), panelMaterial);
    const rightPanel = leftPanel.clone();
    leftPanel.position.x = -0.22;
    rightPanel.position.x = 0.22;
    satellite.add(leftPanel, rightPanel);
    satellite.position.set(-1.28, 1.36, 0.45);
    satellite.rotation.set(0.35, 0.45, -0.2);
    rig.add(satellite);

    const target = new THREE.Vector2();
    const pointerMove = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      target.x = ((event.clientX - rect.left) / rect.width - 0.5) * 0.62;
      target.y = ((event.clientY - rect.top) / rect.height - 0.5) * 0.18;
    };
    const pointerLeave = () => target.set(0, 0);
    renderer.domElement.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("pointerleave", pointerLeave);

    const resize = () => {
      const { width, height } = mount.getBoundingClientRect();
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    let frame;
    const start = performance.now();
    const render = (now) => {
      const elapsed = (now - start) / 1000;
      rig.rotation.y += (-0.38 + target.x - rig.rotation.y) * 0.025;
      rig.rotation.x += (target.y - rig.rotation.x) * 0.025;
      satellite.position.y = 1.36 + Math.sin(elapsed * 1.3) * 0.055;
      satellite.rotation.y = 0.45 + elapsed * 0.22;
      pulses.forEach(({ mesh, phase }) => {
        const progression = (elapsed * 0.45 + phase) % 1;
        mesh.scale.setScalar(0.7 + progression * 2.25);
        mesh.material.opacity = (1 - progression) * 0.34;
      });
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("pointerleave", pointerLeave);
      scene.traverse((item) => {
        item.geometry?.dispose();
        if (Array.isArray(item.material)) item.material.forEach((material) => material.dispose());
        else item.material?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={mountRef} className={`tactical-globe tactical-globe--${variant}`} aria-label="Interactive 3D border sector terrain model" />;
}
