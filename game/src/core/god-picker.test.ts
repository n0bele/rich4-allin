import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseBoard, type RawMap } from './board';
import { pack } from './date';
import { Game } from './game';
import type { Step } from './types';

// 請神符 (card 23, docs/rules/06 §5.4): the remake's change (2026-10-30) — a human picks any free god on the whole
// map from the list (near first), instead of the auto-nearest that could skip a visible one the user meant.
const file = fileURLToPath(new URL('../../dist/assets/maps/remake/tokyo.json', import.meta.url));
const have = existsSync(file);

function setup() {
  const g = new Game({ mapId: 100, players: [1, 4].map(character => ({ character, human: false })), fundIndex: 1, traffic: 0,
    landLimitIndex: 0, daysLimitIndex: 0, victoryIndex: 0, startDate: pack(2026, 10, 30), seed: 7 },
    parseBoard(JSON.parse(readFileSync(file, 'utf8')) as RawMap));
  for (const q of g.players) { q.placed = true; q.whoPlays = 2; q.cash = 500000; q.cards = []; }
  return g;
}

type Play = Generator<Step, unknown, unknown>;
const playOf = (g: Game, id: number) => (g.cards as unknown as { play(q: unknown, id: number, human: boolean): Play }).play(g.players[0], id, true);
const optionsOf = (s: unknown): { label: string }[] | null => (s as unknown as { options?: { label: string }[] }).options ?? null;
const kindOf = (s: unknown): string | undefined => (s as unknown as { kind?: string }).kind;

describe.skipIf(!have)('請神符 picks from the whole map', () => {
  it('the list has every free god, near first, and the answer picks a further one on purpose', () => {
    const g = setup();
    const p = g.players[0];
    p.human = true;
    p.cards = [23];
    p.node = g.board.nodes.find(n => n.ref === 0)!.id;
    const here = g.node(p.node);
    const free = g.board.nodes.filter(n => n.id !== here.id && n.ref === 0);
    const sorted = free.map(n => ({ n, d: Math.hypot(n.x - here.x, n.y - here.y) })).sort((a, b) => a.d - b.d);
    // Two free god objects: the angel nearest, the earth god far away.
    g.objects.slots[0] = { type: 9, node: sorted[0].n.id, dir: 0, owner: 0, life: 0 };
    g.objects.slots[1] = { type: 12, node: sorted[1].n.id, dir: 0, owner: 0, life: 0 };
    const flow = playOf(g, 23);
    let labels: string[] | null = null;
    for (let r = flow.next(); !r.done; r = flow.next()) {
      const o = optionsOf(r.value);
      if (o) { labels = o.map(x => x.label); break; }
    }
    expect(labels, 'the picker shows up').toBeTruthy();
    expect(labels!.some(l => l.includes('天使'))).toBe(true);
    expect(labels!.some(l => l.includes('土地公'))).toBe(true);
    const farIndex = labels!.findIndex(l => l.includes('土地公'));
    const nearIndex = labels!.findIndex(l => l.includes('天使'));
    expect(farIndex).toBeGreaterThan(nearIndex); // near first
    let flew = false;
    for (let r = flow.next(farIndex); !r.done; r = flow.next()) if (kindOf(r.value) === 'god-fly') flew = true;
    expect(g.objects.godType(p)).toBe(12); // the earth god was invited, not the nearer angel
    expect(flew).toBe(true);
  });

  it('with no free god on the map it says so and keeps the card, asking nothing', () => {
    const g = setup();
    const p = g.players[0];
    p.human = true;
    // empty the map of every attachable god object (a new game spawns several)
    g.objects.slots.forEach(o => { if (((o.type >= 1 && o.type <= 10) || o.type === 12 || o.type === 15) && !o.owner) { o.type = 0; o.node = 0; } });
    p.cards = [23];
    p.node = g.board.nodes.find(n => n.ref === 0)!.id;
    const flow = playOf(g, 23);
    let said = false, asked = '';
    for (let r = flow.next(); !r.done; r = flow.next()) {
      const s = r.value as unknown as { t: string; text?: string; args?: unknown };
      if (s.t === 'say' || s.t === 'fx') said = true;
      if (('ask' in s)) asked = `${s.t}|${JSON.stringify(s).slice(0, 160)}`;
    }
    expect(asked).toBe(''); // nothing is asked
    expect(p.cards).toContain(23); // not consumed
    expect(said).toBe(true);
  });
});
