import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseBoard, type RawMap } from './board';
import { pack, weekday } from './date';
import { Game } from './game';
import type { MarginPos } from './modules/stocks';
import type { Player, Step } from './types';

// 杠杆保证金市场 (03 remake §10): every market except the Chinese one trades 1-10× from the bank's margin; a
// drop to 75% of the required margin flags 追加保证金, at 5% the position is liquidated and whatever is left
// returns to the bank (no debt beyond the margin). The leverage locks with the first opening.
const us = fileURLToPath(new URL('../../dist/assets/maps/map-3.json', import.meta.url));
const cn = fileURLToPath(new URL('../../dist/assets/maps/map-1.json', import.meta.url));

function setup(file: string) {
  const board = parseBoard(JSON.parse(readFileSync(file, 'utf8')) as RawMap);
  const g = new Game({ mapId: board.mapId, players: [1, 4].map(character => ({ character, human: false })), fundIndex: 1, traffic: 0,
    landLimitIndex: 0, daysLimitIndex: 0, victoryIndex: 0, startDate: pack(2026, 10, 30), seed: 7 }, board);
  const p = g.players[0];
  p.placed = true; p.whoPlays = 2; p.bank = 1000000; p.cash = 0; p.cards = [];
  return { g, p };
}
const run = (flow: Generator<Step, unknown, unknown>) => { const out: Step[] = []; let r = flow.next(); while (!r.done) { out.push(r.value as Step); r = flow.next(); } return out; };
const posOf = (g: Game, p: Player, slot: number): MarginPos | undefined => g.stocks.position(p.id, slot);
const status = (g: Game) => run((g.stocks as unknown as { marginStatus(): Generator<Step, unknown, unknown> }).marginStatus());
const saidOf = (steps: Step[]) => steps.filter(x => x.t === 'say').map(x => (x as unknown as { text: string }).text).join('|');

describe('the margin market', () => {
  it('a US stock opens with the leverage, the margin leaves the bank, the pools shrink', () => {
    const { g, p } = setup(us);
    expect(g.stocks.leveraged).toBe(true);
    const slot = 3, s = g.stocks.stocks[slot];
    const bank = p.bank, pool = s.floatPool;
    const closed = g.stocks.openPos(p, slot, 100, 1, 5);
    expect(closed).toBe(true);
    const pos = posOf(g, p, slot)!;
    expect([pos.dir, pos.qty, pos.leverage, pos.entry]).toEqual([1, 100, 5, s.price]);
    expect(p.bank).toBe(bank - Math.trunc((100 * s.price) / 5));
    expect(s.floatPool).toBe(pool - 100);
    // the floating equity is the margin, the slipped price included
    expect(g.stocks.equityOf(pos, s.price)).toBe(Math.trunc((100 * s.price) / 5));
  });

  it('a 75% equity calls for extra margin; 5% liquidates and returns the rest', () => {
    const { g, p } = setup(us);
    const slot = 3, s = g.stocks.stocks[slot];
    g.stocks.openPos(p, slot, 100, 1, 5);
    // The exchanges' lines: the initial margin is notional / 5 (20% of notional); the 追加保證金 line sits at
    // half of it (a 10% adverse move at 5×), the liquidation line at the 0.5% maintenance rate (−19.5%).
    let caughtEntry = s.price;
    s.price = (s.price * 0.95);
    let tick = '';
    for (const st of status(g)) if (st.t === 'ticker') tick = (st as unknown as { text: string }).text;
    expect(posOf(g, p, slot)!.call).toBe(false); // −5%: above the call line at 5×
    s.price = caughtEntry * 0.89;
    tick = '';
    for (const st of status(g)) if (st.t === 'ticker') tick = (st as unknown as { text: string }).text;
    expect(posOf(g, p, slot)!.call).toBe(true);
    expect(tick).toContain('追加保證金'); // the call is the owner's private ticker line, not a public say
    // back up a little: half the margin left, still standing, no liquidation
    s.price = posOf(g, p, slot)!.entry * 0.85;
    expect(posOf(g, p, slot)).toBeTruthy();
    caughtEntry = posOf(g, p, slot)!.entry;
    // −20% from the entry crosses the maintenance rate: liquidated, the bank gets the rest
    const marginBefore = posOf(g, p, slot)!.margin;
    s.price = caughtEntry * 0.8;
    const said = saidOf(status(g));
    expect(posOf(g, p, slot)).toBeUndefined();
    expect(said).toContain('爆倉');
    expect(p.bank).toBeGreaterThan(0);
    // the reported loss is the deposited margin minus the return (2026-11-12: it reported the gap below the
    // maintenance line — near 0 for a 5x leg — while the player actually lost the whole margin)
    expect(said).toContain('0元退回存款'); // the equity hit the line exactly: nothing returns
    expect(said).toContain(`（虧損 ${marginBefore}元）`);
  });

  it('topUp restores the call, and the leverage locks at the first opening', () => {
    const { g, p } = setup(us);
    const slot = 3, s = g.stocks.stocks[slot];
    g.stocks.openPos(p, slot, 100, 1, 5);
    s.price = s.price * 0.94;
    status(g);
    const pos = posOf(g, p, slot)!;
    const eq = g.stocks.equityOf(pos, s.price), need = Math.trunc((100 * pos.entry) / 5);
    const bank = p.bank;
    expect(need - eq).toBeGreaterThan(0); // the call state left a hole to fill
    expect(g.stocks.topUp(p, slot, Math.ceil(need - eq))).toBe(true);
    expect(pos.call).toBe(false);
    expect(g.stocks.equityOf(pos, s.price)).toBeGreaterThanOrEqual(need - 0.5);
    expect(p.bank).toBe(Math.round(bank - Math.ceil(need - eq)));
    // a second opening at 3× cannot change the locked 5×
    g.stocks.openPos(p, slot, 10, 1, 3);
    expect(posOf(g, p, slot)!.leverage).toBe(5);
    expect(posOf(g, p, slot)!.qty).toBe(110);
  });

  it('a short opens the same way and its equity rises when the price falls', () => {
    const { g, p } = setup(us);
    const slot = 3, s = g.stocks.stocks[slot];
    g.stocks.openPos(p, slot, 100, -1, 2);
    const pos = posOf(g, p, slot)!;
    expect([pos.dir, pos.leverage]).toEqual([-1, 2]);
    s.price = s.price * 0.9; // shorts profit from a fall
    expect(g.stocks.equityOf(pos, s.price)).toBeGreaterThan(pos.margin);
    g.stocks.closePos(p, slot, 100);
    expect(posOf(g, p, slot)).toBeUndefined();
  });

  it('the Chinese market stays spot: no positions, trades land on the holdings', () => {
    const { g, p } = setup(cn);
    expect(g.stocks.leveraged).toBe(false);
    const slot = 6, s = g.stocks.stocks[slot]; // d() slots carry a real float pool

    const bank = p.bank;
    run(g.stocks.trade(p, slot, true, 10));
    expect(g.stocks.position(p.id, slot)).toBeUndefined();
    expect(g.stocks.holdings[p.id][slot].shares).toBe(10);
    expect(p.bank).toBe(Math.round(bank - 10 * s.price));
  });
});

describe('the liquidation line and the margin ops', () => {
  it('the line is frozen at the open: no daily tick moves it; a top-up pushes it away, a withdrawal closer', () => {
    const { g, p } = setup(us);
    const slot = 3, s = g.stocks.stocks[slot];
    g.stocks.openPos(p, slot, 100, 1, 5);
    const pos = posOf(g, p, slot)!;
    // a fresh 5x leg: entry x (1 + MMR) - margin/qty — the exchanges' formula over the real (truncated) margin
    const liq0 = g.stocks.liquidationPrice(pos);
    expect(liq0).toBeCloseTo(pos.entry * (1 + 0.005 - 0.2), 2);
    expect(pos.liq).toBe(liq0);
    // the daily ticks never move the frozen line (the user 2026-11-02: it must not wander with the price)
    for (let i = 0; i < 5; i++) g.stocks.update();
    expect(posOf(g, p, slot)!.liq).toBeCloseTo(liq0, 4);
    // a top-up: the margin rises, the line retreats from the mark
    g.stocks.topUp(p, slot, Math.trunc(pos.margin));
    const pos2 = posOf(g, p, slot)!;
    const liq2 = pos2.liq; // the position object is live: snapshot the line before the withdrawal moves it
    expect(liq2).toBeLessThan(liq0);
    expect(g.stocks.liquidationPrice(pos2)).toBeCloseTo(pos2.entry * 1.005 - pos2.margin / pos2.qty, 4);
    // a withdrawal: only the part above the initial margin may leave, and the line comes back
    const wd = g.stocks.withdrawable(pos2, s.price);
    expect(wd).toBeGreaterThan(0); // a topped-up leg holds spare margin
    expect(g.stocks.withdraw(p, slot, wd + 1)).toBe(false); // past the spare: rejected whole
    expect(g.stocks.withdraw(p, slot, wd)).toBe(true);
    const pos3 = posOf(g, p, slot)!;
    // the equity lands exactly on the initial margin (the floating pnl stays inside it), nothing above left
    expect(g.stocks.equityOf(pos3, s.price)).toBe(g.stocks.requiredMargin(pos3));
    expect(pos3.liq).toBe(g.stocks.liquidationPrice(pos3)); // the frozen line stayed consistent
    expect(pos3.liq).toBeGreaterThan(liq2); // a long's line CAME BACK CLOSER (a higher price is nearer the cut)
    expect(g.stocks.withdrawable(pos3, s.price)).toBe(0);
    expect(g.stocks.withdraw(p, slot, 1)).toBe(false);
  });
});

describe('opening within the deposit', () => {
  it('a small turn quota never blocks an affordable open (the BTC case: 1,279-share quota, 88,003 price)', () => {
    const coin = fileURLToPath(new URL('../../dist/assets/maps/map-4.json', import.meta.url));
    const { g, p } = setup(coin);
    g.stocks.refreshQuotas();
    const btc = g.stocks.stocks.findIndex(x => x.name === 'BTC');
    const s = g.stocks.stocks[btc];
    s.turnQuota = 1279; // the linked record's day volume, a plain share count
    const bank = p.bank;
    // 5 shares at 10x: the margin (trunc(5 x price / 10)) is far below the deposit — it must open, not fail
    const said: string[] = [];
    for (const st of run(g.stocks.trade(p, btc, true, 5, btc, 10))) {
      if (st.t === 'say') said.push((st as unknown as { text: string }).text);
    }
    const pos = posOf(g, p, btc)!;
    expect(pos).toBeTruthy();
    expect(pos.qty).toBe(5);
    expect(pos.leverage).toBe(10);
    expect(Math.trunc((5 * pos.entry) / 10)).toBeLessThan(bank); // the margin the message talks about, well within
    expect(said.join('|')).not.toContain('無法開倉');
    // and the quota still caps a FRESH opening (partial fill, no failure; adds ride on their own leverage)
    g.stocks.closePos(p, btc, 5);
    g.stocks.stocks[btc].turnQuota = 3;
    for (const st of run(g.stocks.trade(p, btc, true, 999, btc, 10))) void st;
    expect(posOf(g, p, btc)!.qty).toBe(3); // only the day's 3 shares, the rest of the ask silently dropped
  });
});

describe('the market clock and the daily volume', () => {
  it('the US market trades 24/7: open on a Sunday, and an event 休市 cannot close it', () => {
    const sunday = pack(2026, 11, 1); // a Sunday
    expect(weekday(sunday)).toBe(0);
    const board = parseBoard(JSON.parse(readFileSync(us, 'utf8')) as RawMap);
    const g = new Game({ mapId: board.mapId, players: [1, 4].map(character => ({ character, human: false })), fundIndex: 1, traffic: 0,
      landLimitIndex: 0, daysLimitIndex: 0, victoryIndex: 0, startDate: sunday, seed: 7 }, board);
    g.stocks.refreshQuotas();
    expect(g.stocks.open()).toBe(true); // no Sunday closure (the user 2026-11-03)
    g.stocks.closeMarket(10);
    expect(g.stocks.open()).toBe(true); // no event closure either
    expect(g.stocks.alwaysOpen).toBe(true);
  });

  it("the day's volume caps a margin add: the quota can never go negative", () => {
    const { g, p } = setup(us);
    g.stocks.refreshQuotas();
    const slot = 6, s = g.stocks.stocks[slot];
    s.turnQuota = 2; // nearly exhausted for the day
    g.stocks.openPos(p, slot, 999, 1, 5); // a big ask: only 2 shares may open
    const pos = g.stocks.position(p.id, slot)!;
    expect(pos.qty).toBe(2);
    expect(s.turnQuota).toBe(0);
    expect(s.turnQuota).toBeGreaterThanOrEqual(0); // the invariant the old code broke
    s.turnQuota = 0;
    g.stocks.openPos(p, slot, 50, 1, 5); // nothing left: nothing opens, no negative drift
    expect(pos.qty).toBe(2);
    expect(s.turnQuota).toBe(0);
    // a partial close returns its shares, never above the pool
    g.stocks.closePos(p, slot, 1);
    expect(s.turnQuota).toBe(1);
    expect(s.turnQuota).toBeLessThanOrEqual(s.floatPool);
  });
});

describe('the commodity market (the city map)', () => {
  it('every company keeps non-negative retained shares (2026-11-03: the cheap commodities went negative)', () => {
    const city = fileURLToPath(new URL('../../dist/assets/maps/map-7.json', import.meta.url));
    const board = parseBoard(JSON.parse(readFileSync(city, 'utf8')) as RawMap);
    const g = new Game({ mapId: board.mapId, players: [1, 4].map(character => ({ character, human: false })), fundIndex: 1, traffic: 0,
      landLimitIndex: 0, daysLimitIndex: 0, victoryIndex: 0, startDate: pack(2026, 11, 3), seed: 7 }, board);
    g.stocks.refreshQuotas();
    expect(g.stocks.stocks.map(x => x.name)).toContain('黃金');
    for (const c of g.board.companies) {
      expect(c.freeShares).toBeGreaterThanOrEqual(0);
      if (c.stockSlot < g.stocks.stocks.length) {
        expect(g.stocks.stocks[c.stockSlot].floatPool).toBeLessThanOrEqual(10000);
      }
    }
    // the bank's tile (slot 0) holds the safe-haven metal, the store's (slot 1) the consumer staple
    expect(g.stocks.stocks[board.companies.find(c => c.stockSlot === 0)!.stockSlot].name).toBe('黃金');
    expect(g.stocks.stocks[board.companies.find(c => c.stockSlot === 1)!.stockSlot].name).toBe('咖啡');
  });
});

describe('卡槽分红 with margin legs', () => {
  it('a long receives per share and a short pays the same rate, rolled into the next fund', () => {
    const us = fileURLToPath(new URL('../../dist/assets/maps/map-3.json', import.meta.url));
    const { g, p } = setup(us);
    const q = g.players[1];
    q.placed = true; q.whoPlays = 2; q.bank = 1000000; q.cash = 0; q.cards = [];
    const slot = g.board.companies[0].stockSlot;
    const c = g.board.companies[0];
    g.stocks.stocks[slot].turnQuota = 2000; // both legs must open today (the day's volume caps opens)
    g.stocks.openPos(p, slot, 1000, 1, 2);   // the long
    g.stocks.openPos(q, slot, 500, -1, 2);   // the short
    c.fundA = 60000;
    if (process.env.RICH4_GRID_DEBUG) console.log('DIVDBG slot', slot, 'co', c.name, 'fundA', c.fundA,
      'posP', JSON.stringify(g.stocks.position(p.id, slot)), 'posQ', JSON.stringify(g.stocks.position(q.id, slot)),
      'longs', g.stocks.longSharesOf(p.id, slot));
    const steps = [...(g.stocks as unknown as { dividends(): Generator<Step, unknown, unknown> }).dividends()];
    const fx = steps.find(x => x.t === 'fx') as unknown as { data?: { rows: { company: string; each: number[] }[] } };
    const row = fx.data!.rows.find(r => r.company === c.name)!;
    const longPay = row.each[p.id], shortPay = row.each[q.id];
    const per = 60000 / (1000 + 500); // a per-share rate over every standing share
    expect(longPay).toBe(Math.trunc(per * 1000));
    expect(shortPay).toBe(-Math.trunc(per * 500));
    expect(c.fundA).toBe(-shortPay); // the shorts' whole payment rolls into next month's fund
  });
});
