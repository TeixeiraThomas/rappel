// Génère les icônes PNG de la PWA sans dépendance externe (encodeur PNG maison).
// Usage : npm run icons
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

// --- Encodeur PNG minimal (RGBA 8 bits) ---
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
const encodePng = (w, h, rgba) => {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --- Dessin par champ de distance signée (coordonnées normalisées 0..1) ---
const sdRoundRect = (px, py, cx, cy, hw, hh, r) => {
  const qx = Math.abs(px - cx) - (hw - r)
  const qy = Math.abs(py - cy) - (hh - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}
const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)

// Retourne [r,g,b,a] pour un point ; `scale` réduit le motif (zone de sécurité maskable).
function shade(x, y, { rounded, scale }) {
  // fond : dégradé indigo -> violet
  let col = mix([79, 70, 229], [139, 92, 246], (x + y) / 2)
  let alpha = 1
  if (rounded && sdRoundRect(x, y, 0.5, 0.5, 0.5, 0.5, 0.22) > 0) return [0, 0, 0, 0]

  const u = (x - 0.5) / scale
  const v = (y - 0.5) / scale
  const over = (c, a, sd) => {
    const cov = Math.min(1, Math.max(0, 0.5 - sd * 512))
    const k = cov * a
    col = mix(col, c, k)
  }
  // carte arrière (translucide), inclinée
  const [bx, by] = rot(u + 0.06, v - 0.02, -0.18)
  over([255, 255, 255], 0.35, sdRoundRect(bx, by, 0, 0, 0.22, 0.29, 0.05))
  // carte avant, inclinée dans l'autre sens
  const [fx, fy] = rot(u - 0.03, v + 0.0, 0.1)
  const sdFront = sdRoundRect(fx, fy, 0, 0, 0.22, 0.29, 0.05)
  over([255, 255, 255], 1, sdFront)
  // trois points « intervalle croissant » sur la carte avant
  const dots = [[-0.09, 0.14, 0.022], [0.0, 0.14, 0.032], [0.1, 0.14, 0.044]]
  for (const [dx, dy, r] of dots) over([99, 80, 235], 1, Math.hypot(fx - dx, fy - dy) - r)
  // barre de texte
  over([99, 80, 235], 1, sdRoundRect(fx, fy, 0, -0.09, 0.13, 0.025, 0.02))
  over([180, 170, 245], 1, sdRoundRect(fx, fy, -0.04, -0.01, 0.09, 0.018, 0.015))
  return [col[0], col[1], col[2], alpha * 255]
}

function render(size, opts) {
  const buf = Buffer.alloc(size * size * 4)
  const N = 3 // sur-échantillonnage 3x3 pour l'anticrénelage
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sj = 0; sj < N; sj++) {
        for (let si = 0; si < N; si++) {
          const [pr, pg, pb, pa] = shade((i + (si + 0.5) / N) / size, (j + (sj + 0.5) / N) / size, opts)
          r += pr * pa; g += pg * pa; b += pb * pa; a += pa
        }
      }
      const o = (j * size + i) * 4
      if (a > 0) { buf[o] = r / a; buf[o + 1] = g / a; buf[o + 2] = b / a }
      buf[o + 3] = a / (N * N)
    }
  }
  return encodePng(size, size, buf)
}

mkdirSync('public', { recursive: true })
writeFileSync('public/icon-192.png', render(192, { rounded: true, scale: 1 }))
writeFileSync('public/icon-512.png', render(512, { rounded: true, scale: 1 }))
writeFileSync('public/icon-maskable-512.png', render(512, { rounded: false, scale: 0.78 }))
writeFileSync('public/apple-touch-icon.png', render(180, { rounded: false, scale: 0.9 }))

// Favicon SVG équivalent (simplifié)
writeFileSync('public/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>
<rect width="512" height="512" rx="112" fill="url(#g)"/>
<rect x="150" y="120" width="226" height="298" rx="26" fill="#fff" opacity=".35" transform="rotate(-10 263 269)"/>
<rect x="150" y="112" width="226" height="298" rx="26" fill="#fff" transform="rotate(6 263 261)"/>
<g fill="#6350eb" transform="rotate(6 263 261)"><rect x="196" y="190" width="134" height="14" rx="7"/><circle cx="206" cy="330" r="11"/><circle cx="252" cy="330" r="16"/><circle cx="310" cy="330" r="22"/></g>
</svg>
`)
console.log('Icônes générées dans public/')
