import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/* ═══════════════════════════════════════════════════════════════════════
   TopographicTerrainShader — standalone THREE.ShaderMaterial on a
   subdivided plane.
     · Vertex   : fractal Brownian motion (fBm) ridge/valley elevation
     · Fragment : stark white topographic contour lines on deep-black
                  terrain via fract(elevation * lineDensity)
   Props: heightScale, lineDensity, breachPulse (+ size / segments).
   Pure monochrome; crimson only bleeds in during a breach pulse.
   ═══════════════════════════════════════════════════════════════════════ */

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uHeight;
  varying float vElev;
  varying vec3  vPos;

  vec2 hash2(vec2 p){
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }
  float gnoise(vec2 p){
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
                   dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
               mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
                   dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 6; i++){
      v += a * gnoise(p);
      p = rot * p * 2.02;
      a *= 0.5;
    }
    return v;
  }

  void main(){
    vec3 pos = position;
    float e = fbm(pos.xy * 0.14 + vec2(uTime * 0.015, 0.0));
    e = pow(abs(e), 1.35) * 1.9;            // sharpen ridge lines
    pos.z = e * uHeight;
    vElev = e;
    vPos = pos;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform float uLineDensity;
  uniform float uBreach;
  varying float vElev;
  varying vec3  vPos;

  void main(){
    // topographic contour bands
    float band = fract(vElev * uLineDensity);
    float d = min(band, 1.0 - band);
    float aa = fwidth(vElev * uLineDensity);
    float line = 1.0 - smoothstep(0.0, aa * 1.6, d);

    // faint ground grid
    vec2 g = abs(fract(vPos.xy * 0.5) - 0.5);
    float grid = (1.0 - smoothstep(0.0, 0.025, min(g.x, g.y))) * 0.05;

    float lum = line * 0.92 + grid;
    vec3 col = vec3(lum);

    // breach: crimson bleeds through the contour lines
    vec3 crimson = vec3(1.0, 0.133, 0.2);
    col = mix(col, crimson * (line * 0.9 + 0.12), clamp(uBreach, 0.0, 1.0));

    // lowlands sit darker than ridges
    col *= 0.32 + 0.68 * smoothstep(-0.25, 1.05, vElev);

    gl_FragColor = vec4(col, 1.0);
  }
`;

export default function TopographicTerrainShader({
  size = 64,
  segments = 220,
  heightScale = 6,
  lineDensity = 14,
  breachPulse = false,
  position = [0, 0, 0],
  rotation = [-Math.PI / 2, 0, 0],
}) {
  const matRef = useRef(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uHeight: { value: heightScale },
      uLineDensity: { value: lineDensity },
      uBreach: { value: 0 },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useFrame((_, dt) => {
    const m = matRef.current;
    if (!m) return;
    const step = Math.min(dt, 0.05);
    m.uniforms.uTime.value += step;
    m.uniforms.uHeight.value = heightScale;
    m.uniforms.uLineDensity.value = lineDensity;
    const target = breachPulse
      ? 0.5 + 0.5 * Math.sin(m.uniforms.uTime.value * 7.0)
      : 0.0;
    m.uniforms.uBreach.value += (target - m.uniforms.uBreach.value) * Math.min(1, step * 6);
  });

  return (
    <mesh position={position} rotation={rotation} frustumCulled={false}>
      <planeGeometry args={[size, size, segments, segments]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
