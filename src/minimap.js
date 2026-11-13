import * as THREE from 'three';
import {
  PONDS,
  VILLAGES,
  WORLD_HALF,
  WORLD_SIZE,
  heightAt,
  pondDistance,
} from './world-data.js';

const MAP_RESOLUTION = 512;
const MAP_VIEW_RADIUS = 40;

const color = new THREE.Color();
const waterColor = new THREE.Color();
const sandColor = new THREE.Color('#d6c18e');
const mapDirtColor = new THREE.Color('#c9ad7c');

function buildTerrainImage() {
  const canvas = document.createElement('canvas');
  canvas.width = MAP_RESOLUTION;
  canvas.height = MAP_RESOLUTION;
  const context = canvas.getContext('2d');
  const image = context.createImageData(MAP_RESOLUTION, MAP_RESOLUTION);
  const data = image.data;

  for (let py = 0; py < MAP_RESOLUTION; py += 1) {
    const z = -WORLD_HALF + ((py + 0.5) / MAP_RESOLUTION) * WORLD_SIZE;
    for (let px = 0; px < MAP_RESOLUTION; px += 1) {
      const x = -WORLD_HALF + ((px + 0.5) / MAP_RESOLUTION) * WORLD_SIZE;
      const height = heightAt(x, z);
      const texture =
        Math.sin(x * 0.19 + z * 0.07) * 0.5 +
        Math.sin(z * 0.22 - x * 0.05) * 0.3 +
        Math.sin((x + z) * 0.09) * 0.2;
      const greenNoise = texture * 0.5 + 0.5;
      const lightness = 0.35 + Math.max(0, height + 2) * 0.013 + greenNoise * 0.025;
      color.setHSL(
        0.235 + greenNoise * 0.012,
        0.36 + greenNoise * 0.07,
        lightness,
        THREE.SRGBColorSpace,
      );

      for (const village of VILLAGES) {
        const distance = Math.hypot(x - village.x, z - village.z);
        if (distance < village.radius) {
          const amount = 1 - Math.min(1, distance / (village.radius * 0.94));
          color.lerp(mapDirtColor, Math.min(0.82, amount * 0.92));
        }
      }

      for (const pond of PONDS) {
        const normalized = pondDistance(x, z, pond);
        if (normalized < 1.35) {
          const sandAmount = 1 - Math.min(1, Math.max(0, (normalized - 0.84) / 0.48));
          color.lerp(sandColor, sandAmount * 0.9);
          if (normalized < 0.88) {
            waterColor.set('#4a93a2');
            waterColor.offsetHSL(0, 0, (0.88 - normalized) * 0.08);
            color.copy(waterColor);
          }
        }
      }

      color.convertLinearToSRGB();
      const offset = (py * MAP_RESOLUTION + px) * 4;
      data[offset] = Math.round(color.r * 255);
      data[offset + 1] = Math.round(color.g * 255);
      data[offset + 2] = Math.round(color.b * 255);
      data[offset + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);

  const scale = MAP_RESOLUTION / WORLD_SIZE;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  for (const pond of PONDS) {
    context.beginPath();
    context.ellipse(
      (pond.x + WORLD_HALF) * scale,
      (pond.z + WORLD_HALF) * scale,
      pond.rx * 0.9 * scale,
      pond.rz * 0.9 * scale,
      0,
      0,
      Math.PI * 2,
    );
    context.strokeStyle = 'rgba(225, 243, 223, 0.55)';
    context.lineWidth = 1.25 * scale * 0.8;
    context.stroke();
  }

  for (const village of VILLAGES) {
    context.beginPath();
    context.arc(
      (village.x + WORLD_HALF) * scale,
      (village.z + WORLD_HALF) * scale,
      village.radius * 0.56 * scale,
      0,
      Math.PI * 2,
    );
    context.fillStyle = 'rgba(220, 199, 154, 0.22)';
    context.fill();
  }

  return canvas;
}

function setCanvasSize(canvas) {
  const size = canvas.clientWidth || 184;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(size * dpr)) {
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
  }
  return { size, dpr };
}

export class Minimap {
  constructor(canvas, world, paths) {
    this.canvas = canvas;
    this.world = world;
    this.paths = paths;
    this.terrainImage = buildTerrainImageWithPaths(paths);
    this.time = 0;
    this.resize();
  }

  resize() {
    const { size, dpr } = setCanvasSize(this.canvas);
    this.size = size;
    this.dpr = dpr;
    this.radius = size / 2 - 4;
    this.center = size / 2;
    this.context = this.canvas.getContext('2d');
    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  drawTree(context, tree) {
    const scale = tree.scale;
    if (tree.type === 'pine') {
      context.fillStyle = '#2f5d42';
      context.beginPath();
      context.moveTo(tree.x, tree.z - 2.1 * scale);
      context.lineTo(tree.x + 1.5 * scale, tree.z + 1.1 * scale);
      context.lineTo(tree.x - 1.5 * scale, tree.z + 1.1 * scale);
      context.closePath();
      context.fill();
    } else {
      context.fillStyle =
        tree.type === 'autumn' ? '#b4723d' : tree.type === 'birch' ? '#779d50' : '#4e8743';
      context.beginPath();
      context.arc(tree.x, tree.z, 1.55 * scale, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(255, 245, 200, 0.18)';
      context.beginPath();
      context.arc(tree.x - 0.42 * scale, tree.z - 0.44 * scale, 0.62 * scale, 0, Math.PI * 2);
      context.fill();
    }
  }

  update(player, cameraYaw, elapsed) {
    this.time = elapsed;
    const context = this.context;
    const size = this.size;
    const center = this.center;
    const radius = this.radius;
    const viewRadius = MAP_VIEW_RADIUS;
    const scalePixels = radius / viewRadius;

    context.clearRect(0, 0, size, size);
    context.save();
    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.clip();

    context.fillStyle = '#738b58';
    context.fillRect(0, 0, size, size);

    context.save();
    context.translate(center, center);
    context.rotate(cameraYaw);
    context.scale(scalePixels, scalePixels);
    context.translate(-player.x, -player.z);
    context.imageSmoothingEnabled = true;
    context.drawImage(
      this.terrainImage,
      -WORLD_HALF,
      -WORLD_HALF,
      WORLD_SIZE,
      WORLD_SIZE,
    );

    for (const tree of this.world.data.trees) {
      if (Math.abs(tree.x - player.x) > viewRadius + 4) continue;
      if (Math.abs(tree.z - player.z) > viewRadius + 4) continue;
      this.drawTree(context, tree);
    }

    for (const village of this.world.data.villages) {
      for (const house of village.houses) {
        const dx = house.x - player.x;
        const dz = house.z - player.z;
        if (dx * dx + dz * dz > (viewRadius + 3) ** 2) continue;
        context.save();
        context.translate(house.x, house.z);
        context.rotate(-house.rotation);
        context.fillStyle = '#e4cfaa';
        context.fillRect(-1.45, -1.2, 2.9, 2.4);
        context.fillStyle = '#9a5a44';
        context.beginPath();
        context.moveTo(-1.75, -1.2);
        context.lineTo(0, -2.35);
        context.lineTo(1.75, -1.2);
        context.closePath();
        context.fill();
        context.restore();
      }
    }

    for (const slime of this.world.data.slimes) {
      const position = slime.group.position;
      const dx = position.x - player.x;
      const dz = position.z - player.z;
      if (dx * dx + dz * dz > (viewRadius + 2) ** 2) continue;
      context.fillStyle = slime.color;
      context.beginPath();
      context.arc(position.x, position.z, 0.95, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = 'rgba(36, 58, 44, 0.7)';
      context.lineWidth = 0.28;
      context.stroke();
    }

    for (const coin of this.world.data.coins) {
      if (coin.collected) continue;
      const dx = coin.group.position.x - player.x;
      const dz = coin.group.position.z - player.z;
      if (dx * dx + dz * dz > (viewRadius + 1) ** 2) continue;
      const pulse = 0.88 + Math.sin(elapsed * 3 + coin.phase) * 0.14;
      context.save();
      context.translate(coin.group.position.x, coin.group.position.z);
      context.fillStyle = 'rgba(255, 206, 74, 0.22)';
      context.beginPath();
      context.arc(0, 0, 2.3 * pulse, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ffd35d';
      context.strokeStyle = '#fff6c4';
      context.lineWidth = 0.3;
      context.beginPath();
      context.arc(0, 0, 0.92, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.restore();
    }

    context.restore();

    // Gentle vignette and a semicircular range guide.
    const gradient = context.createRadialGradient(center, center, radius * 0.55, center, center, radius);
    gradient.addColorStop(0, 'rgba(17, 35, 22, 0)');
    gradient.addColorStop(1, 'rgba(17, 35, 22, 0.32)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    context.strokeStyle = 'rgba(255, 248, 218, 0.1)';
    context.lineWidth = 1;
    context.beginPath();
    context.arc(center, center, radius * 0.55, 0, Math.PI * 2);
    context.stroke();
    context.restore();

    this.drawCompass(context, center, radius, cameraYaw);
    this.drawPlayer(context, center, cameraYaw, player.heading);
    this.drawFrame(context, center, radius);
  }

  drawCompass(context, center, radius, cameraYaw) {
    const labels = [
      ['N', 0, -1],
      ['E', 1, 0],
      ['S', 0, 1],
      ['W', -1, 0],
    ];
    for (const [label, dx, dz] of labels) {
      const rotatedX = dx * Math.cos(cameraYaw) - dz * Math.sin(cameraYaw);
      const rotatedY = dx * Math.sin(cameraYaw) + dz * Math.cos(cameraYaw);
      const x = center + rotatedX * (radius - 12);
      const y = center + rotatedY * (radius - 12);
      context.fillStyle = label === 'N' ? 'rgba(255, 246, 209, 0.96)' : 'rgba(255, 250, 229, 0.52)';
      context.font = label === 'N' ? '800 10px Trebuchet MS, sans-serif' : '700 8px Trebuchet MS, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(label, x, y);
    }
  }

  drawPlayer(context, center, cameraYaw, heading) {
    const rotation = cameraYaw + Math.PI - heading;
    context.save();
    context.translate(center, center);
    context.rotate(rotation);
    context.shadowColor = 'rgba(20, 32, 16, 0.5)';
    context.shadowBlur = 5;
    context.shadowOffsetY = 1;
    context.fillStyle = '#fff4ce';
    context.strokeStyle = '#334c2e';
    context.lineWidth = 1.6;
    context.beginPath();
    context.moveTo(0, -8.5);
    context.lineTo(6, 5.5);
    context.lineTo(0, 3);
    context.lineTo(-6, 5.5);
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();

    context.fillStyle = 'rgba(255, 247, 220, 0.14)';
    context.beginPath();
    context.arc(center, center, 11, 0, Math.PI * 2);
    context.fill();
  }

  drawFrame(context, center, radius) {
    context.strokeStyle = 'rgba(255, 248, 221, 0.5)';
    context.lineWidth = 1;
    context.beginPath();
    context.arc(center, center, radius - 0.5, 0, Math.PI * 2);
    context.stroke();

    context.strokeStyle = 'rgba(58, 76, 45, 0.65)';
    context.lineWidth = 2.5;
    context.beginPath();
    context.arc(center, center, radius + 1.5, 0, Math.PI * 2);
    context.stroke();

    for (let i = 0; i < 36; i += 1) {
      const angle = (i / 36) * Math.PI * 2;
      const inner = i % 9 === 0 ? radius - 6 : radius - 3.5;
      context.strokeStyle = i % 9 === 0 ? 'rgba(255, 249, 223, 0.55)' : 'rgba(255, 249, 223, 0.22)';
      context.lineWidth = i % 9 === 0 ? 1.5 : 1;
      context.beginPath();
      context.moveTo(
        center + Math.cos(angle) * inner,
        center + Math.sin(angle) * inner,
      );
      context.lineTo(
        center + Math.cos(angle) * (radius - 0.5),
        center + Math.sin(angle) * (radius - 0.5),
      );
      context.stroke();
    }
  }
}

// The image is built from paths passed in at construction time. Keeping this
// helper separate prevents an import cycle with the world module.
function buildTerrainImageWithPaths(paths) {
  const canvas = buildTerrainImage();
  if (!paths || paths.length === 0) return canvas;
  const context = canvas.getContext('2d');
  const scale = MAP_RESOLUTION / WORLD_SIZE;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  for (const path of paths) {
    context.beginPath();
    path.controls.forEach((point, index) => {
      const px = (point.x + WORLD_HALF) * scale;
      const py = (point.z + WORLD_HALF) * scale;
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    });
    context.strokeStyle = 'rgba(201, 173, 121, 0.92)';
    context.lineWidth = 5.2 * scale;
    context.stroke();
    context.strokeStyle = 'rgba(229, 208, 165, 0.42)';
    context.lineWidth = 1.9 * scale;
    context.stroke();
  }

  for (const village of VILLAGES) {
    context.beginPath();
    context.arc(
      (village.x + WORLD_HALF) * scale,
      (village.z + WORLD_HALF) * scale,
      village.radius * 0.53 * scale,
      0,
      Math.PI * 2,
    );
    context.fillStyle = 'rgba(220, 199, 154, 0.18)';
    context.fill();
  }

  return canvas;
}
