import * as THREE from 'three';
import anime from 'animejs/lib/anime.es.js';
import { addColoredPart, makeGlowTexture, mergeColoredParts } from './geometry-utils.js';
import { COIN_SPOTS, heightAt, PLAY_RADIUS } from './world-data.js';

function makeCoinGeometry() {
  const parts = [];
  const gold = '#f7c948';
  const goldLight = '#ffe28a';
  const goldDark = '#b88621';

  addColoredPart(
    parts,
    new THREE.CylinderGeometry(0.25, 0.25, 0.065, 24),
    gold,
    [0, 0, 0],
    { x: Math.PI / 2, y: 0, z: 0 },
  );
  addColoredPart(
    parts,
    new THREE.TorusGeometry(0.218, 0.028, 7, 28),
    goldDark,
    [0, 0, 0.042],
  );
  addColoredPart(
    parts,
    new THREE.TorusGeometry(0.218, 0.028, 7, 28),
    goldDark,
    [0, 0, -0.042],
  );
  addColoredPart(
    parts,
    new THREE.CylinderGeometry(0.185, 0.185, 0.012, 22),
    goldLight,
    [0, 0, 0.037],
    { x: Math.PI / 2, y: 0, z: 0 },
  );
  addColoredPart(
    parts,
    new THREE.CylinderGeometry(0.185, 0.185, 0.012, 22),
    goldLight,
    [0, 0, -0.037],
    { x: Math.PI / 2, y: 0, z: 0 },
  );

  for (const face of [1, -1]) {
    const z = face * 0.049;
    addColoredPart(
      parts,
      new THREE.SphereGeometry(1, 10, 8),
      goldDark,
      [0, -0.047, z],
      null,
      { x: 0.075, y: 0.06, z: 0.012 },
    );
    for (let toe = 0; toe < 4; toe += 1) {
      const angle = -Math.PI / 2 + (toe - 1.5) * 0.4;
      addColoredPart(
        parts,
        new THREE.SphereGeometry(1, 8, 6),
        goldDark,
        [Math.cos(angle) * 0.088, 0.048 + Math.sin(angle) * 0.01, z],
        null,
        { x: 0.034, y: 0.042, z: 0.01 },
      );
    }
  }

  return mergeColoredParts(parts);
}

function moveOutOfColliders(x, z, colliders, padding) {
  let nextX = x;
  let nextZ = z;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    let moved = false;
    for (const collider of colliders) {
      const dx = nextX - collider.x;
      const dz = nextZ - collider.z;
      const distance = Math.hypot(dx, dz);
      const minimum = collider.r + padding;
      if (distance < minimum) {
        const angle = distance < 0.001 ? Math.random() * Math.PI * 2 : Math.atan2(dz, dx);
        nextX = collider.x + Math.cos(angle) * minimum;
        nextZ = collider.z + Math.sin(angle) * minimum;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { x: nextX, z: nextZ };
}

export function buildCoins(worldGroup, colliders, sparklePool) {
  const glowTexture = makeGlowTexture(128);
  const coinGeometry = makeCoinGeometry();
  const coinMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.72,
    roughness: 0.25,
    emissive: '#3b2400',
    emissiveIntensity: 0.38,
  });
  const coins = [];
  const group = new THREE.Group();
  group.name = 'GoldenCoins';
  worldGroup.add(group);

  COIN_SPOTS.forEach(([originalX, originalZ], index) => {
    let { x, z } = moveOutOfColliders(originalX, originalZ, colliders, 1.1);
    const radius = Math.hypot(x, z);
    if (radius > PLAY_RADIUS - 3) {
      x = (x / radius) * (PLAY_RADIUS - 3);
      z = (z / radius) * (PLAY_RADIUS - 3);
    }

    const ground = heightAt(x, z);
    const object = new THREE.Group();
    object.name = `GoldenCoin-${index + 1}`;
    object.position.set(x, ground + 1.03, z);

    const mesh = new THREE.Mesh(coinGeometry, coinMaterial);
    mesh.castShadow = true;
    object.add(mesh);

    const haloMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: '#ffd76c',
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const halo = new THREE.Sprite(haloMaterial);
    halo.scale.set(1.25, 1.25, 1);
    object.add(halo);

    group.add(object);

    const coin = {
      index,
      group: object,
      mesh,
      halo,
      x,
      z,
      baseY: ground + 1.03,
      phase: index * 1.73 + Math.random() * 0.4,
      collected: false,
      collect() {
        if (this.collected) return false;
        this.collected = true;
        this.halo.visible = false;
        anime.remove(this.group.scale);
        anime({
          targets: this.group.scale,
          x: [1, 1.55, 0],
          y: [1, 1.25, 0],
          z: [1, 1.55, 0],
          duration: 420,
          easing: 'easeOutQuad',
          complete: () => {
            this.group.visible = false;
          },
        });
        anime({
          targets: this.group.position,
          y: this.group.position.y + 0.75,
          duration: 430,
          easing: 'easeOutCubic',
        });
        if (sparklePool) {
          sparklePool.spawn({
            position: this.group.position,
            count: 30,
            colors: ['#ffe486', '#ffc73f', '#fff4c4', '#e5a72d'],
            speedMin: 1.1,
            speedMax: 3.6,
            upward: 2.6,
            spread: 1,
            sizeMin: 0.055,
            sizeMax: 0.145,
            lifeMin: 0.45,
            lifeMax: 1.05,
            gravity: 5.2,
          });
        }
        return true;
      },
    };

    anime({
      targets: haloMaterial,
      opacity: [0.22, 0.55],
      duration: 1500 + (index % 5) * 280,
      easing: 'easeInOutSine',
      loop: true,
      direction: 'alternate',
      delay: index * 70,
    });
    anime({
      targets: halo.scale,
      x: [1.08, 1.46],
      y: [1.08, 1.46],
      duration: 1500 + (index % 5) * 280,
      easing: 'easeInOutSine',
      loop: true,
      direction: 'alternate',
      delay: index * 70,
    });

    coins.push(coin);
  });

  function update(dt, elapsed) {
    for (const coin of coins) {
      if (coin.collected) continue;
      coin.group.position.y = coin.baseY + Math.sin(elapsed * 2.15 + coin.phase) * 0.1;
      coin.mesh.rotation.y = elapsed * 1.75 + coin.phase;
      coin.group.rotation.z = Math.sin(elapsed * 1.35 + coin.phase) * 0.035;
    }
  }

  return { coins, group, update, total: coins.length };
}
