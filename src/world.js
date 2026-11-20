import * as THREE from 'three';
import {
  PONDS,
  VILLAGES,
  PATHS,
  PLAY_RADIUS,
  SPAWN,
  WORLD_SIZE,
  heightAt,
  terrainColorAt,
  getRegionName,
} from './world-data.js';
import { buildVillages } from './world-villages.js';
import { buildCoins } from './world-coins.js';
import { createNature } from './world-nature.js';
import { buildPonds } from './world-ponds.js';
import { buildSlimes } from './world-slimes.js';
import { ParticlePool, createPollen } from './particles.js';
import { mulberry32, lerp, smoothstep } from './utils.js';

const TERRAIN_SIZE = 520;
const TERRAIN_SEGMENTS = 380;
// Stay comfortably inside the camera's 480-unit far plane all the way across
// the play area, otherwise the sky dome gets clipped into a hard-edged hole.
const SKY_RADIUS = 340;

const skyVertexShader = /* glsl */ `
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const skyFragmentShader = /* glsl */ `
  uniform vec3 uHorizonColor;
  uniform vec3 uZenithColor;
  uniform vec3 uSunColor;
  uniform vec3 uSunDirection;
  varying vec3 vWorldPosition;

  void main() {
    vec3 direction = normalize(vWorldPosition - cameraPosition);
    float height = clamp(direction.y, -0.08, 1.0);
    float gradient = pow(max(height, 0.0), 0.62);
    vec3 color = mix(uHorizonColor, uZenithColor, gradient);
    color = mix(color, vec3(0.86, 0.88, 0.78), smoothstep(0.0, -0.15, direction.y));

    float sunDot = max(dot(direction, normalize(uSunDirection)), 0.0);
    float sunDisc = pow(sunDot, 1100.0);
    float sunHalo = pow(sunDot, 14.0);
    color += uSunColor * (sunDisc * 1.55 + sunHalo * 0.2);

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function createSky(scene, lowPower = false) {
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uHorizonColor: { value: new THREE.Color('#e5edd4') },
      uZenithColor: { value: new THREE.Color('#70b4e6') },
      uSunColor: { value: new THREE.Color('#fff2c0') },
      uSunDirection: { value: new THREE.Vector3(0.45, 0.7, 0.52).normalize() },
    },
    vertexShader: skyVertexShader,
    fragmentShader: skyFragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(
      SKY_RADIUS,
      lowPower ? 20 : 32,
      lowPower ? 12 : 18,
    ),
    skyMaterial,
  );
  sky.name = 'Sky';
  sky.frustumCulled = false;
  sky.renderOrder = -100;
  scene.add(sky);
  return sky;
}

function createLights(scene, worldGroup, lowPower = false) {
  const hemisphere = new THREE.HemisphereLight('#c6e9ff', '#5b7140', 1.3);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight('#fff1c6', 2.55);
  sun.position.set(40, 52, 26);
  sun.castShadow = true;
  const shadowSize = lowPower ? 1024 : 2048;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 130;
  sun.shadow.camera.left = -34;
  sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 34;
  sun.shadow.camera.bottom = -34;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.045;
  sun.target.position.set(0, 0, 0);
  scene.add(sun);
  scene.add(sun.target);

  const rimLight = new THREE.DirectionalLight('#b9dcff', 0.55);
  rimLight.position.set(-36, 25, -42);
  scene.add(rimLight);

  const world = new THREE.Group();
  world.name = 'SunTarget';
  worldGroup.add(world);

  return { hemisphere, sun, rimLight };
}

function createTerrain(worldGroup, segments = TERRAIN_SEGMENTS) {
  const geometry = new THREE.PlaneGeometry(
    TERRAIN_SIZE,
    TERRAIN_SIZE,
    segments,
    segments,
  );
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();

  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const height = heightAt(x, z);
    positions.setY(i, height);
    terrainColorAt(x, z, height, color);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.98,
    metalness: 0,
  });
  const terrain = new THREE.Mesh(geometry, material);
  terrain.receiveShadow = true;
  terrain.castShadow = false;
  terrain.name = 'Terrain';
  worldGroup.add(terrain);

  const outerGround = new THREE.Mesh(
    new THREE.CircleGeometry(600, 64),
    new THREE.MeshStandardMaterial({ color: '#6f8d5b', roughness: 1 }),
  );
  outerGround.rotation.x = -Math.PI / 2;
  outerGround.position.y = -3.2;
  outerGround.receiveShadow = false;
  worldGroup.add(outerGround);

  return terrain;
}

function createDistantHills(worldGroup) {
  const rng = mulberry32(83271);
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const material = new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false });
  const count = 32;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.12;
    const radius = 206 + rng() * 42;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const width = 58 + rng() * 46;
    const height = 11 + rng() * 9;
    // Sink most of each rounded hill into the terrain so only a soft crown
    // peeks over the horizon.
    dummy.position.set(x, heightAt(x, z) - height * 0.4, z);
    dummy.rotation.set(0, rng() * Math.PI * 2, 0);
    dummy.scale.set(width, height, width * (0.62 + rng() * 0.28));
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    color.setHSL(
      0.3 + rng() * 0.035,
      0.13 + rng() * 0.05,
      0.5 + rng() * 0.07,
      THREE.SRGBColorSpace,
    );
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.name = 'DistantHills';
  worldGroup.add(mesh);
  return mesh;
}

function createClouds(worldGroup) {
  const rng = mulberry32(15310);
  const parts = [];
  const cloudPuff = new THREE.IcosahedronGeometry(1, 1);
  const cloudGeometry = (() => {
    const mergedPuffs = [];
    const puffPositions = [
      [0, 0, 0, 1.4, 0.65, 1],
      [1.7, 0.1, 0.2, 1.1, 0.58, 0.85],
      [-1.6, -0.06, 0.1, 1.0, 0.53, 0.9],
      [0.7, 0.45, -0.3, 1.0, 0.52, 0.8],
      [-0.7, 0.3, 0.35, 0.9, 0.47, 0.75],
    ];
    for (const [x, y, z, sx, sy, sz] of puffPositions) {
      const puff = cloudPuff.clone();
      const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion(),
        new THREE.Vector3(sx, sy, sz),
      );
      puff.applyMatrix4(matrix);
      puff.deleteAttribute('normal');
      puff.deleteAttribute('uv');
      mergedPuffs.push(puff);
    }
    const merged = new THREE.BufferGeometry();
    const allPositions = [];
    for (const puff of mergedPuffs) {
      allPositions.push(...puff.attributes.position.array);
    }
    merged.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));
    merged.computeVertexNormals();
    return merged;
  })();

  const material = new THREE.MeshBasicMaterial({
    color: '#fff8e8',
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    fog: true,
  });
  const clouds = [];
  for (let i = 0; i < 10; i += 1) {
    const cloud = new THREE.Mesh(cloudGeometry, material);
    const angle = rng() * Math.PI * 2;
    const radius = 35 + rng() * 125;
    cloud.position.set(Math.cos(angle) * radius, 28 + rng() * 18, Math.sin(angle) * radius);
    cloud.rotation.y = rng() * Math.PI * 2;
    const scale = 3.2 + rng() * 4.3;
    cloud.scale.set(scale, scale * (0.75 + rng() * 0.25), scale);
    cloud.userData.speed = 0.15 + rng() * 0.3;
    cloud.userData.baseX = cloud.position.x;
    cloud.userData.drift = rng() * Math.PI * 2;
    cloud.renderOrder = -20;
    worldGroup.add(cloud);
    clouds.push(cloud);
  }
  return clouds;
}

function createTrailMarkers(worldGroup) {
  const rng = mulberry32(90210);
  const group = new THREE.Group();
  group.name = 'TrailMarkers';
  worldGroup.add(group);

  const spots = [
    [-4, -3, 0.4],
    [36, 31, -0.7],
    [-37, -21, 2.4],
    [7, 58, 0.1],
  ];

  for (const [x, z, rotation] of spots) {
    const y = heightAt(x, z);
    const marker = new THREE.Group();
    marker.position.set(x, y, z);
    marker.rotation.y = rotation;

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.085, 1.65, 6),
      new THREE.MeshStandardMaterial({ color: '#6c4d32', roughness: 0.9 }),
    );
    post.position.y = 0.825;
    post.castShadow = true;
    marker.add(post);

    const arrowMaterial = new THREE.MeshStandardMaterial({ color: '#947045', roughness: 0.85 });
    for (let i = 0; i < 3; i += 1) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.19, 0.06), arrowMaterial);
      board.position.set(i % 2 === 0 ? 0.24 : -0.24, 1.28 - i * 0.24, 0.04);
      board.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.045;
      board.castShadow = true;
      marker.add(board);
    }

    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.18, 4),
      new THREE.MeshStandardMaterial({ color: '#5b402a', roughness: 0.9 }),
    );
    cap.position.y = 1.7;
    cap.rotation.y = Math.PI / 4;
    marker.add(cap);

    marker.rotation.y += rng() * 0.2;
    group.add(marker);
  }

  return group;
}

export function createWorld(scene, { lowPower = false } = {}) {
  const worldGroup = new THREE.Group();
  worldGroup.name = 'TeddyBearWorld';
  scene.add(worldGroup);

  scene.fog = new THREE.Fog('#d3e2c3', 65, 235);
  scene.background = new THREE.Color('#d3e2c3');

  createSky(scene, lowPower);
  const lights = createLights(scene, worldGroup, lowPower);
  const terrain = createTerrain(
    worldGroup,
    lowPower ? 260 : TERRAIN_SEGMENTS,
  );
  createDistantHills(worldGroup);
  const clouds = createClouds(worldGroup);
  createTrailMarkers(worldGroup);

  const colliders = [];
  const villages = buildVillages(worldGroup, colliders);
  const ponds = buildPonds(worldGroup);

  const sparklePool = new ParticlePool(worldGroup, {
    maxParticles: lowPower ? 360 : 720,
    blending: THREE.AdditiveBlending,
  });
  const dustPool = new ParticlePool(worldGroup, {
    maxParticles: lowPower ? 260 : 520,
    blending: THREE.NormalBlending,
  });
  const coins = buildCoins(worldGroup, colliders, sparklePool);
  const nature = createNature(worldGroup, {
    colliders,
    coins: coins.coins,
    rng: mulberry32(39203),
    lowPower,
  });
  const slimes = buildSlimes(worldGroup, colliders, dustPool);
  const pollen = createPollen(worldGroup, {
    count: lowPower ? 130 : 240,
  });

  function updateLights(playerPosition) {
    const sun = lights.sun;
    sun.position.set(
      playerPosition.x + 40,
      playerPosition.y + 52,
      playerPosition.z + 26,
    );
    sun.target.position.set(playerPosition.x, playerPosition.y, playerPosition.z);
    sun.target.updateMatrixWorld();
  }

  function updateClouds(dt, elapsed) {
    for (const cloud of clouds) {
      cloud.position.x = cloud.userData.baseX + Math.sin(elapsed * 0.02 + cloud.userData.drift) * 14;
      cloud.position.y += Math.sin(elapsed * 0.17 + cloud.userData.drift) * 0.001;
    }
  }

  function update(dt, elapsed, playerPosition) {
    updateLights(playerPosition);
    ponds.update(elapsed);
    coins.update(dt, elapsed);
    slimes.update(dt, elapsed, playerPosition);
    sparklePool.update(dt);
    dustPool.update(dt);
    pollen.update(dt);
    updateClouds(dt, elapsed);

    // A soft dust puff follows the player while running through dry grass.
    if (
      nature &&
      Math.random() < dt * 4.5 &&
      playerPosition.speed > 3.8 &&
      playerPosition.grounded &&
      !playerPosition.inWater
    ) {
      dustPool.spawn({
        position: new THREE.Vector3(
          playerPosition.x,
          heightAt(playerPosition.x, playerPosition.z) + 0.08,
          playerPosition.z,
        ),
        count: 1,
        colors: ['#d9cba6', '#b6a27d', '#eee1c0'],
        speedMin: 0.2,
        speedMax: 0.55,
        upward: 0.35,
        spread: 1,
        sizeMin: 0.06,
        sizeMax: 0.12,
        lifeMin: 0.35,
        lifeMax: 0.7,
        gravity: 1.1,
      });
    }
  }

  function collectNearbyCoins(playerPosition, radius = 1.15) {
    const collected = [];
    for (const coin of coins.coins) {
      if (coin.collected) continue;
      const dx = playerPosition.x - coin.group.position.x;
      const dz = playerPosition.z - coin.group.position.z;
      const vertical = Math.abs(playerPosition.y + 1.05 - coin.group.position.y);
      if (dx * dx + dz * dz < radius * radius && vertical < 1.25) {
        if (coin.collect()) collected.push(coin);
      }
    }
    return collected;
  }

  function splashAt(position) {
    sparklePool.spawn({
      position: new THREE.Vector3(position.x, position.y + 0.06, position.z),
      count: 8,
      colors: ['#d8fff8', '#9de0e0', '#f2fffb'],
      speedMin: 0.4,
      speedMax: 1.6,
      upward: 1.1,
      spread: 1,
      sizeMin: 0.035,
      sizeMax: 0.09,
      lifeMin: 0.25,
      lifeMax: 0.55,
      gravity: 4.5,
    });
  }

  return {
    group: worldGroup,
    terrain,
    lights,
    villages,
    ponds,
    coins,
    nature,
    slimes,
    colliders,
    sparklePool,
    dustPool,
    update,
    collectNearbyCoins,
    splashAt,
    getRegionName,
    data: {
      coins: coins.coins,
      slimes: slimes.slimes,
      trees: nature.trees,
      villages,
      ponds: PONDS,
      paths: PATHS,
      playRadius: PLAY_RADIUS,
      spawn: SPAWN,
      worldSize: WORLD_SIZE,
    },
  };
}
