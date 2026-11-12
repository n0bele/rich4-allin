import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseBoard, type RawMap } from './board';
import { pack } from './date';
import { Game } from './game';
import { OBJ } from './modules/objects';
import type { Step } from './types';

// The gods act on arrival (docs/rules/06 §5.5, fcn_0040f381): the angel covers one more level on any lot or
// facility — an empty large plot is built first (fcn_0040b110 at level 0, the 機器工人 way) — and the devil
// tears one level down after its animation. The Tokyo board comes from the built app (dist/), as the
// repo's editor/site link is not kept in every checkout.
const file = fileURLToPath(new URL('../../dist/assets/maps/remake/tokyo.json', import.meta.url));
const have = existsSync(file);

function setup(chars = [1, 4]) {
  const g = new Game({ mapId: 100, players: chars.map(character => ({ character, human: false })), fundIndex: 1, traffic: 0, landLimitIndex: 0,
    daysLimitIndex: 0, victoryIndex: 0, startDate: pack(2026, 10, 18), seed: 7 }, parseBoard(JSON.parse(readFileSync(file, 'utf8')) as RawMap));
  for (const q of g.players) { q.placed = true; q.whoPlays = 2; q.cash = 500000; q.cards = []; }
  return g;
}
const run = (flow: Generator<Step, unknown, unknown>) => [...flow] as Step[];
const fxData = (s?: Step) => (s as unknown as { data?: Record<string, unknown> } | undefined)?.data;
const fxKind = (s: Step) => (s as unknown as { kind?: string }).kind;
function attach(g: Game, p: Game['players'][number], type: number) {
  const pair = g.objects.slots[((type % 2 ? type + 1 : type - 1)) - 1];
  if (pair?.node) g.objects.removeAt(pair.node);
  run(g.objects.attach(p, type) as Generator<Step, unknown, unknown>);
}
const landEffect = (g: Game) => (g.objects as unknown as { landEffect(q: unknown): Generator<Step, unknown, unknown> }).landEffect.bind(g.objects);

describe.skipIf(!have)('the god landing effect (06 §5.5)', () => {
  it('天使 on an empty large plot builds it: a computer not owning it builds 0, the park', () => {
    const g = setup();
    const p = g.players[0];
    attach(g, p, OBJ.Angel);
    const f = g.board.facilities[0];
    const node = g.board.nodes.find(n => n.ref === f.id + 4000)!;
    f.owner = 0; f.type = 0; f.level = 0;
    p.node = node.id;
    const out = run(landEffect(g)(p));
    expect(f.level).toBe(1);
    expect(f.type).toBe(0); // the ownerless plot: the park, whatever the roll says
    const fx = out.find(s => s.t === 'fx' && fxKind(s) === 'angel');
    expect(fxData(fx)?.built === 1).toBe(true);
  });

  it('天使 covers one more level on a facility of another owner, and nothing at the top', () => {
    const g = setup();
    const p = g.players[0];
    attach(g, p, OBJ.Angel);
    const f = g.board.facilities[0];
    const node = g.board.nodes.find(n => n.ref === f.id + 4000)!;
    f.owner = 2; f.type = 2; f.level = 2;
    p.node = node.id;
    expect(run(landEffect(g)(p)).some(s => fxKind(s) === 'angel')).toBe(true);
    expect([f.owner, f.level]).toEqual([2, 3]);
    f.level = 5;
    expect(run(landEffect(g)(p)).some(s => fxKind(s) === 'angel')).toBe(false);
    expect(f.level).toBe(5);
  });

  it('惡魔 tears down after the animation: the level falls when the flow resumes past the fx', () => {
    const g = setup();
    const p = g.players[0];
    attach(g, p, OBJ.Devil);
    const f = g.board.facilities[0];
    const node = g.board.nodes.find(n => n.ref === f.id + 4000)!;
    f.owner = 2; f.type = 2; f.level = 3;
    p.node = node.id;
    const flow = landEffect(g)(p);
    const before = f.level;
    let fx = false;
    for (let r = flow.next(); !r.done; r = flow.next()) {
      if (fxKind(r.value) === 'devil') { fx = true; expect(f.level).toBe(before); }
    }
    expect(fx).toBe(true);
    expect(f.level).toBe(before - 1);
  });
});
