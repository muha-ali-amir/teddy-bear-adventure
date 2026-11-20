import * as THREE from 'three';
import anime from 'animejs/lib/anime.es.js';
import './style.css';
import { createWorld } from './world.js';
import { createBear } from './bear.js';
import { Minimap } from './minimap.js';
import { AudioEngine } from './audio.js';
import {
  PONDS,
  PLAY_RADIUS,
  SPAWN,
  getRegionName,
  heightAt,
  waterDepthAt,
} from './world-data.js';
import { clamp, damp, dampAngle, smoothstep } from './utils.js';

const PLAYER_RADIUS = 0.44;
const WALK_SPEED = 5.4;
const SPRINT_SPEED = 8.6;
const WATER_SPEED = 0.56;
const GROUND_RESPONSE = 14;
const AIR_RESPONSE = 4.2;
const GRAVITY = 23;
const JUMP_SPEED = 7.5;
const MOUSE_SENSITIVITY = 0.0022;
const MIN_CAMERA_DISTANCE = 5.4;
const MAX_CAMERA_DISTANCE = 13.5;
const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// Touch devices get a joystick, an on-screen jump button and a lower-cost
// renderer configuration. The game stays identical on mouse-and-keyboard.
const coarsePointer =
  window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
const MAX_PIXEL_RATIO = coarsePointer ? 1.5 : 2;
const LOOK_SENSITIVITY = coarsePointer ? 0.003 : MOUSE_SENSITIVITY;
const CAMERA_FOV = coarsePointer ? 58 : 52;
const DEFAULT_CAMERA_DISTANCE = coarsePointer ? 8.4 : 9.2;
const STICK_RADIUS = 42;
const STICK_DEADZONE = 0.14;

const dom = {
  canvas: document.getElementById('scene'),
  loadingScreen: document.getElementById('loading-screen'),
  startScreen: document.getElementById('start-screen'),
  playButton: document.getElementById('play-button'),
  startAudioButton: document.getElementById('start-audio-button'),
  hud: document.getElementById('hud'),
  coinPill: document.getElementById('coin-pill'),
  coinCount: document.getElementById('coin-count'),
  coinTotal: document.getElementById('coin-total'),
  locationPill: document.querySelector('.location-pill'),
  locationName: document.getElementById('location-name'),
  minimap: document.getElementById('minimap'),
  mapHeading: document.getElementById('map-heading'),
  hintBar: document.getElementById('hint-bar'),
  audioButton: document.getElementById('audio-button'),
  pauseButton: document.getElementById('pause-button'),
  pauseAudioButton: document.getElementById('pause-audio-button'),
  pauseAudioLabel: document.querySelector('#pause-audio-button .audio-label'),
  coinFloatLayer: document.getElementById('coin-float-layer'),
  victoryBanner: document.getElementById('victory-banner'),
  pauseScreen: document.getElementById('pause-screen'),
  resumeButton: document.getElementById('resume-button'),
  errorScreen: document.getElementById('error-screen'),
  errorMessage: document.getElementById('error-message'),
  touchStick: document.getElementById('touch-stick'),
  touchKnob: document.getElementById('touch-stick-knob'),
  touchJump: document.getElementById('touch-jump'),
};
const audioButtons = [
  dom.audioButton,
  dom.startAudioButton,
  dom.pauseAudioButton,
].filter(Boolean);

const reduceMotion =
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

let renderer;
let scene;
let camera;
let world;
let bear;
let minimap;
let audio;

let appPhase = 'intro';
let started = false;
let elapsed = 0;
let lastFrame = performance.now();
let pointerLocked = false;
let hasEverLocked = false;
let dragging = false;
let dragMoved = false;
let dragX = 0;
let dragY = 0;
let dragPointerId = null;
let stickPointerId = null;
let stickOriginX = 0;
let stickOriginY = 0;
const touchMove = { x: 0, y: 0, active: false };
let yaw = 0.18;
let pitch = 0.26;
let cameraDistance = DEFAULT_CAMERA_DISTANCE;
let cameraClearance = 1;
let cameraShake = 0;
let pauseOpenedAt = 0;
let jumpBuffer = 0;
let coyote = 0;
let stepAccumulator = 0;
let regionTimer = 0;
let currentRegion = '';
let mapTimer = 0;
let collectedCoins = 0;
let totalCoins = 0;
let displayedCoins = 0;
let coinCounterAnimation = null;
let victoryShown = false;
let edgeReminderAt = -20;

const errorLog = [];
const keys = new Set();

const player = {
  position: new THREE.Vector3(SPAWN.x, heightAt(SPAWN.x, SPAWN.z), SPAWN.z),
  velocity: new THREE.Vector3(),
  heading: 2.18,
  grounded: true,
};

const playerInfo = {
  x: player.position.x,
  y: player.position.y,
  z: player.position.z,
  speed: 0,
  heading: player.heading,
  grounded: true,
  inWater: false,
};

const cameraFocus = new THREE.Vector3(
  player.position.x,
  player.position.y + 1.32,
  player.position.z,
);
const cameraBlend = { value: 1 };

const tempGameplayPosition = new THREE.Vector3();
const tempIntroPosition = new THREE.Vector3();
const tempCameraTarget = new THREE.Vector3();
const tempIntroLook = new THREE.Vector3();
const tempLook = new THREE.Vector3();

window.addEventListener('error', (event) => {
  errorLog.push(event.message || 'Unknown runtime error');
});

window.addEventListener('unhandledrejection', (event) => {
  errorLog.push(String(event.reason));
});

function boot() {
  try {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      window.innerWidth / window.innerHeight,
      0.1,
      480,
    );

    renderer = new THREE.WebGLRenderer({
      canvas: dom.canvas,
      antialias: !coarsePointer,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO),
    );
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = coarsePointer
      ? THREE.PCFShadowMap
      : THREE.PCFSoftShadowMap;

    bear = createBear();
    player.position.set(SPAWN.x, heightAt(SPAWN.x, SPAWN.z), SPAWN.z);
    bear.root.position.copy(player.position);
    bear.root.rotation.y = player.heading;
    scene.add(bear.root);

    world = createWorld(scene, { lowPower: coarsePointer });
    minimap = new Minimap(dom.minimap, world, world.data.paths);
    audio = new AudioEngine();

    totalCoins = world.data.coins.length;
    dom.coinTotal.textContent = String(totalCoins);
    const objectiveCount = document.querySelector('.start-coin-objective strong');
    if (objectiveCount) objectiveCount.textContent = String(totalCoins);

    cameraFocus.set(
      player.position.x,
      player.position.y + 1.32,
      player.position.z,
    );
    setupEvents();
    setupInitialUI();
    syncPlayerInfo();
    updateCamera(0, 0, true);
    renderer.render(scene, camera);

    lastFrame = performance.now();
    requestAnimationFrame(frame);
    beginIntroReveal();
    exposeDebugApi();
  } catch (error) {
    showFatalError(error);
  }
}

function setupInitialUI() {
  if (dom.hud) dom.hud.setAttribute('aria-hidden', 'true');
  if (dom.pauseScreen) dom.pauseScreen.setAttribute('aria-hidden', 'true');
  if (dom.victoryBanner) dom.victoryBanner.setAttribute('aria-hidden', 'true');
  updateMuteUI();
}

function beginIntroReveal() {
  window.setTimeout(() => {
    if (!dom.loadingScreen) return;
    anime({
      targets: dom.loadingScreen,
      opacity: [1, 0],
      duration: reduceMotion ? 1 : 700,
      easing: 'easeInOutQuad',
      complete: () => {
        dom.loadingScreen.classList.add('is-hidden');
      },
    });
    revealStartScreen();
  }, reduceMotion ? 60 : 620);
}

function revealStartScreen() {
  const items = [
    ['.start-topbar', 80, -14],
    ['.eyebrow', 260, 12],
    ['.title-main', 320, 28],
    ['.title-accent', 400, 28],
    ['.start-description', 520, 16],
    ['#play-button', 630, 18],
    ['.start-meta', 730, 12],
    ['.start-scene-tag', 820, 8],
    ['.start-coin-objective', 860, 8],
  ];

  for (const [selector, delay, offset] of items) {
    const isButton = selector === '#play-button';
    anime({
      targets: selector,
      opacity: [0, 1],
      translateY: [offset, 0],
      duration: reduceMotion ? 1 : 850,
      delay: reduceMotion ? 0 : delay,
      easing: 'easeOutCubic',
      complete: isButton
        ? (animation) => {
            const element = animation.animatables[0]?.target;
            if (element) element.style.transform = '';
          }
        : undefined,
    });
  }
}

function startGame(options = {}) {
  const { lockPointer = !coarsePointer } = options;
  if (!world || started) return;
  started = true;
  appPhase = 'playing';
  lastFrame = performance.now();
  mapTimer = 0;
  regionTimer = 0;

  if (audio) audio.init();

  // Turn the bear to face out into the meadow as the camera settles behind it.
  player.heading = Math.PI;
  bear.root.rotation.y = player.heading;

  dom.startScreen.classList.add('is-hidden');
  anime({
    targets: '.start-content',
    opacity: [1, 0],
    translateY: [0, -20],
    duration: reduceMotion ? 1 : 520,
    easing: 'easeInQuad',
  });

  dom.hud.classList.add('is-visible');
  dom.hud.setAttribute('aria-hidden', 'false');
  dom.hintBar.classList.remove('is-faded');

  cameraBlend.value = 1;
  anime.remove(cameraBlend);
  anime({
    targets: cameraBlend,
    value: 0,
    duration: reduceMotion ? 1 : 1700,
    easing: 'easeInOutCubic',
  });

  currentRegion = '';
  updateLocation(1);
  updateCoinUI(true);

  if (lockPointer) requestPointerLock();

  window.setTimeout(() => {
    if (appPhase === 'playing' || appPhase === 'paused') {
      dom.hintBar.classList.add('is-faded');
    }
  }, 17000);
}

function updateCoinUI(instant = false) {
  const target = collectedCoins;

  if (instant) {
    if (coinCounterAnimation) coinCounterAnimation.pause();
    coinCounterAnimation = null;
    displayedCoins = target;
    dom.coinCount.textContent = String(target);
    return;
  }

  const state = { value: displayedCoins };
  if (coinCounterAnimation) coinCounterAnimation.pause();
  coinCounterAnimation = anime({
    targets: state,
    value: target,
    duration: reduceMotion ? 1 : 520,
    easing: 'easeOutCubic',
    update: () => {
      displayedCoins = state.value;
      dom.coinCount.textContent = String(Math.round(state.value));
    },
    complete: () => {
      displayedCoins = target;
      dom.coinCount.textContent = String(target);
      coinCounterAnimation = null;
    },
  });

  anime.remove(dom.coinPill);
  anime({
    targets: dom.coinPill,
    scale: [1, 1.085, 1],
    duration: reduceMotion ? 1 : 430,
    easing: 'easeOutQuad',
  });
}

function updateLocation(dt) {
  if (!world || !dom.locationName) return;
  regionTimer -= dt;
  if (regionTimer > 0) return;
  regionTimer = 0.5;

  const region = getRegionName(player.position.x, player.position.z);
  if (!region || region === currentRegion) return;
  currentRegion = region;

  const label = dom.locationName;
  anime.remove(label);
  label.textContent = region;
  label.style.opacity = '0';
  anime({
    targets: label,
    opacity: [0, 1],
    translateY: [5, 0],
    duration: reduceMotion ? 1 : 320,
    easing: 'easeOutCubic',
  });

  if (dom.locationPill) {
    anime.remove(dom.locationPill);
    anime({
      targets: dom.locationPill,
      scale: [1, 1.035, 1],
      duration: reduceMotion ? 1 : 390,
      easing: 'easeOutQuad',
    });
  }
}

function updateCompass() {
  if (!dom.mapHeading) return;
  let degrees = ((-yaw * 180) / Math.PI) % 360;
  if (degrees < 0) degrees += 360;
  const label = COMPASS_POINTS[Math.round(degrees / 45) % 8];
  if (dom.mapHeading.textContent !== label) {
    dom.mapHeading.textContent = label;
  }
}

function updateMuteUI() {
  const muted = audio ? audio.muted : false;
  for (const button of audioButtons) {
    button.classList.toggle('is-muted', muted);
    button.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    button.setAttribute(
      'title',
      muted ? 'Unmute sound (M)' : 'Mute sound (M)',
    );
  }
  if (dom.pauseAudioLabel) {
    dom.pauseAudioLabel.textContent = muted ? 'Sound off' : 'Sound on';
  }
}

function toggleMute() {
  if (!audio) return;
  if (!audio.initialized) audio.init();
  audio.toggleMute();
  updateMuteUI();
}

function requestPointerLock() {
  if (!dom.canvas.requestPointerLock) return;
  try {
    const request = dom.canvas.requestPointerLock();
    if (request && typeof request.catch === 'function') {
      request.catch(() => {});
    }
  } catch (error) {
    // Pointer lock can be unavailable in embedded or headless contexts.
    // The drag fallback still lets the player look around.
  }
}

function cameraObstruction(focus, target) {
  const dx = target.x - focus.x;
  const dz = target.z - focus.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 0.0001) return 1;

  let allowed = 1;
  for (const collider of world.colliders) {
    if (collider.type === 'rock') continue;
    const radius = collider.r + 0.32;
    const fromX = focus.x - collider.x;
    const fromZ = focus.z - collider.z;
    const b = 2 * (fromX * dx + fromZ * dz);
    const c = fromX * fromX + fromZ * fromZ - radius * radius;
    const discriminant = b * b - 4 * lengthSquared * c;
    if (discriminant <= 0) continue;

    const t = (-b - Math.sqrt(discriminant)) / (2 * lengthSquared);
    if (t <= 0.04 || t >= allowed) continue;

    const hitY = focus.y + (target.y - focus.y) * t;
    const baseY = collider.y ?? heightAt(collider.x, collider.z);
    const topY = baseY + (collider.height ?? 4.2);
    if (hitY > topY - 0.12) continue;

    allowed = Math.max(0.06, t - 0.04);
  }
  return allowed;
}

function updateCamera(dt, time, snap = false) {
  const targetFocus = tempLook.set(
    player.position.x,
    player.position.y + 1.32,
    player.position.z,
  );

  if (snap) cameraFocus.copy(targetFocus);
  else cameraFocus.lerp(targetFocus, 1 - Math.exp(-8 * dt));

  const horizontal = Math.cos(pitch) * cameraDistance;
  const gameX = cameraFocus.x + Math.sin(yaw) * horizontal;
  const gameZ = cameraFocus.z + Math.cos(yaw) * horizontal;
  let gameY = cameraFocus.y + 0.55 + Math.sin(pitch) * cameraDistance;
  gameY = Math.max(gameY, heightAt(gameX, gameZ) + 0.72);
  tempGameplayPosition.set(gameX, gameY, gameZ);

  // Pull the camera in smoothly when a trunk, house or well cuts across the
  // line of sight, so roofs never smother the view.
  const allowedClearance = cameraObstruction(cameraFocus, tempGameplayPosition);
  if (snap) {
    cameraClearance = allowedClearance;
  } else {
    const rate = allowedClearance < cameraClearance ? 32 : 4.5;
    cameraClearance = damp(cameraClearance, allowedClearance, rate, dt);
  }
  if (cameraClearance < 0.999) {
    tempGameplayPosition.lerpVectors(
      cameraFocus,
      tempGameplayPosition,
      cameraClearance,
    );
  }

  // A gentle orbit around the bear while the title card is on screen.
  const introAngle = 2.18 + Math.sin(time * 0.065) * 0.22;
  const introRadius = 8.7;
  const introX = player.position.x + Math.sin(introAngle) * introRadius;
  const introZ = player.position.z + Math.cos(introAngle) * introRadius;
  const introY = Math.max(
    player.position.y + 3.65,
    heightAt(introX, introZ) + 1.25,
  );
  tempIntroPosition.set(introX, introY, introZ);

  // Push the bear a little to the right of frame so the title card breathes.
  const rightX = Math.cos(introAngle);
  const rightZ = -Math.sin(introAngle);
  tempIntroLook.set(
    player.position.x - rightX * 1.45,
    player.position.y + 1.12,
    player.position.z - rightZ * 1.45,
  );

  const blend = clamp(cameraBlend.value, 0, 1);
  tempCameraTarget.set(
    THREE.MathUtils.lerp(
      tempGameplayPosition.x,
      tempIntroPosition.x,
      blend,
    ),
    THREE.MathUtils.lerp(
      tempGameplayPosition.y,
      tempIntroPosition.y,
      blend,
    ),
    THREE.MathUtils.lerp(
      tempGameplayPosition.z,
      tempIntroPosition.z,
      blend,
    ),
  );

  const lookX = THREE.MathUtils.lerp(cameraFocus.x, tempIntroLook.x, blend);
  const lookY = THREE.MathUtils.lerp(cameraFocus.y, tempIntroLook.y, blend);
  const lookZ = THREE.MathUtils.lerp(cameraFocus.z, tempIntroLook.z, blend);

  if (snap) {
    camera.position.copy(tempCameraTarget);
  } else {
    camera.position.lerp(tempCameraTarget, 1 - Math.exp(-11 * dt));
  }

  camera.position.y = Math.max(
    camera.position.y,
    heightAt(camera.position.x, camera.position.z) + 0.45,
  );

  if (cameraShake > 0.0008) {
    camera.position.x += Math.sin(time * 71.3) * cameraShake * 0.36;
    camera.position.y += Math.sin(time * 93.7 + 1.7) * cameraShake * 0.26;
    cameraShake *= Math.exp(-7.5 * dt);
  }

  camera.lookAt(lookX, lookY, lookZ);

  // When the camera is squeezed right up against the bear by a house or tree,
  // fade the character out so it doesn't fill the entire screen.
  bear.setCameraFade(
    smoothstep(1.55, 2.35, camera.position.distanceTo(cameraFocus)),
  );
}

function syncPlayerInfo() {
  playerInfo.x = player.position.x;
  playerInfo.y = player.position.y;
  playerInfo.z = player.position.z;
  playerInfo.speed = Math.hypot(player.velocity.x, player.velocity.z);
  playerInfo.heading = player.heading;
  playerInfo.grounded = player.grounded;
}

function pressed(...codes) {
  return codes.some((code) => keys.has(code));
}

function resolveCollisions() {
  const position = player.position;
  for (let pass = 0; pass < 2; pass += 1) {
    for (const collider of world.colliders) {
      const dx = position.x - collider.x;
      const dz = position.z - collider.z;
      const minimum = collider.r + PLAYER_RADIUS;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared >= minimum * minimum) continue;

      const distance = Math.sqrt(distanceSquared);
      if (distance < 0.0001) {
        position.x = collider.x + minimum;
        position.z = collider.z;
      } else {
        position.x = collider.x + (dx / distance) * minimum;
        position.z = collider.z + (dz / distance) * minimum;
      }
    }
  }
}

function getWaterSurfaceY(x, z) {
  for (const pond of PONDS) {
    const nx = (x - pond.x) / pond.rx;
    const nz = (z - pond.z) / pond.rz;
    if (nx * nx + nz * nz < 0.88 * 0.88) return pond.waterY;
  }
  return heightAt(x, z);
}

function updatePlayer(dt) {
  let forward =
    (pressed('KeyW', 'ArrowUp') ? 1 : 0) -
    (pressed('KeyS', 'ArrowDown') ? 1 : 0);
  let strafe =
    (pressed('KeyD', 'ArrowRight') ? 1 : 0) -
    (pressed('KeyA', 'ArrowLeft') ? 1 : 0);
  let inputScale = 1;
  let touchRunBoost = 1;

  // The virtual stick is analog: a gentle push walks slowly, and its direction
  // is relative to the camera just like WASD. Pushing it all the way to the
  // rim eases into a run so crossing the meadow stays comfortable on a phone.
  if (touchMove.active) {
    const magnitude = Math.min(1, Math.hypot(touchMove.x, touchMove.y));
    if (magnitude > 0.001) {
      forward = -touchMove.y / magnitude;
      strafe = touchMove.x / magnitude;
      inputScale = magnitude;
      touchRunBoost =
        1 + 0.58 * clamp((magnitude - 0.72) / 0.28, 0, 1);
    } else {
      forward = 0;
      strafe = 0;
    }
  }

  const sprinting = pressed('ShiftLeft', 'ShiftRight');
  const wasInWater = playerInfo.inWater;

  let wishX = 0;
  let wishZ = 0;
  const moving = forward !== 0 || strafe !== 0;
  if (moving) {
    const length = Math.hypot(forward, strafe);
    const f = forward / length;
    const s = strafe / length;
    wishX = -Math.sin(yaw) * f + Math.cos(yaw) * s;
    wishZ = -Math.cos(yaw) * f - Math.sin(yaw) * s;
  }

  const startInWater = waterDepthAt(player.position.x, player.position.z) > 0.05;
  const targetSpeed =
    (sprinting ? SPRINT_SPEED : WALK_SPEED) *
    inputScale *
    touchRunBoost *
    (startInWater ? WATER_SPEED : 1);
  const response = player.grounded
    ? moving
      ? GROUND_RESPONSE
      : 9
    : AIR_RESPONSE;

  player.velocity.x = damp(player.velocity.x, wishX * targetSpeed, response, dt);
  player.velocity.z = damp(player.velocity.z, wishZ * targetSpeed, response, dt);

  player.position.x += player.velocity.x * dt;
  player.position.z += player.velocity.z * dt;

  resolveCollisions();

  const distanceFromCenter = Math.hypot(player.position.x, player.position.z);
  const boundary = PLAY_RADIUS - 1.3;
  if (distanceFromCenter > boundary) {
    const scale = boundary / distanceFromCenter;
    player.position.x *= scale;
    player.position.z *= scale;
    player.velocity.x *= 0.5;
    player.velocity.z *= 0.5;

    if (elapsed - edgeReminderAt > 9) {
      edgeReminderAt = elapsed;
      dom.hintBar.classList.remove('is-faded');
      window.setTimeout(() => {
        if (appPhase === 'playing') dom.hintBar.classList.add('is-faded');
      }, 2600);
    }
  }

  const waterNow =
    waterDepthAt(player.position.x, player.position.z) > 0.05;
  if (waterNow && !wasInWater) {
    const surfaceY = getWaterSurfaceY(player.position.x, player.position.z);
    world.splashAt({
      x: player.position.x,
      y: surfaceY,
      z: player.position.z,
    });
    audio.splash();
    cameraShake = Math.max(cameraShake, 0.06);
  }
  playerInfo.inWater = waterNow;

  jumpBuffer = Math.max(0, jumpBuffer - dt);
  coyote = Math.max(0, coyote - dt);

  if (jumpBuffer > 0 && (player.grounded || coyote > 0)) {
    player.velocity.y = JUMP_SPEED;
    player.grounded = false;
    jumpBuffer = 0;
    coyote = 0;
    bear.playJump();
    audio.jump();
    if (waterNow) {
      world.splashAt({
        x: player.position.x,
        y: getWaterSurfaceY(player.position.x, player.position.z),
        z: player.position.z,
      });
      audio.splash();
    } else {
      spawnFootDust(6);
    }
  }

  if (!player.grounded) {
    player.velocity.y -= GRAVITY * dt;
    player.position.y += player.velocity.y * dt;
  }

  const ground = heightAt(player.position.x, player.position.z);

  if (player.grounded) {
    if (player.position.y - ground > 0.9) {
      player.grounded = false;
      coyote = 0.13;
    } else {
      player.position.y = ground;
      player.velocity.y = 0;
    }
  }

  if (!player.grounded && player.position.y <= ground) {
    const impact = Math.max(0, -player.velocity.y);
    player.position.y = ground;
    player.velocity.y = 0;
    player.grounded = true;
    coyote = 0.12;

    if (impact > 1.6) {
      bear.land();
      audio.land();
      cameraShake = Math.min(0.22, 0.025 + impact * 0.014);
      if (waterNow) {
        world.splashAt({
          x: player.position.x,
          y: getWaterSurfaceY(player.position.x, player.position.z),
          z: player.position.z,
        });
        audio.splash();
      } else {
        spawnFootDust(Math.min(14, Math.round(4 + impact * 1.1)));
      }
    }
  }

  const planarSpeed = Math.hypot(player.velocity.x, player.velocity.z);
  if (planarSpeed > 0.35) {
    const targetHeading = Math.atan2(player.velocity.x, player.velocity.z);
    player.heading = dampAngle(player.heading, targetHeading, 11.5, dt);
  }

  bear.root.position.copy(player.position);
  bear.root.rotation.y = player.heading;
  bear.setSpeed(planarSpeed);

  if (player.grounded && planarSpeed > 1.2) {
    stepAccumulator += planarSpeed * dt;
    if (stepAccumulator > (sprinting ? 2.15 : 1.65)) {
      stepAccumulator = 0;
      audio.footstep(waterNow);
      if (waterNow && Math.random() < 0.55) {
        world.splashAt({
          x: player.position.x,
          y: getWaterSurfaceY(player.position.x, player.position.z),
          z: player.position.z,
        });
      }
    }
  } else {
    stepAccumulator = 0;
  }

  collectCoins();
}

function spawnFootDust(count) {
  if (!world || count <= 0) return;
  world.dustPool.spawn({
    position: new THREE.Vector3(
      player.position.x,
      player.position.y + 0.08,
      player.position.z,
    ),
    count,
    colors: ['#ddcda7', '#c1ae87', '#efe2c4'],
    speedMin: 0.3,
    speedMax: 1.15,
    upward: 0.75,
    spread: 1,
    sizeMin: 0.04,
    sizeMax: 0.1,
    lifeMin: 0.28,
    lifeMax: 0.62,
    gravity: 2.2,
  });
}

function collectCoins() {
  const picked = world.collectNearbyCoins(player.position);
  if (picked.length === 0) return;

  collectedCoins = Math.min(totalCoins, collectedCoins + picked.length);
  for (const coin of picked) {
    spawnCoinFloat(coin.group.position);
  }
  audio.coin();
  updateCoinUI();
  cameraShake = Math.max(cameraShake, 0.035);

  if (collectedCoins >= totalCoins) triggerVictory();
}

function spawnCoinFloat(worldPosition) {
  const projected = worldPosition.clone();
  projected.y += 0.24;
  projected.project(camera);
  if (projected.z > 1) return;

  const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-projected.y * 0.5 + 0.5) * window.innerHeight;

  const element = document.createElement('span');
  element.className = 'coin-float';
  element.textContent = '+1';
  element.style.left = `${x}px`;
  element.style.top = `${y}px`;
  dom.coinFloatLayer.appendChild(element);

  anime({
    targets: element,
    top: [y, y - 70],
    opacity: [1, 0],
    duration: reduceMotion ? 350 : 950,
    easing: 'easeOutCubic',
    complete: () => element.remove(),
  });
}

function triggerVictory() {
  if (victoryShown) return;
  victoryShown = true;

  dom.victoryBanner.classList.add('is-visible');
  dom.victoryBanner.setAttribute('aria-hidden', 'false');
  audio.victory();
  cameraShake = Math.max(cameraShake, 0.15);

  const burst = (delay, count) => {
    window.setTimeout(() => {
      if (!world) return;
      world.sparklePool.spawn({
        position: new THREE.Vector3(
          player.position.x,
          player.position.y + 1.45,
          player.position.z,
        ),
        count,
        colors: ['#ffe486', '#ffc73f', '#fff4c4', '#f6a93b'],
        speedMin: 1.2,
        speedMax: 4.2,
        upward: 3.2,
        spread: 1,
        sizeMin: 0.06,
        sizeMax: 0.16,
        lifeMin: 0.6,
        lifeMax: 1.35,
        gravity: 4.8,
      });
    }, delay);
  };

  burst(0, 44);
  burst(260, 34);
  burst(560, 28);

  window.setTimeout(() => {
    dom.victoryBanner.classList.remove('is-visible');
    dom.victoryBanner.setAttribute('aria-hidden', 'true');
  }, 11000);
}

function updateMinimap(dt) {
  mapTimer -= dt;
  if (mapTimer > 0) return;
  mapTimer = 1 / 30;
  minimap.update(playerInfo, yaw, elapsed);
}

function openPause() {
  if (appPhase !== 'playing') return;
  appPhase = 'paused';
  pauseOpenedAt = performance.now();
  keys.clear();
  dragging = false;
  dragPointerId = null;
  resetTouchInput();
  dom.pauseScreen.classList.add('is-open');
  dom.pauseScreen.setAttribute('aria-hidden', 'false');
  if (bear) bear.pauseDetails(true);
  if (document.pointerLockElement && document.exitPointerLock) {
    document.exitPointerLock();
  }
}

function closePause(lockPointer = !coarsePointer) {
  if (appPhase !== 'paused') return;
  appPhase = 'playing';
  dom.pauseScreen.classList.remove('is-open');
  dom.pauseScreen.setAttribute('aria-hidden', 'true');
  if (bear) bear.pauseDetails(false);
  if (audio?.context?.state === 'suspended') {
    audio.context.resume().catch(() => {});
  }
  lastFrame = performance.now();
  if (lockPointer) requestPointerLock();
}

function handleEscape() {
  if (appPhase === 'playing') {
    openPause();
  } else if (
    appPhase === 'paused' &&
    performance.now() - pauseOpenedAt > 450
  ) {
    closePause(false);
  }
}

function onKeyDown(event) {
  if (event.code === 'KeyM' && !event.repeat) {
    event.preventDefault();
    toggleMute();
    return;
  }

  if (event.code === 'Escape') {
    handleEscape();
    return;
  }

  if (appPhase !== 'playing') return;

  if (
    event.code === 'Space' ||
    event.code === 'ArrowUp' ||
    event.code === 'ArrowDown' ||
    event.code === 'ArrowLeft' ||
    event.code === 'ArrowRight'
  ) {
    event.preventDefault();
  }

  keys.add(event.code);
  if (event.code === 'Space' && !event.repeat) {
    jumpBuffer = 0.16;
  }
}

function onKeyUp(event) {
  keys.delete(event.code);
}

function onPointerMove(event) {
  if (appPhase !== 'playing') return;

  if (document.pointerLockElement === dom.canvas) {
    yaw -= (event.movementX || 0) * LOOK_SENSITIVITY;
    pitch = clamp(
      pitch + (event.movementY || 0) * LOOK_SENSITIVITY * 0.9,
      -0.22,
      1.05,
    );
    return;
  }

  if (!dragging) return;
  if (dragPointerId !== null && event.pointerId !== dragPointerId) return;
  const dx = event.clientX - dragX;
  const dy = event.clientY - dragY;
  dragX = event.clientX;
  dragY = event.clientY;
  if (Math.abs(dx) + Math.abs(dy) > 2.5) dragMoved = true;

  yaw -= dx * LOOK_SENSITIVITY;
  pitch = clamp(
    pitch + dy * LOOK_SENSITIVITY * 0.9,
    -0.22,
    1.05,
  );
}

function onPointerUp(event) {
  if (dragPointerId !== null && event.pointerId !== dragPointerId) return;
  dragging = false;
  dragPointerId = null;
}

function onCanvasPointerDown(event) {
  if (appPhase !== 'playing' || dragging) return;
  dragging = true;
  dragMoved = false;
  dragPointerId = event.pointerId;
  dragX = event.clientX;
  dragY = event.clientY;

  if (
    event.pointerType !== 'touch' &&
    document.pointerLockElement !== dom.canvas
  ) {
    requestPointerLock();
  }
}

function onCanvasClick() {
  if (appPhase !== 'playing' || coarsePointer) return;
  if (dragMoved) {
    dragMoved = false;
    return;
  }
  if (document.pointerLockElement !== dom.canvas) requestPointerLock();
}

function onWheel(event) {
  if (appPhase !== 'playing') return;
  cameraDistance = clamp(
    cameraDistance + event.deltaY * 0.004,
    MIN_CAMERA_DISTANCE,
    MAX_CAMERA_DISTANCE,
  );
}

function onPointerLockChange() {
  pointerLocked = document.pointerLockElement === dom.canvas;
  if (pointerLocked) {
    hasEverLocked = true;
    return;
  }
  dragging = false;
  dragPointerId = null;
  if (hasEverLocked && appPhase === 'playing') openPause();
}

function onWindowBlur() {
  keys.clear();
  dragging = false;
  dragPointerId = null;
  resetTouchInput();
  if (appPhase === 'playing') openPause();
}

function onVisibilityChange() {
  if (document.hidden) onWindowBlur();
}

function onResize() {
  if (!renderer || !camera) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO),
  );
  renderer.setSize(window.innerWidth, window.innerHeight);
  minimap?.resize();
  if (appPhase === 'paused') renderer.render(scene, camera);
}

function resetTouchInput() {
  touchMove.x = 0;
  touchMove.y = 0;
  touchMove.active = false;
  stickPointerId = null;
  if (dom.touchStick) dom.touchStick.classList.remove('is-active');
  if (dom.touchKnob) dom.touchKnob.style.transform = '';
  if (dom.touchJump) dom.touchJump.classList.remove('is-pressed');
}

function updateStickFromEvent(event) {
  let dx = event.clientX - stickOriginX;
  let dy = event.clientY - stickOriginY;
  const distance = Math.hypot(dx, dy);
  if (distance > STICK_RADIUS) {
    dx = (dx / distance) * STICK_RADIUS;
    dy = (dy / distance) * STICK_RADIUS;
  }

  if (dom.touchKnob) {
    dom.touchKnob.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
  }

  const nx = dx / STICK_RADIUS;
  const ny = dy / STICK_RADIUS;
  const magnitude = Math.hypot(nx, ny);
  touchMove.active = true;

  if (magnitude < STICK_DEADZONE) {
    touchMove.x = 0;
    touchMove.y = 0;
    return;
  }

  const scaled = Math.min(
    1,
    (magnitude - STICK_DEADZONE) / (1 - STICK_DEADZONE),
  );
  touchMove.x = (nx / magnitude) * scaled;
  touchMove.y = (ny / magnitude) * scaled;
}

function onStickPointerDown(event) {
  if (appPhase !== 'playing' || stickPointerId !== null) return;
  event.preventDefault();
  event.stopPropagation();
  stickPointerId = event.pointerId;

  const rect = dom.touchStick.getBoundingClientRect();
  stickOriginX = rect.left + rect.width / 2;
  stickOriginY = rect.top + rect.height / 2;
  dom.touchStick.classList.add('is-active');
  try {
    dom.touchStick.setPointerCapture(event.pointerId);
  } catch (error) {
    // Pointer capture is a nicety; the stick still tracks pointermove events.
  }
  updateStickFromEvent(event);
}

function onStickPointerMove(event) {
  if (event.pointerId !== stickPointerId) return;
  event.preventDefault();
  event.stopPropagation();
  updateStickFromEvent(event);
}

function onStickPointerUp(event) {
  if (event.pointerId !== stickPointerId) return;
  resetTouchInput();
}

function onJumpPointerDown(event) {
  if (appPhase !== 'playing') return;
  event.preventDefault();
  event.stopPropagation();
  jumpBuffer = 0.16;
  dom.touchJump.classList.add('is-pressed');
}

function onJumpPointerUp(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  dom.touchJump.classList.remove('is-pressed');
}

function setupTouchControls() {
  if (!coarsePointer || !dom.touchStick || !dom.touchJump) return;

  dom.touchStick.addEventListener('pointerdown', onStickPointerDown);
  dom.touchStick.addEventListener('pointermove', onStickPointerMove);
  dom.touchStick.addEventListener('pointerup', onStickPointerUp);
  dom.touchStick.addEventListener('pointercancel', onStickPointerUp);
  dom.touchStick.addEventListener('lostpointercapture', onStickPointerUp);

  dom.touchJump.addEventListener('pointerdown', onJumpPointerDown);
  dom.touchJump.addEventListener('pointerup', onJumpPointerUp);
  dom.touchJump.addEventListener('pointercancel', onJumpPointerUp);
  dom.touchJump.addEventListener('pointerleave', onJumpPointerUp);
  dom.touchJump.addEventListener('contextmenu', (event) =>
    event.preventDefault(),
  );
}

function setupEvents() {
  window.addEventListener('resize', onResize);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onWindowBlur);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  dom.canvas.addEventListener('pointerdown', onCanvasPointerDown);
  dom.canvas.addEventListener('click', onCanvasClick);
  dom.canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });
  window.addEventListener('wheel', onWheel, { passive: true });

  setupTouchControls();

  dom.playButton.addEventListener('click', () => startGame());
  dom.resumeButton.addEventListener('click', () => closePause());
  dom.pauseButton?.addEventListener('click', openPause);
  dom.audioButton.addEventListener('click', toggleMute);
  dom.pauseAudioButton.addEventListener('click', toggleMute);
  dom.startAudioButton.addEventListener('click', () => {
    if (audio) {
      audio.init();
      if (audio.context?.state === 'suspended') {
        audio.context.resume().catch(() => {});
      }
    }
    toggleMute();
  });
}

function frame(now) {
  requestAnimationFrame(frame);

  const rawDelta = (now - lastFrame) / 1000;
  lastFrame = now;
  const dt = clamp(rawDelta, 0, 0.05);
  const active = appPhase === 'intro' || appPhase === 'playing';

  if (active) {
    elapsed += dt;
    if (appPhase === 'playing') updatePlayer(dt);
    syncPlayerInfo();
    world.update(dt, elapsed, playerInfo);
    bear.update(dt);

    if (appPhase === 'playing') {
      updateLocation(dt);
      updateMinimap(dt);
    }
  }

  if (appPhase !== 'paused') {
    updateCamera(dt, elapsed);
  }

  updateCompass();
  // The pause screen is a DOM overlay above the last rendered frame, so the
  // world can stay still and save battery while the game is paused.
  if (appPhase !== 'paused') renderer.render(scene, camera);
}

function showFatalError(error) {
  console.error('[Teddy Bear Adventure]', error);
  const detail = error?.message || String(error);
  errorLog.push(error?.stack || detail);

  if (dom.errorMessage) {
    dom.errorMessage.textContent = `The world builder hit a snag: ${detail}`;
  }
  dom.errorScreen?.classList.add('is-visible');
  dom.loadingScreen?.classList.add('is-hidden');

  window.__teddyGame = {
    fatal: true,
    errors: errorLog,
  };
}

function exposeDebugApi() {
  const api = {
    scene,
    renderer,
    camera,
    world,
    bear,
    audio,
    errors: errorLog,
    get phase() {
      return appPhase;
    },
    get info() {
      return {
        phase: appPhase,
        started,
        collected: collectedCoins,
        total: totalCoins,
        pointerLocked,
        touch: coarsePointer,
        touchInput: {
          x: touchMove.x,
          y: touchMove.y,
          active: touchMove.active,
        },
        quality: {
          pixelRatio: renderer.getPixelRatio(),
          maxPixelRatio: MAX_PIXEL_RATIO,
          fov: camera.fov,
          shadowMapSize: world?.lights?.sun?.shadow?.mapSize?.x ?? null,
        },
        player: { ...playerInfo },
        camera: {
          yaw,
          pitch,
          distance: cameraDistance,
          clearance: cameraClearance,
          position: camera.position.toArray(),
        },
        errors: errorLog.slice(),
      };
    },
    start(options = {}) {
      startGame({ lockPointer: false, ...options });
    },
    pause: openPause,
    resume() {
      closePause(false);
    },
    teleport(x, z) {
      const nextX = clamp(x, -PLAY_RADIUS, PLAY_RADIUS);
      const nextZ = clamp(z, -PLAY_RADIUS, PLAY_RADIUS);
      player.position.set(nextX, heightAt(nextX, nextZ), nextZ);
      player.velocity.set(0, 0, 0);
      player.grounded = true;
      playerInfo.inWater =
        waterDepthAt(player.position.x, player.position.z) > 0.05;
      bear.root.position.copy(player.position);
      cameraFocus.set(
        player.position.x,
        player.position.y + 1.32,
        player.position.z,
      );
      cameraBlend.value = 0;
      updateCamera(0, elapsed, true);
      mapTimer = 0;
    },
    setCamera(nextYaw, nextPitch = pitch, nextDistance = cameraDistance) {
      yaw = nextYaw;
      pitch = clamp(nextPitch, -0.22, 1.05);
      cameraDistance = clamp(
        nextDistance,
        MIN_CAMERA_DISTANCE,
        MAX_CAMERA_DISTANCE,
      );
      cameraBlend.value = 0;
      anime.remove(cameraBlend);
      cameraFocus.set(
        player.position.x,
        player.position.y + 1.32,
        player.position.z,
      );
      updateCamera(0, elapsed, true);
    },
    collectAll() {
      if (!world) return 0;
      let added = 0;
      for (const coin of world.data.coins) {
        if (!coin.collected && coin.collect()) added += 1;
      }
      if (added > 0) {
        collectedCoins = Math.min(totalCoins, collectedCoins + added);
        updateCoinUI();
        if (collectedCoins >= totalCoins) triggerVictory();
      }
      return added;
    },
    render() {
      renderer.render(scene, camera);
    },
  };

  window.__teddyGame = api;
}

window.setTimeout(boot, 60);

