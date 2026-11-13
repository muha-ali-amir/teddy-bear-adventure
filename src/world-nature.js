import * as THREE from 'three';
import { mulberry32, randRange, choose, distance2D, smoothstep } from './utils.js';
import {
  TREE_TYPES,
  VILLAGES,
  PONDS,
  PLAY_RADIUS,
  SPAWN,
  distanceToPaths,
  heightAt,
  isWaterAt,
  pondDistance,
} from './world-data.js';
import {
  createBushGeometry,
  createFlowerGeometry,
  createGrassGeometry,
  createMushroomGeometry,
  createRockGeometry,
  createTreeGeometry,
} from './nature-geometry.js';

const tempObject = new THREE.Object3D();
const tempColor = new THREE.Color();

function makeInstanceMesh(geometry, material, entries, castShadow = true, receiveShadow = true) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, entries.length));
  mesh.count = entries.length;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    tempObject.position.set(entry.x, entry.y, entry.z);
    tempObject.rotation.set(
      entry.rotation?.x || 0,
      entry.rotation?.y || 0,
      entry.rotation?.z || 0,
    );
    tempObject.scale.set(
      entry.scale?.x ?? entry.scale ?? 1,
      entry.scale?.y ?? entry.scale ?? 1,
      entry.scale?.z ?? entry.scale ?? 1,
    );
    tempObject.updateMatrix();
    mesh.setMatrixAt(i, tempObject.matrix);
    if (entry.color) {
      mesh.setColorAt(i, tempColor.set(entry.color));
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  mesh.frustumCulled = false;
  mesh.computeBoundingSphere();
  return mesh;
}

function collidesWith(entry, colliders, padding = 0.2) {
  for (const collider of colliders) {
    if (Math.hypot(entry.x - collider.x, entry.z - collider.z) < collider.r + padding) return true;
  }
  return false;
}

function insideVillageClearing(x, z, padding = 0) {
  for (const village of VILLAGES) {
    if (Math.hypot(x - village.x, z - village.z) < village.radius + padding) return true;
  }
  return false;
}

function nearCoin(x, z, coins, distance = 1.6) {
  for (const coin of coins) {
    if (!coin.collected && Math.hypot(x - coin.x, z - coin.z) < distance) return true;
  }
  return false;
}

function makePaleTint(random, strength = 0.14) {
  const tint = 0.88 + random() * strength;
  return `rgb(${Math.round(tint * 255)}, ${Math.round((tint + random() * 0.04) * 255)}, ${Math.round((tint - random() * 0.03) * 255)})`;
}

export function createNature(worldGroup, { colliders, coins, rng = mulberry32(52310) }) {
  const trees = [];
  const treeClusters = [
    [-83, -60, 14],
    [70, -66, 15],
    [88, 51, 16],
    [-30, 86, 13],
    [17, -42, 11],
    [-88, 28, 12],
    [43, -7, 10],
    [66, 77, 15],
    [-67, 79, 12],
    [-10, -87, 13],
    [94, -16, 12],
    [-92, -18, 11],
  ];

  const tryTree = (x, z) => {
    if (Math.hypot(x, z) > 158) return false;
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 7) return false;
    if (insideVillageClearing(x, z, 3.5)) return false;
    if (distanceToPaths(x, z) < 2.8) return false;
    if (isWaterAt(x, z)) return false;
    for (const pond of PONDS) {
      if (pondDistance(x, z, pond) < 1.28) return false;
    }
    if (nearCoin(x, z, coins, 1.8)) return false;
    for (const tree of trees) {
      if (distance2D(x, z, tree.x, tree.z) < 2.5) return false;
    }
    return true;
  };

  const addTreeCandidate = (x, z) => {
    if (trees.length >= 176) return;
    if (!tryTree(x, z)) return;
    const roll = rng();
    let type = 'oak';
    if (roll > 0.58 && roll <= 0.8) type = 'pine';
    else if (roll > 0.8 && roll <= 0.91) type = 'birch';
    else if (roll > 0.91) type = 'autumn';
    const scale = randRange(rng, 0.88, 1.42);
    trees.push({
      x,
      z,
      y: heightAt(x, z),
      scale,
      type,
      rotation: rng() * Math.PI * 2,
      color: makePaleTint(rng, 0.1),
    });
  };

  for (const [cx, cz, radius] of treeClusters) {
    const count = 5 + Math.floor(rng() * 4);
    for (let i = 0; i < count; i += 1) {
      const angle = rng() * Math.PI * 2;
      const distance = Math.sqrt(rng()) * radius;
      addTreeCandidate(cx + Math.cos(angle) * distance, cz + Math.sin(angle) * distance);
    }
  }

  let attempts = 0;
  while (trees.length < 108 && attempts < 1400) {
    attempts += 1;
    const angle = rng() * Math.PI * 2;
    const radius = Math.sqrt(rng()) * 112;
    addTreeCandidate(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }

  // A sparse belt of far trees softens the horizon and makes the meadow feel
  // like part of a much larger woodland.
  let beltAttempts = 0;
  while (trees.length < 172 && beltAttempts < 1600) {
    beltAttempts += 1;
    const angle = rng() * Math.PI * 2;
    const radius = 118 + rng() * 36;
    addTreeCandidate(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }

  const treeMeshMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    flatShading: true,
  });
  const treeMeshes = {};
  for (const type of Object.keys(TREE_TYPES)) {
    const entries = trees
      .filter((tree) => tree.type === type)
      .map((tree) => ({
        x: tree.x,
        y: tree.y,
        z: tree.z,
        scale: tree.scale,
        rotation: { y: tree.rotation },
        color: tree.color,
      }));
    const geometry = createTreeGeometry(type);
    const mesh = makeInstanceMesh(geometry, treeMeshMaterial, entries);
    mesh.name = `${type}-trees`;
    treeMeshes[type] = mesh;
    worldGroup.add(mesh);
  }

  for (const tree of trees) {
    const radius = TREE_TYPES[tree.type].trunk * tree.scale + 0.08;
    colliders.push({
      x: tree.x,
      z: tree.z,
      r: Math.max(0.28, radius),
      type: 'tree',
      y: tree.y,
      height: 5.4 * tree.scale,
    });
  }

  // Bushes and flowering shrubs.
  const bushMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });
  const bushVariants = {
    plain: [],
    berry: [],
    flower: [],
  };
  const bushPositions = [];
  let bushAttempts = 0;
  while (bushPositions.length < 185 && bushAttempts < 2000) {
    bushAttempts += 1;
    const angle = rng() * Math.PI * 2;
    const radius = Math.sqrt(rng()) * 112;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const candidate = { x, z };
    if (isWaterAt(x, z)) continue;
    if (distanceToPaths(x, z) < 2) continue;
    if (collidesWith(candidate, colliders, 0.9)) continue;
    if (insideVillageClearing(x, z, -1.5) && rng() < 0.72) continue;
    if (bushPositions.some((bush) => distance2D(x, z, bush.x, bush.z) < 1.25)) continue;
    if (nearCoin(x, z, coins, 0.8)) continue;
    const scale = randRange(rng, 0.62, 1.3);
    const variantRoll = rng();
    const variant = variantRoll < 0.66 ? 'plain' : variantRoll < 0.84 ? 'berry' : 'flower';
    const entry = {
      x,
      y: heightAt(x, z) - 0.02,
      z,
      scale,
      rotation: { y: rng() * Math.PI * 2 },
      color: makePaleTint(rng, 0.12),
    };
    bushPositions.push({ x, z });
    bushVariants[variant].push(entry);
  }

  for (const [variant, entries] of Object.entries(bushVariants)) {
    const mesh = makeInstanceMesh(
      createBushGeometry(variant),
      bushMaterial,
      entries,
      true,
      true,
    );
    mesh.name = `${variant}-bushes`;
    worldGroup.add(mesh);
  }

  // Rocks.
  const rockEntries = [];
  let rockAttempts = 0;
  while (rockEntries.length < 34 && rockAttempts < 500) {
    rockAttempts += 1;
    let x;
    let z;
    if (rockAttempts % 3 === 0) {
      const pond = choose(rng, PONDS);
      const angle = rng() * Math.PI * 2;
      const distance = randRange(rng, 1.05, 1.45);
      x = pond.x + Math.cos(angle) * pond.rx * distance;
      z = pond.z + Math.sin(angle) * pond.rz * distance;
    } else {
      const angle = rng() * Math.PI * 2;
      const radius = Math.sqrt(rng()) * 110;
      x = Math.cos(angle) * radius;
      z = Math.sin(angle) * radius;
    }
    if (insideVillageClearing(x, z, -5)) continue;
    if (distanceToPaths(x, z) < 1.7) continue;
    if (nearCoin(x, z, coins, 1.9)) continue;
    if (collidesWith({ x, z }, colliders, 1.0)) continue;
    if (rockEntries.some((rock) => distance2D(x, z, rock.x, rock.z) < 4)) continue;
    const scale = randRange(rng, 0.28, 1.15);
    rockEntries.push({
      x,
      z,
      y: heightAt(x, z) + scale * 0.32,
      scale: { x: scale, y: scale * (0.6 + rng() * 0.3), z: scale * (0.8 + rng() * 0.35) },
      rotation: { x: rng() * 0.4, y: rng() * Math.PI * 2, z: rng() * 0.3 },
      color: `hsl(${randRange(rng, 80, 110)} 5% ${randRange(rng, 44, 62)}%)`,
    });
    if (scale > 0.62) {
      colliders.push({ x, z, r: scale * 0.72, type: 'rock' });
    }
  }

  const rockGeometry = createRockGeometry();
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
  });
  const rocks = makeInstanceMesh(rockGeometry, rockMaterial, rockEntries, true, true);
  rocks.name = 'rocks';
  worldGroup.add(rocks);

  // Grass tufts.
  const grassEntries = [];
  let grassAttempts = 0;
  while (grassEntries.length < 5600 && grassAttempts < 14000) {
    grassAttempts += 1;
    const angle = rng() * Math.PI * 2;
    const radius = Math.sqrt(rng()) * 113;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (isWaterAt(x, z)) continue;
    const pathDistance = distanceToPaths(x, z);
    if (pathDistance < 1.85 && rng() < 0.88) continue;
    if (insideVillageClearing(x, z, -5) && rng() < 0.52) continue;
    if (nearCoin(x, z, coins, 0.4)) continue;
    grassEntries.push({
      x,
      y: heightAt(x, z) + 0.01,
      z,
      scale: randRange(rng, 0.7, 1.65),
      rotation: { y: rng() * Math.PI * 2 },
      color: makePaleTint(rng, 0.22),
    });
  }

  const grassMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const grass = makeInstanceMesh(
    createGrassGeometry(),
    grassMaterial,
    grassEntries,
    false,
    true,
  );
  grass.name = 'grass-tufts';
  worldGroup.add(grass);

  // Wildflowers.
  const flowerVariants = { daisy: [], pink: [] };
  let flowerAttempts = 0;
  while (flowerVariants.daisy.length + flowerVariants.pink.length < 520 && flowerAttempts < 2600) {
    flowerAttempts += 1;
    let x;
    let z;
    if (rng() < 0.55) {
      const angle = rng() * Math.PI * 2;
      const radius = Math.sqrt(rng()) * 108;
      x = Math.cos(angle) * radius;
      z = Math.sin(angle) * radius;
    } else {
      const angle = rng() * Math.PI * 2;
      const distance = 3 + rng() * 18;
      const centerAngle = rng() * Math.PI * 2;
      x = Math.cos(centerAngle) * Math.sqrt(rng()) * 100 + Math.cos(angle) * distance;
      z = Math.sin(centerAngle) * Math.sqrt(rng()) * 100 + Math.sin(angle) * distance;
    }
    if (Math.hypot(x, z) > 112) continue;
    if (isWaterAt(x, z)) continue;
    const pathDistance = distanceToPaths(x, z);
    if (pathDistance < 1.15) continue;
    const variant = rng() < 0.62 ? 'daisy' : 'pink';
    flowerVariants[variant].push({
      x,
      y: heightAt(x, z),
      z,
      scale: randRange(rng, 0.8, 1.45),
      rotation: { y: rng() * Math.PI * 2 },
      color: makePaleTint(rng, 0.1),
    });
  }

  const flowerMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
  });
  for (const [variant, entries] of Object.entries(flowerVariants)) {
    const mesh = makeInstanceMesh(
      createFlowerGeometry(variant),
      flowerMaterial,
      entries,
      false,
      true,
    );
    mesh.name = `${variant}-flowers`;
    worldGroup.add(mesh);
  }

  // Mushrooms tucked around the trees.
  const mushroomEntries = [];
  let mushroomAttempts = 0;
  while (mushroomEntries.length < 70 && mushroomAttempts < 420) {
    mushroomAttempts += 1;
    const tree = choose(rng, trees);
    if (!tree) break;
    const angle = rng() * Math.PI * 2;
    const distance = randRange(rng, 0.9, 3.2) * tree.scale;
    const x = tree.x + Math.cos(angle) * distance;
    const z = tree.z + Math.sin(angle) * distance;
    if (isWaterAt(x, z)) continue;
    if (distanceToPaths(x, z) < 1.25) continue;
    mushroomEntries.push({
      x,
      y: heightAt(x, z),
      z,
      scale: randRange(rng, 0.7, 1.35),
      rotation: { y: rng() * Math.PI * 2 },
      color: makePaleTint(rng, 0.08),
    });
  }

  const mushroomMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0,
  });
  const mushrooms = makeInstanceMesh(
    createMushroomGeometry(),
    mushroomMaterial,
    mushroomEntries,
    false,
    true,
  );
  mushrooms.name = 'mushrooms';
  worldGroup.add(mushrooms);

  return {
    trees,
    treeMeshes,
    bushVariants,
    rocks,
    grass,
    flowers: flowerVariants,
    mushrooms,
    bushMaterial,
  };
}
