import * as THREE from 'three';
import { addColoredPart, mergeColoredParts } from './geometry-utils.js';
import { PONDS, heightAt, pondDistance } from './world-data.js';
import { mulberry32, randRange } from './utils.js';

const vertexShader = /* glsl */ `
  #include <fog_pars_vertex>
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  varying vec2 vUv;
  #include <fog_pars_fragment>

  void main() {
    vec2 p = vUv - 0.5;
    float radial = length(p) * 2.0;
    float edgeFade = 1.0 - smoothstep(0.78, 1.0, radial);

    float waveA = sin(vUv.x * 11.0 + uTime * 0.8 + sin(vUv.y * 6.0 - uTime * 0.5) * 1.2);
    float waveB = sin(vUv.y * 8.0 - uTime * 0.6 + vUv.x * 4.0);
    float glint = smoothstep(0.86, 0.99, waveA * 0.5 + waveB * 0.5 + 0.15);
    vec3 color = mix(uShallow, uDeep, smoothstep(0.18, 0.92, radial));
    color += vec3(0.08, 0.085, 0.055) * glint;

    float shore = smoothstep(0.76, 0.88, radial) * (1.0 - smoothstep(0.92, 1.0, radial));
    color = mix(color, vec3(0.76, 0.91, 0.83), shore * 0.36);

    gl_FragColor = vec4(color, edgeFade * 0.9);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function makeWaterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color('#3f7d88') },
        uShallow: { value: new THREE.Color('#7fb9ac') },
      },
    ]),
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
}

function addLilyPads(group, pond, rng) {
  const parts = [];
  const padCount = 5 + Math.floor(rng() * 5);
  const padGeometry = new THREE.CircleGeometry(1, 12, 0.25, Math.PI * 1.72);
  for (let i = 0; i < padCount; i += 1) {
    const angle = rng() * Math.PI * 2;
    const distance = randRange(rng, 0.15, 0.62);
    const x = pond.x + Math.cos(angle) * pond.rx * distance;
    const z = pond.z + Math.sin(angle) * pond.rz * distance;
    const radius = randRange(rng, 0.23, 0.46);
    addColoredPart(
      parts,
      padGeometry,
      i % 3 === 0 ? '#477f42' : '#5a9348',
      [x, pond.waterY + 0.018, z],
      { x: -Math.PI / 2, y: 0, z: rng() * Math.PI * 2 },
      { x: radius, y: radius * 0.85, z: radius },
    );
    if (i === 1) {
      const flowerParts = [
        [0.11, '#f5c4d6'],
        [-0.08, '#f1adc2'],
        [0.02, '#f9d8e5'],
      ];
      for (const [offset, color] of flowerParts) {
        addColoredPart(
          parts,
          new THREE.SphereGeometry(0.085, 7, 5),
          color,
          [x + offset, pond.waterY + 0.07, z + offset * 0.4],
          null,
          { x: 1, y: 0.5, z: 1 },
        );
      }
      addColoredPart(
        parts,
        new THREE.SphereGeometry(0.045, 6, 4),
        '#efd35b',
        [x, pond.waterY + 0.085, z],
        null,
        null,
      );
    }
  }
  const geometry = mergeColoredParts(parts);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.72,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `${pond.id}-lilypads`;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function addReeds(group, pond, rng) {
  const parts = [];
  const count = 10 + Math.floor(rng() * 6);
  for (let i = 0; i < count; i += 1) {
    const angle = rng() * Math.PI * 2;
    const distance = randRange(rng, 0.88, 1.06);
    const x = pond.x + Math.cos(angle) * pond.rx * distance;
    const z = pond.z + Math.sin(angle) * pond.rz * distance;
    const baseY = Math.max(heightAt(x, z), pond.waterY - 0.05);
    const height = randRange(rng, 0.55, 1.25);
    const tiltX = randRange(rng, -0.12, 0.12);
    const tiltZ = randRange(rng, -0.12, 0.12);
    addColoredPart(
      parts,
      new THREE.CylinderGeometry(0.012, 0.022, height, 4),
      '#5c8546',
      [x, baseY + height / 2, z],
      { x: tiltX, y: 0, z: tiltZ },
    );
    addColoredPart(
      parts,
      new THREE.CylinderGeometry(0.038, 0.048, 0.19, 5),
      '#77513b',
      [x, baseY + height + 0.04, z],
      { x: tiltX, y: 0, z: tiltZ },
    );
    if (i % 3 === 0) {
      addColoredPart(
        parts,
        new THREE.SphereGeometry(0.02, 5, 4),
        '#84934b',
        [x + 0.03, baseY + height * 0.6, z],
        null,
        { x: 1.8, y: 0.4, z: 0.7 },
      );
    }
  }
  const mesh = new THREE.Mesh(
    mergeColoredParts(parts),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = `${pond.id}-reeds`;
  group.add(mesh);
}

function addRipple(group, pond, material) {
  const ripple = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), material.clone());
  ripple.rotation.x = -Math.PI / 2;
  ripple.position.set(pond.x, pond.waterY + 0.012, pond.z);
  ripple.renderOrder = 3;
  ripple.userData.pond = pond;
  ripple.userData.phase = Math.random();
  ripple.userData.speed = 0.08 + Math.random() * 0.035;
  group.add(ripple);
  return ripple;
}

export function buildPonds(worldGroup) {
  const rng = mulberry32(77417);
  const group = new THREE.Group();
  group.name = 'Ponds';
  worldGroup.add(group);

  const waterMaterials = [];
  const ripples = [];
  const rippleMaterial = new THREE.MeshBasicMaterial({
    color: '#e2fff9',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  for (const pond of PONDS) {
    const waterMaterial = makeWaterMaterial();
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 64), waterMaterial);
    water.rotation.x = -Math.PI / 2;
    water.position.set(pond.x, pond.waterY, pond.z);
    water.scale.set(pond.rx * 0.92, pond.rz * 0.92, 1);
    water.renderOrder = 2;
    water.name = `${pond.id}-water`;
    water.receiveShadow = true;
    group.add(water);
    waterMaterials.push(waterMaterial);

    addLilyPads(group, pond, rng);
    addReeds(group, pond, rng);

    for (let i = 0; i < 2; i += 1) {
      const ripple = addRipple(group, pond, rippleMaterial);
      ripple.userData.phase = i * 0.48 + rng() * 0.18;
      ripples.push(ripple);
    }
  }

  function update(elapsed) {
    for (const material of waterMaterials) {
      material.uniforms.uTime.value = elapsed;
    }
    for (const ripple of ripples) {
      const cycle = (elapsed * ripple.userData.speed + ripple.userData.phase) % 1;
      const spread = 0.18 + cycle * 0.66;
      const pond = ripple.userData.pond;
      ripple.scale.set(pond.rx * spread, pond.rz * spread, 1);
      ripple.material.opacity = Math.sin(cycle * Math.PI) * 0.26;
    }
  }

  function spawnRippleAt(x, z) {
    // Small splash rings are handled by the particle system; the water shader
    // already carries the continuous surface animation.
    return { x, z };
  }

  return { group, update, spawnRippleAt, waterMaterials };
}
