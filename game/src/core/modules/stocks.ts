/**
 * Stock market and listed companies — docs/rules/03-stocks.md, company tiles in docs/rules/02 §5.
 * Owns: the 12 stocks of the map, player holdings, price history, market rest counter, company controllers.
 *
 * Prices, momentum and average costs are float32 like the original's `fstp dword` stores (03 §0 note):
 * every stored value goes through Math.fround, intermediate maths is double.
 */
import type { Company } from '../board';
import { day as dayOf, daysBetween, weekday } from '../date';
import { CHARACTERS } from '../characters';
import { ask, type Flow } from '../flow';
import type { Game } from '../game';
import type { Player } from '../types';
import { WheelKind } from './wheel';

export const f32 = Math.fround;

/** One entry of the original 96-stock table (asm/rich4_all_stocks.c, 03 §2.2). */
export interface StockDef {
  name: string;
  /** Table flag f4: the slot is meant to be linked to a company of the map. */
  linked: boolean;
  /** f8: initial market float. */
  float: number;
  /** f12 = f16 = f20: initial price. */
  price: number;
  /** f24: volatility. */
  vol: number;
}

const d = (name: string, price: number, vol: number, float = 10000, linked = false): StockDef => ({ name, linked, float, price, vol });
const L = (name: string, price: number, vol: number, float: number): StockDef => d(name, price, vol, float, true);

/**
 * The eight stock groups, group = map number (03 §2.1, §2.2). The remake's tables (quotes of 2026-10-28, local
 * currency: 台股 TWD、陸股 CNY、日股 JPY、美股 USD、幣市 USD via CoinGecko): today's real prices. The linked slots
 * are the map's company tiles — a still-listed firm carries its real quote (和地塊估值記錄一起重錨); a heritage
 * tile whose firm is gone (臺灣人壽、富士銀行…) keeps the original's canon numbers. Groups 5-7 keep the original's
 * fictional firms.
 */
export const STOCK_TABLE: readonly (readonly StockDef[])[] = [
  [ // 0 台灣 (TWSE 現價 TWD; 國泰人壽取其上市母公司國泰金控 2882 的現價)
    L('中國信託', 74.2, 1, 10000), L('國泰人壽', 115.5, 0.7, 5000), L('遠東百貨', 21.95, 1.5, 10000), d('台積電', 2425, 1.6),
    d('聯發科', 4235, 1.5), d('台達電', 1550, 1.4), d('鴻海', 251.5, 1.2), d('日月光投控', 695, 1.4),
    d('南亞塑膠', 75.4, 0.8), d('富邦金控', 161, 0.7), d('欣興電子', 1100, 1.6), d('南亞科技', 477, 1.8),
    d('聯華電子', 128, 1.5), d('廣達電腦', 330, 1.2), d('中華電信', 156.5, 0.5), d('國巨', 547, 1.6),
    d('創意電子', 8170, 1.8), d('緯穎科技', 1950, 1.8), d('台新金控', 42, 0.7), d('玉山金控', 48.35, 0.7),
  ],
  [ // 1 中國大陸 (A股現價 CNY)
    L('上海銀行', 9.31, 1.2, 10000), L('中國人壽', 35, 1, 5000), L('王府井百貨', 9.56, 1.6, 10000), L('中國石油', 13.26, 1.5, 0),
    d('建設銀行', 11.77, 0.7), d('農業銀行', 7.43, 0.7), d('工商銀行', 8.56, 0.7), d('中國銀行', 7.02, 0.7),
    d('貴州茅台', 1330.75, 1), d('中國移動', 99.38, 0.6), d('招商銀行', 42.13, 0.8), d('中國神華', 49.65, 0.9),
    d('寧德時代', 229.14, 1.8), d('中國海洋石油', 34.85, 1.1), d('工業富聯', 48.64, 1.5), d('中國平安', 52.31, 0.8),
    d('比亞迪', 82.74, 1.6), d('紫金礦業', 27.95, 1.3), d('長江電力', 29.4, 0.5), d('中芯國際', 102, 1.9),
  ],
  [ // 2 日本 (現價 JPY)
    L('瑞穗銀行', 7639, 0.8, 10000), L('明治安田生命', 6929, 1.4, 5000), L('三越百貨', 1740, 2, 10000), L('鹿島建設', 4794, 1.2, 5000),
    L('ＳＥＧＡ', 3224, 1, 5000), L('豐田汽車', 3051, 1.2, 5000), d('三菱UFJ', 3159, 0.8), d('軟銀集團', 4682, 1.6),
    d('瑞可利', 18800, 1.2), d('愛德萬測試', 34930, 1.8), d('日立製作所', 5620, 1.1), d('ＳＯＮＹ', 3957, 1.2),
    d('鎧俠', 14340, 1.8), d('迅銷', 73520, 1.2), d('東京威力科創', 9805, 1.8), d('基恩士', 79190, 1.3),
    d('三菱商事', 4847, 0.9), d('伊藤忠商事', 2311, 0.9), d('東京海上', 555, 0.7), d('三井物產', 5042, 0.9),
  ],
  [ // 3 美國 (現價 USD; 名稱=交易所代碼)
    L('C', 122.69, 1, 10000), L('UNH', 410.39, 0.8, 5000), L('WMT', 119.32, 2, 10000), L('UAL', 104.71, 1, 5000),
    L('F', 11.71, 1.4, 5000), L('IBM', 250.25, 2, 5000), d('NVDA', 217.94, 2), d('AAPL', 347.1, 1.4),
    d('MSFT', 531.33, 1.1), d('GOOGL', 320.58, 1.3), d('AMZN', 253.1, 1.4), d('AVGO', 342.33, 1.5),
    d('TSLA', 407.46, 2), d('META', 620.19, 1.5), d('BRK-B', 542.99, 0.8), d('LLY', 1281.91, 1.1),
    d('MU', 928.76, 1.9), d('XOM', 179.91, 1.2), d('AMD', 560.26, 1.9), d('V', 401.86, 0.6),
  ],
  [ // 4 星座島 → 加密貨幣 (現價 USD; 市值前20去穩定幣; 前三槽=公司地塊聯動: 交易所=BNB, 保險=BTC, 百貨=ETH。
    // 流通量取實際規模 (2026-10-30): 低價幣按發行量算,交易量按發行量放開——不是每回合一兩千的零頭。
    L('BNB', 757, 1.8, 10000), L('BTC', 81485, 1.5, 5000), L('ETH', 2368, 1.9, 10000), d('XRP', 1.33, 2.2, 60000000000),
    d('SOL', 102.9, 2.2, 560000000), d('TRX', 0.33, 1.6, 86000000000), d('AVAX', 8.36, 2.2, 430000000), d('ZEC', 1312, 2.5, 16100000),
    d('HYPE', 82.1, 2.5, 340000000), d('DOGE', 0.08, 2.8, 152000000000), d('XMR', 605, 1.8, 18400000), d('SUI', 0.898, 2.5, 3600000000),
    d('LINK', 11.8, 2, 660000000), d('UNI', 7.17, 2.2, 700000000), d('LEO', 9.39, 1, 927000000), d('ADA', 0.21, 2.2, 36000000000),
    d('NEAR', 4.69, 2.4, 1200000000), d('XLM', 0.17, 2.4, 31000000000), d('BCH', 300, 1.8, 19800000), d('LTC', 57.7, 1.8, 76000000),
  ],
  [ // 5 武俠
    L('聚寶銀樓', 70, 1.2, 10000), L('狂徒鏢局', 70, 1, 5000), L('南北貨場', 20, 1.6, 10000), L('少林派', 250, 1.5, 3000),
    L('武當派', 101, 2, 3000), L('蜀山派', 96, 1.8, 5000), L('嵩山派', 120, 1.4, 6000), L('恆山派', 47, 1.5, 4000),
    L('泰山派', 40, 0.8, 5000), L('衡山派', 30, 0.4, 4000), L('華山派', 90, 0.6, 5000), L('逍遙客棧', 300, 1, 4000),
  ],
  [ // 6 恐龍
    L('黃金銀行', 60, 0.8, 10000), L('肥龍保險', 33, 1.4, 5000), L('飛龍百貨', 22, 2, 10000), d('雷龍電子', 18, 2),
    d('侏羅紀影業', 100, 1), d('長毛象紡織', 15, 1.2), d('迅猛汽車', 40, 1), d('恐龍蛋食品', 30, 1),
    d('火山岩保險', 100, 1.2), d('三葉蟲百貨', 25, 0.7), d('始祖化石', 100, 1), d('翼龍航空', 50, 0.8),
  ],
  [ // 7 城市主題 → 商品期貨 (現價 USD, 2026-11-03 快照; 前7槽=公司地塊聯動: 銀行=黃金(保險位缺席,金庫對黃金),
    // 百貨=咖啡(日常消費品的代表標的), 五家飯店=原油/白銀/銅/天然氣/小麥。流通量取名義規模,讓低價品也能放量。
    L('黃金', 4165, 0.9, 4000), L('咖啡', 2.93, 2.2, 10000), L('原油', 95.6, 1.8, 10000), L('白銀', 60.1, 2.2, 10000),
    L('銅', 6.46, 1.5, 10000), L('天然氣', 2.92, 3, 10000), L('小麥', 6.02, 1.6, 10000), d('玉米', 4.48, 1.4, 1200000),
    d('大豆', 10.4, 1.3, 600000), d('可可', 5480, 2.6, 1200), d('白糖', 0.184, 1.8, 30000000), d('棉花', 0.768, 1.6, 8000000),
    d('活牛', 2.197, 1.2, 2500000), d('瘦肉豬', 0.582, 2, 10000000), d('木材', 521, 2.2, 12000), d('鉑金', 1437, 1.7, 4000),
    d('鈀金', 932, 2.4, 5000), d('鎳', 15290, 1.8, 400), d('鋁', 3043, 1.5, 2000), d('鋅', 2950, 1.6, 2000),
  ],
];

/**
 * The eight groups as the original wrote them: the map's own stock names (stock_names) ride these numbers — the
 * 大富豪模式's five cities and 激情歲月 keep the values their company records are tuned to, whatever the classic
 * maps now trade (03 §2.4 note).
 */
export const REMAKE_STOCK_TABLE: readonly (readonly StockDef[])[] = [
  [ // 0 台灣 (original)
    L('中國信託', 100, 1, 10000), L('台灣人壽', 40, 0.6, 5000), L('大宇百貨', 25, 1.5, 10000), d('台積電', 180, 1.6),
    d('大宇資訊', 80, 1.2), d('台灣塑膠', 60, 1), d('裕隆汽車', 60, 1.4), d('遠東紡織', 27, 0.9),
    d('統一超商', 310, 0.7), d('震旦行', 66, 1), d('萊爾富', 171, 1.4), d('聯合報', 280, 0.8),
  ],
  [ // 1 中國大陸 (original)
    L('上海銀行', 70, 1.2, 10000), L('中國人壽', 36, 1, 5000), L('王府井百貨', 20, 1.6, 10000), L('中國石油', 15, 1.5, 0),
    d('聯想科技', 300, 2), d('頂新食品', 296, 1.8), d('東方實業', 133, 1.4), d('匯豐證券', 170, 1.5),
    d('大慶石油', 121, 0.8), d('長城電機', 60, 0.4), d('長江建設', 92, 0.6), d('大眾軟件', 366, 1),
  ],
  [ // 2 日本 (original)
    L('富士銀行', 160, 0.8, 10000), L('三井生命', 99, 1.4, 5000), L('三越百貨', 22, 2, 10000), L('日產建設', 28, 2, 5000),
    L('ＳＥＧＡ', 300, 1, 5000), L('豐田汽車', 35, 1.2, 5000), d('松下電機', 540, 1), d('日立機電', 830, 1),
    d('ＳＯＮＹ', 300, 1.2), d('三菱工業', 225, 0.7), d('任天堂', 300, 1), d('德間書店', 150, 0.8),
  ],
  [ // 3 美國 (original)
    L('花旗銀行', 200, 1, 10000), L('喬治亞人壽', 55, 0.8, 5000), L('環球百貨', 20, 2, 10000), L('聯合航空', 18, 1, 5000),
    L('福特汽車', 16, 1.4, 5000), L('ＩＢＭ', 550, 2, 5000), d('德州儀器', 245, 1.5), d('摩扥羅拉', 166, 1.3),
    d('迪士尼', 955, 1.4), d('可口可樂', 1030, 0.8), d('麥當勞', 1440, 1), d('百事可樂', 310, 1.2),
  ],
  [ // 4 星際 (original)
    L('行星銀行', 50, 1, 10000), L('銀河保險', 40, 0.6, 5000), L('宇宙百貨', 25, 1.5, 10000), d('火星移民', 90, 1.6),
    d('隕石礦業', 45, 1.2), d('星球電視', 60, 1), d('金星科技', 60, 1.4), d('星海通訊', 27, 0.9),
    d('銀河航運', 110, 0.7), d('月世界旅遊', 66, 1), d('宇宙地產', 71, 1.4), d('太陽能電力', 80, 0.8),
  ],
  [ // 5 武俠 (original)
    L('聚寶銀樓', 70, 1.2, 10000), L('狂徒鏢局', 70, 1, 5000), L('南北貨場', 20, 1.6, 10000), L('少林派', 250, 1.5, 3000),
    L('武當派', 101, 2, 3000), L('蜀山派', 96, 1.8, 5000), L('嵩山派', 120, 1.4, 6000), L('恆山派', 47, 1.5, 4000),
    L('泰山派', 40, 0.8, 5000), L('衡山派', 30, 0.4, 4000), L('華山派', 90, 0.6, 5000), L('逍遙客棧', 300, 1, 4000),
  ],
  [ // 6 恐龍 (original)
    L('黃金銀行', 60, 0.8, 10000), L('肥龍保險', 33, 1.4, 5000), L('飛龍百貨', 22, 2, 10000), d('雷龍電子', 18, 2),
    d('侏羅紀影業', 100, 1), d('長毛象紡織', 15, 1.2), d('迅猛汽車', 40, 1), d('恐龍蛋食品', 30, 1),
    d('火山岩保險', 100, 1.2), d('三葉蟲百貨', 25, 0.7), d('始祖化石', 100, 1), d('翼龍航空', 50, 0.8),
  ],
  [ // 7 假期 (original)
    L('假期銀行', 100, 1, 10000), L('假期百貨', 33, 0.8, 10000), L('狂徒大飯店', 500, 2, 3000), L('豪華大飯店', 100, 1, 5000),
    L('第一大飯店', 130, 1.4, 5000), L('金金大飯店', 150, 2, 5000), L('世界大飯店', 70, 1.5, 5000), d('百事可樂', 66, 1.3),
    d('狄士尼', 55, 1.4), d('可口可樂', 30, 0.8), d('麥當勞', 44, 1), d('愛迪達', 30, 1.2),
  ],
];

/** The market's name for the news texts: the map group's region; the 星座 group trades crypto (幣市). */
export const marketLabel = (mapId: number): string =>
  ({ 0: '台股', 1: '陸股', 2: '日股', 3: '美股', 4: '幣市', 7: '商品期貨' } as Record<number, string>)[(((mapId | 0) % 8) + 8) % 8] ?? '交易市場';

/** One stock of the current map, `stocks_on_map` (03 §1.1). */
export interface Stock {
  name: string;
  /** +4: 0 = not a company stock, otherwise the linked company index (1-based). */
  companyId: number;
  /** +6: days left suspended. */
  suspendDays: number;
  /** +7: high nibble = days of forced limit up, low nibble = days of forced limit down. */
  forced: number;
  /** +8: shares that can be bought on the market. */
  floatPool: number;
  /** +10: shares that can be bought this turn (交易量). */
  turnQuota: number;
  basePrice: number;
  prevClose: number;
  price: number;
  volatility: number;
  /** Percent, -10..+10, kept across days. */
  momentum: number;
  lastImpulse: number;
  /** 144 daily closes, ring buffer; 0 = no data. */
  history: number[];
}

export interface Holding { shares: number; avgCost: number }

/**
 * A margin position (the remake's leverage, 03 remake §10): long (dir 1) or short (dir −1); `margin` is the money
 * paid in so far (initial + any 追加保证金 top-ups), `entry` the size-weighted average open price, `leverage` fixed
 * by the first opening and never changed while the position lives; `call` flags the 追加保证金 reminder.
 */
export interface MarginPos { dir: 1 | -1; qty: number; leverage: number; entry: number; margin: number; call: boolean;
  /** The frozen liquidation line (solved from the entry, the margin and the size): it only moves when the
   *  margin or the size changes, never with the daily ticks (the user 2026-11-02). */
  liq: number }

/** Trend states fcn_004295ea (03 §4.5). */
export const Trend = { Up: 0, LimitUp: 1, Down: 2, LimitDown: 3, Flat: 4 } as const;
export type Trend = (typeof Trend)[keyof typeof Trend];

/** Price display format (03 §4.4): < 15 two decimals, < 150 one, otherwise whole. */
export function formatPrice(p: number): string {
  return p < 15 ? p.toFixed(2) : p < 150 ? p.toFixed(1) : Math.trunc(p).toString();
}

/** Price step fcn_00428ec5 (03 §4.4): the change is rounded towards zero to the tick of the candidate price.
 * The original clamped 1..9999; the remake's real quotes go past both ends (BTC at 8 萬, TRX at $0.33),
 * so the band widened to 0.01..999999. Below 2 a 0.001 tick — at 0.01 the sub-0.1 quotes (DOGE) would never
 * move: their ±10% change is smaller than the tick. */
export function adjustPrice(prev: number, pct: number): number {
  const cand = (prev * (pct + 100)) / 100;
  const tick = cand < 2 ? 0.001 : cand < 5 ? 0.01 : cand < 15 ? 0.05 : cand < 50 ? 0.1 : cand < 150 ? 0.5 : 1;
  let r = pct > 0 ? cand - ((cand - prev) % tick) : cand + ((prev - cand) % tick);
  if (r < 0.01) r = 0.01;
  else if (r > 999999) r = 999999;
  return f32(r);
}

/** Five states fcn_004295ea (03 §4.5). */
export function trendOf(s: Stock, crypto = false): Trend {
  if (crypto) {
    if (s.price > s.prevClose) return Trend.Up;
    if (s.price < s.prevClose) return Trend.Down;
    return Trend.Flat;
  }
  if (s.price > s.prevClose) return s.price >= adjustPrice(s.prevClose, 10) ? Trend.LimitUp : Trend.Up;
  if (s.price < s.prevClose) return s.price <= adjustPrice(s.prevClose, -10) ? Trend.LimitDown : Trend.Down;
  return Trend.Flat;
}

/** A message box's own template-string line breaks (typing them with ${...} keeps them exact in source). */
const NL2 = '\n\n';

/**
 * The maintenance margin rate (the exchanges' MMR, 03 remake §10): flat 0.5% of the position's notional —
 * the liquidation line, shown in the market screen, and the point the daily check-up force-closes at. The
 * 追加保证金 reminder sits at half the initial margin (notional × 0.5 / leverage).
 */
export const MMR = 0.005;

/** Facility level caps by type (ref_00474940), copied from the core to avoid an import cycle. */
const FACILITY_MAX = [1, 5, 5, 1, 5, 5, 5, 5, 5, 5]; // + 5..9 大富翁城's halls (docs/rules/19)
/** The same with 10..13 歌舞伎町's shops (docs/rules/21), as the core's FACILITY_MAX_LEVEL (REMAKE_FREE_BUILD). */
const FACILITY_TOP = [...FACILITY_MAX, 5, 5, 5, 5];
/** Fee names by company category (ref_0047528e → ref_0047517c, 02 §6). */
const FEE_NAME: Record<number, string> = { 1: '旅遊費', 3: '電腦費', 4: '保險費', 5: '修車費', 6: '加油費', 11: '工程費', 12: '過路費' };

export class Stocks {
  /** Market closed for N days (0x4990dc, bit 7 = reopens tomorrow). */
  restDays = 0;
  /** The coin market (the 星座 group): 24/7 trading — no Sunday closure, no 休市, no 停牌, no 涨跌停. */
  crypto = false;
  /** The coin market and the US market trade around the clock. */
  alwaysOpen = false;
  /** The margin markets: every market except the Chinese股市 (台股、陸股) — trades are leveraged 1-10×. */
  leveraged = false;
  china = true;
  /** Margin positions [player][slot]; a leveraged trade goes through here (spot holdings stay untouched for them). */
  positions: (MarginPos | undefined)[][] = [];
  stocks: Stock[] = [];
  /** holdings[player][slot] (0x4971a0). */
  holdings: Holding[][] = [];
  /** Shareholder ranking per company (company +0x1c..+0x1f), player id + 1, [0] = controller. */
  ranks: number[][] = [];
  /** Next history slot 0..143 (0x499100). */
  cursor = 0;
  /** Today's market drift (0x4990ec). */
  drift = 0;
  /** trunc(Σ prices × 10), today (0x499078) and at the start (0x49907c). */
  index = 0;
  baseIndex = 0;

  constructor(readonly g: Game) {}

  // ---------------------------------------------------------------- setup

  /** New game: stock table for the map and company links (03 §2-§3), then the first price update (03 §4.1). */
  init(): void {
    const g = this.g;
    const group = (((g.board.mapId | 0) % 8) + 8) % 8;
    // A map that names its slots (stock_names; the tycoon's five cities, 激情歲月, 歌舞伎町) keeps the original
    // group's numbers — the ones its company records are tuned to (REMAKE_STOCK_TABLE). A classic map plays the
    // remake's real-market table, whole (the groups 0-4 have 20, 03 §2.4 note).
    const names = g.board.stockNames;
    const table = names ? REMAKE_STOCK_TABLE[group] : STOCK_TABLE[group];
    const count = names?.length ?? table.length;
    this.crypto = !names && group === 4;
    // The US market keeps the coins' clock: no Sunday closure, no event 休市 (the user 2026-11-03).
    this.alwaysOpen = this.crypto || group === 3;
    this.china = group === 0 || group === 1;
    this.leveraged = !this.china;
    this.stocks = table.slice(0, count).map((t, i): Stock => ({
      name: names?.[i] || t.name, companyId: t.linked ? 1 : 0, suspendDays: 0, forced: 0, floatPool: t.float, turnQuota: 0,
      basePrice: f32(t.price), prevClose: f32(t.price), price: f32(t.price), volatility: f32(t.vol),
      momentum: 0, lastImpulse: 0, history: new Array(144).fill(0),
    }));
    this.holdings = g.players.map(() => Array.from({ length: this.stocks.length }, () => ({ shares: 0, avgCost: 0 })));
    this.positions = g.players.map(() => Array.from({ length: this.stocks.length }, () => undefined as MarginPos | undefined));
    this.restDays = 0;
    this.cursor = 0;
    this.baseIndex = Math.trunc(this.stocks.reduce((s, x) => f32(s + x.basePrice), 0) * 10);
    // _rich4_init_stock_commercial (03 §3.1): the last company pointing at a flagged slot; none leaves 1 (quirk).
    this.stocks.forEach((s, slot) => {
      if (!s.companyId) return;
      g.board.companies.forEach((c, j) => { if (c.stockSlot === slot) s.companyId = j + 1; });
    });
    for (const c of g.board.companies) c.freeShares = c.stockSlot < this.stocks.length ? Math.max(0, 10000 - this.stocks[c.stockSlot].floatPool) : 0;
    this.ranks = g.board.companies.map(c => [c.controller, 0, 0, 0]);
    this.refreshQuotas();
    this.update();
  }

  // ---------------------------------------------------------------- queries

  /** Linked company of a slot, if any. */
  companyOf(slot: number): Company | undefined {
    const s = this.stocks[slot];
    return s?.companyId ? this.g.board.companies[s.companyId - 1] : undefined;
  }

  /** Stock slot of a company when that stock is linked back to it. */
  slotOf(c: Company): number {
    const idx = this.g.board.companies.indexOf(c) + 1;
    return c.stockSlot < 12 && this.stocks[c.stockSlot]?.companyId === idx ? c.stockSlot : -1;
  }

  holding(p: number, slot: number): Holding { return this.holdings[p][slot]; }

  /** A player's margin position in a slot, when this is a leveraged market. */
  position(p: number, slot: number): MarginPos | undefined { return this.positions[p]?.[slot]; }

  /** Shares standing in a slot: the spot holdings plus a long margin position (shorts count none). */
  longSharesOf(p: number, slot: number): number {
    const pos = this.leveraged ? this.positions[p]?.[slot] : undefined;
    return (this.holdings[p][slot]?.shares ?? 0) + (pos?.dir === 1 ? pos.qty : 0);
  }

  /**
   * The net position a slot shows in the 持股表: spot plus the margin leg — a long adds its shares, a short
   * subtracts them (the holder owes that many to the pool). Zero for no stake at all.
   */
  netSharesOf(p: number, slot: number): number {
    const pos = this.leveraged ? this.positions[p]?.[slot] : undefined;
    if (!pos) return this.holdings[p][slot]?.shares ?? 0;
    return (this.holdings[p][slot]?.shares ?? 0) + (pos.dir === 1 ? pos.qty : -pos.qty);
  }

  /** Does the player hold anything in the slot (spot shares or a margin leg)? */
  holdsAny(p: number, slot: number): boolean {
    return (this.holdings[p][slot]?.shares ?? 0) > 0 || !!this.positions[p]?.[slot];
  }

  /** A position's floating equity: everything it paid in plus the price difference. */
  equityOf(pos: MarginPos, price: number): number { return pos.margin + (pos.dir === 1 ? price - pos.entry : pos.entry - price) * pos.qty; }

  /** A position's required initial margin (the 追保 / 爆仓 lines are 75% / 5% of it). */
  requiredMargin(pos: MarginPos): number { return Math.trunc(pos.qty * pos.entry / pos.leverage); }

  /** The position's notional (its borrowed size): qty × entry. */
  notional(pos: MarginPos): number { return pos.qty * pos.entry; }

  /**
   * The margin rate the exchanges show: (margin + unrealised PnL) / notional. Liquidation lands at the
   * maintenance rate below; the 追加保证金 reminder sits at half the initial margin.
   */
  marginRate(pos: MarginPos, price: number): number { return this.equityOf(pos, price) / this.notional(pos); }

  /**
   * The estimated liquidation price, the exchanges' isolated-margin formula (Binance style): a long lands at
   * entry × (1 − 1/leverage + MMR), a short at entry × (1 + 1/leverage − MMR) — at that price the margin rate
   * touches the maintenance rate exactly.
   */
  liquidationPrice(pos: MarginPos): number {
    // equity = the maintenance margin at the entry notional, solved for the price: a long lands at
    // entry x (1 + MMR) - margin/qty, a short at entry x (1 - MMR) + margin/qty. A fresh position's margin is
    // notional/L, which reduces to the old entry x (1 -/+ (1/L - MMR)); a topped-up margin pushes the line away,
    // a withdrawn one pulls it closer. Frozen per position: no daily tick moves it.
    return pos.dir === 1 ? pos.entry * (1 + MMR) - pos.margin / pos.qty : pos.entry * (1 - MMR) + pos.margin / pos.qty;
  }

  /** A slot's value for one player: spot shares × price, or a margin position's floating equity. */
  marketValueOf(p: number, slot: number): number {
    const s = this.stocks[slot];
    const pos = this.leveraged ? this.positions[p]?.[slot] : undefined;
    if (pos) return this.equityOf(pos, s.price);
    return Math.trunc((this.holdings[p][slot]?.shares ?? 0) * s.price);
  }
  trend(slot: number): Trend { return this.mkTrend(this.stocks[slot]); }

  /** Trend by the market's rules: the coin market knows no limits (Up / Down / Flat only). */
  private mkTrend(s: Stock): Trend { return trendOf(s, this.crypto); }

  /** Value of a player's shares at today's prices, added the original way (02 §7.1): truncated per stock, float32.
   * A margin position counts by its floating equity, not the borrowed notional. */
  holdingsValue(w: number, p: Player): number {
    const h = this.holdings[p.id];
    if (!h) return w;
    for (let i = 0; i < this.stocks.length; i++) w = Math.trunc(f32(f32(w) + this.marketValueOf(p.id, i)));
    return w;
  }

  /** Is the market open today (03 §4.2)? Sundays close it; holidays join once the holiday table is remade.
   * The coin market trades 24/7: no Sunday closure and no event 休市. */
  open(): boolean {
    if (this.alwaysOpen) return true; // the coins and the US market: 24/7, no Sunday and no event closure
    return this.restDays === 0 && weekday(this.g.date) !== 0;
  }

  /** Total shares and share value per player, for news and taxes (06 §4.3 #10, #13). */
  shareCount(p: Player): number {
    return this.stocks.reduce((sum, _s, i) => sum + this.netSharesOf(p.id, i), 0);
  }
  shareValue(p: Player): number {
    let v = 0;
    this.holdings[p.id].forEach((h, i) => { v = Math.trunc(v + h.shares * this.stocks[i].price); });
    return v;
  }

  /** Average of the most recent n history slots that hold a close (03 §9.2 avg6 / avg24). */
  recentAverage(slot: number, n: number): number {
    const hist = this.stocks[slot].history;
    let sum = 0, count = 0;
    for (let k = 1; k <= n; k++) {
      const v = hist[(this.cursor - k + 144 * 2) % 144];
      if (v) { sum += v; count++; }
    }
    return count ? sum / count : 0;
  }

  /**
   * The consecutive-day run a slot rides (03 remake §11): +n = n up days in a row (today included),
   * −n = n down days, 0 = flat or no history. The AI grid anchors on this, not on a volatility band.
   */
  streakOf(slot: number): number {
    const s = this.stocks[slot];
    const seq: number[] = [s.price];
    for (let k = 1; k <= 10; k++) {
      const v = s.history[(this.cursor - k + 288) % 144];
      if (!v) break;
      seq.push(v);
    }
    if (seq.length < 2) return 0;
    let n = 0;
    if (seq[0] > seq[1]) { while (n + 1 < seq.length && seq[n] > seq[n + 1]) n++; return n; }
    if (seq[0] < seq[1]) { while (n + 1 < seq.length && seq[n] < seq[n + 1]) n++; return -n; }
    return 0;
  }

  /** Lowest close in the 144-day history (0 when empty). */
  historyLow(slot: number): number {
    let low = 0;
    for (const v of this.stocks[slot].history) if (v && (!low || v < low)) low = v;
    return low;
  }

  // ---------------------------------------------------------------- daily

  /** Per-turn trading volume reset at each player's turn start (03 §4.7). */
  turnStart(_p: Player): void { this.refreshQuotas(); }

  /** fcn_0042915a: quota = float when ≤ 1000, else 10%..29.99% of it. A coin market's free slots
   * (no company record) trade by their real supply: the whole pool is the turn's volume. */
  refreshQuotas(): void {
    for (const s of this.stocks) {
      if (this.crypto && !s.companyId) { s.turnQuota = s.floatPool; continue; }
      s.turnQuota = s.floatPool <= 1000 ? s.floatPool : Math.trunc((s.floatPool * (1000 + this.g.rng.rand() % 2000)) / 10000);
    }
  }

  /** Daily settlement part (01 §4.2 steps 7, 8 and 10): rest counter, temporary counters, price update. */
  *daily(): Flow {
    if (this.restDays & 0x80) this.restDays = 0;
    else if (this.restDays) { this.restDays -= 1; if (!this.restDays) this.restDays = 0x80; }
    for (const s of this.stocks) {
      if (s.suspendDays) s.suspendDays -= 1;
      if (s.forced & 0xf0) s.forced -= 0x10;
      if (s.forced & 0x0f) s.forced -= 1;
    }
    if (this.update()) yield { t: 'fx', kind: 'stocks-updated' };
    yield* this.marginStatus();
  }

  /** Daily price update fcn_004291d6 (03 §4.3). Returns false when the market is closed. */
  update(): boolean {
    if (!this.open()) return false;
    const rng = this.g.rng;
    const m = f32((rng.rand() - 16384) / 4097);
    this.drift = m;
    let sum = 0;
    this.stocks.forEach((s, i) => {
      s.prevClose = s.price;
      if (s.suspendDays) s.momentum = 0;
      // A card's forced days: the DIRECTION is guaranteed, the size stays at the market's own natural scale —
      // a gentle ~2% drift, no pinned wall (the 2026-10-31 rebalance: 10% a day let a 10× full position double).
      else if (s.forced) s.momentum = s.forced & 0xf0 ? 2 : -2;
      else {
        const r = (rng.rand() - 16384) / 1171;
        s.lastImpulse = f32(r);
        // The leveraged markets breathe at half speed (a quarter on the remake cities, 0.6 on the coins) so the
        // leverage itself carries the risk instead of the daily core swings.
        const volK = this.leveraged ? (this.crypto ? 0.6 : 0.5) : 1;
        let mom = f32(f32(s.momentum + f32(r * s.volatility * volK)) + f32(m * volK));
        const c = this.companyOf(i);
        const ref = c ? c.value / 10000 : s.basePrice;
        const hi = c ? 3 : 8, lo = c ? 0.85 : 0.5;
        if (s.prevClose > ref) { if (s.prevClose > ref * hi) mom = f32(mom * (mom > 0 ? 0.5 : 2)); }
        else if (s.prevClose < ref * lo) mom = f32(mom * (mom > 0 ? 2 : 0.5));
        // The coins still have no ±10% band at all (they breathe inside ±8), the leveraged stock markets stand
        // inside ±4 (the remake cities' quiet tables ±3), the Chinese spot markets keep the original ±10.
        const cap = this.crypto ? 8 : this.china ? 10 : this.g.board.stockNames ? 3 : 4;
        s.momentum = Math.max(-cap, Math.min(cap, mom));
      }
      s.price = adjustPrice(s.prevClose, s.momentum);
      s.history[this.cursor] = s.price;
      sum = f32(sum + s.price);
    });
    this.cursor = (this.cursor + 1) % 144;
    this.index = Math.trunc(sum * 10);
    return true;
  }

  // ---------------------------------------------------------------- card and news hooks (03 §4.6, §8)

  /**
   * Red/black card and news: force limit up (true) or down for a stock slot, or all when slot < 0 (03 §4.6).
   * days defaults to the callers' originals: 1 for the all-stock news (#0173/#0174), 2 for the red/black card.
   * The forced byte is overwritten, then the limit applies at once (fcn_00429040: no closure or suspension check).
   */
  forceLimit(slot: number, up: boolean, days = slot < 0 ? 1 : 2): void {
    // A leveraged card hits a big pop NOW (12% on the coins, 10% on the stocks) and the forced byte holds the
    // pump for the promised days; a whole-market news keeps its lighter band push for a single day.
    const n = Math.max(0, Math.min(15, days || (slot < 0 ? 1 : 2)));
    const v = up ? n << 4 : n;
    for (const [i, s] of this.stocks.entries()) if (slot < 0 || i === slot) s.forced = v;
    if (this.leveraged) {
      const x = this.crypto ? 8 : 6;
      this.sweep(up ? x : -x, slot);
      return;
    }
    this.applyForced(slot);
  }

  /**
   * A one-day sharp move for one slot or the whole market (the coin market's news and card effects; carries no
   * 涨跌停 state, the move lands today and the momentum resets from scratch tomorrow).
   */
  sweep(pct: number, slot = -1): void {
    const today = (this.cursor + 143) % 144;
    for (const [i, s] of this.stocks.entries()) {
      if ((slot >= 0 && i !== slot) || !s) continue;
      s.momentum = pct;
      s.price = adjustPrice(s.prevClose, pct);
      s.history[today] = s.price;
    }
  }

  /** fcn_00429040: forced stocks jump to their limit now and overwrite today's history slot. */
  applyForced(slot = -1): void {
    const today = (this.cursor + 143) % 144;
    for (const [i, s] of this.stocks.entries()) {
      if ((slot >= 0 && i !== slot) || !s.forced) continue;
      s.momentum = s.forced & 0xf0 ? 10 : -10;
      s.price = adjustPrice(s.prevClose, s.momentum);
      s.history[today] = s.price;
    }
  }

  /** News #0175: the whole market closes (counter 10: today and the next 10 day changes). */
  closeMarket(days = 10): void { if (!this.crypto) this.restDays = days; }

  /**
   * News #0176: one stock suspended; the price goes back to yesterday's close and today's history is rewritten.
   * Bug decision #6: 10 days like the message (the original code wrote 15).
   */
  suspend(slot: number, days = 10): void {
    if (this.crypto) return; // the coin market has no 停牌
    const s = this.stocks[slot];
    s.suspendDays = days;
    s.price = s.prevClose;
    s.history[(this.cursor + 143) % 144] = s.price;
  }

  /** News #0177: trading resumes. */
  resume(slot: number): void { this.stocks[slot].suspendDays = 0; }

  /** Slots currently suspended (news #0177 candidates). */
  suspendedSlots(): number[] { return this.stocks.flatMap((s, i) => (s.suspendDays ? [i] : [])); }

  /** News #0179-#0184: change a company's month and total surplus (not price indexed). */
  adjustProfit(c: Company, delta: number): void { c.fundA += delta; c.fundB += delta; }

  // ---------------------------------------------------------------- trading primitives

  /** _rich4_buy_stock market mode (03 §5.2): from the bank deposit, within the turn quota. */
  buyMarket(p: Player, slot: number, n: number): boolean {
    const s = this.stocks[slot];
    n = Math.min(n, Math.max(0, s.turnQuota)); // the day's volume is a hard cap (2026-11-03: it once went negative)
    if (!(n > 0)) return false;
    const cost = Math.trunc(n * s.price);
    s.turnQuota -= n; s.floatPool -= n;
    p.bank -= cost;
    return this.addShares(p.id, slot, n, cost);
  }

  /** _rich4_buy_stock subscription mode (03 §5.5): cash, at trunc(valuation / 10000), from the primary shares. */
  buyPrimary(p: Player, c: Company, n: number): boolean {
    const cost = n * Math.trunc(c.value / 10000);
    c.freeShares -= n;
    p.cash -= cost;
    return this.addShares(p.id, c.stockSlot, n, cost);
  }

  private addShares(pid: number, slot: number, n: number, cost: number): boolean {
    const h = this.holdings[pid][slot];
    const old = Math.trunc(h.shares * h.avgCost);
    h.shares += n;
    h.avgCost = f32((old + cost) / h.shares);
    this.g.stats?.stockBought(pid, n, cost);
    return this.rerank(pid, slot);
  }

  /**
   * The margin primitive (03 remake §10): opens / adds to a same-direction position, the deposit from the bank.
   * The existing position's leverage is locked — `lev` only counts for a fresh one. The borrowed shares leave
   * the market's pool. Returns whether the controller changed.
   */
  openPos(p: Player, slot: number, n: number, dir: 1 | -1, lev: number): boolean {
    const s = this.stocks[slot];
    let pos = this.positions[p.id]?.[slot];
    const L = pos ? pos.leverage : Math.max(1, Math.min(10, Math.trunc(lev)));
    n = Math.min(n, Math.max(0, s.turnQuota)); // adds included: the day's volume caps everything it can go below
    const notional = Math.trunc(n * s.price);
    const margin = Math.trunc(notional / L);
    if (!(n > 0) || notional <= 0 || p.bank < margin) return false;
    s.turnQuota -= n; s.floatPool -= n;
    p.bank -= margin;
    if (pos) {
      pos.entry = f32((pos.entry * pos.qty + s.price * n) / (pos.qty + n));
      pos.qty += n; pos.margin += margin;
    } else {
      pos = { dir, qty: n, leverage: L, entry: s.price, margin, call: false, liq: 0 };
      this.positions[p.id][slot] = pos;
    }
    pos.liq = this.liquidationPrice(pos);
    this.g.stats?.stockBought(p.id, n, notional);
    this.rerank(p.id, slot);
    return true; // the open succeeded — the controller change is rerank's own side effect
  }

  /** The margin close: `n` lots of a position, the bank gets its slice of the floating equity (never below 0). */
  closePos(p: Player, slot: number, n: number): boolean {
    const s = this.stocks[slot];
    const pos = this.positions[p.id]?.[slot];
    if (!pos || !(n > 0)) return false;
    n = Math.min(pos.qty, n);
    const eq = this.equityOf(pos, s.price);
    const part = Math.max(0, Math.trunc((eq * n) / pos.qty));
    p.bank += part;
    this.g.stats?.stockSold(p.id, n, part, Math.trunc(pos.entry * n));
    s.turnQuota = Math.min(s.floatPool, s.turnQuota + n); s.floatPool += n;
    const frac = n / pos.qty;
    pos.qty -= n;
    pos.margin = Math.max(0, pos.margin - Math.trunc(pos.margin * frac));
    if (pos.qty === 0 || pos.margin === 0) this.positions[p.id][slot] = undefined;
    return this.rerank(p.id, slot);
  }

  /** _rich4_sell_stock (03 §5.3): proceeds to the bank deposit, or to the lottery pool when toBank is false. */
  sell(p: Player, slot: number, n: number, toBank: boolean): number {
    const s = this.stocks[slot], h = this.holdings[p.id][slot];
    const basis = Math.trunc(n * h.avgCost);
    h.shares -= n;
    if (h.shares === 0) h.avgCost = 0;
    const proceeds = Math.trunc(n * s.price);
    this.g.stats?.stockSold(p.id, n, toBank ? proceeds : 0, basis);
    s.turnQuota = Math.min(s.floatPool, s.turnQuota + n); s.floatPool += n;
    if (toBank) p.bank += proceeds; else this.g.lotteryPool += proceeds;
    this.rerank(p.id, slot);
    return proceeds;
  }

  /**
   * Player-to-player share sale (03 §5.6): the buyer's average cost uses the deal price; only the buyer is re-ranked
   * (the original's leftover ranking for the seller is kept). Money is moved by the trade screen. Returns true when
   * the buyer became the controller.
   */
  transferShares(seller: number, buyer: number, slot: number, n: number, price: number): boolean {
    const h = this.holdings[seller][slot];
    this.g.stats?.stockSold(seller, n, Math.trunc(n * price), Math.trunc(n * h.avgCost));
    h.shares -= n;
    if (h.shares === 0) h.avgCost = 0;
    return this.addShares(buyer, slot, n, Math.trunc(n * price));
  }

  /**
   * _rich4_update_commercial_owner (03 §3.2): only the player whose holding changed moves; ties keep the earlier
   * player ahead. Returns true when the controller changed.
   */
  rerank(pid: number, slot: number): boolean {
    const c = this.companyOf(slot);
    if (!c) return false;
    const ci = this.g.board.companies.indexOf(c);
    const me = pid + 1;
    const list = this.ranks[ci].filter(x => x && x !== me);
    while (list.length < 4) list.push(0);
    const mine = this.longSharesOf(pid, slot);
    if (mine > 0) {
      let pos = 0;
      for (let k = 2; k >= 0; k--) {
        const o = list[k];
        if (!o) continue;
        if (this.longSharesOf(o - 1, slot) < mine) list[k + 1] = o;
        else { pos = k + 1; break; }
      }
      list[pos] = me;
    }
    this.ranks[ci] = list.slice(0, 4);
    const owner = this.ranks[ci][0];
    if (owner === c.controller) return false;
    c.controller = owner;
    return true;
  }

  /** Sell every share of a player (03 §5.4). Bankrupt players' shares always go to the lottery pool. */
  *sellAll(p: Player, toPool: boolean): Flow {
    const pool = toPool || p.bankrupt;
    if (this.leveraged && !pool) for (let slot = 0; slot < this.stocks.length; slot++) if (this.positions[p.id]?.[slot]) this.closePos(p, slot, this.positions[p.id]![slot]!.qty);
    let total = 0;
    for (let slot = 0; slot < this.stocks.length; slot++) {
      const n = this.holdings[p.id][slot].shares;
      if (n > 0) total += this.sell(p, slot, n, !pool);
    }
    if (total) yield { t: 'fx', kind: 'stock-sell-all', p: p.id, data: { total, toPool: pool } };
  }

  /** Fate #0193: lose trunc(shares × percent / 100) of every stock, the proceeds go to the lottery pool. */
  *confiscate(p: Player, percent = 10): Flow {
    let total = 0;
    for (let slot = 0; slot < this.stocks.length; slot++) {
      const n = Math.trunc((this.holdings[p.id][slot].shares * percent) / 100);
      if (n > 0) total += this.sell(p, slot, n, false);
    }
    if (total) yield { t: 'fx', kind: 'stock-confiscated', p: p.id, data: { total } };
  }

  // ---------------------------------------------------------------- dividends (03 §6.2)

  /** Day 15: company dividends fcn_0042ba97, also on market holidays; negative surplus is charged. */
  *dividends(): Flow {
    const g = this.g;
    const pay = g.players.map(() => 0);
    // One row per linked stock for the 「上市公司分紅」 table (rich4_ui_stock.asm:3052-3330): every player's share
    // of this month's surplus (`each`, by player id) and the surplus itself.
    const rows: { company: string; profit: number; each: number[] }[] = [];
    this.stocks.forEach((_s, slot) => {
      const c = this.companyOf(slot);
      if (!c) return;
      const living = g.players.filter(p => p.whoPlays !== 0);
      // Per-share distribution over every standing share: spot and margin longs receive, margin shorts OWE the
      // same per-share rate (they borrowed the shares that paid the dividend). The owed amounts roll into the
      // company's fund for next month, so no money appears from nowhere.
      const longs = living.reduce((a, p) => a + this.longSharesOf(p.id, slot), 0);
      const shorts = living.reduce((a, p) => { const sp = this.positions[p.id]?.[slot]; return a + (sp && sp.dir === -1 ? sp.qty : 0); }, 0);
      const base = longs + shorts;
      const perShare = base ? c.fundA / base : 0;
      const each = g.players.map(() => 0);
      for (const p of living) {
        const sh = this.longSharesOf(p.id, slot);
        each[p.id] = Math.trunc(perShare * sh);
        pay[p.id] += each[p.id];
      }
      let owed = 0;
      for (const p of living) {
        const sp = this.positions[p.id]?.[slot];
        if (!sp || sp.dir !== -1) continue;
        const owe = Math.trunc(perShare * sp.qty);
        each[p.id] -= owe;
        pay[p.id] -= owe;
        owed += owe;
      }
      rows.push({ company: c.name, profit: c.fundA, each });
      if (longs) c.fundA = 0;
      if (owed) c.fundA += owed;
    });
    yield { t: 'fx', kind: 'dividends', data: { rows, pay: [...pay] } };
    for (const p of g.players) {
      if (!p.whoPlays) continue;
      p.bank += pay[p.id];
      if (p.bank < 0) {
        p.cash += p.bank; p.bank = 0;
        if (p.cash < 0) { p.cash = 0; yield* g.bankrupt(p); if (g.over) return; }
      }
    }
  }

  // ---------------------------------------------------------------- computer (03 §9)

  /** Computer's stock trading at the start of its turn (03 §9.2-§9.3). */

  /** The player's stock ratio (+0x1a, 03 §9.1). */
  private stockRatio(p: Player): number { return CHARACTERS[p.character]?.stockRatio ?? 0; }

  /** fcn_0042bf03 (03 §9.2). */
  *aiBuy(p: Player): Flow {
    const g = this.g, rng = g.rng, PI = g.priceIndex;
    if (rng.rand() % 3 !== 0) return;
    const ratio = this.stockRatio(p);
    if (!ratio || !this.open()) return;
    if (p.loanDue && daysBetween(g.date, p.loanDue) < 15) return;
    let value = 0;
    this.stocks.forEach((_s, i) => { value = Math.trunc(f32(value + this.marketValueOf(p.id, i))); });
    const target = Math.trunc(((p.bank + p.cash + value) * ratio) / 100);
    if (value >= target) return;
    const budget = Math.min(target - value, p.bank);
    const scores = this.stocks.map((s, slot) => {
      if (s.suspendDays || this.mkTrend(s) === Trend.LimitUp || s.turnQuota === 0) return 0;
      const c = this.companyOf(slot);
      const mine = this.longSharesOf(p.id, slot);
      let sc = 0;
      if (c) {
        if (p.bank <= 20000 * PI) return 0;
        const avgProfit = g.monthsElapsed ? Math.trunc(c.fundB / g.monthsElapsed) : c.fundB;
        const nav = Math.trunc(c.value / 10000);
        if (avgProfit > 0 && avgProfit < 5000 * PI) sc += 1;
        else if (avgProfit >= 5000 * PI && avgProfit < 10000 * PI) sc += 2;
        else if (avgProfit >= 10000 * PI) sc += 3;
        if (c.fundA > 0 && mine < 5000 && s.price <= nav * 1.2) {
          sc += 1;
          if (c.controller && c.controller !== p.id + 1) {
            const ctl = this.longSharesOf(c.controller - 1, slot);
            if (s.floatPool + mine + c.freeShares > ctl) sc += 1;
            if (mine + s.turnQuota > ctl) sc += 2;
          }
        }
        if (s.price < nav * 0.85) sc += 3;
        if (s.price < nav * 0.7) sc += 5;
      } else {
        if (p.bank <= 30000 * PI) return 0;
        const avg24 = this.recentAverage(slot, 24), avg6 = this.recentAverage(slot, 6);
        if (s.price < s.basePrice * 2.5 && s.momentum > 2 && avg6 > avg24) sc += 2;
        if (s.price < s.basePrice * 0.6 && avg6 > avg24) sc += 4;
        if (avg6 < avg24 * 0.5) sc += 2;
      }
      return sc;
    });
    // Watcom qsort is not stable; the remake breaks ties by slot (推测).
    const order = scores.map((sc, slot) => ({ sc, slot })).sort((a, b) => b.sc - a.sc || a.slot - b.slot);
    let pick = -1;
    for (let rank = 0; rank < order.length; rank++) {
      if (!order[rank].sc) continue;
      if (rng.rand() % 24 <= 12 - rank) { pick = order[rank].slot; break; }
    }
    if (pick < 0) return;
    const s = this.stocks[pick];
    const n = Math.min(Math.trunc(budget / s.price), s.turnQuota);
    if (n <= 0) return;
    const changed = this.buyMarket(p, pick, n);
    yield { t: 'fx', kind: 'stock-trade', p: p.id, data: { slot: pick, n, buy: true } };
    // Message box 「%s\n\n買進%s%d張」 1500 ms (rich4.asm:15335).
    yield* g.say(undefined, `${g.name(p.id)}\n\n買進${s.name}${n}張`);
    if (changed) yield { t: 'board' };
  }

  *aiTrade(p: Player): Flow {
    if (this.leveraged) { yield* this.aiGrid(p); return; }
    yield* this.aiBuy(p);
    if (this.g.over || !p.whoPlays) return;
    yield* this.aiSell(p);
  }

  /** Each player-slot's live grid (03 remake §11): the anchor, the rung step and the live leg. */
  grid: Record<string, { anchor: number; step: number; side: 'long' | 'short' }> = {};

  /**
   * The grid strategy the computers run on a leveraged market (03 remake §11, retuned 2026-10-31): every slot
   * keeps an anchor; the rung step is ~80% of the market's daily band scaled by the token's temperament and
   * the computer level (簡單 1.5×, 中級 1.0×, 困難 0.7×) — the harder, the finer the grid and the lever.
   * Below the anchor the grid buys a rung at a time with a fixed margin slice; above it a long is banked (a
   * 困難 computer banks in halves); an empty grid shorts the peaks. The crash guards for the instruments
   * that halve or drop 60%: the grid never averages below the crash floor (45% on the coins, 30% on stocks),
   * and the leg itself is cut at the stop drop — always inside its own liquidation line — after which the
   * anchor re-centres and the grid trades the new range. One trade a turn, like the original's computer.
   */
  private *aiGrid(p: Player): Flow {
    const g = this.g, PI = g.priceIndex, lvl = g.aiLevel(p);
    if (!this.open()) return;
    if (p.bank <= 20000 * PI) return;
    const precision = [1.5, 1, 0.7][lvl], slice = Math.trunc(p.bank * [0.1, 0.07, 0.05][lvl]);
    // each computer has its own risk appetite around the level's lever (±2) — the grid levers differ per AI
    const lever = Math.max(1, Math.min(10, [2, 4, 6][lvl] + ((p.character * 5 + p.id * 3) % 5) - 2));
    for (let slot = 0; slot < this.stocks.length; slot++) {
      const s = this.stocks[slot];
      const pos = this.positions[p.id]?.[slot];
      // the market's volume gates openings/adds only: a standing position can always be closed
      if (s.suspendDays || (!pos && (!s.turnQuota || !s.floatPool))) continue;
      const band = this.crypto ? 0.08 : this.g.board.stockNames ? 0.03 : 0.04;
      const vol = Math.max(0.6, Math.min(1.2, 0.5 + s.volatility / 3));
      const step = Math.max(0.015, band * 0.8 * vol * precision);
      const k = `${p.id}:${slot}`;
      // (Re)seed or re-centre: an empty grid follows a 4-rung drift either way. A held leg never re-anchors by
      // drift — its bank at +step and its crash stop at −stopDrop each re-anchor in their own branch, so no
      // re-anchor can preempt a signal (the 2026-10-31 lesson: the drift reset once swallowed the stop).
      let book = this.grid[k];
      const drift = book ? Math.abs(s.price / book.anchor - 1) : Infinity;
      if (!book || book.step !== step || (!pos && drift > 4 * step)) {
        this.grid[k] = { anchor: s.price, step, side: pos?.dir === -1 ? 'short' : 'long' };
        book = this.grid[k];
      }
      const rel = s.price / book.anchor - 1;
      const crash = this.crypto ? 0.45 : 0.3;          // the floor the grid stops averaging into
      const stopDrop = Math.min(crash, 0.8 / lever);   // the leg's stop, always inside its liquidation line
      let acted: boolean | null = null, word = '';
      if (pos && pos.dir === 1) {
        if (rel >= step) { // bank the rung on the way up
          const n = lvl === 2 ? Math.max(1, Math.trunc(pos.qty / 2)) : pos.qty;
          this.closePos(p, slot, n); acted = true; word = '平多';
          if (!this.positions[p.id][slot]) { book.side = 'long'; book.anchor = s.price; }
        } else if (rel <= -stopDrop) { // the crash guard: cut before the liquidation line, re-centre after
          this.closePos(p, slot, pos.qty); acted = true; word = '止损';
          book.anchor = s.price;
        } else if (rel <= -step && rel >= -crash && pos.margin < Math.trunc(p.bank * 0.35)) { // add below, never into the abyss
          const n = Math.max(1, Math.min(Math.trunc((slice * lever) / s.price), s.turnQuota, s.floatPool));
          if (n > 0) this.openPos(p, slot, n, 1, lever);
          acted = !!this.positions[p.id][slot];
          word = '加多';
        }
      } else if (pos && pos.dir === -1) { // the short leg symmetric
        if (rel <= -step) {
          const n = lvl === 2 ? Math.max(1, Math.trunc(pos.qty / 2)) : pos.qty;
          this.closePos(p, slot, n); acted = true; word = '平空';
          if (!this.positions[p.id][slot]) { book.side = 'long'; book.anchor = s.price; }
        } else if (rel >= stopDrop) {
          this.closePos(p, slot, pos.qty); acted = true; word = '止损';
          book.anchor = s.price;
        } else if (rel >= step && rel <= crash && pos.margin < Math.trunc(p.bank * 0.35)) {
          const n = Math.max(1, Math.min(Math.trunc(((slice * lever * 0.7) / s.price) | 0), s.turnQuota, s.floatPool));
          if (n > 0) this.openPos(p, slot, n, -1, lever);
          acted = !!this.positions[p.id][slot];
          word = '回補';
        }
      } else {
        if (rel <= -step) { // an empty grid buys the dip
          const n = Math.max(1, Math.min(Math.trunc((slice * lever) / s.price), s.turnQuota, s.floatPool));
          if (n > 0) this.openPos(p, slot, n, 1, lever);
          acted = !!this.positions[p.id][slot];
          word = '買入';
          if (acted) book.side = 'long';
        } else if (rel >= step) { // and shorts the peak
          const n = Math.max(1, Math.min(Math.trunc(((slice * lever * 0.7) / s.price) | 0), s.turnQuota, s.floatPool));
          if (n > 0) this.openPos(p, slot, n, -1, lever);
          acted = !!this.positions[p.id][slot];
          word = '做空';
          if (acted) book.side = 'short';
        }
      }
      if (!acted) continue;
      yield { t: 'fx', kind: 'stock-trade', p: p.id, data: { slot, n: 0, buy: word === '買入' || word === '加多' || word === '回補', grid: true } };
      yield* this.g.say(undefined, `${g.name(p.id)}${NL2}網格交易 ${s.name}：${word}（${lever}×構滍）`);
      break; // one trade a turn, like the original's computer
    }
    yield* this.aiSell(p);
  }

  /** fcn_0042c79f (03 §9.3); per bug decision #5 the holding ratio is own / all players' shares. */
  *aiSell(p: Player): Flow {
    const g = this.g, PI = g.priceIndex;
    const urgent = p.loan > 0 && p.loanDue !== 0 && daysBetween(g.date, p.loanDue) <= 6 && p.bank + p.cash < p.loan;
    if (!urgent && g.rng.rand() % 3 !== 0) return;
    if (!this.open()) return;
    for (;;) {
      let best = -1, bestScore = 0;
      for (let slot = 0; slot < this.stocks.length; slot++) {
        const s = this.stocks[slot], h = this.holdings[p.id][slot];
        const pos = this.positions[p.id]?.[slot];
        if (!(h.shares || pos) || s.suspendDays || this.mkTrend(s) === Trend.LimitDown) continue;
        const sc = this.sellScore(p, slot, urgent, PI);
        if (sc > bestScore) { best = slot; bestScore = sc; }
      }
      if (best < 0) return;
      const s = this.stocks[best], pos = this.positions[p.id]?.[best];
      const n = Math.max(this.holdings[p.id][best].shares, pos?.qty ?? 0);
      if (pos) this.closePos(p, best, n); else this.sell(p, best, n, true);
      yield { t: 'fx', kind: 'stock-trade', p: p.id, data: { slot: best, n, buy: false } };
      // Message box 「%s\n\n賣出%s%d張」 1500 ms (rich4.asm:16035).
      yield* g.say(undefined, `${g.name(p.id)}\n\n賣出${s.name}${n}張`);
      if (!(urgent && p.bank + p.cash < p.loan * 1.1)) return;
    }
  }

  private sellScore(p: Player, slot: number, urgent: boolean, PI: number): number {
    const g = this.g, s = this.stocks[slot], h = this.holdings[p.id][slot];
    const c = this.companyOf(slot);
    const cost = h.avgCost;
    let sc = 0;
    if (c) {
      const all = g.players.reduce((a, q) => a + this.holdings[q.id][slot].shares, 0);
      const ratio = all ? h.shares / all : 0;
      const today = dayOf(g.date);
      const me = p.id + 1;
      const isCtl = c.controller === me;
      const nav = Math.trunc(c.value / 10000);
      const avgProfit = g.monthsElapsed ? Math.trunc(c.fundB / g.monthsElapsed) : c.fundB;
      if (c.fundA <= -10000 * PI && ratio > 0.6 && today > 10 && today < 15) sc += 3;
      if (c.fundA <= -6000 * PI && s.price > cost * 1.2 && !isCtl && today > 8 && today < 15) sc += 2;
      if (avgProfit <= 10000 * PI && nav * 2 <= s.price && s.price > cost * 1.3 && ratio < 0.4) sc += 1;
      if (c.controller && !isCtl) {
        const ctl = this.holdings[c.controller - 1][slot].shares;
        if (h.shares + s.floatPool + c.freeShares < ctl && c.fundA <= 0 && s.price >= cost * 1.5) sc += 1;
      }
      if (s.price > nav * 2 && s.price > cost * 2 && s.price < s.prevClose && !isCtl) sc += 2;
      if (s.price > nav * 3 && s.price > cost * 3 && s.price < s.prevClose && isCtl) sc += 2;
      if (urgent) sc += 1;
    } else {
      const pr = cost ? s.price / cost : 0;
      const low = this.historyLow(slot);
      const avg24 = this.recentAverage(slot, 24), avg6 = this.recentAverage(slot, 6);
      const money = p.cash + p.bank;
      if (pr > 1.6 && s.momentum < 1) sc += 2;
      if (s.price > low * 8 && low * 8 > cost * 1.25) sc += 2;
      if (avg24 > avg6 && s.price < s.prevClose) sc += 2;
      if (pr >= 2) sc += Math.trunc((pr - 2) / 0.5 + 1);
      if (money < 30000 * PI && pr > 0) sc += Math.trunc(pr / 0.5 + 1);
      if (money < 16000 * PI && pr > 0) sc += Math.trunc(pr / 0.5 + 1);
      if (urgent) sc *= 2;
    }
    return sc;
  }

  /** Red card choice fcn_00420055 (03 §9.5): own stock with the largest position cost, not suspended or limit up. */
  aiRedCardSlot(p: Player): number {
    if (!this.open()) return -1;
    let best = -1, bestCost = 0;
    this.holdings[p.id].forEach((h, slot) => {
      const s = this.stocks[slot];
      if (!h.shares || s.suspendDays || this.mkTrend(s) === Trend.LimitUp) return;
      const cost = h.shares * h.avgCost;
      if (best < 0 || cost > bestCost) { best = slot; bestCost = cost; }
    });
    return best;
  }

  /**
   * Black card choice fcn_004200ea (03 §9.5): B = the most hostile player's biggest position (any stock),
   * else A = the biggest linked position of the opponent controlling most companies; never a stock the user holds.
   */
  aiBlackCardSlot(p: Player): { slot: number; target: number } | null {
    if (!this.open()) return null;
    const g = this.g;
    const others = g.players.filter(q => q.id !== p.id && q.whoPlays !== 0);
    const pickFor = (q: Player | undefined, linkedOnly: boolean) => {
      if (!q) return -1;
      let best = -1, bestCost = 0;
      this.holdings[q.id].forEach((h, slot) => {
        const s = this.stocks[slot];
        if (!h.shares || s.suspendDays || this.holdings[p.id][slot].shares || this.mkTrend(s) === Trend.LimitDown) return;
        if (linkedOnly && !s.companyId) return;
        const cost = h.shares * h.avgCost;
        if (best < 0 || cost > bestCost) { best = slot; bestCost = cost; }
      });
      return best;
    };
    let hostile: Player | undefined;
    for (const q of others) if (p.hostility[q.id] > 0 && (!hostile || p.hostility[q.id] > p.hostility[hostile.id])) hostile = q;
    const b = pickFor(hostile, false);
    if (b >= 0) return { slot: b, target: hostile!.id };
    let tycoon: Player | undefined, most = 0;
    for (const q of others) {
      const n = g.board.companies.filter(c => c.controller === q.id + 1).length;
      if (n > most) { tycoon = q; most = n; }
    }
    const a = pickFor(tycoon, true);
    return a >= 0 ? { slot: a, target: tycoon!.id } : null;
  }

  // ---------------------------------------------------------------- human market (03 §5.2-§5.3)

  /** Human's stock market screen from the turn menu. */
  /**
   * The leveraged trade flow: opposite action closes the held leg, the same side opens / adds. The 涨跌停/跌停
   * gates of the spot market do not apply here; the market's own band (and the daily 追保 / 爆仓 checks) are
   * the risk.
   */
  private *marginTrade(p: Player, slot: number, buy: boolean, count: number, shown: number, lev: number): Flow {
    const g = this.g, s = this.stocks[slot];
    const dir: 1 | -1 = buy ? 1 : -1;
    const pos = this.positions[p.id]?.[slot];
    if (pos && pos.dir !== dir) {
      // Closing: the opposite action closes the held leg.
      const n = Math.max(1, Math.min(pos.qty, Math.trunc(count)));
      this.closePos(p, slot, n);
      yield { t: 'fx', kind: 'stock-trade', p: p.id, data: { slot: shown, n, buy, close: true } };
      return;
    }
    const L = pos ? pos.leverage : Math.max(1, Math.min(10, Math.trunc(lev)));
    // Room in SHARES (2026-11-03 fix: the turn quota is a share count — the old code divided it by the price
    // again, so a rich player on a small-quota instrument (BTC 1,279 shares / 88,003 yuan) read 0 room and was
    // denied with a bogus 保證金需… message although the margin was well within the deposit).
    const want = Math.trunc(count) || 0;
    const afford = Math.trunc(Math.trunc(p.bank * L) / s.price); // the deposit's leveraged buying power, in shares
    const room = Math.min(s.turnQuota, afford); // adds included: the panel's cap must match the engine's
    const n = Math.max(0, Math.min(want, room));
    if (!(n > 0)) {
      if (want <= 0) return;
      if (!pos && s.turnQuota <= 0) yield* g.say(p.id, '無法開倉：今日交易量已用完');
      else yield* g.say(p.id, `無法開倉：保證金需 ${Math.trunc((want * s.price) / L)}元（存款 ${Math.trunc(p.bank)}元）`);
      return;
    }
    if (!this.openPos(p, slot, n, dir, L)) {
      yield* g.say(p.id, `無法開倉：保證金需 ${Math.trunc((n * s.price) / L)}元（存款 ${Math.trunc(p.bank)}元）`);
      return;
    }
    yield { t: 'fx', kind: 'stock-trade', p: p.id, data: { slot: shown, n, buy, lev: L } };
  }

  /**
   * The daily margin look-over (03 remake §10), after each day's settlement: at 75% of the required initial
   * margin a 追加保证金 reminder flags the position; at 5% it is liquidated (爆仓) and whatever remains goes
   * back to the bank — losing no more than the margin. The old spot holdings of an older save are untouched.
   */
  private *marginStatus(): Flow {
    if (!this.leveraged) return;
    for (const p of this.g.players) {
      if (!p.whoPlays || p.bankrupt) continue;
      for (let slot = 0; slot < this.stocks.length; slot++) {
        const pos = this.positions[p.id]?.[slot];
        if (!pos) continue;
        const s = this.stocks[slot];
        // The exchanges' terms: the margin rate (equity / notional) sinks as the price moves against the leg;
        // half the initial margin is the 追加保证金 line, the maintenance rate is the liquidation line.
        const eq = this.equityOf(pos, s.price), notional = this.notional(pos);
        const callLine = notional * 0.5 / pos.leverage, liqLine = notional * MMR;
        pos.call = eq <= callLine;
        if (pos.call) {
          // 追加保證金 is the owner's private affair: a ticker line for their log, not a public announcement.
          yield { t: 'ticker', map: this.g.settings.mapId, day: this.g.daysElapsed, p: p.id, kind: 'margin', important: true,
            text: `${s.name}${pos.dir === 1 ? '多頭' : '空頭'}保證金告急（保證金率 ${(this.marginRate(pos, s.price) * 100).toFixed(1)}%），請追加保證金` };
        }
        if (eq <= liqLine) {
          const left = Math.max(0, Math.trunc(eq));
          // The player's loss is the deposited margin minus what returns to the bank (2026-11-12 fix: the old
          // notional x MMR - left was the gap below the maintenance line — a 5x leg reported a ~0 loss).
          const loss = Math.max(0, Math.trunc(pos.margin - left));
          p.bank += left;
          this.positions[p.id][slot] = undefined;
          yield { t: 'fx', kind: 'stock-liquidated', p: p.id, data: { slot, dir: pos.dir, left, loss } };
          yield* this.g.say(p.id, `${s.name}${pos.dir === 1 ? '多頭' : '空頭'}爆倉！${NL2}標記價已觸及強平價 ${formatPrice(pos.liq)}，強制平倉，${left}元退回存款（虧損 ${loss}元）`);
        }
      }
    }
  }

  /** Push money from the bank into a margin position (the holding panel's 補足 button). */
  topUp(p: Player, slot: number, amount: number): boolean {
    const pos = this.positions[p.id]?.[slot];
    if (!pos || !(amount > 0) || p.bank < amount) return false;
    p.bank -= amount;
    pos.margin += amount;
    pos.liq = this.liquidationPrice(pos);
    pos.call = false;
    return true;
  }

  /** What the position may pay out: everything above the initial margin (a withdrawal never lands at a call). */
  withdrawable(pos: MarginPos, price: number): number {
    return Math.max(0, Math.trunc(this.equityOf(pos, price) - this.requiredMargin(pos)));
  }

  /** Pull margin from the position back to the bank: the liquidation line moves closer (or the call returns). */
  withdraw(p: Player, slot: number, amount: number): boolean {
    const pos = this.positions[p.id]?.[slot], s = this.stocks[slot];
    if (!pos || !s || !(amount > 0)) return false;
    if (Math.trunc(amount) > this.withdrawable(pos, s.price)) return false;
    pos.margin -= Math.trunc(amount);
    p.bank += Math.trunc(amount);
    pos.liq = this.liquidationPrice(pos);
    pos.call = this.equityOf(pos, s.price) <= this.notional(pos) * 0.5 / pos.leverage;
    return true;
  }

  *humanMarket(p: Player): Flow {
    const g = this.g;
    // 大富豪模式: one screen for the five cities' 60 stocks (docs/rules/17 §5).
    if (g.world) { yield* g.world.hooks.humanMarket(p, g); return; }
    if (!this.open()) { yield* g.say(undefined, '本日休市'); return; }
    for (;;) {
      if (g.over || !p.whoPlays) return;
      // The screen shows the tables and the company pages; each trade it asks for is checked here (03 §5.2-5.3).
      const a = (yield ask({ t: 'stock-market', p: p.id })) as { slot: number; buy?: boolean; n?: number; lev?: number; topup?: number; withdraw?: number } | number | undefined;
      if (!a || typeof a !== 'object') return;
      const slot = a.slot;
      if (!Number.isInteger(slot) || slot < 0 || slot >= this.stocks.length) return;
      if (typeof a.topup === 'number') { // the holding panel's 追加保证金
        if (this.topUp(p, slot, a.topup)) { yield { t: 'fx', kind: 'stock-margin-topup', p: p.id, data: { slot } }; }
        else yield* g.say(p.id, '存款不足，無法補足保證金！');
        continue;
      }
      if (typeof a.withdraw === 'number') { // pulling margin back to the bank; the liquidation line moves closer
        if (this.withdraw(p, slot, a.withdraw)) { yield { t: 'fx', kind: 'stock-margin-topup', p: p.id, data: { slot, op: 'sub' } }; }
        else yield* g.say(p.id, '可提取保證金不足，無法提取！');
        continue;
      }
      yield* this.trade(p, slot, !!a.buy, a.n ?? 0, slot, a.lev ?? 1);
    }
  }

  /**
   * One trade the market screen asked for (03 §5.2-5.3); `shown`: the slot the screen knows it by. For a plain
   * spot market this is the original buy / sell; for a leveraged market (03 remake §10) buy = (more) long,
   * sell = (more) short, `lev` = 1..10 only counts for a fresh opening (the position's leverage is locked).
   */
  *trade(p: Player, slot: number, buy: boolean, count: number, shown = slot, lev = 1): Flow {
    const g = this.g, s = this.stocks[slot], h = this.holdings[p.id][slot];
    if (s.suspendDays) return;
    if (this.leveraged) { yield* this.marginTrade(p, slot, buy, count, shown, lev); return; }
    if (buy) {
      if (this.mkTrend(s) === Trend.LimitUp) { yield* g.say(p.id, '漲停無法買進！'); return; }
      const n = Math.min(s.turnQuota, Math.trunc(p.bank / s.price), Math.trunc(count));
      if (!(n > 0)) return;
      this.buyMarket(p, slot, n);
      yield { t: 'fx', kind: 'stock-trade', p: p.id, data: { slot: shown, n, buy: true } };
    } else {
      if (this.mkTrend(s) === Trend.LimitDown) { yield* g.say(p.id, '跌停無法賣出！'); return; }
      const n = Math.min(h.shares, Math.trunc(count));
      if (!(n > 0)) return;
      this.sell(p, slot, n, true);
      yield { t: 'fx', kind: 'stock-trade', p: p.id, data: { slot: shown, n, buy: false } };
    }
  }

  // ---------------------------------------------------------------- company tiles (02 §5, 03 §5.5, §7)

  /** Stopping on a company tile: controller services, fees, then the share subscription offer (02 §5, 03 §5.5). */
  *landOnCompany(p: Player, c: Company): Flow {
    const g = this.g;
    if (c.controller === p.id + 1) yield* this.controllerService(p, c);
    else if (c.controller) yield* this.companyFee(p, c);
    if (g.over || !p.whoPlays) return;
    yield* this.subscribe(p, c);
  }

  /** Controller's own visit (02 §5): insurance days for free, or the construction company's free building. */
  private *controllerService(p: Player, c: Company): Flow {
    const g = this.g;
    if (c.category === 4) {
      const n = yield* g.spin(WheelKind.insurance, c.name);
      p.insurance = (p.insurance + n) & 0x7f;
      yield* g.say(p.id, `免費增加保險${n}天`);
    } else if (c.category === 11) {
      const ref = yield* this.pickBuilding(p, '選擇免費加蓋的地產');
      if (!ref) return;
      const first = yield* this.freeFloor(p, ref);
      let level = first;
      if (first >= 0 && !(first & 0x80)) { const second = g.freeUpgrade(ref); if (second >= 0) level = second; }
      // core_actions:1810-1861: the robot crew Data#553; when the first floor topped it out, the owner's event[15]
      // and fireworks (only the first call's 0x80 is tested, so a top reached by the second floor stays quiet).
      // The remake (REMAKE_FREE_BUILD): fireworks whenever the floors top it out.
      const top = level >= 0 && (level & 0x80) !== 0 && ((first & 0x80) !== 0 || g.remakeFreeBuild);
      if (level >= 0) { yield { t: 'fx', kind: 'free-upgrade', p: p.id, data: { ref, level: level & 0x7f, top, own: true } }; yield { t: 'board' }; }
    }
  }

  /** Someone else's company (02 §5): fee by category into the company funds, through the payment chain. */
  private *companyFee(p: Player, c: Company): Flow {
    const g = this.g, PI = g.priceIndex;
    const idx = g.board.companies.indexOf(c) + 1;
    const boss = g.name(c.controller - 1);
    const fee = FEE_NAME[c.category] ?? '過路費';
    const price = c.baseFee;
    let amount = 0, travel = 0;
    switch (c.category) {
      case 1: {
        travel = yield* g.spin(WheelKind.travel, c.name);
        if (!travel) { yield* g.say(p.id, '不用出國！'); break; }
        amount = price * travel * PI;
        yield* g.say(p.id, `出國旅遊${travel}天\n\n${fee}${amount}元`);
        break;
      }
      case 3: amount = price * g.daysElapsed; break;
      case 4: {
        const n = yield* g.spin(WheelKind.insurance, c.name);
        p.insurance = (p.insurance + n) & 0x7f;
        amount = price * n * PI;
        yield* g.say(p.id, `保險${n}天\n\n${fee}${amount}元`);
        break;
      }
      case 5: case 6: {
        const v = p.traffic & 3;
        amount = v ? price * (1 << (v - 1)) * g.diceTotal * PI : 0;
        break;
      }
      case 11: {
        const ref = yield* this.pickBuilding(p, '選擇要加蓋的地產');
        const level = ref ? yield* this.freeFloor(p, ref) : -1;
        if (ref && level >= 0) {
          // core_actions:2014-2043: the robot crew Data#553, fireworks at the top, no line.
          yield { t: 'fx', kind: 'free-upgrade', p: p.id, data: { ref, level: level & 0x7f, top: (level & 0x80) !== 0, own: false } };
          yield { t: 'board' };
        }
        amount = ref ? (ref < 4000 ? g.board.lands[ref - 2001].price : g.board.facilities[ref - 4001].price) * PI : 1000 * PI;
        break;
      }
      case 12: amount = price * g.diceTotal * PI; break;
    }
    if (amount > 0) {
      yield* g.say(undefined, c.category === 12 ? `幫主${boss} 請付${amount}元${fee}` : `董事長${boss} 請付${amount}元${fee}`);
      const paid = yield* this.collect(p, c.controller - 1, amount, fee);
      if (paid) yield* g.transfer(paid.payer, 100 + idx, paid.amount, 0, fee);
    }
    if (travel && p.whoPlays && !g.over) yield* g.vanish(p, travel, false);
  }

  /** The core's payment chain for company fees (02 §5): payer's god, passive cards, then Death/chest paying instead. */
  private *collect(p: Player, ownerId: number, total: number, fee: string): Flow<{ payer: number; amount: number } | null> {
    const g = this.g;
    let amount = g.godModify(p, total);
    if (amount !== total) yield* g.say(p.id, g.rules?.godFeeText?.(g, p, fee, total, amount) ?? (amount === 0 ? `${fee}免付！` : `${fee}改為${amount}元`));
    if (amount === 0) return null;
    const r = yield* g.cards.tollPassive(p, ownerId, amount);
    let payer = r.payer;
    amount = r.amount;
    if (amount === 0) return null;
    const death = g.objects.deathPayer(g.players[payer]);
    if (death !== null) { yield* g.say(undefined, `死神顯靈\n\n由${g.name(death)}賠償${fee}`); payer = death; }
    return { payer, amount };
  }

  /**
   * Properties the player can have built up for free: own lots below the top and own large plots — an empty one
   * (built first) or a facility below its type's top, on every map (REMAKE_FREE_BUILD; off: built facilities of the
   * original types and 大富翁城's halls only).
   */
  upgradableRefs(p: Player): number[] {
    const me = p.id + 1, refs: number[] = [], all = this.g.remakeFreeBuild;
    this.g.board.lands.forEach((l, i) => { if (l.owner === me && (l.chain ? l.level < 1 : l.level < 5)) refs.push(2001 + i); });
    this.g.board.facilities.forEach((f, i) => {
      if (f.owner === me && (all ? f.level === 0 || f.level < FACILITY_TOP[f.type] : f.level >= 1 && f.level < FACILITY_MAX[f.type])) refs.push(4001 + i);
    });
    return refs;
  }

  /** One free floor (fcn_0040b110): an empty large plot is built first (the facility type asked as for 機器工人). */
  private *freeFloor(p: Player, ref: number): Flow<number> {
    const f = ref > 4000 && ref < 6000 ? this.g.board.facilities[ref - 4001] : undefined;
    if (f && f.level === 0 && this.g.remakeFreeBuild) return yield* this.g.buildEmptyPlot(p, f);
    return this.g.freeUpgrade(ref);
  }

  /**
   * Building target for the construction company, from `upgradableRefs` for both (the original lets a human pick any
   * lot or large plot, select flags 0x2090086, and the computer's fcn_0040b455 takes its own lots and large plots,
   * empty ones too): a human taps one, the computer takes the one whose toll/fee at its current level is highest
   * (the original rates a large plot by its price +0x22, docs/rules/02 §5). Returns the ref or 0.
   */
  private *pickBuilding(p: Player, title: string): Flow<number> {
    const g = this.g;
    const refs = this.upgradableRefs(p);
    if (!refs.length) return 0;
    if (g.isHuman(p)) {
      // One choice per property, glowing on the building itself (lots and large plots alike, as for 機器工人).
      const at = new Map<number, number>();
      for (const n of g.board.nodes) if (refs.includes(n.ref) && !at.has(n.ref)) at.set(n.ref, n.id);
      const id = Number(yield ask({ t: 'pick-node', p: p.id, title, nodes: [...at.values()], cancellable: true, plot: true }));
      const node = id > 0 ? g.board.nodes.find(n => n.id === id) : undefined;
      return node && refs.includes(node.ref) ? node.ref : 0;
    }
    let best = 0, bestScore = -1;
    for (const ref of refs) {
      const score = ref < 4000 ? g.board.lands[ref - 2001].tolls[g.board.lands[ref - 2001].level] : g.board.facilities[ref - 4001].fees[g.board.facilities[ref - 4001].level];
      if (score > bestScore) { best = ref; bestScore = score; }
    }
    return best;
  }

  /** Share subscription fcn_0041d1a9 (03 §5.5): cash, trunc(valuation / 10000) each, at most 1000 per visit. */
  private *subscribe(p: Player, c: Company): Flow {
    const g = this.g;
    if (p.sleepwalk || !p.whoPlays || c.freeShares <= 0 || this.slotOf(c) < 0) return;
    const unit = Math.trunc(c.value / 10000);
    if (unit <= 0) return;
    const max = Math.min(Math.trunc(p.cash / unit), 1000, c.freeShares);
    let n: number;
    if (g.isHuman(p)) {
      if (max <= 0) return;
      const yes = (yield ask({ t: 'yesno', p: p.id, kind: 'subscribe', text: `${c.name}\n\n每股售價${unit}\n\n是否認購股份？`, price: unit })) as boolean;
      if (!yes) return;
      n = Math.trunc(Number(yield ask({ t: 'amount', p: p.id, title: `認購${c.name}`, text: `每股${unit}元`, min: 0, max, step: 1 })));
      n = n > 0 ? Math.min(n, max) : 0;
    } else {
      const reserve = Math.trunc(g.fund * 0.3) * g.priceIndex;
      n = p.cash - reserve > 0 ? Math.min(max, Math.trunc((p.cash - reserve) / unit)) : 0;
    }
    if (n <= 0) return;
    let changed: boolean;
    if (this.leveraged && !g.isHuman(p)) {
      // the computers subscribe into a 1× position on the leveraged markets (the user 2026-10-31: an AI should
      // never hold a bare un-leveraged stake) — the primary issue keeps its own freeShares accounting
      c.freeShares -= n;
      let pos = this.positions[p.id]?.[c.stockSlot];
      const margin = Math.trunc(n * unit);
      if (pos) { pos.entry = f32((pos.entry * pos.qty + unit * n) / (pos.qty + n)); pos.qty += n; pos.margin += margin; }
      else { pos = { dir: 1, qty: n, leverage: 1, entry: unit, margin, call: false, liq: 0 }; this.positions[p.id][c.stockSlot] = pos; }
      pos.liq = this.liquidationPrice(pos);
      p.bank -= margin;
      changed = this.rerank(p.id, c.stockSlot);
    } else changed = this.buyPrimary(p, c, n);
    yield { t: 'fx', kind: 'stock-subscribe', p: p.id, data: { slot: c.stockSlot, n, price: unit } };
    if (changed) {
      yield { t: 'board' };
      // Message box 1500 ms (core_actions:5033-5043).
      if (c.controller === p.id + 1) yield* g.say(undefined, c.category === 12 ? '恭喜您成為幫主！' : '恭喜您獲得經營權！');
    }
  }
}
