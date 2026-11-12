/**
 * The 星座 map's small-scale art (the user 2026-11-03): the real board is a glowing glass-and-star sky, but
 * the extracted ground compresses to a near-black square at small sizes — the minimap and the map-select
 * thumbnail looked like a dead black tile. Both paint a stylized night sky over the board's REAL road graph
 * instead: nebula gradients, a fixed starfield, glowing lines and glassy node pads. Deterministic, so every
 * repaint shows the same sky.
 */
import { nodeById, parseBoard, worldSize, type Board } from '../core/board';

export const isConstellationMap = (mapId: number) => (((mapId | 0) % 8) + 8) % 8 === 4;

/** mulberry32: a tiny seeded generator — the sky never flickers between repaints. */
const skyRand = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const painted = new WeakMap<Board, Map<number, HTMLCanvasElement>>();

/** The painted sky at `px` × `px`, cached per board and size (the minimap repaints often). */
export function constellationCanvas(board: Board, px: number): HTMLCanvasElement {
  let per = painted.get(board);
  if (!per) painted.set(board, (per = new Map()));
  const hit = per.get(px);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = px;
  cv.height = px;
  paintSky(cv.getContext('2d')!, px, board);
  per.set(px, cv);
  return cv;
}

/** The night sky and the glowing road graph over the board's world coordinates. */
export function paintSky(ctx: CanvasRenderingContext2D, px: number, board: Board): void {
  const K = px / worldSize(board);
  // The sky: a deep gradient with a few nebula glows.
  const sky = ctx.createLinearGradient(0, 0, px, px);
  sky.addColorStop(0, '#060a1e');
  sky.addColorStop(0.55, '#0b1132');
  sky.addColorStop(1, '#171038');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, px, px);
  const blobs: [number, number, number, string][] = [
    [0.3, 0.28, 0.34, 'rgba(124, 92, 214, .20)'],
    [0.72, 0.62, 0.3, 'rgba(46, 126, 168, .17)'],
    [0.58, 0.16, 0.22, 'rgba(196, 84, 168, .12)'],
    [0.18, 0.8, 0.26, 'rgba(64, 108, 200, .13)'],
    [0.85, 0.25, 0.2, 'rgba(88, 70, 190, .12)'],
  ];
  for (const [x, y, r, color] of blobs) {
    const rg = ctx.createRadialGradient(x * px, y * px, 0, x * px, y * px, r * px);
    rg.addColorStop(0, color);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, px, px);
  }
  // The starfield: mostly dim white, some blue, a few warm — plus a handful of bright cross sparkles.
  const rand = skyRand(0xc0ffe);
  const unit = px / 240;
  for (let i = 0, n = Math.round(px / 1.4); i < n; i++) {
    const x = rand() * px, y = rand() * px, r = (0.4 + rand() * 1.2) * unit, warm = rand();
    ctx.fillStyle = warm > 0.85 ? 'rgba(255, 226, 180, .95)' : warm > 0.55 ? 'rgba(212, 232, 255, .9)' : 'rgba(255,255,255,.8)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 7; i++) {
    const x = rand() * px, y = rand() * px, r = 1.7 * unit;
    ctx.fillStyle = 'rgba(255,255,255,.96)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(190, 220, 255, .5)';
    ctx.lineWidth = unit * 0.8;
    ctx.beginPath();
    ctx.moveTo(x - r * 3.2, y);
    ctx.lineTo(x + r * 3.2, y);
    ctx.moveTo(x, y - r * 3.2);
    ctx.lineTo(x, y + r * 3.2);
    ctx.stroke();
  }
  // The roads: a wide soft glow pass, then the bright core — the in-game glass paths, read at small scale.
  const edges: [number, number, number, number][] = [];
  for (const n of board.nodes) for (const a of n.adjacent) {
    const m = nodeById(board, a);
    if (m && m.id > n.id) edges.push([n.x * K, n.y * K, m.x * K, m.y * K]);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(120, 196, 255, .9)';
  ctx.strokeStyle = 'rgba(140, 190, 255, .4)';
  ctx.lineWidth = px / 30;
  ctx.shadowBlur = px / 24;
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of edges) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(228, 241, 255, .95)';
  ctx.lineWidth = Math.max(1, px / 110);
  ctx.shadowBlur = px / 70;
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of edges) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
  ctx.stroke();
  ctx.shadowBlur = 0;
  // The stops: little glassy beads where the paths meet.
  for (const n of board.nodes) {
    ctx.beginPath();
    ctx.arc(n.x * K, n.y * K, Math.max(1.4, px / 150), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(242, 250, 255, .95)';
    ctx.shadowColor = 'rgba(140, 200, 255, 1)';
    ctx.shadowBlur = px / 90;
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

let thumbUrl = '';

/** The map-select thumbnail (256×256): built once from the board data, replacing the extracted black square. */
export async function constellationThumb(assets: string): Promise<string> {
  if (thumbUrl) return thumbUrl;
  try {
    const res = await fetch(`${assets}/maps/map-4.json`);
    thumbUrl = constellationCanvas(parseBoard(await res.json()), 256).toDataURL('image/png');
  } catch { /* offline or a bad fetch: the extracted thumbnail stays */ }
  return thumbUrl;
}
