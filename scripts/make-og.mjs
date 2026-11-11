import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const W = 1200, H = 630
const px = Buffer.alloc(W * H * 4)
const blobs = [
  { x: 330, y: 330, r: 190, c: [94, 200, 255] },   // 바위
  { x: 600, y: 300, r: 160, c: [120, 170, 255] },  // 가위
  { x: 860, y: 340, r: 180, c: [60, 110, 230] },   // 보
]
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4
  const t = y / H
  let r = 5 + 10 * t, g = 7 + 22 * t, b = 13 + 60 * t           // 블랙→네이비 그라데이션
  for (const o of blobs) {
    const d = Math.hypot(x - o.x, y - o.y)
    if (d < o.r) {
      const shade = 0.55 + 0.45 * (1 - Math.hypot(x - (o.x - o.r * 0.3), y - (o.y - o.r * 0.35)) / (o.r * 1.5)) // 광택
      r = o.c[0] * shade; g = o.c[1] * shade; b = o.c[2] * shade
    } else if (d < o.r + 30) {                                      // 부드러운 글로우
      const k = 1 - (d - o.r) / 30
      r += o.c[0] * k * 0.25; g += o.c[1] * k * 0.25; b += o.c[2] * k * 0.25
    }
  }
  px[i] = Math.min(255, r); px[i + 1] = Math.min(255, g); px[i + 2] = Math.min(255, b); px[i + 3] = 255
}
const raw = Buffer.alloc((W * 4 + 1) * H)
for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 0; px.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4) }
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]) }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6
writeFileSync('public/og.png', Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
console.log('public/og.png written')
