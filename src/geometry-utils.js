import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const tempColor = new THREE.Color();
const tempQuaternion = new THREE.Quaternion();
const tempEuler = new THREE.Euler();
const tempPosition = new THREE.Vector3();
const tempScale = new THREE.Vector3();

/**
 * Adds a piece of geometry to a collection, baking its transform and a flat
 * vertex colour into the vertices.
 */
export function addColoredPart(
  parts,
  geometry,
  color,
  position = [0, 0, 0],
  rotation = null,
  scale = null,
  parentMatrix = null,
) {
  const part = geometry.index ? geometry.toNonIndexed() : geometry.clone();

  if (!part.attributes.uv) {
    part.setAttribute(
      'uv',
      new THREE.BufferAttribute(new Float32Array(part.attributes.position.count * 2), 2),
    );
  }

  tempPosition.set(position[0], position[1], position[2]);
  tempEuler.set(
    rotation ? rotation.x || 0 : 0,
    rotation ? rotation.y || 0 : 0,
    rotation ? rotation.z || 0 : 0,
    'XYZ',
  );
  tempQuaternion.setFromEuler(tempEuler);
  tempScale.set(
    scale && scale.x !== undefined ? scale.x : 1,
    scale && scale.y !== undefined ? scale.y : 1,
    scale && scale.z !== undefined ? scale.z : 1,
  );

  const localMatrix = new THREE.Matrix4().compose(tempPosition, tempQuaternion, tempScale);
  const matrix = parentMatrix ? new THREE.Matrix4().multiplyMatrices(parentMatrix, localMatrix) : localMatrix;
  part.applyMatrix4(matrix);

  const count = part.attributes.position.count;
  const colors = new Float32Array(count * 3);
  tempColor.set(color);
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = tempColor.r;
    colors[i * 3 + 1] = tempColor.g;
    colors[i * 3 + 2] = tempColor.b;
  }
  part.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  parts.push(part);
  return part;
}

export function mergeColoredParts(parts) {
  if (parts.length === 0) return new THREE.BufferGeometry();
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  merged.computeBoundingSphere();
  return merged;
}

export function composeMatrix(position, rotation = null, scale = null) {
  tempPosition.set(position[0], position[1], position[2]);
  tempEuler.set(
    rotation ? rotation.x || 0 : 0,
    rotation ? rotation.y || 0 : 0,
    rotation ? rotation.z || 0 : 0,
    'XYZ',
  );
  tempQuaternion.setFromEuler(tempEuler);
  tempScale.set(
    scale && scale.x !== undefined ? scale.x : 1,
    scale && scale.y !== undefined ? scale.y : 1,
    scale && scale.z !== undefined ? scale.z : 1,
  );
  return new THREE.Matrix4().compose(tempPosition, tempQuaternion, tempScale);
}

export function makeGlowTexture(size = 128, inner = 'rgba(255, 249, 218, 1)', outer = 'rgba(255, 193, 80, 0)') {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.18, inner);
  gradient.addColorStop(0.45, 'rgba(255, 219, 126, 0.42)');
  gradient.addColorStop(1, outer);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function makeCircleTexture(size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
