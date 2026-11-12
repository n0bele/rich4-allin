import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseBoard, type RawMap } from '../board';
import { pack } from '../date';
import { Game } from '../game';
import type { Ask } from '../types';

// 画面内 (docs/rules/04 §2): the player-targeting cards pick within a 440×440 original-px box centred on the
// user — the original's screen. The user 2026-11-04: the lists reached across the whole map. The ask offers
// only the near figures, and a cancelled pick keeps the card.
const mapFile = fileURLToPath(new URL('../../../dist/assets/maps/map-1.json', import.meta.url));
const have = existsSync(mapFile);

function setup(seed = 1) {
  const board = parseBoard(JSON.parse(readFileSync(mapFile, 'utf8')) as RawMap);
  const g = new Game({
    mapId: 1, players: [0, 4, 9, 11].map((character, i) => ({ character, human: i === 0 })),
    fundIndex: 1, traffic: 0, landLimitIndex: 0, daysLimitIndex: 0, victoryIndex: 0, startDate: pack(2026, 10, 14), seed,
  }, board);
  const nodes = board.nodes;
  // The user at a 4-way crossing; a companion right beside it; a stranger on the farthest node of the map.
  const start = nodes.find(n => n.adjacent.filter(Boolean).length === 2 && !n.ref)!;
  const far = nodes.reduce((a, b) => (Math.hypot(b.x - start.x, b.y - start.y) > Math.hypot(a.x - start.x, a.y - start.y) ? b : a));
  for (const p of g.players) { p.placed = true; p.whoPlays = p.human ? 1 : 2; p.cash = 50000; p.bank = 50000; p.cards = []; }
  g.players[0].node = start.id;
  g.players[1].node = start.adjacent.find(Boolean)!;
  g.players[2].node = far.id;
  return { g, p: g.players[0], far };
}

describe('the in-view targeting field', () => {
  it('viewActors keeps the neighbour and drops the stranger across the map', () => {
    if (!have) return;
    const { g, p } = setup();
    const cards = g.cards as unknown as { viewActors(p: unknown, self: boolean): number[]; actors(p: unknown, self: boolean): number[] };
    const all = cards.actors(p, true), near = cards.viewActors(p, true);
    expect(all).toContain(g.players[1].id);
    expect(all).toContain(g.players[2].id);
    expect(near).toContain(g.players[1].id); // the companion right beside the user
    expect(near).not.toContain(g.players[2].id); // the stranger across the map: outside 440×440
  });

  it('the turn card asks for in-view targets only; cancelling keeps the card', () => {
    if (!have) return;
    const { g, p } = setup();
    p.cards = [6];
    const flow = g.cards.humanUse(p);
    let asked = '', picked = false, guard = 0;
    let r = flow.next();
    while (!r.done && guard++ < 100) {
      const s = r.value;
      if ('ask' in s) {
        const a = s as Ask;
        if (a.t === 'pick-player') {
          asked = 'pick-player';
          const players = (a as unknown as { players: number[] }).players;
          expect(players).toContain(g.players[1].id);
          expect(players).not.toContain(g.players[2].id);
          picked = true;
          r = flow.next(-1); // cancel the pick: the hand panel reopens
        } else r = flow.next(picked ? -1 : 0); // take the card once, then leave the hand panel
      } else r = flow.next();
    }
    expect(guard).toBeLessThan(100); // the flow ended
    expect(asked).toBe('pick-player');
    expect(p.cards).toEqual([6]); // the cancelled pick leaves the card in hand
  });
});
