/**
 * gen_radar_grid.js — 生成雷达图静态网格 PNG（六边形/五边形）
 * 用法: node tools/gen_radar_grid.js
 * 输出: src/common/maixiang/radar_grid6.png / radar_grid5.png
 *
 * 背景：Vela 模拟器 transform rotate 语义不可靠，雷达网格改为预渲染位图。
 * 2x 超采样（692x456 → 显示 346x228），透明底，颜色与古风调色板一致。
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const W = 692, H = 456;           // 2x of 346x228
const CX = 346, CY = 228, R = 160; // 2x of (173,114) R=80

// ---------- 最小 PNG 编码器 ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgba, w, h) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ---------- 画布与线段绘制 ----------
function makeCanvas() { return Buffer.alloc(W * H * 4); }

function setPixel(buf, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  if (buf[i + 3] >= a) return; // 保留更实的像素
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
}

function fillDisc(buf, cx, cy, rad, color) {
  const r0 = Math.ceil(rad);
  for (let dy = -r0; dy <= r0; dy++) {
    for (let dx = -r0; dx <= r0; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > rad + 0.5) continue;
      // 边缘 1px 渐隐做简易抗锯齿
      const a = d <= rad - 0.5 ? color[3] : Math.round(color[3] * (rad + 0.5 - d));
      setPixel(buf, Math.round(cx + dx), Math.round(cy + dy), color[0], color[1], color[2], a);
    }
  }
}

function drawLine(buf, x0, y0, x1, y1, th, color) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.ceil(len * 2);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    fillDisc(buf, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, th / 2, color);
  }
}

// ---------- 雷达网格 ----------
function pts(n, r) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (-90 + i * (360 / n)) * Math.PI / 180;
    out.push([CX + r * Math.cos(a), CY + r * Math.sin(a)]);
  }
  return out;
}

function drawGrid(n) {
  const buf = makeCanvas();
  const C_OUTER = [0x6A, 0x4A, 0x28, 255];  // 深棕（与卡片标题色一致，确保在米金背景上可见）
  const C_SOFT = [0x8A, 0x76, 0x58, 255];   // 中棕（内环/轴线，略浅于外框）
  const outer = pts(n, R);
  const inner = pts(n, R * 0.5);
  for (let i = 0; i < n; i++) {
    const o1 = outer[i], o2 = outer[(i + 1) % n];
    const n1 = inner[i], n2 = inner[(i + 1) % n];
    drawLine(buf, o1[0], o1[1], o2[0], o2[1], 4, C_OUTER);   // 外框 2px(设计)
    drawLine(buf, n1[0], n1[1], n2[0], n2[1], 3, C_SOFT);    // 内环
    drawLine(buf, CX, CY, o1[0], o1[1], 3, C_SOFT);          // 放射轴线
  }
  return encodePng(buf, W, H);
}

const outDir = path.join(__dirname, '..', 'src', 'common', 'maixiang');
fs.writeFileSync(path.join(outDir, 'radar_grid6.png'), drawGrid(6));
fs.writeFileSync(path.join(outDir, 'radar_grid5.png'), drawGrid(5));
console.log('radar_grid6.png / radar_grid5.png generated in', outDir);
