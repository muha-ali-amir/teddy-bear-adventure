import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import anime from 'animejs/lib/anime.es.js';
import { clamp, smoothstep } from './utils.js';

const FUR = '#c68752';
const FUR_DARK = '#aa6a3c';
const FUR_LIGHT = '#dda46d';
const CREAM = '#f3d9a8';
const CREAM_DARK = '#e5bf88';
const INNER_EAR = '#e8b899';
const NOSE = '#3d281e';
const EYE = '#241914';
const EYE_GLINT = '#fff9e8';
const BLUSH = '#d87e68';
const SCARF = '#c4513e';
const SCARF_DARK = '#9f382f';
const MOUTH = '#5a3b2d';

const ROTATION_BONES = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'shoulderL',
  'elbowL',
  'wristL',
  'shoulderR',
  'elbowR',
  'wristR',
  'hipL',
  'kneeL',
  'ankleL',
  'hipR',
  'kneeR',
  'ankleR',
];

const tempMatrix = new THREE.Matrix4();
const tempQuaternion = new THREE.Quaternion();
const tempEuler = new THREE.Euler();
const tempPosition = new THREE.Vector3();
const tempScale = new THREE.Vector3();
const tempColor = new THREE.Color();
const ZERO_ROTATION = { x: 0, y: 0, z: 0 };

function matrixFrom(position, rotation = ZERO_ROTATION, scale = { x: 1, y: 1, z: 1 }) {
  const euler = rotation || ZERO_ROTATION;
  tempPosition.set(position[0], position[1], position[2]);
  tempEuler.set(euler.x || 0, euler.y || 0, euler.z || 0, 'XYZ');
  tempQuaternion.setFromEuler(tempEuler);
  tempScale.set(scale.x || 1, scale.y || 1, scale.z || 1);
  return new THREE.Matrix4().compose(tempPosition, tempQuaternion, tempScale);
}

function makeBones() {
  const definitions = [
    ['hips', null, [0, 1.0, 0]],
    ['spine', 'hips', [0, 0.25, 0]],
    ['chest', 'spine', [0, 0.27, 0]],
    ['neck', 'chest', [0, 0.23, 0]],
    ['head', 'neck', [0, 0.2, 0]],
    ['earL', 'head', [0.33, 0.34, -0.02]],
    ['earR', 'head', [-0.33, 0.34, -0.02]],
    ['shoulderL', 'chest', [0.38, 0.12, 0]],
    ['elbowL', 'shoulderL', [0, -0.34, 0]],
    ['wristL', 'elbowL', [0, -0.3, 0]],
    ['shoulderR', 'chest', [-0.38, 0.12, 0]],
    ['elbowR', 'shoulderR', [0, -0.34, 0]],
    ['wristR', 'elbowR', [0, -0.3, 0]],
    ['hipL', 'hips', [0.21, -0.04, 0]],
    ['kneeL', 'hipL', [0, -0.38, 0]],
    ['ankleL', 'kneeL', [0, -0.36, 0]],
    ['hipR', 'hips', [-0.21, -0.04, 0]],
    ['kneeR', 'hipR', [0, -0.38, 0]],
    ['ankleR', 'kneeR', [0, -0.36, 0]],
    ['tail', 'hips', [0, 0.02, -0.3]],
  ];

  const bones = {};
  const ordered = [];
  for (const [name, parentName, position] of definitions) {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.set(position[0], position[1], position[2]);
    if (parentName) bones[parentName].add(bone);
    bones[name] = bone;
    ordered.push(bone);
  }
  return { bones, ordered };
}

function createBearGeometry(bones, boneOrder) {
  const parts = [];
  const boneIndex = new Map(boneOrder.map((bone, index) => [bone.name, index]));

  function addPart(geometry, color, matrix, weightResolver) {
    const part = geometry.clone();
    part.applyMatrix4(matrix);
    if (!part.attributes.uv) {
      const count = part.attributes.position.count;
      part.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    const positions = part.attributes.position;
    const count = positions.count;
    const colors = new Float32Array(count * 3);
    const skinIndices = new Uint16Array(count * 4);
    const skinWeights = new Float32Array(count * 4);
    tempColor.set(color);

    for (let i = 0; i < count; i += 1) {
      colors[i * 3] = tempColor.r;
      colors[i * 3 + 1] = tempColor.g;
      colors[i * 3 + 2] = tempColor.b;

      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      const weights = weightResolver(x, y, z);

      for (let j = 0; j < 4; j += 1) {
        const entry = weights[j];
        if (entry) {
          skinIndices[i * 4 + j] = boneIndex.get(entry[0]);
          skinWeights[i * 4 + j] = entry[1];
        }
      }
    }

    part.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    part.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    part.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    parts.push(part);
    return part;
  }

  const rigid = (boneName) => () => [[boneName, 1]];
  const torsoWeights = (x, y) => {
    if (y > 1.63) return [['chest', 1]];
    if (y > 1.4) {
      const t = smoothstep(1.4, 1.63, y);
      return [
        ['chest', t],
        ['spine', 1 - t],
      ];
    }
    if (y > 1.14) {
      const t = smoothstep(1.14, 1.4, y);
      return [
        ['spine', t],
        ['hips', 1 - t],
      ];
    }
    return [['hips', 1]];
  };

  const sphere = (segments = 20) => new THREE.SphereGeometry(1, segments, Math.max(8, Math.round(segments * 0.7)));
  const addEllipsoid = (position, scale, color, bone, rotation, segments = 20) => {
    addPart(
      sphere(segments),
      color,
      matrixFrom(position, rotation, scale),
      typeof bone === 'function' ? bone : rigid(bone),
    );
  };
  const addCapsule = (position, radius, length, color, bone, rotation = ZERO_ROTATION) => {
    addPart(
      new THREE.CapsuleGeometry(radius, length, 6, 14),
      color,
      matrixFrom(position, rotation, { x: 1, y: 1, z: 1 }),
      rigid(bone),
    );
  };

  // Torso and pelvis.
  addEllipsoid([0, 1.31, 0.01], { x: 0.43, y: 0.47, z: 0.35 }, FUR, torsoWeights, null, 24);
  addEllipsoid([0, 1.54, 0.02], { x: 0.46, y: 0.39, z: 0.35 }, FUR_LIGHT, torsoWeights, null, 24);
  addEllipsoid([0, 1.02, 0.01], { x: 0.35, y: 0.27, z: 0.3 }, FUR, 'hips');
  addEllipsoid([0, 1.28, 0.315], { x: 0.27, y: 0.34, z: 0.055 }, CREAM, torsoWeights, null, 24);
  addEllipsoid([0, 1.42, 0.345], { x: 0.08, y: 0.19, z: 0.025 }, CREAM_DARK, torsoWeights, null, 12);

  // Neck fluff.
  addEllipsoid([0, 1.82, 0.01], { x: 0.245, y: 0.17, z: 0.235 }, FUR, 'neck', null, 18);

  // Head.
  addEllipsoid([0, 2.12, 0.02], { x: 0.57, y: 0.53, z: 0.5 }, FUR, 'head', null, 28);
  addEllipsoid([0.34, 2.02, 0.19], { x: 0.2, y: 0.21, z: 0.18 }, FUR_LIGHT, 'head', null, 18);
  addEllipsoid([-0.34, 2.02, 0.19], { x: 0.2, y: 0.21, z: 0.18 }, FUR_LIGHT, 'head', null, 18);

  // Muzzle, nose and smile.
  addEllipsoid([0, 2.055, 0.435], { x: 0.275, y: 0.205, z: 0.165 }, CREAM, 'head', null, 24);
  addEllipsoid([0, 2.135, 0.568], { x: 0.115, y: 0.085, z: 0.07 }, NOSE, 'head', null, 18);
  addEllipsoid([-0.055, 2.162, 0.6], { x: 0.028, y: 0.022, z: 0.014 }, '#7d5140', 'head', null, 10);
  addEllipsoid([0, 2.005, 0.585], { x: 0.075, y: 0.045, z: 0.018 }, CREAM_DARK, 'head', null, 12);

  const mouthCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.11, 2.055, 0.598),
    new THREE.Vector3(-0.045, 2.018, 0.612),
    new THREE.Vector3(0, 2.01, 0.616),
    new THREE.Vector3(0.045, 2.018, 0.612),
    new THREE.Vector3(0.11, 2.055, 0.598),
  ]);
  addPart(
    new THREE.TubeGeometry(mouthCurve, 18, 0.012, 6, false),
    MOUTH,
    matrixFrom([0, 0, 0]),
    rigid('head'),
  );

  // Eyes.
  for (const side of [-1, 1]) {
    addEllipsoid([side * 0.205, 2.25, 0.438], { x: 0.074, y: 0.095, z: 0.052 }, EYE, 'head', null, 16);
    addEllipsoid([side * 0.184, 2.283, 0.484], { x: 0.027, y: 0.035, z: 0.018 }, EYE_GLINT, 'head', null, 10);
    addEllipsoid([side * 0.234, 2.214, 0.486], { x: 0.014, y: 0.019, z: 0.01 }, EYE_GLINT, 'head', null, 8);
    addEllipsoid([side * 0.355, 2.07, 0.39], { x: 0.13, y: 0.073, z: 0.045 }, BLUSH, 'head', null, 14);
  }

  // Eyebrows: kept soft and nearly level for a friendly, curious face.
  addEllipsoid([0.2, 2.382, 0.44], { x: 0.078, y: 0.019, z: 0.024 }, FUR_DARK, 'head', { x: 0, y: 0, z: -0.025 }, 10);
  addEllipsoid([-0.2, 2.382, 0.44], { x: 0.078, y: 0.019, z: 0.024 }, FUR_DARK, 'head', { x: 0, y: 0, z: 0.025 }, 10);

  // Ears.
  for (const [side, earBone] of [
    [1, 'earL'],
    [-1, 'earR'],
  ]) {
    addPart(
      sphere(18),
      FUR,
      matrixFrom([side * 0.42, 2.46, -0.02], { x: 0, y: 0, z: side * -0.1 }, { x: 0.19, y: 0.195, z: 0.12 }),
      rigid(earBone),
    );
    addPart(
      sphere(14),
      INNER_EAR,
      matrixFrom([side * 0.425, 2.455, 0.084], { x: 0, y: 0, z: side * -0.1 }, { x: 0.115, y: 0.12, z: 0.025 }),
      rigid(earBone),
    );
  }

  // Scarf collar and little trailing ends.
  addPart(
    new THREE.TorusGeometry(0.34, 0.072, 8, 28),
    SCARF,
    matrixFrom([0, 1.79, 0.01], { x: Math.PI / 2, y: 0, z: 0 }),
    rigid('chest'),
  );
  addPart(
    new THREE.BoxGeometry(0.15, 0.3, 0.035),
    SCARF,
    matrixFrom([0.22, 1.61, 0.37], { x: -0.08, y: 0.05, z: 0.22 }),
    rigid('chest'),
  );
  addPart(
    new THREE.BoxGeometry(0.13, 0.24, 0.035),
    SCARF_DARK,
    matrixFrom([0.3, 1.56, 0.34], { x: -0.06, y: 0.08, z: 0.36 }),
    rigid('chest'),
  );

  // Arms.
  for (const [side, shoulder, elbow, wrist] of [
    [1, 'shoulderL', 'elbowL', 'wristL'],
    [-1, 'shoulderR', 'elbowR', 'wristR'],
  ]) {
    addEllipsoid([side * 0.38, 1.65, 0], { x: 0.18, y: 0.18, z: 0.17 }, FUR_LIGHT, shoulder, null, 18);
    addCapsule([side * 0.39, 1.48, 0], 0.14, 0.15, FUR, shoulder);
    addEllipsoid([side * 0.39, 1.31, 0], { x: 0.145, y: 0.15, z: 0.14 }, FUR_LIGHT, elbow, null, 16);
    addCapsule([side * 0.39, 1.15, 0], 0.125, 0.13, FUR, elbow);
    addEllipsoid([side * 0.39, 0.98, 0.025], { x: 0.16, y: 0.15, z: 0.14 }, FUR_LIGHT, wrist, null, 16);
    addEllipsoid([side * 0.39, 0.94, 0.147], { x: 0.085, y: 0.067, z: 0.025 }, CREAM_DARK, wrist, null, 12);
  }

  // Legs.
  for (const [side, hip, knee, ankle] of [
    [1, 'hipL', 'kneeL', 'ankleL'],
    [-1, 'hipR', 'kneeR', 'ankleR'],
  ]) {
    addEllipsoid([side * 0.22, 0.9, 0], { x: 0.2, y: 0.21, z: 0.19 }, FUR, hip, null, 18);
    addCapsule([side * 0.22, 0.76, 0], 0.165, 0.12, FUR, hip);
    addEllipsoid([side * 0.22, 0.59, 0], { x: 0.15, y: 0.15, z: 0.15 }, FUR_LIGHT, knee, null, 16);
    addCapsule([side * 0.22, 0.41, 0], 0.135, 0.13, FUR, knee);
    addEllipsoid([side * 0.22, 0.15, 0.125], { x: 0.185, y: 0.145, z: 0.275 }, FUR_LIGHT, ankle, null, 18);
    addEllipsoid([side * 0.22, 0.135, 0.32], { x: 0.1, y: 0.075, z: 0.08 }, CREAM_DARK, ankle, null, 12);
  }

  // Tail.
  addPart(
    sphere(16),
    FUR_LIGHT,
    matrixFrom([0, 1.055, -0.385], null, { x: 0.145, y: 0.145, z: 0.12 }),
    rigid('tail'),
  );

  const geometry = mergeGeometries(parts, false);
  geometry.computeBoundingSphere();
  return geometry;
}

function quaternionValuesForPose(pose, boneName) {
  const rotation = pose[boneName] || ZERO_ROTATION;
  tempEuler.set(rotation.x || 0, rotation.y || 0, rotation.z || 0, 'XYZ');
  tempQuaternion.setFromEuler(tempEuler);
  return [tempQuaternion.x, tempQuaternion.y, tempQuaternion.z, tempQuaternion.w];
}

function buildClip(name, duration, times, poseFunction, hipsBaseY) {
  const frames = times.map((time) => ({ time, pose: poseFunction(time / duration, time) }));
  const tracks = [];

  for (const boneName of ROTATION_BONES) {
    const values = [];
    for (const frame of frames) {
      values.push(...quaternionValuesForPose(frame.pose, boneName));
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, values));
  }

  const hipsPositions = [];
  for (const frame of frames) {
    const position = frame.pose.hipsPosition || { x: 0, y: hipsBaseY, z: 0 };
    hipsPositions.push(position.x, position.y, position.z);
  }
  tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, hipsPositions));

  return new THREE.AnimationClip(name, duration, tracks);
}

function makeIdlePose(hipsBaseY) {
  return (u) => {
    const phase = u * Math.PI * 2;
    const breath = Math.sin(phase);
    const slow = Math.sin(phase * 0.5);
    const armSway = Math.sin(phase + 0.4);
    return {
      hips: { x: 0.006 * slow, y: 0.03 * slow, z: 0 },
      hipsPosition: { x: 0, y: hipsBaseY + 0.006 * breath, z: 0 },
      spine: { x: 0.012 + 0.014 * breath, y: 0.018 * slow, z: 0.005 * slow },
      chest: { x: 0.01 + 0.022 * breath, y: -0.012 * slow, z: -0.008 * slow },
      neck: { x: -0.012 - 0.01 * breath, y: 0.018 * slow, z: 0 },
      head: { x: -0.012 + 0.008 * breath, y: 0.09 * Math.sin(phase * 0.5 + 0.5), z: 0.018 * slow },
      shoulderL: { x: 0.035 * armSway, y: 0, z: 0.07 },
      elbowL: { x: -0.08 + 0.035 * armSway, y: 0, z: 0 },
      wristL: { x: 0.02, y: 0, z: 0 },
      shoulderR: { x: 0.035 * Math.sin(phase + 1.2), y: 0, z: -0.07 },
      elbowR: { x: -0.08 + 0.035 * Math.sin(phase + 1.2), y: 0, z: 0 },
      wristR: { x: 0.02, y: 0, z: 0 },
      hipL: { x: -0.015, y: 0, z: -0.018 },
      kneeL: { x: 0.035, y: 0, z: 0 },
      ankleL: { x: -0.02, y: 0, z: 0 },
      hipR: { x: -0.015, y: 0, z: 0.018 },
      kneeR: { x: 0.035, y: 0, z: 0 },
      ankleR: { x: -0.02, y: 0, z: 0 },
    };
  };
}

function makeRunPose(hipsBaseY) {
  return (u) => {
    const phase = u * Math.PI * 2;
    const cos = Math.cos(phase);
    const sin = Math.sin(phase);
    const leftKnee = 0.18 + 0.95 * Math.max(0, -sin) + 0.2 * Math.max(0, sin);
    const rightKnee = 0.18 + 0.95 * Math.max(0, sin) + 0.2 * Math.max(0, -sin);
    const leftLift = Math.max(0, -sin);
    const rightLift = Math.max(0, sin);
    return {
      hips: { x: 0.015, y: -0.055 * cos, z: 0.012 * sin },
      hipsPosition: { x: 0, y: hipsBaseY + 0.032 * Math.abs(sin), z: 0 },
      spine: { x: 0.09, y: 0.045 * cos, z: -0.018 * sin },
      chest: { x: 0.055, y: -0.1 * cos, z: 0.015 * sin },
      neck: { x: -0.035, y: 0.018 * cos, z: 0 },
      head: { x: -0.055 - 0.025 * Math.abs(sin), y: 0.025 * cos, z: 0.02 * sin },
      shoulderL: { x: 0.68 * cos - 0.04, y: 0.02, z: 0.12 },
      elbowL: { x: -0.76 - 0.2 * cos, y: 0, z: 0.02 },
      wristL: { x: -0.06, y: 0, z: 0 },
      shoulderR: { x: -0.68 * cos - 0.04, y: -0.02, z: -0.12 },
      elbowR: { x: -0.76 + 0.2 * cos, y: 0, z: -0.02 },
      wristR: { x: -0.06, y: 0, z: 0 },
      hipL: { x: -0.74 * cos, y: 0.01, z: -0.035 },
      kneeL: { x: leftKnee, y: 0, z: 0 },
      ankleL: { x: 0.05 - 0.35 * leftLift, y: 0, z: 0 },
      hipR: { x: 0.74 * cos, y: -0.01, z: 0.035 },
      kneeR: { x: rightKnee, y: 0, z: 0 },
      ankleR: { x: 0.05 - 0.35 * rightLift, y: 0, z: 0 },
    };
  };
}

function makeJumpPose(hipsBaseY) {
  return (u) => {
    const arc = Math.sin(Math.PI * clamp(u, 0, 1));
    const launch = Math.sin(Math.PI * clamp(u * 1.6, 0, 1));
    const tuck = Math.sin(Math.PI * clamp((u - 0.1) / 0.8, 0, 1));
    const settle = smoothstep(0.78, 1, u);
    const armOut = (0.1 + 1.0 * arc) * (1 - settle);
    const kneeTuck = 0.09 + 0.9 * tuck * (1 - settle);
    return {
      hips: { x: -0.04 + 0.05 * arc, y: 0, z: 0 },
      hipsPosition: { x: 0, y: hipsBaseY + 0.035 * arc, z: 0 },
      spine: { x: 0.11 - 0.03 * arc, y: 0, z: 0 },
      chest: { x: 0.08 - 0.04 * arc, y: 0, z: 0 },
      neck: { x: -0.02 - 0.04 * arc, y: 0, z: 0 },
      head: { x: -0.02 - 0.13 * arc, y: 0, z: 0 },
      shoulderL: { x: 0.2 - 0.45 * arc, y: 0, z: armOut },
      elbowL: { x: -0.25 - 0.35 * arc, y: 0, z: 0 },
      wristL: { x: 0.02, y: 0, z: 0 },
      shoulderR: { x: 0.2 - 0.45 * arc, y: 0, z: -armOut },
      elbowR: { x: -0.25 - 0.35 * arc, y: 0, z: 0 },
      wristR: { x: 0.02, y: 0, z: 0 },
      hipL: { x: -0.06 - 0.42 * tuck * (1 - settle), y: 0, z: -0.035 },
      kneeL: { x: kneeTuck, y: 0, z: 0 },
      ankleL: { x: 0.03 + 0.18 * launch * (1 - settle), y: 0, z: 0 },
      hipR: { x: -0.06 - 0.42 * tuck * (1 - settle), y: 0, z: 0.035 },
      kneeR: { x: kneeTuck, y: 0, z: 0 },
      ankleR: { x: 0.03 + 0.18 * launch * (1 - settle), y: 0, z: 0 },
    };
  };
}

export function createBear() {
  const root = new THREE.Group();
  root.name = 'TeddyBear';
  const visual = new THREE.Group();
  root.add(visual);

  const { bones, ordered } = makeBones();
  const geometry = createBearGeometry(bones, ordered);
  // Keep the character material in the transparent pass so it can fade out
  // smoothly when an obstruction pulls the camera right up against the bear.
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.68,
    metalness: 0.015,
    transparent: true,
  });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'TeddyBearMesh';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  mesh.add(bones.hips);
  mesh.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(ordered);
  mesh.bind(skeleton);
  visual.add(mesh);

  const hipsBaseY = bones.hips.position.y;
  const clips = {
    idle: buildClip(
      'idle',
      5,
      [0, 1.25, 2.5, 3.75, 5],
      makeIdlePose(hipsBaseY),
      hipsBaseY,
    ),
    run: buildClip(
      'run',
      0.68,
      [0, 0.085, 0.17, 0.255, 0.34, 0.425, 0.51, 0.595, 0.68],
      makeRunPose(hipsBaseY),
      hipsBaseY,
    ),
    jump: buildClip(
      'jump',
      0.95,
      [0, 0.095, 0.19, 0.285, 0.38, 0.475, 0.57, 0.665, 0.76, 0.855, 0.95],
      makeJumpPose(hipsBaseY),
      hipsBaseY,
    ),
  };

  const mixer = new THREE.AnimationMixer(mesh);
  const actions = {};
  for (const [name, clip] of Object.entries(clips)) {
    const action = mixer.clipAction(clip);
    if (name === 'jump') {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    actions[name] = action;
  }

  let currentAction = actions.idle;
  actions.idle.play();
  let currentName = 'idle';
  let jumpLocked = false;
  let currentSpeed = 0;
  let cameraFade = 1;

  const fadeTo = (name, duration = 0.2, restart = false) => {
    const next = actions[name];
    if (next === currentAction && !restart) return;
    if (restart) next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(1);
    next.play();
    if (currentAction && currentAction !== next) {
      next.crossFadeFrom(currentAction, duration, false);
    }
    currentAction = next;
    currentName = name;
  };

  // Anime.js adds the small, organic details on top of the skeletal clips:
  // ear flicks and tail wags are real bone animations.
  const earAnimation = anime({
    targets: bones.earL.rotation,
    z: [-0.06, 0.06, -0.02],
    x: [0.02, -0.035, 0.02],
    duration: 2600,
    easing: 'easeInOutSine',
    loop: true,
    direction: 'alternate',
  });
  const earAnimationR = anime({
    targets: bones.earR.rotation,
    z: [0.06, -0.06, 0.02],
    x: [0.02, -0.035, 0.02],
    duration: 3100,
    easing: 'easeInOutSine',
    loop: true,
    direction: 'alternate',
    delay: 600,
  });
  const tailAnimation = anime({
    targets: bones.tail.rotation,
    z: [-0.16, 0.16],
    x: [0.04, -0.06],
    duration: 2200,
    easing: 'easeInOutSine',
    loop: true,
    direction: 'alternate',
  });

  function playJump() {
    jumpLocked = true;
    fadeTo('jump', 0.12, true);
    anime.remove(visual.scale);
    anime({
      targets: visual.scale,
      x: [1, 1.045, 1],
      y: [1, 0.94, 1],
      z: [1, 1.045, 1],
      duration: 360,
      easing: 'easeOutSine',
    });
  }

  function land() {
    jumpLocked = false;
    fadeTo(currentSpeed > 0.35 ? 'run' : 'idle', 0.18, false);
    anime.remove(visual.scale);
    anime({
      targets: visual.scale,
      x: [1.12, 1],
      y: [0.86, 1],
      z: [1.12, 1],
      duration: 520,
      easing: 'easeOutElastic(1, 0.55)',
    });
  }

  function setSpeed(speed) {
    currentSpeed = speed;
    if (jumpLocked) return;
    const shouldRun = speed > 0.35;
    if (shouldRun && currentName !== 'run') fadeTo('run', 0.2, false);
    if (!shouldRun && currentName !== 'idle') fadeTo('idle', 0.28, false);
  }

  function update(dt) {
    if (!jumpLocked && currentName === 'run') {
      actions.run.setEffectiveTimeScale(clamp(0.72 + currentSpeed * 0.105, 0.8, 1.65));
    }
    if (currentName === 'jump' && !jumpLocked) {
      fadeTo(currentSpeed > 0.35 ? 'run' : 'idle', 0.2, false);
    }
    mixer.update(dt);
  }

  function setCameraFade(value) {
    const next = clamp(value, 0, 1);
    if (Math.abs(next - cameraFade) < 0.002) return;
    cameraFade = next;
    material.opacity = cameraFade;
    material.depthWrite = cameraFade > 0.999;
    mesh.visible = cameraFade > 0.02;
    mesh.castShadow = cameraFade > 0.5;
  }

  function pauseDetails(paused) {
    for (const animation of [earAnimation, earAnimationR, tailAnimation]) {
      if (paused) animation.pause();
      else if (animation.began) animation.play();
    }
  }

  return {
    root,
    visual,
    mesh,
    skeleton,
    bones,
    mixer,
    actions,
    playJump,
    land,
    setSpeed,
    update,
    setCameraFade,
    pauseDetails,
    getCurrentAction: () => currentName,
  };
}
