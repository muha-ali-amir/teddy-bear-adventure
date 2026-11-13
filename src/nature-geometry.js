import * as THREE from 'three';
import { addColoredPart, mergeColoredParts } from './geometry-utils.js';

const OAK_GREENS = ['#4f8f3f', '#60a14d', '#6eae56', '#447f37', '#7ab45e'];
const PINE_GREENS = ['#2f6547', '#376f4e', '#285b41', '#407757'];
const AUTUMN_COLORS = ['#c96f35', '#df8d3d', '#b85e32', '#e3a94e', '#a9532d'];
const BIRCH_GREENS = ['#82aa53', '#95b962', '#729c49', '#a5c46e'];

function blobs(parts, geometry, colors, entries) {
  for (let i = 0; i < entries.length; i += 1) {
    const [x, y, z, sx, sy, sz, ry] = entries[i];
    addColoredPart(
      parts,
      geometry,
      colors[i % colors.length],
      [x, y, z],
      { x: 0, y: ry || 0, z: 0 },
      { x: sx, y: sy, z: sz },
    );
  }
}

function makeOak(parts, autumn = false) {
  addColoredPart(parts, new THREE.CylinderGeometry(0.14, 0.3, 2.6, 7), '#745137', [0, 1.3, 0]);
  addColoredPart(
    parts,
    new THREE.CylinderGeometry(0.07, 0.13, 1.25, 5),
    '#6d4a32',
    [0.34, 2.15, 0.04],
    { x: 0.05, y: 0, z: -0.72 },
  );
  addColoredPart(
    parts,
    new THREE.CylinderGeometry(0.06, 0.12, 1.1, 5),
    '#6d4a32',
    [-0.3, 2.08, -0.03],
    { x: 0.05, y: 0, z: 0.8 },
  );

  const ico = new THREE.IcosahedronGeometry(1, 1);
  const colors = autumn ? AUTUMN_COLORS : OAK_GREENS;
  blobs(parts, ico, colors, [
    [0, 2.95, 0, 1.25, 1.08, 1.18, 0.2],
    [0.78, 3.2, 0.12, 0.95, 0.92, 0.92, 0.6],
    [-0.72, 3.04, -0.1, 0.92, 0.85, 0.9, 1.2],
    [0.12, 3.46, -0.32, 0.95, 0.82, 0.88, 2.1],
    [0.05, 2.91, 0.78, 0.85, 0.74, 0.82, 0.4],
    [-0.28, 2.63, 0.58, 0.7, 0.63, 0.7, 1.7],
  ]);
  if (autumn) {
    addColoredPart(parts, new THREE.IcosahedronGeometry(1, 0), '#f0c563', [0.85, 2.75, 0.55], null, {
      x: 0.22,
      y: 0.2,
      z: 0.2,
    });
  }
}

function makePine(parts) {
  addColoredPart(parts, new THREE.CylinderGeometry(0.11, 0.3, 3.15, 7), '#65492e', [0, 1.55, 0]);
  addColoredPart(parts, new THREE.ConeGeometry(1.72, 2.8, 7), PINE_GREENS[0], [0, 2.25, 0]);
  addColoredPart(parts, new THREE.ConeGeometry(1.34, 2.35, 7), PINE_GREENS[1], [0, 3.15, 0], {
    x: 0,
    y: 0.35,
    z: 0,
  });
  addColoredPart(parts, new THREE.ConeGeometry(0.96, 1.95, 7), PINE_GREENS[2], [0, 3.91, 0], {
    x: 0,
    y: 0.7,
    z: 0,
  });
  addColoredPart(parts, new THREE.ConeGeometry(0.55, 1.3, 6), PINE_GREENS[3], [0, 4.55, 0], {
    x: 0,
    y: 0.2,
    z: 0,
  });
}

function makeBirch(parts) {
  addColoredPart(parts, new THREE.CylinderGeometry(0.11, 0.19, 3.35, 7), '#e6dec7', [0, 1.65, 0]);
  for (const [y, radius] of [
    [0.75, 0.18],
    [1.25, 0.17],
    [1.82, 0.15],
    [2.4, 0.13],
  ]) {
    addColoredPart(parts, new THREE.CylinderGeometry(radius, radius, 0.055, 6), '#4f4a3f', [0, y, 0]);
  }
  addColoredPart(
    parts,
    new THREE.CylinderGeometry(0.05, 0.1, 1.0, 5),
    '#ddd2b9',
    [0.27, 2.28, 0.02],
    { x: 0, y: 0, z: -0.6 },
  );
  const ico = new THREE.IcosahedronGeometry(1, 1);
  blobs(parts, ico, BIRCH_GREENS, [
    [0, 3.42, 0, 0.92, 0.9, 0.88, 0.3],
    [0.54, 3.66, -0.12, 0.73, 0.71, 0.68, 1.1],
    [-0.52, 3.48, 0.16, 0.68, 0.7, 0.68, 2.2],
    [0.12, 3.89, 0.2, 0.7, 0.67, 0.66, 0.8],
  ]);
}

export function createTreeGeometry(type) {
  const parts = [];
  if (type === 'oak') makeOak(parts, false);
  else if (type === 'pine') makePine(parts);
  else if (type === 'birch') makeBirch(parts);
  else makeOak(parts, true);
  return mergeColoredParts(parts);
}

function bushBase(parts, leafColors) {
  const ico = new THREE.IcosahedronGeometry(1, 1);
  blobs(parts, ico, leafColors, [
    [0, 0.42, 0, 0.6, 0.48, 0.56, 0.2],
    [0.38, 0.34, 0.12, 0.46, 0.38, 0.48, 1.1],
    [-0.36, 0.33, 0.06, 0.44, 0.37, 0.42, 2.2],
    [0.08, 0.38, -0.32, 0.4, 0.33, 0.38, 0.7],
    [-0.06, 0.35, 0.38, 0.38, 0.32, 0.35, 1.7],
  ]);
}

export function createBushGeometry(variant = 'plain') {
  const parts = [];
  if (variant === 'flower') {
    bushBase(parts, ['#4d873e', '#60a04d', '#568f43']);
  } else {
    bushBase(parts, ['#3f7738', '#4d8a40', '#5b974a']);
  }

  if (variant === 'berry') {
    const berryGeometry = new THREE.SphereGeometry(1, 8, 6);
    const berries = [
      [0.4, 0.54, 0.5],
      [-0.36, 0.57, 0.33],
      [0.13, 0.7, 0.44],
      [-0.56, 0.35, 0.2],
      [0.21, 0.35, -0.55],
      [0.58, 0.27, -0.16],
    ];
    for (const [x, y, z] of berries) {
      addColoredPart(parts, berryGeometry, '#a63d35', [x, y, z], null, {
        x: 0.055,
        y: 0.055,
        z: 0.055,
      });
    }
  }

  if (variant === 'flower') {
    const flowerGeometry = new THREE.SphereGeometry(1, 7, 5);
    const flowerColors = ['#f5e6c7', '#f3c4c7', '#f0d37c'];
    const blossoms = [
      [0.33, 0.72, 0.34],
      [-0.3, 0.68, 0.24],
      [0.52, 0.48, -0.08],
      [-0.05, 0.79, -0.1],
      [-0.48, 0.49, 0.36],
    ];
    for (let i = 0; i < blossoms.length; i += 1) {
      addColoredPart(
        parts,
        flowerGeometry,
        flowerColors[i % flowerColors.length],
        blossoms[i],
        null,
        { x: 0.075, y: 0.052, z: 0.075 },
      );
    }
  }

  return mergeColoredParts(parts);
}

export function createGrassGeometry() {
  const positions = [];
  const colors = [];
  const baseColor = new THREE.Color('#3e6d2d');
  const tipColor = new THREE.Color('#8dbb57');
  const bladeCount = 5;

  for (let i = 0; i < bladeCount; i += 1) {
    const angle = i * 2.399 + 0.3;
    const radius = 0.025 + (i % 2) * 0.035;
    const bx = Math.cos(angle) * radius;
    const bz = Math.sin(angle) * radius;
    const sideX = Math.cos(angle + Math.PI / 2) * 0.028;
    const sideZ = Math.sin(angle + Math.PI / 2) * 0.028;
    const height = 0.24 + ((i * 37) % 10) / 10 * 0.17;
    const leanX = Math.cos(angle) * (0.04 + (i % 3) * 0.025);
    const leanZ = Math.sin(angle) * (0.04 + (i % 3) * 0.025);
    positions.push(
      bx - sideX,
      0,
      bz - sideZ,
      bx + sideX,
      0,
      bz + sideZ,
      bx + leanX,
      height,
      bz + leanZ,
    );
    colors.push(
      baseColor.r,
      baseColor.g,
      baseColor.b,
      baseColor.r,
      baseColor.g,
      baseColor.b,
      tipColor.r,
      tipColor.g,
      tipColor.b,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createFlowerGeometry(variant = 'daisy') {
  const parts = [];
  const petalColors =
    variant === 'daisy'
      ? ['#fff8df', '#fff2d5', '#fffdf1']
      : ['#f4b7c9', '#e9a0b8', '#f9cbd8'];

  addColoredPart(parts, new THREE.CylinderGeometry(0.012, 0.016, 0.33, 5), '#4f7f3b', [0, 0.165, 0]);
  addColoredPart(parts, new THREE.SphereGeometry(1, 8, 6), '#e9bd45', [0, 0.335, 0], null, {
    x: 0.052,
    y: 0.045,
    z: 0.052,
  });

  const petalGeometry = new THREE.SphereGeometry(1, 7, 5);
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    addColoredPart(
      parts,
      petalGeometry,
      petalColors[i % petalColors.length],
      [Math.cos(angle) * 0.09, 0.335, Math.sin(angle) * 0.09],
      { x: 0, y: -angle, z: 0 },
      { x: 0.075, y: 0.022, z: 0.042 },
    );
  }
  addColoredPart(
    parts,
    new THREE.SphereGeometry(1, 6, 4),
    '#5f9142',
    [0.06, 0.11, 0.01],
    { x: 0, y: 0.4, z: -0.2 },
    { x: 0.06, y: 0.015, z: 0.025 },
  );
  return mergeColoredParts(parts);
}

export function createMushroomGeometry() {
  const parts = [];
  addColoredPart(parts, new THREE.CylinderGeometry(0.04, 0.055, 0.17, 6), '#eadfc6', [0, 0.085, 0]);
  addColoredPart(
    parts,
    new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    '#b34739',
    [0, 0.17, 0],
    null,
    { x: 0.13, y: 0.09, z: 0.13 },
  );
  const spotGeometry = new THREE.SphereGeometry(1, 5, 4);
  for (const [x, z] of [
    [0.055, 0.04],
    [-0.06, 0.015],
    [0.005, -0.065],
    [-0.015, 0.07],
  ]) {
    addColoredPart(parts, spotGeometry, '#f5e8d0', [x, 0.245, z], null, {
      x: 0.023,
      y: 0.012,
      z: 0.023,
    });
  }
  return mergeColoredParts(parts);
}

export function createRockGeometry() {
  return new THREE.DodecahedronGeometry(1, 0);
}
