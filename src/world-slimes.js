import * as THREE from 'three';
import anime from 'animejs/lib/anime.es.js';
import { addColoredPart, mergeColoredParts } from './geometry-utils.js';
import { heightAt, isWaterAt } from './world-data.js';
import { lerp, randRange } from './utils.js';

const SLIME_COLORS = [
  '#7ddfb1',
  '#87cfee',
  '#f3a8c5',
  '#b5a4ea',
  '#f5d47f',
  '#9ee0ce',
  '#eda6a0',
  '#a7d58a',
  '#91b8f2',
  '#e9b9e0',
];

const HOMES = [
  [5, 14],
  [15, 2],
  [-9, 7],
  [23, -12],
  [-27, 17],
  [-36, 6],
  [31, 15],
  [63, -7],
  [-68, 2],
  [17, 45],
  [-8, 52],
  [57, 53],
];

function makeSlimeGeometry(color, hasSprout) {
  const parts = [];
  const dark = '#26372f';
  const glint = '#ffffff';

  addColoredPart(parts, new THREE.SphereGeometry(1, 20, 14), color, [0, 0.38, 0], null, {
    x: 0.5,
    y: 0.38,
    z: 0.5,
  });
  addColoredPart(parts, new THREE.SphereGeometry(1, 18, 10), color, [0, 0.18, 0], null, {
    x: 0.54,
    y: 0.16,
    z: 0.54,
  });

  for (const side of [-1, 1]) {
    addColoredPart(
      parts,
      new THREE.SphereGeometry(1, 10, 8),
      dark,
      [side * 0.155, 0.45, 0.435],
      null,
      { x: 0.062, y: 0.082, z: 0.045 },
    );
    addColoredPart(
      parts,
      new THREE.SphereGeometry(1, 7, 5),
      glint,
      [side * 0.14, 0.478, 0.482],
      null,
      { x: 0.022, y: 0.03, z: 0.012 },
    );
    addColoredPart(
      parts,
      new THREE.SphereGeometry(1, 7, 5),
      '#e78a9b',
      [side * 0.27, 0.35, 0.4],
      null,
      { x: 0.065, y: 0.03, z: 0.018 },
    );
  }

  addColoredPart(parts, new THREE.SphereGeometry(1, 7, 5), dark, [0, 0.345, 0.482], null, {
    x: 0.042,
    y: 0.018,
    z: 0.014,
  });
  addColoredPart(
    parts,
    new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    '#f7fff8',
    [-0.17, 0.57, 0.2],
    { x: 0, y: 0.2, z: -0.25 },
    { x: 0.115, y: 0.055, z: 0.065 },
  );

  if (hasSprout) {
    addColoredPart(
      parts,
      new THREE.CylinderGeometry(0.012, 0.018, 0.2, 5),
      '#4d7f3b',
      [0.13, 0.78, 0.03],
      { x: 0.1, y: 0, z: -0.12 },
    );
    addColoredPart(
      parts,
      new THREE.SphereGeometry(1, 7, 5),
      '#70a54d',
      [0.21, 0.87, 0.03],
      { x: 0.1, y: 0.4, z: -0.2 },
      { x: 0.09, y: 0.025, z: 0.055 },
    );
  }

  return mergeColoredParts(parts);
}

function findClearSpot(x, z, colliders) {
  let currentX = x;
  let currentZ = z;
  for (let iteration = 0; iteration < 5; iteration += 1) {
    let moved = false;
    for (const collider of colliders) {
      const dx = currentX - collider.x;
      const dz = currentZ - collider.z;
      const distance = Math.hypot(dx, dz);
      const minimum = collider.r + 0.7;
      if (distance < minimum) {
        const angle = distance < 0.001 ? Math.random() * Math.PI * 2 : Math.atan2(dz, dx);
        currentX = collider.x + Math.cos(angle) * minimum;
        currentZ = collider.z + Math.sin(angle) * minimum;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { x: currentX, z: currentZ };
}

export function buildSlimes(worldGroup, colliders, dustPool) {
  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.17,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
  });
  const group = new THREE.Group();
  group.name = 'Slimes';
  worldGroup.add(group);

  let elapsed = 0;
  const slimes = [];

  HOMES.forEach(([homeX, homeZ], index) => {
    const spot = findClearSpot(homeX, homeZ, colliders);
    const color = SLIME_COLORS[index % SLIME_COLORS.length];
    const mesh = new THREE.Mesh(makeSlimeGeometry(color, index % 3 === 0), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `Slime-${index + 1}`;

    const slimeGroup = new THREE.Group();
    slimeGroup.position.set(spot.x, heightAt(spot.x, spot.z) + 0.01, spot.z);
    slimeGroup.rotation.y = Math.random() * Math.PI * 2;
    slimeGroup.add(mesh);
    group.add(slimeGroup);

    const slime = {
      group: slimeGroup,
      mesh,
      color,
      homeX: spot.x,
      homeZ: spot.z,
      readyAt: 0.8 + Math.random() * 3.2,
      isHopping: false,
      hop: { t: 0 },
      animation: null,
    };
    slimes.push(slime);
  });

  function startHop(slime, playerPosition) {
    if (slime.isHopping) return;
    let targetX = slime.homeX;
    let targetZ = slime.homeZ;
    let found = false;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = randRange(Math.random, 2.3, 6.2);
      targetX = slime.homeX + Math.cos(angle) * distance;
      targetZ = slime.homeZ + Math.sin(angle) * distance;
      if (Math.hypot(targetX, targetZ) > 103) continue;
      if (isWaterAt(targetX, targetZ)) continue;

      let blocked = false;
      for (const collider of colliders) {
        if (
          Math.hypot(targetX - collider.x, targetZ - collider.z) <
          collider.r + 0.55
        ) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      if (
        playerPosition &&
        Math.hypot(targetX - playerPosition.x, targetZ - playerPosition.z) < 1.8
      ) {
        continue;
      }
      found = true;
      break;
    }

    if (!found) {
      slime.readyAt = elapsed + 1.4;
      return;
    }

    const fromX = slime.group.position.x;
    const fromZ = slime.group.position.z;
    const dx = targetX - fromX;
    const dz = targetZ - fromZ;
    slime.isHopping = true;
    slime.hop.t = 0;
    slime.group.rotation.y = Math.atan2(dx, dz);
    anime.remove(slime.group.scale);

    const duration = randRange(Math.random, 610, 920);
    slime.animation = anime({
      targets: slime.hop,
      t: 1,
      duration,
      easing: 'easeInOutSine',
      update: () => {
        const t = slime.hop.t;
        const x = lerp(fromX, targetX, t);
        const z = lerp(fromZ, targetZ, t);
        slime.group.position.x = x;
        slime.group.position.z = z;
        slime.group.position.y = heightAt(x, z) + Math.sin(t * Math.PI) * 0.82;
        const stretch = Math.sin(t * Math.PI);
        slime.group.scale.set(1 - stretch * 0.075, 1 + stretch * 0.18, 1 - stretch * 0.075);
      },
      complete: () => {
        slime.isHopping = false;
        slime.readyAt = elapsed + 1.2 + Math.random() * 2;
        slime.group.position.y = heightAt(slime.group.position.x, slime.group.position.z) + 0.01;
        anime.remove(slime.group.scale);
        anime({
          targets: slime.group.scale,
          x: [1.12, 1],
          y: [0.84, 1],
          z: [1.12, 1],
          duration: 470,
          easing: 'easeOutElastic(1, 0.5)',
        });
        if (dustPool) {
          dustPool.spawn({
            position: new THREE.Vector3(
              slime.group.position.x,
              slime.group.position.y + 0.08,
              slime.group.position.z,
            ),
            count: 7,
            colors: ['#d7cba8', '#b9aa86', '#ece2c8'],
            speedMin: 0.5,
            speedMax: 1.5,
            upward: 0.65,
            spread: 1,
            sizeMin: 0.04,
            sizeMax: 0.09,
            lifeMin: 0.35,
            lifeMax: 0.7,
            gravity: 2.5,
          });
        }
      },
    });
  }

  function update(dt, worldElapsed, playerPosition) {
    elapsed = worldElapsed;
    for (const slime of slimes) {
      if (slime.isHopping) continue;
      if (worldElapsed < slime.readyAt) continue;

      if (
        playerPosition &&
        Math.hypot(
          slime.group.position.x - playerPosition.x,
          slime.group.position.z - playerPosition.z,
        ) < 2.3
      ) {
        slime.readyAt = worldElapsed + 0.45;
      }
      startHop(slime, playerPosition);
    }
  }

  return { slimes, group, update, material };
}
