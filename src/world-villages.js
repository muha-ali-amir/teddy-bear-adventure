import * as THREE from 'three';
import anime from 'animejs/lib/anime.es.js';
import {
  addColoredPart,
  composeMatrix,
  mergeColoredParts,
} from './geometry-utils.js';
import { heightAt, VILLAGES, SPAWN } from './world-data.js';
import { mulberry32, randRange } from './utils.js';

const WALL_COLORS = ['#e7cfa4', '#e4c59a', '#f0d9b4', '#d9bc91', '#ead3ad'];
const ROOF_COLORS = ['#a94f3f', '#7a563f', '#596d51', '#b06946', '#6b7c65', '#9e5b48'];
const WOOD = '#513b2b';
const STONE = '#8d8778';
const STONE_LIGHT = '#a8a294';

function addLantern(parts, glowParts, parent, x, z, rotation = 0) {
  addColoredPart(parts, new THREE.CylinderGeometry(0.045, 0.075, 2.15, 6), WOOD, [x, 1.1, z], {
    x: 0,
    y: rotation,
    z: 0,
  }, null, parent);
  addColoredPart(parts, new THREE.BoxGeometry(0.1, 0.13, 0.45), WOOD, [x, 2.1, z], { x: 0, y: rotation, z: 0 }, null, parent);
  addColoredPart(parts, new THREE.BoxGeometry(0.4, 0.08, 0.4), WOOD, [x, 2.42, z], { x: 0, y: rotation + Math.PI / 4, z: 0 }, null, parent);
  addColoredPart(glowParts, new THREE.BoxGeometry(0.23, 0.34, 0.23), '#ffd482', [x, 2.24, z], { x: 0, y: rotation + Math.PI / 4, z: 0 }, null, parent);
  addColoredPart(parts, new THREE.ConeGeometry(0.33, 0.22, 4), WOOD, [x, 2.56, z], { x: 0, y: rotation + Math.PI / 4, z: 0 }, null, parent);
}

function addWell(parts, parent) {
  addColoredPart(parts, new THREE.CylinderGeometry(1.48, 1.58, 0.1, 16), STONE_LIGHT, [0, 0.05, 0], null, null, parent);
  addColoredPart(parts, new THREE.CylinderGeometry(0.94, 1.04, 0.78, 14), STONE, [0, 0.48, 0], null, null, parent);
  addColoredPart(parts, new THREE.CylinderGeometry(0.79, 0.79, 0.09, 16), '#252b25', [0, 0.85, 0], null, null, parent);
  addColoredPart(parts, new THREE.CylinderGeometry(0.7, 0.7, 0.025, 16), '#536c65', [0, 0.9, 0], null, null, parent);
  for (const side of [-1, 1]) {
    addColoredPart(parts, new THREE.BoxGeometry(0.1, 1.7, 0.1), WOOD, [side * 0.72, 1.66, 0], null, null, parent);
    addColoredPart(parts, new THREE.BoxGeometry(0.16, 0.15, 0.16), '#6c4a31', [side * 0.72, 0.98, 0], null, null, parent);
  }
  addColoredPart(parts, new THREE.CylinderGeometry(0.05, 0.05, 1.7, 6), '#6c4a31', [0, 2.35, 0], { x: 0, y: 0, z: Math.PI / 2 }, null, parent);
  addColoredPart(parts, new THREE.ConeGeometry(1.18, 0.72, 4), '#7e5840', [0, 2.88, 0], { x: 0, y: Math.PI / 4, z: 0 }, null, parent);
  addColoredPart(parts, new THREE.SphereGeometry(0.13, 8, 6), '#6b5130', [0.25, 2.08, 0], null, null, parent);
  addColoredPart(parts, new THREE.CylinderGeometry(0.02, 0.02, 0.8, 4), '#c0a46c', [0.25, 2.46, 0], null, null, parent);
}

function addHouse(parts, glowParts, rng, house, parent) {
  const { width: w, depth: d, wallHeight: wallH, roofHeight: roofH } = house;
  const wallColor = WALL_COLORS[Math.floor(rng() * WALL_COLORS.length)];
  const roofColor = ROOF_COLORS[Math.floor(rng() * ROOF_COLORS.length)];
  const foundationHeight = 0.32;
  const wallY = foundationHeight + wallH / 2;
  const roofBaseY = foundationHeight + wallH;
  const roofRadius = Math.hypot(w, d) / 2 + 0.3;
  const trimColor = '#f4e3c0';
  const doorX = 0;

  // Stone footing and plaster walls.
  addColoredPart(
    parts,
    new THREE.BoxGeometry(w + 0.22, foundationHeight, d + 0.22),
    STONE,
    [0, foundationHeight / 2, 0],
    null,
    null,
    parent,
  );
  addColoredPart(
    parts,
    new THREE.BoxGeometry(w, wallH, d),
    wallColor,
    [0, wallY, 0],
    null,
    null,
    parent,
  );

  // Timber framing. Keep the beams slightly proud of the plaster: when their
  // outer faces sit flush with the wall the coplanar surfaces z-fight and
  // flicker as the camera moves.
  const beamInset = 0.03;
  for (const x of [-w / 2 + beamInset, w / 2 - beamInset]) {
    for (const z of [-d / 2 + beamInset, d / 2 - beamInset]) {
      addColoredPart(parts, new THREE.BoxGeometry(0.12, wallH + 0.06, 0.12), WOOD, [x, wallY, z], null, null, parent);
    }
  }
  for (const z of [-d / 2 + beamInset, d / 2 - beamInset]) {
    addColoredPart(parts, new THREE.BoxGeometry(w, 0.11, 0.12), WOOD, [0, wallY + wallH * 0.22, z], null, null, parent);
    addColoredPart(parts, new THREE.BoxGeometry(w, 0.15, 0.12), WOOD, [0, roofBaseY - 0.06, z], null, null, parent);
  }
  for (const x of [-w / 2 + beamInset, w / 2 - beamInset]) {
    addColoredPart(parts, new THREE.BoxGeometry(0.12, 0.12, d), WOOD, [x, wallY + wallH * 0.22, 0], null, null, parent);
    addColoredPart(parts, new THREE.BoxGeometry(0.12, 0.15, d), WOOD, [x, roofBaseY - 0.06, 0], null, null, parent);
  }

  // Door.
  addColoredPart(parts, new THREE.BoxGeometry(0.82, 1.5, 0.1), '#b88a54', [doorX, foundationHeight + 0.75, d / 2 + 0.04], null, null, parent);
  addColoredPart(parts, new THREE.BoxGeometry(0.92, 0.13, 0.15), WOOD, [doorX, foundationHeight + 1.54, d / 2 + 0.08], null, null, parent);
  addColoredPart(parts, new THREE.BoxGeometry(0.08, 1.5, 0.14), WOOD, [doorX - 0.48, foundationHeight + 0.75, d / 2 + 0.06], null, null, parent);
  addColoredPart(parts, new THREE.BoxGeometry(0.08, 1.5, 0.14), WOOD, [doorX + 0.48, foundationHeight + 0.75, d / 2 + 0.06], null, null, parent);
  addColoredPart(parts, new THREE.CylinderGeometry(0.04, 0.04, 0.04, 6), '#e4c26d', [doorX + 0.29, foundationHeight + 0.8, d / 2 + 0.12], { x: Math.PI / 2, y: 0, z: 0 }, null, parent);
  addColoredPart(parts, new THREE.BoxGeometry(1.2, 0.12, 0.42), STONE_LIGHT, [doorX, 0.08, d / 2 + 0.3], null, null, parent);
  addColoredPart(parts, new THREE.BoxGeometry(1.2, 0.12, 0.75), '#8f6544', [doorX, foundationHeight + 1.72, d / 2 + 0.35], { x: -0.22, y: 0, z: 0 }, null, parent);

  // Front windows with warm panes and little window boxes.
  for (const side of [-1, 1]) {
    const x = doorX + side * w * 0.31;
    const windowY = foundationHeight + wallH * 0.58;
    addColoredPart(parts, new THREE.BoxGeometry(0.53, 0.58, 0.08), WOOD, [x, windowY, d / 2 + 0.035], null, null, parent);
    addColoredPart(glowParts, new THREE.BoxGeometry(0.42, 0.47, 0.06), '#ffd484', [x, windowY, d / 2 + 0.085], null, null, parent);
    addColoredPart(parts, new THREE.BoxGeometry(0.04, 0.48, 0.07), WOOD, [x, windowY, d / 2 + 0.12], null, null, parent);
    addColoredPart(parts, new THREE.BoxGeometry(0.43, 0.04, 0.07), WOOD, [x, windowY, d / 2 + 0.12], null, null, parent);
    addColoredPart(parts, new THREE.BoxGeometry(0.55, 0.15, 0.23), '#725137', [x, foundationHeight + wallH * 0.32, d / 2 + 0.2], null, null, parent);
    for (let flower = 0; flower < 4; flower += 1) {
      addColoredPart(
        parts,
        new THREE.SphereGeometry(0.055, 7, 5),
        flower % 2 === 0 ? '#d96d68' : '#e8cc63',
        [x - 0.18 + flower * 0.12, foundationHeight + wallH * 0.32 + 0.09, d / 2 + 0.28],
        null,
        null,
        parent,
      );
      addColoredPart(
        parts,
        new THREE.SphereGeometry(0.06, 6, 4),
        '#4f813f',
        [x - 0.18 + flower * 0.12, foundationHeight + wallH * 0.3 + 0.005, d / 2 + 0.26],
        null,
        { x: 0.8, y: 0.8, z: 0.8 },
        parent,
      );
    }
  }

  // A side window with shutters.
  addColoredPart(
    parts,
    new THREE.BoxGeometry(0.08, 0.54, 0.5),
    WOOD,
    [w / 2 + 0.035, foundationHeight + wallH * 0.58, -d * 0.15],
    null,
    null,
    parent,
  );
  addColoredPart(
    glowParts,
    new THREE.BoxGeometry(0.06, 0.44, 0.4),
    '#ffd484',
    [w / 2 + 0.08, foundationHeight + wallH * 0.58, -d * 0.15],
    null,
    null,
    parent,
  );
  for (const side of [-1, 1]) {
    addColoredPart(
      parts,
      new THREE.BoxGeometry(0.06, 0.5, 0.16),
      '#6e533c',
      [w / 2 + 0.09, foundationHeight + wallH * 0.58, -d * 0.15 + side * 0.34],
      null,
      null,
      parent,
    );
  }

  // Steep, cosy roof.
  addColoredPart(
    parts,
    new THREE.ConeGeometry(roofRadius, roofH, 4),
    roofColor,
    [0, roofBaseY + roofH / 2 - 0.04, 0],
    { x: 0, y: Math.PI / 4, z: 0 },
    null,
    parent,
  );
  addColoredPart(
    parts,
    new THREE.ConeGeometry(0.16, 0.34, 4),
    '#58483b',
    [0, roofBaseY + roofH + 0.1, 0],
    { x: 0, y: Math.PI / 4, z: 0 },
    null,
    parent,
  );

  // Chimney.
  const chimneyX = w * 0.29;
  const chimneyZ = -d * 0.19;
  const chimneyHeight = 1.15;
  addColoredPart(
    parts,
    new THREE.BoxGeometry(0.42, chimneyHeight, 0.42),
    STONE,
    [chimneyX, roofBaseY + roofH * 0.56, chimneyZ],
    null,
    null,
    parent,
  );
  addColoredPart(
    parts,
    new THREE.BoxGeometry(0.54, 0.17, 0.54),
    '#6a6257',
    [chimneyX, roofBaseY + roofH * 0.56 + chimneyHeight * 0.53, chimneyZ],
    null,
    null,
    parent,
  );

  // Porch post.
  addColoredPart(parts, new THREE.CylinderGeometry(0.06, 0.08, 1.72, 6), '#6e4c32', [doorX + w * 0.37, foundationHeight + 0.86, d / 2 + 0.57], null, null, parent);
  addColoredPart(parts, new THREE.BoxGeometry(w * 0.45, 0.12, 0.12), '#6e4c32', [doorX + w * 0.18, foundationHeight + 1.71, d / 2 + 0.57], { x: 0, y: 0, z: -0.1 }, null, parent);
  addColoredPart(parts, new THREE.BoxGeometry(0.16, 0.09, 0.16), trimColor, [doorX + w * 0.37, foundationHeight + 0.04, d / 2 + 0.57], null, null, parent);
}

function addVillageProps(parts, glowParts, parent, village, rng) {
  addWell(parts, parent);

  const lanternAngle = Math.atan2(SPAWN.x - village.x, SPAWN.z - village.z) + 0.38;
  const lanternX = Math.sin(lanternAngle) * 2.65;
  const lanternZ = Math.cos(lanternAngle) * 2.65;
  addLantern(parts, glowParts, parent, lanternX, lanternZ, lanternAngle + Math.PI);
  addLantern(parts, glowParts, parent, -lanternX * 0.82, -lanternZ * 0.82, lanternAngle);

  // Crates, barrels and a couple of market baskets.
  const propAngle = lanternAngle + Math.PI * 0.82;
  const crateX = Math.sin(propAngle) * 3.6;
  const crateZ = Math.cos(propAngle) * 3.6;
  addColoredPart(parts, new THREE.BoxGeometry(0.62, 0.62, 0.62), '#9f784d', [crateX, 0.31, crateZ], { x: 0, y: rng() * 0.6, z: 0 }, null, parent);
  addColoredPart(parts, new THREE.BoxGeometry(0.55, 0.48, 0.55), '#b48a58', [crateX + 0.78, 0.24, crateZ + 0.16], { x: 0, y: 0.5, z: 0 }, null, parent);
  addColoredPart(parts, new THREE.CylinderGeometry(0.3, 0.33, 0.5, 10), '#8b603b', [crateX - 0.7, 0.25, crateZ + 0.38], { x: 0, y: 0, z: 0 }, null, parent);
  addColoredPart(parts, new THREE.CylinderGeometry(0.31, 0.31, 0.065, 10), '#5e4129', [crateX - 0.7, 0.38, crateZ + 0.38], null, null, parent);
  addColoredPart(parts, new THREE.SphereGeometry(0.13, 8, 6), '#d5903d', [crateX + 0.15, 0.67, crateZ - 0.1], null, null, parent);
  addColoredPart(parts, new THREE.SphereGeometry(0.12, 8, 6), '#c47a2f', [crateX + 0.35, 0.65, crateZ + 0.06], null, null, parent);

  // Flower tufts around the well.
  const flowerGeometry = new THREE.SphereGeometry(0.055, 6, 4);
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2 + 0.4;
    const radius = 1.8 + rng() * 0.5;
    addColoredPart(
      parts,
      flowerGeometry,
      i % 3 === 0 ? '#f0d05e' : i % 3 === 1 ? '#e8a6b4' : '#f4f0d6',
      [Math.sin(angle) * radius, 0.25, Math.cos(angle) * radius],
      null,
      null,
      parent,
    );
    addColoredPart(
      parts,
      new THREE.CylinderGeometry(0.012, 0.016, 0.22, 4),
      '#557e3d',
      [Math.sin(angle) * radius, 0.11, Math.cos(angle) * radius],
      null,
      null,
      parent,
    );
  }
}

export function buildVillages(worldGroup, colliders) {
  const rng = mulberry32(48723);
  const villageGroup = new THREE.Group();
  villageGroup.name = 'Villages';
  worldGroup.add(villageGroup);

  const customVillages = VILLAGES.map((village) => ({
    ...village,
    houses: [],
    meshes: {},
    lights: [],
  }));

  for (const village of customVillages) {
    const solidParts = [];
    const glowParts = [];
    const parent = composeMatrix([village.x, heightAt(village.x, village.z), village.z]);
    const entranceAngle = Math.atan2(SPAWN.x - village.x, SPAWN.z - village.z);
    const count = village.houseCount;

    for (let index = 0; index < count; index += 1) {
      const angle = entranceAngle + 0.78 + (index / count) * Math.PI * 2 + randRange(rng, -0.12, 0.12);
      const distance = randRange(rng, 6.9, 10.3);
      const x = Math.sin(angle) * distance;
      const z = Math.cos(angle) * distance;
      const width = randRange(rng, 2.7, 3.5);
      const depth = randRange(rng, 2.35, 3.0);
      const wallHeight = randRange(rng, 1.8, 2.3);
      const roofHeight = randRange(rng, 1.45, 2.05);
      const rotation = angle + Math.PI + randRange(rng, -0.05, 0.05);
      const worldX = village.x + x;
      const worldZ = village.z + z;
      const houseParent = composeMatrix(
        [worldX, heightAt(worldX, worldZ) - 0.03, worldZ],
        { x: 0, y: rotation, z: 0 },
      );
      const house = { width, depth, wallHeight, roofHeight };
      addHouse(solidParts, glowParts, rng, house, houseParent);

      const colliderRadius = Math.hypot(width / 2, depth / 2) + 0.25;
      colliders.push({
        x: worldX,
        z: worldZ,
        r: colliderRadius,
        type: 'house',
        y: heightAt(worldX, worldZ),
        height: 0.32 + wallHeight + roofHeight + 0.35,
      });
      village.houses.push({
        x: worldX,
        z: worldZ,
        rotation,
        width,
        depth,
        color: '#e1cda2',
        roofColor: ROOF_COLORS[(index * 3 + village.name.length) % ROOF_COLORS.length],
      });
    }

    addVillageProps(solidParts, glowParts, parent, village, rng);
    colliders.push({
      x: village.x,
      z: village.z,
      r: 1.45,
      type: 'well',
      y: village.baseY,
      height: 3.35,
    });

    const solidGeometry = mergeColoredParts(solidParts);
    const solidMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.86,
      metalness: 0,
    });
    const solidMesh = new THREE.Mesh(solidGeometry, solidMaterial);
    solidMesh.castShadow = true;
    solidMesh.receiveShadow = true;
    solidMesh.name = `${village.name}-village`;
    villageGroup.add(solidMesh);

    const glowGeometry = mergeColoredParts(glowParts);
    const glowMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      toneMapped: false,
    });
    const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
    glowMesh.name = `${village.name}-windows`;
    villageGroup.add(glowMesh);

    const light = new THREE.PointLight('#ffc97e', 7, 19, 2);
    light.position.set(village.x, village.baseY + 3.4, village.z);
    villageGroup.add(light);
    anime({
      targets: light,
      intensity: [5.2, 8.4],
      duration: 2600 + rng() * 1300,
      easing: 'easeInOutSine',
      loop: true,
      direction: 'alternate',
      delay: 200 + rng() * 600,
    });

    village.light = light;
    village.meshes.solid = solidMesh;
    village.meshes.glow = glowMesh;
  }

  return customVillages;
}
