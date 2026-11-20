import * as THREE from 'three';
import { makeCircleTexture } from './geometry-utils.js';
import { randRange } from './utils.js';

const particleVertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vColor = color;
    vAlpha = aAlpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize * uPixelRatio * (330.0 / max(0.75, -mvPosition.z));
  }
`;

const particleFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 centered = gl_PointCoord - 0.5;
    float distanceToCenter = length(centered);
    if (distanceToCenter > 0.5) discard;
    float alpha = smoothstep(0.5, 0.08, distanceToCenter) * vAlpha;
    gl_FragColor = vec4(vColor, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class ParticlePool {
  constructor(parent, { maxParticles = 600, blending = THREE.AdditiveBlending } = {}) {
    this.maxParticles = maxParticles;
    this.cursor = 0;
    this.positions = new Float32Array(maxParticles * 3);
    this.colors = new Float32Array(maxParticles * 3);
    this.sizes = new Float32Array(maxParticles);
    this.alphas = new Float32Array(maxParticles);
    this.velocities = new Float32Array(maxParticles * 3);
    this.life = new Float32Array(maxParticles);
    this.maxLife = new Float32Array(maxParticles);
    this.baseSizes = new Float32Array(maxParticles);
    this.gravity = new Float32Array(maxParticles);

    this.positions.fill(-999);
    this.alphas.fill(0);
    this.sizes.fill(0);

    const geometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(this.positions, 3);
    const colorAttribute = new THREE.BufferAttribute(this.colors, 3);
    const sizeAttribute = new THREE.BufferAttribute(this.sizes, 1);
    const alphaAttribute = new THREE.BufferAttribute(this.alphas, 1);
    positionAttribute.setUsage(THREE.DynamicDrawUsage);
    colorAttribute.setUsage(THREE.DynamicDrawUsage);
    sizeAttribute.setUsage(THREE.DynamicDrawUsage);
    alphaAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', positionAttribute);
    geometry.setAttribute('color', colorAttribute);
    geometry.setAttribute('aSize', sizeAttribute);
    geometry.setAttribute('aAlpha', alphaAttribute);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      },
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending,
      vertexColors: true,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    parent.add(this.points);
    this.geometry = geometry;
  }

  spawn({
    position,
    count = 12,
    colors = ['#ffe28c', '#ffc63d', '#fff2c4'],
    speedMin = 1.2,
    speedMax = 3.3,
    upward = 2.2,
    spread = 1,
    sizeMin = 0.045,
    sizeMax = 0.13,
    lifeMin = 0.45,
    lifeMax = 0.95,
    gravity = 5.5,
  }) {
    const color = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      const index = this.cursor;
      this.cursor = (this.cursor + 1) % this.maxParticles;
      const angle = Math.random() * Math.PI * 2;
      const horizontalSpeed = randRange(Math.random, speedMin, speedMax) * spread;
      const lateralSpeed = (Math.random() - 0.5) * 1.1 * spread;

      this.positions[index * 3] = position.x + (Math.random() - 0.5) * 0.18;
      this.positions[index * 3 + 1] = position.y + (Math.random() - 0.5) * 0.18;
      this.positions[index * 3 + 2] = position.z + (Math.random() - 0.5) * 0.18;
      this.velocities[index * 3] = Math.cos(angle) * horizontalSpeed;
      this.velocities[index * 3 + 1] = upward * (0.3 + Math.random() * 0.9);
      this.velocities[index * 3 + 2] = Math.sin(angle) * horizontalSpeed + lateralSpeed;

      color.set(colors[Math.floor(Math.random() * colors.length)]);
      this.colors[index * 3] = color.r;
      this.colors[index * 3 + 1] = color.g;
      this.colors[index * 3 + 2] = color.b;
      this.baseSizes[index] = randRange(Math.random, sizeMin, sizeMax);
      this.sizes[index] = this.baseSizes[index];
      this.alphas[index] = 1;
      const life = randRange(Math.random, lifeMin, lifeMax);
      this.life[index] = life;
      this.maxLife[index] = life;
      this.gravity[index] = gravity;
    }
  }

  update(dt) {
    for (let index = 0; index < this.maxParticles; index += 1) {
      if (this.life[index] <= 0) continue;
      this.life[index] -= dt;
      if (this.life[index] <= 0) {
        this.alphas[index] = 0;
        this.sizes[index] = 0;
        this.positions[index * 3 + 1] = -999;
        continue;
      }
      const t = this.life[index] / this.maxLife[index];
      this.velocities[index * 3 + 1] -= this.gravity[index] * dt;
      this.positions[index * 3] += this.velocities[index * 3] * dt;
      this.positions[index * 3 + 1] += this.velocities[index * 3 + 1] * dt;
      this.positions[index * 3 + 2] += this.velocities[index * 3 + 2] * dt;
      this.velocities[index * 3] *= 1 - dt * 1.2;
      this.velocities[index * 3 + 2] *= 1 - dt * 1.2;
      this.alphas[index] = t * t;
      this.sizes[index] = this.baseSizes[index] * (0.55 + t * 0.6);
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
  }
}

export function createPollen(parent, { count = 240 } = {}) {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * 95;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = 8 + Math.random() * 18;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
    phases[i] = Math.random() * Math.PI * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    map: makeCircleTexture(),
    color: '#fff0b7',
    size: 0.16,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  parent.add(points);
  let elapsed = 0;
  const base = new Float32Array(positions);

  function update(dt) {
    elapsed += dt;
    const array = geometry.attributes.position.array;
    for (let i = 0; i < count; i += 1) {
      const phase = phases[i];
      array[i * 3] = base[i * 3] + Math.sin(elapsed * 0.22 + phase) * 1.8;
      array[i * 3 + 1] = base[i * 3 + 1] + Math.sin(elapsed * 0.4 + phase * 1.7) * 0.75;
      array[i * 3 + 2] = base[i * 3 + 2] + Math.cos(elapsed * 0.18 + phase * 1.3) * 1.8;
    }
    geometry.attributes.position.needsUpdate = true;
  }

  return { points, update };
}
