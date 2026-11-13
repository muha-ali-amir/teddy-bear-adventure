import * as THREE from 'three';
import { clamp, lerp, makeNoise2D, smoothstep } from './utils.js';

export const WORLD_SIZE = 240;
export const WORLD_HALF = WORLD_SIZE / 2;
export const PLAY_RADIUS = 105;
export const SPAWN = { x: 0, z: -2 };

const baseNoise = makeNoise2D(9137);
const colorNoise = makeNoise2D(5519);

function rawHeight(x, z) {
  const broad = 1.7 * Math.sin(x * 0.041) * Math.cos(z * 0.035);
  const rolling = 1.15 * Math.sin((x + z) * 0.026 + 1.25);
  const small = 0.5 * Math.cos(x * 0.103 - z * 0.077);
  const detail = 0.22 * Math.sin(x * 0.19 + z * 0.14 + 0.8);
  const grain = 0.25 * baseNoise(x * 0.07, z * 0.07);
  const distance = Math.sqrt(x * x + z * z);
  const rim = smoothstep(99, 137, distance) * 8 + smoothstep(128, 176, distance) * 15;
  return broad + rolling + small + detail + grain + rim;
}

export const PONDS = [
  { id: 'lily', name: 'Lilypad Pond', x: -16, z: 24, rx: 9.2, rz: 6.6, depth: 0.58 },
  { id: 'mossy', name: 'Mossy Pool', x: 39, z: -28, rx: 7.1, rz: 8.6, depth: 0.64 },
  { id: 'fern', name: 'Fernwater', x: -60, z: 52, rx: 8.4, rz: 5.8, depth: 0.52 },
  { id: 'pebble', name: 'Pebble Pond', x: 80, z: 8, rx: 5.7, rz: 5.2, depth: 0.48 },
].map((pond) => {
  const baseY = rawHeight(pond.x, pond.z);
  return { ...pond, baseY, waterY: baseY - 0.18 };
});

export const VILLAGES = [
  {
    id: 'honeybrook',
    name: 'Honeybrook',
    subtitle: 'The warm little hamlet',
    x: -46,
    z: -26,
    radius: 14,
    houseCount: 5,
    accent: '#c76b4a',
  },
  {
    id: 'cloverfield',
    name: 'Cloverfield',
    subtitle: 'Cottages in the clover',
    x: 51,
    z: 33,
    radius: 14,
    houseCount: 4,
    accent: '#6e8f5b',
  },
  {
    id: 'thimblewood',
    name: 'Thimblewood',
    subtitle: 'The sleepy north village',
    x: 9,
    z: 73,
    radius: 12,
    houseCount: 4,
    accent: '#b48552',
  },
].map((village) => ({ ...village, baseY: rawHeight(village.x, village.z) }));

const PATH_DEFINITIONS = [
  {
    name: 'Honeybrook Trail',
    points: [
      [-1, 1],
      [-10, -5],
      [-24, -13],
      [-38, -21],
      [-46, -26],
    ],
  },
  {
    name: 'Clover Path',
    points: [
      [1, 1],
      [-3, 16],
      [15, 26],
      [34, 31],
      [46, 33],
      [51, 33],
    ],
  },
  {
    name: 'Thimble Trail',
    points: [
      [0, 1],
      [7, 18],
      [3, 36],
      [6, 54],
      [10, 66],
      [9, 73],
    ],
  },
];

export const PATHS = PATH_DEFINITIONS.map((definition) => {
  const curve = new THREE.CatmullRomCurve3(
    definition.points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    'centripetal',
    0.5,
  );
  const controls = curve.getPoints(28).map((point) => ({ x: point.x, z: point.z }));
  return {
    ...definition,
    curve,
    controls,
    width: 2.35,
  };
});

function flattenHeight(x, z) {
  let height = rawHeight(x, z);

  for (const village of VILLAGES) {
    const distance = Math.hypot(x - village.x, z - village.z);
    if (distance < village.radius * 1.35) {
      const influence = 1 - smoothstep(village.radius * 0.55, village.radius * 1.35, distance);
      height = lerp(height, village.baseY, influence * 0.93);
    }
  }

  for (const pond of PONDS) {
    const nx = (x - pond.x) / pond.rx;
    const nz = (z - pond.z) / pond.rz;
    const distance = Math.sqrt(nx * nx + nz * nz);
    if (distance < 1.55) {
      const flat = 1 - smoothstep(0.9, 1.55, distance);
      height = lerp(height, pond.baseY, flat);
      if (distance < 1.22) {
        const bowl = pond.depth * Math.pow(Math.max(0, 1 - Math.min(distance, 1) ** 2), 1.1);
        const carve = 1 - smoothstep(0.96, 1.22, distance);
        height -= bowl * carve;
      }
    }
  }

  return height;
}

export function heightAt(x, z) {
  return flattenHeight(x, z);
}

export function pondDistance(x, z, pond) {
  const nx = (x - pond.x) / pond.rx;
  const nz = (z - pond.z) / pond.rz;
  return Math.sqrt(nx * nx + nz * nz);
}

export function isWaterAt(x, z) {
  for (const pond of PONDS) {
    if (pondDistance(x, z, pond) < 0.84) return true;
  }
  return false;
}

export function waterDepthAt(x, z) {
  for (const pond of PONDS) {
    if (pondDistance(x, z, pond) < 0.86) {
      return Math.max(0, pond.waterY - heightAt(x, z));
    }
  }
  return 0;
}

export function distanceToPaths(x, z) {
  let best = Infinity;
  for (const path of PATHS) {
    const samples = path.controls;
    for (let i = 0; i < samples.length - 1; i += 1) {
      const a = samples[i];
      const b = samples[i + 1];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const apx = x - a.x;
      const apz = z - a.z;
      const denominator = abx * abx + abz * abz;
      let t = denominator > 0 ? (apx * abx + apz * abz) / denominator : 0;
      t = clamp(t, 0, 1);
      const dx = apx - abx * t;
      const dz = apz - abz * t;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared < best) best = distanceSquared;
    }
  }
  return Math.sqrt(best);
}

export function nearestVillage(x, z) {
  let nearest = null;
  let best = Infinity;
  for (const village of VILLAGES) {
    const distance = Math.hypot(x - village.x, z - village.z);
    if (distance < best) {
      best = distance;
      nearest = village;
    }
  }
  return { village: nearest, distance: best };
}

export function nearestPond(x, z) {
  let nearest = null;
  let best = Infinity;
  for (const pond of PONDS) {
    const distance = pondDistance(x, z, pond);
    if (distance < best) {
      best = distance;
      nearest = pond;
    }
  }
  return { pond: nearest, normalizedDistance: best };
}

export function getRegionName(x, z) {
  const { village, distance } = nearestVillage(x, z);
  if (village && distance < village.radius + 2) return village.name;

  const { pond, normalizedDistance } = nearestPond(x, z);
  if (pond && normalizedDistance < 1.75) return pond.name;

  if (z > 30) return 'The Clover Hills';
  if (x < -45) return 'Honeybrook Meadow';
  if (x > 45) return 'Fernwood Reach';
  return 'Wildflower Meadow';
}

export function terrainColorAt(x, z, height, target = new THREE.Color()) {
  const patch = colorNoise(x * 0.045 + 11, z * 0.045 - 4);
  const fine = baseNoise(x * 0.17, z * 0.17);
  const dryness = smoothstep(0.15, 0.85, patch * 0.7 + fine * 0.3);
  const hue = 0.225 + patch * 0.022 - dryness * 0.012;
  const saturation = 0.38 + fine * 0.08;
  const lightness = 0.43 + patch * 0.055 + Math.max(0, height) * 0.012 + fine * 0.018;
  target.setHSL(hue, saturation, lightness, THREE.SRGBColorSpace);

  let dirtAmount = 0;

  for (const village of VILLAGES) {
    const distance = Math.hypot(x - village.x, z - village.z);
    if (distance < village.radius) {
      const villageDirt = (1 - smoothstep(village.radius * 0.44, village.radius * 0.98, distance)) * 0.68;
      dirtAmount = Math.max(dirtAmount, villageDirt);
    }
  }

  if (dirtAmount > 0) {
    tempDirt.set('#bd9868');
    tempDirt.offsetHSL(0.008 * fine, 0.02, fine * 0.035);
    target.lerp(tempDirt, dirtAmount);
  }

  const pathDistance = distanceToPaths(x, z);
  if (pathDistance < 3.4) {
    const edgeNoise = fine * 0.5 + patch * 0.3;
    const pathAmount = 1 - smoothstep(1.05, 1.95 + edgeNoise, pathDistance);
    if (pathAmount > 0) {
      tempDirt.set(fine > 0.2 ? '#b78f5e' : '#a97f4f');
      target.lerp(tempDirt, pathAmount * 0.8);
    }
  }

  for (const pond of PONDS) {
    const normalized = pondDistance(x, z, pond);
    if (normalized < 1.24) {
      const sandAmount = 1 - smoothstep(0.9, 1.22 + fine * 0.08, normalized);
      const wetSand = 1 - smoothstep(0.72, 1.02, normalized);
      tempDirt.set('#d3bc8a');
      target.lerp(tempDirt, sandAmount * 0.82);
      tempDirt.set('#9aa477');
      target.lerp(tempDirt, wetSand * 0.34);
    }
  }

  return target;
}

const tempDirt = new THREE.Color();

export const TREE_TYPES = {
  oak: {
    trunk: 0.36,
    label: 'Oak',
    mapColor: '#4f8a42',
  },
  pine: {
    trunk: 0.3,
    label: 'Pine',
    mapColor: '#356d49',
  },
  birch: {
    trunk: 0.24,
    label: 'Birch',
    mapColor: '#7c9f55',
  },
  autumn: {
    trunk: 0.34,
    label: 'Maple',
    mapColor: '#be7b3f',
  },
};

export const COIN_SPOTS = [
  [4, -8],
  [10, -1],
  [4, 7],
  [-6, 4],
  [-4, 24],
  [-13, 33],
  [-27, 28],
  [-43, -18],
  [-50, -22],
  [-46, -34],
  [46, 29],
  [55, 35],
  [50, 27],
  [5, 74],
  [13, 71],
  [9, 67],
  [21, 54],
  [33, 61],
  [72, -2],
  [81, 10],
  [70, 18],
  [-74, 7],
  [-82, 16],
  [-68, 14],
];
