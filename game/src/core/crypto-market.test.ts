import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseBoard, type Board, type RawMap } from './board';
import { pack, weekday } from './date';
import { Game } from './game';
import { Trend } from './modules/stocks';
import type { GameSettings } from './types';

// The coin market (the 星座 map, docs/rules/03 through the remake): 24/7 trading with no Sunday closure and no
// event 休市, no 停牌, no 涨跌停 flags — a news or red/black card only sweeps a sharp one-day move. Free slots
// trade by their real supply (the whole float is the turn's volume), the linked company slots keep the 10k share
// records their company tiles are anchored to.
const file = fileURLToPath(new URL('../../dist/assets/maps/map-4.json', import.meta.url));
const have = existsSync(file);

function setup(date = weekday(pack(2026, 11, 1)) === 0 ? pack(2026, 11, 1) : pack(2026, 11, 2)) {
  const board = parseBoard(JSON.parse(readFileSync(file, 'utf8')) as RawMap);
  const g = new Game({ mapId: 4, players: [1, 4].map(character => ({ character, human: false })), fundIndex: 1, traffic: 0,
    landLimitIndex: 0, daysLimitIndex: 0, victoryIndex: 0, startDate: date, seed: 7 }, board);
  for (const q of g.players) { q.placed = true; q.whoPlays = 2; q.cash = 500000; q.bank = 0; q.cards = []; }
  return g;
}
const settings = (seed: number, date: number): GameSettings =>
  ({ mapId: 4, players: [1, 4].map(character => ({ character, human: false })), fundIndex: 1, traffic: 0,
     landLimitIndex: 0, daysLimitIndex: 0, victoryIndex: 0, startDate: date, seed });

describe.skipIf(!have)('the coin market', () => {
  it('trades 24/7: open on a Sunday, and a news 休市 cannot close it', () => {
    const sunday = pack(2026, 11, 1);
    expect(weekday(sunday)).toBe(0);
    const g = new Game(settings(3, sunday), parseBoard(JSON.parse(readFileSync(file, 'utf8')) as RawMap) as Board);
    expect(g.stocks.crypto).toBe(true);
    expect(g.stocks.open()).toBe(true);
    g.stocks.closeMarket(10);
    expect(g.stocks.restDays).toBe(0);
    expect(g.stocks.open()).toBe(true);
  });

  it('has no limit flags: a red/black card sweeps the day without 涨停, and no 停牌', () => {
    const g = setup();
    g.stocks.forceLimit(-1, true, 2);
    for (const s of [0, 5, 19]) {
      expect(g.stocks.stocks[s].price).toBeGreaterThanOrEqual(g.stocks.stocks[s].prevClose); // the sweep raised the day
      expect(g.stocks.trend(s)).toBe(Trend.Up); // the coin trend never reads a limit, forced bits or not
    }
    g.stocks.suspend(0, 10);
    expect(g.stocks.stocks[0].suspendDays).toBe(0);
    expect(g.stocks.suspendedSlots()).toEqual([]);
  });

  it('a card only guarantees direction: the pop sits at the market band, the forced days drift ~2%', () => {
    const g = setup();
    const pct = (now: number, ref: number) => now / Math.max(1, ref) - 1;
    const slot = 0, s = g.stocks.stocks[slot];
    g.stocks.forceLimit(slot, true, 2); // the red card on one coin
    const base = s.prevClose; // the card-day reference, before the pop
    // day 0: a single band-sized pop (+8% on the coins), not the old 12%
    expect(pct(s.price, s.prevClose)).toBeGreaterThan(0.05);
    expect(pct(s.price, s.prevClose)).toBeLessThan(0.11);
    const p0 = s.price;
    // the two forced days only drift upward by ~2% each — direction, not a pinned wall
    g.stocks.update();
    expect(s.momentum).toBe(2);
    expect(pct(s.price, p0)).toBeGreaterThan(0.005);
    expect(pct(s.price, p0)).toBeLessThan(0.035);
    g.stocks.update();
    const p2 = s.price;
    expect(pct(p2, p0)).toBeGreaterThan(0.02);
    expect(pct(p2, p0)).toBeLessThan(0.06);
    g.stocks.update();
    // the third day is back to the market's own rhythm: any band move, no card scale left
    expect(Math.abs(s.momentum)).toBeLessThanOrEqual(8);
    const total = s.price / base - 1; // measured from the card-day reference
    expect(total).toBeGreaterThan(0.06); // direction held for the card's window
    expect(total).toBeLessThan(0.24); // but a 10× full position cannot double off one card
  });

  it('free slots trade by their supply and the linked ones keep company records', () => {
    const g = setup();
    const doge = g.stocks.stocks.findIndex(s => s.name === 'DOGE');
    const avaxSlot = g.stocks.stocks.findIndex(s => s.name === 'AVAX');
    const suiSlot = g.stocks.stocks.findIndex(s => s.name === 'SUI');
    const btcSlot = g.stocks.stocks.findIndex(s => s.name === 'BTC');
    expect(avaxSlot).toBeGreaterThanOrEqual(0);
    expect(suiSlot).toBeGreaterThanOrEqual(0);
    expect(doge).toBeGreaterThan(5);
    expect(avaxSlot).toBeGreaterThan(5);
    g.stocks.refreshQuotas();
    expect(g.stocks.stocks[doge].floatPool).toBeGreaterThan(100001);
    expect(g.stocks.stocks[doge].turnQuota).toBe(g.stocks.stocks[doge].floatPool);
    expect(g.stocks.stocks[suiSlot].floatPool).toBeGreaterThan(100001);
    expect(g.stocks.companyOf(btcSlot)).toBeDefined();
    expect(g.stocks.stocks[btcSlot].turnQuota).toBeLessThanOrEqual(g.stocks.stocks[btcSlot].floatPool);
  });
});
