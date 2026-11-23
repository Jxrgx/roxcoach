// Genera los iconos PNG de la PWA (fase 12) a partir de la marca de RoxCoach,
// sin dependencias: rasteriza la "R" con figuras simples (supermuestreo 4×4) y
// codifica PNG con zlib. Uso: node scripts/generate-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const BG = [0x0b, 0x0d, 0x0f]; // fondo principal
const TILE = [0x20, 0x26, 0x2b]; // superficie elevada
const ACID = [0xd7, 0xf5, 0x00]; // amarillo ácido

// La "R" en el espacio 32×32 del logo (components/shared/logo.tsx).
const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
function inPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inR(x, y) {
  const stem = x >= 9 && x <= 12.6 && y >= 9 && y <= 23;
  const bowlOuter = (x >= 9 && x <= 16.5 && y >= 9 && y <= 18) || inCircle(x, y, 16.5, 13.5, 4.5);
  const bowlHole = (x >= 12.6 && x <= 16.3 && y >= 12 && y <= 15) || inCircle(x, y, 16.3, 13.5, 1.5);
  const leg = inPolygon(x, y, [[13.8, 18.2], [17.6, 17.6], [22.5, 23], [18.3, 23]]);
  return stem || (bowlOuter && !bowlHole && x >= 9) || leg;
}
const inRoundedRect = (x, y, size, r) => {
  const cx = Math.min(Math.max(x, r), size - r);
  const cy = Math.min(Math.max(y, r), size - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

/** `scale`: fracción del lienzo que ocupa el logo (maskable usa la zona segura). */
function render(size, { scale = 1, tileRadius = 8, bg = BG } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const SS = 4;
  const offset = (1 - scale) / 2;
  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (pxi + (sx + 0.5) / SS) / size; // 0..1
          const v = (py + (sy + 0.5) / SS) / size;
          const lx = ((u - offset) / scale) * 32; // espacio del logo
          const ly = ((v - offset) / scale) * 32;
          const insideTile = lx >= 0 && lx <= 32 && ly >= 0 && ly <= 32 && inRoundedRect(lx, ly, 32, tileRadius);
          const c = insideTile ? (inR(lx, ly) ? ACID : TILE) : bg;
          acc = [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]];
        }
      }
      const i = (py * size + pxi) * 4;
      px[i] = Math.round(acc[0] / (SS * SS));
      px[i + 1] = Math.round(acc[1] / (SS * SS));
      px[i + 2] = Math.round(acc[2] / (SS * SS));
      px[i + 3] = 255;
    }
  }
  return px;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filtro: ninguno
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync("public/icons", { recursive: true });
const outputs = [
  ["public/icons/icon-192.png", 192, { scale: 1, tileRadius: 8 }],
  ["public/icons/icon-512.png", 512, { scale: 1, tileRadius: 8 }],
  // Maskable: el sistema recorta en círculo o squircle; el logo va en la zona segura (80 %).
  ["public/icons/icon-maskable-512.png", 512, { scale: 0.72, tileRadius: 0, bg: TILE }],
  // iOS redondea por su cuenta: mosaico sin esquinas.
  ["app/apple-icon.png", 180, { scale: 1, tileRadius: 0 }],
];
for (const [file, size, opts] of outputs) {
  writeFileSync(file, png(size, render(size, opts)));
  console.log("ok", file, size);
}
