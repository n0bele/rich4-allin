import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseBoard, type RawMap } from './board';
import { pack } from './date';
import { Game } from './game';
import type { Step } from './types';

// The band grid the computers run on a leveraged market (03 remake §11, retuned 2026-10-31): the rung is ~80%
// of the market's daily band scaled by the token's temperament and the computer level — 簡單 1.5× / 2×,
// 中級 1.0× / 4×, 困難 0.7× / 6×. The crash guards for the instruments that halve or drop 60%: adds never
// average below the crash floor (45% coins / 30% stocks) and the leg is cut at min(crash, 80%/leverage) —
// always inside its own liquidation line — after which the anchor re-centres and the grid trades the range.
const us = fileURLToPath(new URL('../../dist/assets/maps/map-3.json', import.meta.url));

function setup(seed: number, aiLevel = 1) {
  const board = parseBoard(JSON.parse(readFileSync(us, 'utf8')) as RawMap);
  const settings = { mapId: 3, players: [1, 4].map(character => ({ character, human: false })), fundIndex: 1, traffic: 0,
    landLimitIndex: 0, daysLimitIndex: 0, victoryIndex: 0, startDate: pack(2026, 10, 30), seed, aiLevel } as never;
  const g = new Game(settings, board);
  const p = g.players[0];
  p.placed = true; p.whoPlays = 2; p.bank = 1000000; p.cash = 0; p.cards = [];
  return { g, p };
}
const run = (flow: Generator<Step, unknown, unknown>) => [...flow] as Step[];
const SLOT = 6; // ＩＢＭ: no company record, a plain leveraged slot
/** The level's lever plus the computer's own risk appetite (±2 by character and seat) — the engine's formula. */
const leverOf = (g: Game, lvl: number) => {
  const q = g.players[0];
  return Math.max(1, Math.min(10, [2, 4, 6][lvl] + ((q.character * 5 + q.id * 3) % 5) - 2));
};
const book = (g: Game) => (g.stocks as unknown as { grid: Record<string, { anchor: number; step: number; side: string }> }).grid[`0:${SLOT}`];

describe('the grid computers', () => {
  it('中級 buys a rung below the anchor with a 4× lever and banks it a rung above', () => {
    const { g, p } = setup(31);
    run(g.stocks.aiTrade(p)); // seeds the anchor at IBM's price
    const a0 = book(g)!.anchor, step = book(g)!.step;
    expect(step).toBeGreaterThan(0.02);
    g.stocks.stocks[SLOT].price = a0 * (1 - step) * 0.99;
    run(g.stocks.aiTrade(p));
    const pos = g.stocks.position(p.id, SLOT)!;
    expect(pos && pos.dir).toBe(1);
    expect(pos.leverage).toBe(leverOf(g, 1));
    expect(pos.margin).toBeLessThanOrEqual(Math.round(1000000 * 0.07) + 1); // within the level's margin slice
    g.stocks.stocks[SLOT].price = a0 * (1 + step) * 1.01;
    run(g.stocks.aiTrade(p));
    expect(g.stocks.position(p.id, SLOT)).toBeUndefined(); // 中級 banks the whole leg
  });

  it('an empty grid shorts the peak and covers on the fall back', () => {
    const { g, p } = setup(32);
    run(g.stocks.aiTrade(p));
    const bk = () => book(g)!;
    g.stocks.stocks[SLOT].price = bk()!.anchor * (1 + bk()!.step) * 1.01;
    run(g.stocks.aiTrade(p));
    const pos = g.stocks.position(p.id, SLOT);
    expect(pos && pos.dir).toBe(-1);
    g.stocks.stocks[SLOT].price = bk()!.anchor * (1 - bk()!.step) * 0.99;
    run(g.stocks.aiTrade(p));
    expect(g.stocks.position(p.id, SLOT)).toBeUndefined();
  });

  it('adds a rung below, within the 35% deposit cap', () => {
    const { g, p } = setup(33);
    run(g.stocks.aiTrade(p));
    const a0 = book(g)!.anchor, step = book(g)!.step;
    g.stocks.stocks[SLOT].price = a0 * (1 - step) * 0.99;
    run(g.stocks.aiTrade(p));
    const qty1 = g.stocks.position(p.id, SLOT)!.qty;
    g.stocks.stocks[SLOT].price = a0 * (1 - 2 * step);
    run(g.stocks.aiTrade(p));
    const pos = g.stocks.position(p.id, SLOT)!;
    expect(pos.qty).toBeGreaterThan(qty1);
    expect(pos.margin).toBeLessThanOrEqual(Math.round(1000000 * 0.35));
  });

  it('the crash guard cuts the leg at 80%/leverage and re-centres the grid', () => {
    const { g, p } = setup(34); // 中級: 4× → the stop sits at a 20% drop, inside the 24.5% liquidation
    run(g.stocks.aiTrade(p));
    const a0 = book(g)!.anchor, step = book(g)!.step;
    g.stocks.stocks[SLOT].price = a0 * (1 - step) * 0.99;
    run(g.stocks.aiTrade(p));
    expect(g.stocks.position(p.id, SLOT)).toBeTruthy();
    const stopDrop = Math.min(0.3, 0.8 / leverOf(g, 1));
    g.stocks.stocks[SLOT].price = a0 * (1 - stopDrop) * 0.995; // past the stop, still above the liquidation line
    run(g.stocks.aiTrade(p));
    expect(g.stocks.position(p.id, SLOT)).toBeUndefined();
    expect(book(g)!.anchor).toBeCloseTo(g.stocks.stocks[SLOT].price, 4); // the grid re-centred
  });

  it('the grid never averages below the crash floor', () => {
    const { g, p } = setup(35, 0); // 簡單: 2× — the crash floor 30% and the stop 30% coincide
    run(g.stocks.aiTrade(p));
    const a0 = book(g)!.anchor, step = book(g)!.step;
    g.stocks.stocks[SLOT].price = a0 * (1 - step) * 0.99;
    run(g.stocks.aiTrade(p));
    expect(g.stocks.position(p.id, SLOT)).toBeTruthy();
    // a 31% crash: past the floor AND past the 2× stop — the leg closes instead of averaging forever
    g.stocks.stocks[SLOT].price = a0 * (1 - 0.31);
    run(g.stocks.aiTrade(p));
    expect(g.stocks.position(p.id, SLOT)).toBeUndefined();
  });
});
