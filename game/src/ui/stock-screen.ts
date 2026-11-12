/**
 * The stock market (docs/rules/09 §7.6): the price table (red up / green down, limit badges) and the holdings
 * table, a company page with the price chart, figures and shareholders, and buy / sell. Each trade is handed
 * back to the rules (stocks.humanMarket), which checks it.
 */
import { CHARACTERS, playerName } from '../core/characters';
import type { Game } from '../core/game';
import { f32, formatPrice, MMR, Trend, trendOf, type Stock } from '../core/modules/stocks';
import type { World } from '../core/world';
import { audio, Sfx } from './audio';
import './fit-list.css';

const money = (n: number) => `$${Math.trunc(n).toLocaleString('en-US')}`;
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
/** A player's colour as text on the dark blue sheet: dark ones (忍太郎, 小丹尼) lifted halfway to white. */
const onBlue = (c: number) => {
  const r = c >> 16, g = (c >> 8) & 0xff, b = c & 0xff;
  if (0.299 * r + 0.587 * g + 0.114 * b > 110) return hex(c);
  const up = (v: number) => Math.round(v + (255 - v) * 0.55);
  return hex((up(r) << 16) | (up(g) << 8) | up(b));
};
const signed = (v: number, ref: number) => (v > 0 ? '+' : v < 0 ? '−' : '±') + formatPrice(Math.abs(v)).replace(/^/, '') + (ref ? '' : '');

/** Brand colours for the badges (the famous ones; every other name hashes to a steady hue). */
const BRAND: Record<string, string> = {
  BTC: '#f7931a', ETH: '#627eea', BNB: '#f3ba2f', XRP: '#23292f', SOL: '#9945ff', TRX: '#eb0029', AVAX: '#e84142',
  ZEC: '#f4b728', HYPE: '#0ecb81', DOGE: '#c2a633', XMR: '#ff6600', SUI: '#4da2ff', LINK: '#2a5ada', LEO: '#f5d014',
  ADA: '#0033ad', NEAR: '#00c08b', XLM: '#7d00ff', BCH: '#8dc351', LTC: '#345d9d', UNI: '#ff007a',
  台積電: '#d3002d', 聯發科: '#3a7d44', 台達電: '#c3002f', 鴻海: '#1a3a6b', 日月光投控: '#c8102e', 富邦金控: '#00655f',
  國泰人壽: '#00584a', 中國信託: '#c9a100', 遠東百貨: '#7a2f8f', 玉山金控: '#00863f', 台新金控: '#0d5eaf', 貴州茅台: '#b8332f',
  工商銀行: '#c7000b', 建設銀行: '#0058a8', 農業銀行: '#00965e', 中國銀行: '#a6093d', 中國石油: '#f26522', 中國移動: '#0085d0',
  招商銀行: '#d4000f', 中國平安: '#f26f21', 豐田汽車: '#eb0a1e', 三菱UFJ: '#e60012', 軟銀集團: '#8a8d8f', ＳＯＮＹ: '#191919',
  日立製作所: '#e60027', 花旗銀行: '#003b70', ＩＢＭ: '#1f70c1', 輝達: '#76b900', 蘋果: '#6e6e73', 微軟: '#00a4ef',
  谷歌: '#4285f4', 亞馬遜: '#ff9900', 特斯拉: '#cc0000', Meta: '#0668e1', 沃爾瑪: '#0071ce', 聯合健康: '#002677',
  波克夏: '#8b7355', 禮來: '#d52b1e', 美光科技: '#1b4da1', 博通: '#cc092f', 埃克森美孚: '#ce1126', Visa: '#1a1f71',
  黃金: '#c9a227', 咖啡: '#6f4e37', 原油: '#2f2f36', 白銀: '#aeb6c2', 銅: '#b87333', 天然氣: '#2e9bb5',
  小麥: '#d9a441', 玉米: '#e5b93c', 大豆: '#7a9c3f', 可可: '#7b3f00', 白糖: '#dfe4ea', 棉花: '#cfd8df',
  活牛: '#8b5a2b', 瘦肉豬: '#e8a0a8', 木材: '#a0713c', 鉑金: '#c9ccd4', 鈀金: '#a8adb8', 鎳: '#8f99a4',
  鋁: '#c3cad2', 鋅: '#8b97a3',
  三越百貨: '#7f1917', ＳＥＧＡ: '#0089cf', 瑞穗銀行: '#f39700', 明治安田生命: '#e8342a', 鹿島建設: '#d7143a',
  三井物產: '#004179', 伊藤忠商事: '#0b3d91', 三菱商事: '#c8161d', 東京海上: '#00549f', 基恩士: '#001e50', 東京威力科創: '#0a1f8f',
};
/** The commodity futures' marks (the city map's 商品期貨): self-contained 32×32 with their own background. */
const COMMODITY_ART: Record<string, string> = {
  黃金: '<rect width="32" height="32" fill="#8a6d1d"/><g fill="#ffd75e" stroke="#8a6d1d" stroke-width="1"><path d="M4 23 L8 15 L20 15 L24 23 Z"/><path d="M12 13 L16 6 L26 6 L29 13 Z" opacity=".92"/></g>',
  咖啡: '<rect width="32" height="32" fill="#4a3226"/><path d="M7 12 h15 v7 a7.5 7.5 0 0 1 -15 0 Z" fill="#e9d9c8"/><path d="M22 13 h3 a3.5 3.5 0 0 1 0 7 h-3.4" fill="none" stroke="#e9d9c8" stroke-width="2"/><path d="M11 9 c0-2 2-2 2-4 M16 9 c0-2 2-2 2-4" fill="none" stroke="#c9a227" stroke-width="1.8" stroke-linecap="round"/>',
  原油: '<rect width="32" height="32" fill="#26262a"/><path d="M16 4 C22 12 25 16.5 25 21 a9 9 0 1 1 -18 0 C7 16.5 10 12 16 4 Z" fill="#3a3a42" stroke="#5c5c66" stroke-width="1.6"/><path d="M16 10 C19 15 21 17.5 21 20.5 a5 5 0 1 1 -10 0 C11 17.5 13 15 16 10 Z" fill="#57575f"/>',
  白銀: '<rect width="32" height="32" fill="#6e7684"/><g fill="#eef1f6" stroke="#6e7684" stroke-width="1"><path d="M4 23 L8 15 L20 15 L24 23 Z"/><path d="M12 13 L16 6 L26 6 L29 13 Z" opacity=".92"/></g>',
  銅: '<rect width="32" height="32" fill="#8a4a1f"/><text x="16" y="22.5" font-size="14" font-weight="700" fill="#f7d9be" text-anchor="middle" font-family="Arial,sans-serif">Cu</text>',
  天然氣: '<rect width="32" height="32" fill="#0d3f52"/><path d="M16 3 C20 9 25 12 25 19 a9 9 0 1 1 -18 0 C7 13 12 10 13 5 C14 8 15 9 16 3 Z" fill="#37b6d8"/><path d="M16 13 C18 16 20.5 17.5 20.5 20.5 a4.5 4.5 0 1 1 -9 0 C11.5 18 14 16.5 16 13 Z" fill="#c8f2ff"/>',
  小麥: '<rect width="32" height="32" fill="#7c5a22"/><g stroke="#f0d791" stroke-width="1.8" fill="none" stroke-linecap="round"><path d="M16 28 V8"/><path d="M16 12 c-4-1-6-4-6-7 3 0 6 2 6 5 M16 12 c4-1 6-4 6-7 -3 0-6 2-6 5 M16 18 c-4-1-6-4-6-7 3 0 6 2 6 5 M16 18 c4-1 6-4 6-7 -3 0-6 2-6 5 M16 24 c-4-1-6-4-6-7 3 0 6 2 6 5 M16 24 c4-1 6-4 6-7 -3 0-6 2-6 5"/></g>',
  玉米: '<rect width="32" height="32" fill="#3f5a1e"/><ellipse cx="16" cy="17" rx="6.5" ry="11" fill="#f2c14e"/><g stroke="#d9a02f" stroke-width="1" fill="none"><path d="M16 7 v20 M11 10 c3 3 7 3 10 0 M10 15 c4 3 8 3 12 0 M10 20 c4 3 8 3 12 0 M11 25 c3-3 7-3 10 0"/></g><path d="M9 6 C5 8 5 13 9 15" fill="none" stroke="#5f8a2b" stroke-width="2"/>',
  大豆: '<rect width="32" height="32" fill="#33502a"/><path d="M8 26 C6 14 14 6 25 5 c1 12-6 21-17 21 Z" fill="#9ec26a"/><circle cx="14" cy="18" r="2.4" fill="#f4f1dd"/><circle cx="19" cy="13" r="2.4" fill="#f4f1dd"/><circle cx="21" cy="19" r="2.2" fill="#f4f1dd"/>',
  可可: '<rect width="32" height="32" fill="#3b2314"/><ellipse cx="16" cy="17" rx="7" ry="11.5" fill="#a5572e" transform="rotate(14 16 17)"/><g stroke="#6e3417" stroke-width="1.6" fill="none"><path d="M12 8 c-2 6-2 13 1 19 M16 7 c-1 7-1 14 0 20 M20 7 c1 7 1 14 0 20"/></g><path d="M16 5.5 v-2" stroke="#5f8a2b" stroke-width="2"/>',
  白糖: '<rect width="32" height="32" fill="#8c95a3"/><rect x="7" y="8" width="12" height="12" rx="1.5" transform="rotate(8 13 14)" fill="#fbfdff"/><rect x="13" y="14" width="12" height="12" rx="1.5" transform="rotate(-6 19 20)" fill="#eef3f8"/>',
  棉花: '<rect width="32" height="32" fill="#4c6b52"/><g fill="#f7fafc"><circle cx="12" cy="14" r="4.2"/><circle cx="20" cy="12" r="4.6"/><circle cx="16" cy="19" r="5"/><circle cx="23" cy="19" r="3.8"/></g><path d="M10 26 c4-3 10-3 14 0" fill="none" stroke="#8fbf9a" stroke-width="1.8"/>',
  活牛: '<rect width="32" height="32" fill="#5c3a1e"/><path d="M6 8 c3-2 6-1 8 1 M26 8 c-3-2-6-1-8 1" stroke="#e8dcc8" stroke-width="2.4" fill="none"/><ellipse cx="16" cy="18" rx="9" ry="8.5" fill="#8b5a2b"/><ellipse cx="16" cy="22" rx="5.5" ry="4" fill="#e8c9a8"/><circle cx="12.5" cy="15" r="1.4" fill="#241206"/><circle cx="19.5" cy="15" r="1.4" fill="#241206"/><circle cx="14" cy="22" r="1" fill="#b58a67"/><circle cx="18" cy="22" r="1" fill="#b58a67"/>',
  瘦肉豬: '<rect width="32" height="32" fill="#7c4a56"/><ellipse cx="16" cy="18" rx="10" ry="8.5" fill="#efb6c0"/><circle cx="12" cy="15" r="1.3" fill="#3a1420"/><circle cx="20" cy="15" r="1.3" fill="#3a1420"/><ellipse cx="16" cy="20" rx="4.2" ry="3.2" fill="#f7d4da"/><circle cx="14.5" cy="20" r="0.9" fill="#7c4a56"/><circle cx="17.5" cy="20" r="0.9" fill="#7c4a56"/><path d="M25 12 c2-1 4 0 4 2" stroke="#efb6c0" stroke-width="2" fill="none"/>',
  木材: '<rect width="32" height="32" fill="#4c3a22"/><g stroke="#3a2a14" stroke-width="1"><rect x="4" y="18" width="24" height="7" rx="2" fill="#b5834b"/><rect x="7" y="10" width="24" height="7" rx="2" fill="#c99a63"/></g><circle cx="9" cy="21.5" r="2" fill="#e0c296"/><circle cx="12" cy="13.5" r="2" fill="#ecd6ae"/>',
  鉑金: '<rect width="32" height="32" fill="#5a5c66"/><text x="16" y="22.5" font-size="14" font-weight="700" fill="#f2f3f7" text-anchor="middle" font-family="Arial,sans-serif">Pt</text>',
  鈀金: '<rect width="32" height="32" fill="#565b66"/><text x="16" y="22.5" font-size="14" font-weight="700" fill="#e9ecf2" text-anchor="middle" font-family="Arial,sans-serif">Pd</text>',
  鎳: '<rect width="32" height="32" fill="#4a5560"/><text x="16" y="22.5" font-size="14" font-weight="700" fill="#dfe6ee" text-anchor="middle" font-family="Arial,sans-serif">Ni</text>',
  鋁: '<rect width="32" height="32" fill="#6a7482"/><text x="16" y="22.5" font-size="14" font-weight="700" fill="#f4f7fb" text-anchor="middle" font-family="Arial,sans-serif">Al</text>',
  鋅: '<rect width="32" height="32" fill="#4f5a66"/><text x="16" y="22.5" font-size="14" font-weight="700" fill="#e6ecf4" text-anchor="middle" font-family="Arial,sans-serif">Zn</text>',
};

/** Currency glyphs for the coins that have one; the rest take a letter. */
const GLYPH: Record<string, string> = { BTC: '₿', ETH: 'Ξ', BNB: '◆', DOGE: 'Ð', LTC: 'Ł', XRP: '✕', XLM: '✦', LINK: '⬡' };

/**
 * The coins' own marks, drawn as little SVGs (font-safe: the game's font has no ₿/Ξ/⬡ glyphs). Each entry is the
 * inside of a 32×32 viewBox on the coin's brand colour; the badge() wrapper adds the round coin.
 */
const COIN_ART: Record<string, string> = {
  BTC: '<text x="16" y="23" font-size="19" font-weight="700" fill="#fff" text-anchor="middle" font-family="Arial,sans-serif" transform="rotate(-12 16 16)">B</text>',
  ETH: '<path d="M16 4 L24 16.2 L16 21.2 L8 16.2 Z" fill="#fff" opacity=".92"/><path d="M16 23.2 L8 17.9 L16 28 L24 17.9 Z" fill="#fff" opacity=".68"/>',
  BNB: '<g fill="#1e2026"><path d="M16 8.2 L19.2 11.4 L16 14.6 L12.8 11.4 Z"/><path d="M16 17.4 L19.2 20.6 L16 23.8 L12.8 20.6 Z"/><path d="M11.4 12.8 L14.6 16 L11.4 19.2 L8.2 16 Z"/><path d="M20.6 12.8 L23.8 16 L20.6 19.2 L17.4 16 Z"/><path d="M16 12.8 L19.2 16 L16 19.2 L12.8 16 Z" opacity="0"/><path d="M9.4 21.4 L11.6 23.6 L9.4 25.8 L7.2 23.6 Z"/><path d="M22.6 21.4 L24.8 23.6 L22.6 25.8 L20.4 23.6 Z"/></g>',
  XRP: '<path d="M8.5 7.5 h4.2 L16 11 l3.3-3.5 h4.2 l-5.4 6 v3 l5.4 8 h-4.2 L16 21.5 13.2 24.5 H9 l5.4-8 v-3 Z" fill="#fff"/>',
  SOL: '<defs><linearGradient id="solg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#00ffa3"/><stop offset="1" stop-color="#dc1fff"/></linearGradient></defs><g fill="url(#solg)"><path d="M9.5 8 h13.5 l-3.5 4.4 H6 Z"/><path d="M9.5 13.8 h13.5 l3.5 4.4 H6 Z" transform="translate(0,0)"/><path d="M9.5 19.6 h13.5 l-3.5 4.4 H6 Z"/></g>',
  TRX: '<path d="M6.5 8.5 L26 7.5 L14.5 26.5 Z" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/><path d="M6.5 8.5 L17.5 13.5 L14.5 26.5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/>',
  DOGE: '<text x="16" y="22.5" font-size="17" font-weight="700" fill="#fff" text-anchor="middle" font-family="Arial,sans-serif">Ð</text>',
  LTC: '<text x="16" y="23" font-size="19" font-weight="700" fill="#fff" text-anchor="middle" font-family="Arial,sans-serif">Ł</text>',
  XMR: '<path d="M6 24.5 V9.5 l10 9.5 10-9.5 v15 h-4.6 v-6.8 l-5.4 5 -5.4-5 v6.8 Z" fill="#fff"/>',
  ZEC: '<text x="16" y="23.5" font-size="19" font-weight="700" fill="#1e2026" text-anchor="middle" font-family="Arial,sans-serif">Z</text>',
  BCH: '<text x="16" y="23" font-size="19" font-weight="700" fill="#fff" text-anchor="middle" font-family="Arial,sans-serif" transform="rotate(-12 16 16)">B</text>',
  LINK: '<path d="M16 5.5 l8.7 5 v11 L16 26.5 7.3 21.5 v-11 Z" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>',
  ADA: '<g fill="#fff"><circle cx="16" cy="16" r="2.6"/><circle cx="16" cy="8.6" r="1.5"/><circle cx="16" cy="23.4" r="1.5"/><circle cx="9.6" cy="12.3" r="1.5"/><circle cx="22.4" cy="12.3" r="1.5"/><circle cx="9.6" cy="19.7" r="1.5"/><circle cx="22.4" cy="19.7" r="1.5"/><circle cx="11.5" cy="6.9" r="1"/><circle cx="20.5" cy="6.9" r="1"/><circle cx="11.5" cy="25.1" r="1"/><circle cx="20.5" cy="25.1" r="1"/></g>',
  NEAR: '<text x="16" y="23.5" font-size="19" font-weight="700" fill="#fff" text-anchor="middle" font-family="Arial,sans-serif">N</text>',
  XLM: '<g fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M6.5 21.5 C13 20 20 14.5 25.5 8.5"/><path d="M6.5 15.5 C13 14.5 20 9 25.5 3.5" opacity=".55"/></g>',
  UNI: '<text x="16" y="23.5" font-size="19" font-weight="700" fill="#fff" text-anchor="middle" font-family="Arial,sans-serif">U</text>',
  HYPE: '<text x="16" y="23.5" font-size="18" font-weight="700" fill="#0b3b40" text-anchor="middle" font-family="Arial,sans-serif">H</text>',
  SUI: '<path d="M16 3.5c6.2 7.2 9.4 10 9.4 15.2a9.4 9.4 0 1 1-18.8 0C6.6 13.5 9.8 10.7 16 3.5z" fill="#fff"/>',
  AVAX: '<path d="M16 7l11 19H5z" fill="#fff"/><rect x="26.4" y="12.5" width="5.2" height="13.4" fill="#fff"/>',
  LEO: '<text x="16" y="23.5" font-size="16" font-weight="700" fill="#f5d014" text-anchor="middle" font-family="Arial,sans-serif">LEO</text>',
};

/** The US companies' marks (the famous ones drawn; 32×32, self-contained with their own background). */
const US_ART: Record<string, string> = {
  C: '<rect width="32" height="32" fill="#003b70"/><path d="M7 11 c4-4.5 14-4.5 18 0" fill="none" stroke="#e8442d" stroke-width="2.6" stroke-linecap="round"/><text x="16" y="24.5" font-size="17" font-weight="700" fill="#fff" text-anchor="middle" font-family="Arial,sans-serif">C</text>',
  UNH: '<rect width="32" height="32" fill="#002677"/><text x="16" y="23.5" font-size="18" font-weight="700" fill="#ffc220" text-anchor="middle" font-family="Arial,sans-serif">U</text>',
  WMT: '<rect width="32" height="32" fill="#0071ce"/><g stroke="#ffc220" stroke-width="2.8" stroke-linecap="round"><path d="M16 7.5 v5.2"/><path d="M16 19.3 v5.2"/><path d="M8.9 11.6 l4.5 2.6"/><path d="M18.6 17.8 l4.5 2.6"/><path d="M23.1 11.6 l-4.5 2.6"/><path d="M13.4 17.8 l-4.5 2.6"/></g>',
  UAL: '<rect width="32" height="32" fill="#005daa"/><circle cx="16" cy="16" r="10.5" fill="none" stroke="#9ad2ff" stroke-width="1.4" opacity=".7"/><text x="16" y="23.5" font-size="18" font-weight="700" fill="#fff" text-anchor="middle" font-family="Arial,sans-serif">U</text>',
  F: '<rect width="32" height="32" fill="#003478"/><ellipse cx="16" cy="16" rx="12.5" ry="8.5" fill="none" stroke="#fff" stroke-width="2"/><text x="16" y="21.5" font-size="14" font-weight="700" font-style="italic" fill="#fff" text-anchor="middle" font-family="Arial,sans-serif">F</text>',
  IBM: '<rect width="32" height="32" fill="#1f70c1"/><text x="16" y="21.5" font-size="12.5" font-weight="700" fill="#fff" text-anchor="middle" font-family="Arial,sans-serif" letter-spacing="1">IBM</text>',
  NVDA: '<rect width="32" height="32" fill="#76b900"/><text x="16" y="23.5" font-size="18" font-weight="700" fill="#1a1a1a" text-anchor="middle" font-family="Arial,sans-serif">N</text>',
  AAPL: '<rect width="32" height="32" fill="#3a3a3c"/><path d="M20.4 10.2 c-1.3-.1-2.8.5-3.7.5 -1 0-2.3-.5-3.8-.5 -2.7 0-5.2 2.3-5.2 5.9 0 3.7 2.9 8.4 5 8.4 1 0 1.8-.7 3.1-.7 1.4 0 2 .7 3.1.7 2.2 0 4.8-4.4 4.9-5.6-1.7-.7-2.8-2.1-2.8-3.9 0-1.6.8-2.9 2.1-3.8-1-1.1-2.3-1.6-2.7-1.7Z" fill="#fff"/><path d="M19.1 6.8 c.2 1-.3 2.1-1 2.9-.6.8-1.7 1.3-2.6 1.2-.1-1 .4-2.1 1-2.8.7-.8 1.8-1.3 2.6-1.3Z" fill="#fff"/>',
  MSFT: '<rect width="32" height="32" fill="#fff"/><rect x="6" y="6" width="9.4" height="9.4" fill="#f25022"/><rect x="16.6" y="6" width="9.4" height="9.4" fill="#7fba00"/><rect x="6" y="16.6" width="9.4" height="9.4" fill="#00a4ef"/><rect x="16.6" y="16.6" width="9.4" height="9.4" fill="#ffb900"/>',
  GOOGL: '<rect width="32" height="32" fill="#fff"/><text x="16" y="23" font-size="19" font-weight="700" fill="#4285f4" text-anchor="middle" font-family="Arial,sans-serif">G</text>',
  AMZN: '<rect width="32" height="32" fill="#232f3e"/><text x="16" y="17.5" font-size="16" font-weight="700" fill="#fff" text-anchor="middle" font-family="Arial,sans-serif">a</text><path d="M7.5 20.5 c5.5 3.8 12.5 3.8 17 -.5" fill="none" stroke="#ff9900" stroke-width="2.4" stroke-linecap="round"/><path d="M24.5 20 l.8-3.2 -3 1.4 Z" fill="#ff9900"/>',
  AVGO: '<rect width="32" height="32" fill="#cc092f"/><path d="M5.5 16.5 h6 l2.5-5.5 4.5 10.5 2.5-5 h5.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  TSLA: '<rect width="32" height="32" fill="#e31937"/><path d="M8.5 7.5 h15 v3.4 h-5.7 V25 h-3.6 V10.9 H8.5 Z" fill="#fff"/>',
  META: '<rect width="32" height="32" fill="#0668e1"/><circle cx="12.3" cy="16" r="5.2" fill="none" stroke="#fff" stroke-width="2.7"/><circle cx="19.7" cy="16" r="5.2" fill="none" stroke="#fff" stroke-width="2.7"/>',
  'BRK-B': '<rect width="32" height="32" fill="#4a6b8a"/><text x="16" y="21.5" font-size="11.5" font-weight="700" fill="#fff" text-anchor="middle" font-family="Arial,sans-serif">BRK</text>',
  LLY: '<rect width="32" height="32" fill="#d52b1e"/><text x="16" y="23.5" font-size="18" font-weight="700" font-style="italic" fill="#fff" text-anchor="middle" font-family="Arial,sans-serif">L</text>',
  MU: '<rect width="32" height="32" fill="#1b4da1"/><circle cx="16" cy="16" r="9.5" fill="none" stroke="#9ad2ff" stroke-width="1.2" opacity=".6"/><text x="16" y="22.5" font-size="16" font-weight="700" fill="#fff" text-anchor="middle" font-family="Arial,sans-serif">M</text>',
  XOM: '<rect width="32" height="32" fill="#ce1126"/><text x="16" y="23.5" font-size="19" font-weight="700" fill="#fff" text-anchor="middle" font-family="Arial,sans-serif">X</text>',
  AMD: '<rect width="32" height="32" fill="#111"/><text x="16" y="21.5" font-size="11" font-weight="700" fill="#fff" text-anchor="middle" font-family="Arial,sans-serif" letter-spacing="1">AMD</text>',
  V: '<rect width="32" height="32" fill="#1a1f71"/><text x="16" y="24" font-size="20" font-weight="700" font-style="italic" fill="#fff" text-anchor="middle" font-family="Arial,sans-serif">V</text>',
};

/** A stock's little logo: coins get their round SVG mark, companies a brand-coloured square with the leading letter. */
const badgeOf = (name: string): { bg: string; ch: string } => {
  const bg = BRAND[name] ?? `hsl(${[...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7)} 55% 40%)`;
  const ch = GLYPH[name] ?? (/^[A-Za-z]+$/.test(name) ? name[0] : name[0]);
  return { bg, ch };
};
const badge = (name: string, big = false) => {
  const art = COIN_ART[name];
  if (art) return `<i class="stk-badge coin${big ? ' big' : ''}" style="background:${BRAND[name] ?? '#333'}"><svg viewBox="0 0 32 32" aria-hidden="true">${art}</svg></i>`;
  const us = US_ART[name];
  if (us) return `<i class="stk-badge${big ? ' big' : ''}"><svg viewBox="0 0 32 32" aria-hidden="true">${us}</svg></i>`;
  const com = COMMODITY_ART[name];
  if (com) return `<i class="stk-badge${big ? ' big' : ''}"><svg viewBox="0 0 32 32" aria-hidden="true">${com}</svg></i>`;
  const b = badgeOf(name);
  return `<i class="stk-badge${big ? ' big' : ''}" style="background:${b.bg}">${b.ch}</i>`;
};

export type Trade =
  | { slot: number; buy: boolean; n: number; /** 1-10; counts on a fresh leveraged opening only. */ lev?: number }
  | { slot: number; /** 追加保证金: pushes this much from the bank into the position. */ topup: number }
  | { slot: number; /** 提取保证金: pulls this much of the position's margin back to the bank. */ withdraw: number };

export class StockScreen {
  readonly el: HTMLElement;
  private view: 'prices' | 'holders' = 'prices';
  private selected = -1;
  private detail = -1;
  private trade: { buy: boolean; n: number } | null = null;
  done: (a: Trade | -1) => void = () => {};

  /**
   * 大富豪模式 (docs/rules/17 §5): the nationwide market, the five cities' 12 stocks each on a tab; a trade's slot is
   * city × 12 + the city's slot.
   */
  private city = 0;
  /**
   * 持股表 with more player columns than fit across (大富豪模式's twelve, or a narrow phone): the players a page at a
   * time with a pager (`hper` columns a page, 0 = all), never cut off.
   */
  private hpage = 0;
  private hper = 0;
  /** The 持股表 without 保留股份 / 累積盈餘 (left to 公司資訊), so the players get the room. */
  private lean = false;
  /** The coin market (the 星座 group): no 涨跌停 display and no halt — it trades 24/7 as the engine does. */
  private crypto = false;
  /** The leverage multiplier the trade panel will open with (drag 1-10; a held position locks it). */
  private lev = 1;
  /** The margin sub-panel: '' hides it, 'add' pushes bank money in, 'sub' pulls it back out. */
  private mmode: '' | 'add' | 'sub' = '';
  /** The margin sub-panel's amount. */
  private mn = 0;

  constructor(readonly game: Game, readonly p: number, readonly world?: World | null) {
    this.el = document.createElement('div');
    this.el.className = 'stk';
    // 原版是红涨绿跌（09 §7.6）；只有中文市场（台股、陸股）保持它，别的市场照世界惯例绿涨红跌。
    const g8 = (((this.game.board.mapId | 0) % 8) + 8) % 8;
    this.crypto = g8 === 4 && !this.game.board.stockNames;
    if (g8 === 0 || g8 === 1) this.el.classList.add('cn');
    if (world) { this.city = Math.max(0, world.cities.indexOf(game)); this.el.classList.add('world'); }
    this.el.addEventListener('click', e => this.click(e));
    this.render();
    let w = 0;
    new ResizeObserver(() => {
      // Turned or resized: the 持股表 works out its columns again.
      if (this.view === 'holders' && this.detail < 0 && Math.abs(this.el.clientWidth - w) > 1) { w = this.el.clientWidth; this.render(); } else this.fit();
    }).observe(this.el);
  }

  /** One page, no scrolling: the table's sizes step down (--k) until it fits; a tiny screen shrinks it as a whole. */
  private fit() {
    const el = this.el;
    if (!el.isConnected || !el.clientHeight) return;
    el.style.zoom = '';
    for (const k of [1, 0.92, 0.85, 0.78, 0.72]) {
      el.style.setProperty('--k', String(k));
      if (el.scrollHeight <= el.clientHeight + 0.5) return;
    }
    el.style.zoom = String(Math.max(0.6, el.clientHeight / el.scrollHeight));
  }

  /** The market shown: the game's, or the chosen city's in 大富豪模式. */
  private get market(): Game { return this.world ? this.world.cities[this.city] : this.game; }
  private get st() { return this.market.stocks; }

  private company(slot: number) {
    const s = this.st.stocks[slot], b = this.market.board;
    return s.companyId ? b.companies[s.companyId - 1] : b.companies.find(c => c.stockSlot === slot);
  }

  private click(e: Event) {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!t) return;
    const a = t.dataset.a!, v = Number(t.dataset.v);
    // The stock screen (fcn_0042aaff): a bought / sold amount rings Effect#40 / #41, the amount keys beep (#7),
    // leaving cancels (#4), the rest click (#1).
    audio.sfx(a === 'ok' && this.trade ? (this.trade.buy ? Sfx.stockBuy : Sfx.stockSell) : a === 'n' || a === 'max' || a === 'pct' ? Sfx.key : a === 'exit' || a === 'cancel-trade' || a === 'back' ? 4 : 1);
    const s = this.selected >= 0 ? this.st.stocks[this.selected] : null;
    const me = this.game.players[this.p];
    if (a === 'city') { this.city = v; this.selected = -1; this.detail = -1; this.trade = null; this.hpage = 0; this.mmode = ''; this.mn = 0; }
    else if (a === 'view') { this.view = t.dataset.v === 'holders' ? 'holders' : 'prices'; this.hpage = 0; }
    else if (a === 'hpage') { const n = this.holderCount(); this.hpage = Math.max(0, Math.min(Math.ceil(n / (this.hper || n)) - 1, this.hpage + v)); }
    else if (a === 'row') {
      if (this.selected === v) this.detail = v;
      else { this.selected = v; const pos = this.st.leveraged ? this.st.position(this.p, v) : undefined; if (pos) this.lev = pos.leverage; this.trade = null; this.mmode = ''; this.mn = 0; }
    }
    else if (a === 'detail' && this.selected >= 0) this.detail = this.selected;
    else if (a === 'back') { this.detail = -1; this.trade = null; this.mmode = ''; this.mn = 0; }
    else if (a === 'closeall' && this.selected >= 0) {
      const pos = this.st.leveraged ? this.st.position(this.p, this.selected) : undefined;
      if (pos) { this.done({ slot: (this.world ? this.city * this.st.stocks.length : 0) + this.selected, buy: pos.dir === -1, n: pos.qty, lev: pos.leverage }); return; }
    }
    else if (a === 'pct' && this.trade) {
      // a quick-fill rung: 25 / 50 / 75 / 100% of what the panel's slider caps at
      const slider = this.el.querySelector<HTMLInputElement>(this.mmode ? 'input.stk-slider.msl' : 'input.stk-slider:not(.msl)');
      if (slider) {
        const smin = Number(slider.min) || 0, smax = Number(slider.max) || 1;
        slider.value = String(Math.round(smin + (smax - smin) * v / 100));
        slider.dispatchEvent(new Event('input'));
      }
    }
    else if (a === 'posclose') {
      // The position card's 市價平倉: select the slot and open the pre-filled close panel (inside, not the bar).
      const pos = this.st.leveraged ? this.st.position(this.p, v) : undefined;
      if (pos) { this.selected = v; this.trade = { buy: pos.dir === -1, n: pos.qty }; this.mmode = ''; this.mn = 0; }
    }
    else if ((a === 'buy' || a === 'sell') && s) { this.trade = { buy: a === 'buy', n: this.max(a === 'buy') }; this.mmode = ''; this.mn = 0; }
    else if (a === 'topup') {
      const pos = this.st.leveraged ? this.st.position(this.p, v) : undefined;
      const need = pos ? Math.max(0, Math.ceil(this.st.requiredMargin(pos) - this.st.equityOf(pos, this.st.stocks[v].price))) : 0;
      if (!pos || need <= 0) { this.trade = null; }
      else { this.done({ slot: (this.world ? this.city * this.st.stocks.length : 0) + v, topup: need }); return; }
    }
    else if (a === 'ok' && this.trade && this.selected >= 0 && this.trade.n > 0) {
      const ok = this.el.querySelector<HTMLButtonElement>('[data-a=ok]');
      if (ok) ok.disabled = true; // one submit per panel: a second click must not fire a stale trade
      this.done({ slot: (this.world ? this.city * this.st.stocks.length : 0) + this.selected, buy: this.trade.buy, n: this.trade.n, lev: this.lev });
      return;
    }
    else if (a === 'cancel-trade') this.trade = null;
    else if (a === 'mmode' && this.selected >= 0) { this.mmode = (t.dataset.v as '' | 'add' | 'sub') ?? ''; this.mn = 0; }
    else if (a === 'mmok' && this.mmode && this.mn > 0 && this.selected >= 0) {
      const ok = this.el.querySelector<HTMLButtonElement>('[data-a=mmok]');
      if (ok) ok.disabled = true;
      const slot = (this.world ? this.city * this.st.stocks.length : 0) + this.selected;
      this.done(this.mmode === 'add' ? { slot, topup: this.mn } : { slot, withdraw: this.mn });
      return;
    }
    else if (a === 'exit') { this.done(-1); return; }
    void me;
    this.render();
  }

  /**
   * The trade's cap in shares: on a spot market, the turn's volume and the deposit cap a buy and the shares held
   * cap a sell (03 §5.2). On a leveraged market the deposit's × leverage caps it (a position adds within its own
   * locked leverage), a pool quota caps a fresh opening, and the opposite tab closes the held leg.
   */
  private max(buy: boolean): number {
    const s = this.st.stocks[this.selected], me = this.game.players[this.p];
    if (!s) return 0;
    const pos = this.st.leveraged ? this.st.position(this.p, this.selected) : undefined;
    if (this.st.leveraged) {
      if (pos && (buy ? pos.dir === -1 : pos.dir === 1)) return pos.qty; // the opposite action closes it out
      const L = pos ? pos.leverage : this.lev;
      // exactly the engine's arithmetic: the margin is trunc(notional / L) against trunc(bank × L)
      return Math.max(0, Math.min(s.turnQuota, Math.trunc(Math.trunc(me.bank * L) / s.price))); // the day's volume caps adds too
    }
    return buy ? Math.max(0, Math.min(s.turnQuota, Math.trunc(me.bank / s.price))) : this.st.holdings[this.p][this.selected].shares;
  }

  private trendClass(s: Stock): string {
    if (s.suspendDays) return 'halt';
    return ['up', 'limit-up', 'down', 'limit-down', 'flat'][trendOf(s, this.crypto)]; // limits cannot appear for coins
  }

  render() {
    const me = this.game.players[this.p];
    const pos = this.st.leveraged && this.selected >= 0 ? this.st.position(this.p, this.selected) : undefined;
    const head = `<div class="stk-bar">
      <button class="chip${this.view === 'prices' ? ' on' : ''}" data-a="view" data-v="prices">價值表</button>
      <button class="chip${this.view === 'holders' ? ' on' : ''}" data-a="view" data-v="holders">持倉表</button>
      <button class="stk-btn buy" data-a="buy" ${this.selected < 0 ? 'disabled' : ''}>▲ 買進</button>
      <button class="stk-btn sell" data-a="sell" ${this.selected < 0 || (!this.st.leveraged && !(this.st.holdings[this.p]?.[this.selected]?.shares || pos)) ? 'disabled' : ''}>▼ 賣出</button>
      <button class="chip" data-a="detail" ${this.selected < 0 ? 'disabled' : ''}>K線&信息</button>
      <span class="stk-bank">存款 ${money(me.bank)}</span></div>${this.world ? `<div class="stk-cities">${this.world.cities.map((_c, i) =>
        `<button class="chip${i === this.city ? ' on' : ''}" data-a="city" data-v="${i}">${this.world!.cityName(i)}${this.market.stocks.open() || i !== this.city ? '' : '（休市）'}</button>`).join('')}</div>` : ''}`;
    const draw = () => {
      const body = this.detail >= 0 ? this.company_page(this.detail) : this.view === 'prices' ? this.prices() : this.holders();
      this.el.innerHTML = `${head}${body}${this.trade ? this.tradeBox() : ''}`;
      this.fit();
      // The drag slider patches its own numbers while dragging (a full re-render would kill the gesture).
      const slider = this.el.querySelector<HTMLInputElement>('input.stk-slider');
      if (slider) slider.addEventListener('input', () => {
        if (!this.trade || this.selected < 0 || this.mmode) return; // the margin sub-panel owns the slider then
        const s = this.st.stocks[this.selected], max = this.max(this.trade.buy);
        let val = Number(slider.value);
        const smin = Number(slider.min) || 0, smax = Number(slider.max) || 1;
        for (const m of [0.25, 0.5, 0.75, 1]) { // magnetic rungs: the thumb snaps onto 25/50/75/100%
          const mv = Math.round(smin + (smax - smin) * m);
          if (Math.abs(val - mv) <= (smax - smin) * 0.02) { val = mv; slider.value = String(mv); break; }
        }
        this.trade.n = val;
        slider.style.setProperty('--pct', `${max ? Math.round(this.trade.n / max * 100) : 0}%`);
        const b = this.el.querySelector<HTMLElement>('.stk-amt b');
        const ok = this.el.querySelector<HTMLButtonElement>('.stk-trade-box .choices .candy:last-child');
        if (b) b.textContent = this.trade.n.toLocaleString('en-US');
        const mRow = this.el.querySelector<HTMLElement>('.js-margin');
        if (mRow) mRow.textContent = money(Math.trunc((this.trade.n * s.price) / (pos ? pos.leverage : this.lev)));
        const nRow = this.el.querySelector<HTMLElement>('.js-notional');
        if (nRow) nRow.textContent = money(this.trade.n * s.price);
        const aRow = this.el.querySelector<HTMLElement>('.js-amount');
        if (aRow) aRow.textContent = money(this.trade.n * s.price);
        const rRow = this.el.querySelector<HTMLElement>('.js-return');
        if (rRow && pos) { const eq = this.st.equityOf(pos, s.price); rRow.textContent = money(Math.round(Math.max(0, (eq * Math.min(pos.qty, this.trade.n)) / pos.qty))); }
        if (ok) ok.disabled = !(this.trade.n > 0);
        const lq = this.el.querySelector<HTMLElement>('.js-liq2');
        if (lq && pos && this.trade.n > 0) {
          const nn = Math.min(this.trade.n, 1e15);
          const blend = { ...pos, entry: f32((pos.entry * pos.qty + s.price * nn) / (pos.qty + nn)), qty: pos.qty + nn,
            margin: pos.margin + Math.trunc((nn * s.price) / (pos ? pos.leverage : this.lev)) };
          lq.textContent = formatPrice(this.st.liquidationPrice(blend));
        }
      });
      const levbar = this.el.querySelector<HTMLInputElement>('input.stk-levbar');
      if (levbar && !levbar.disabled) levbar.addEventListener('input', () => {
        this.lev = Number(levbar.value);
        levbar.style.setProperty('--pct', `${((this.lev - 1) / 9) * 100}%`);
        const val = this.el.querySelector<HTMLElement>('.stk-lev-val');
        if (val) val.textContent = `${this.lev}×`;
        this.el.querySelectorAll('.stk-lev-ticks i').forEach(t => t.classList.toggle('on', Number(t.textContent) === this.lev));
      });
      if (levbar && !levbar.disabled) levbar.addEventListener('change', () => {
        const frac = this.trade ? this.trade.n / Math.max(1, this.max(this.trade.buy)) : 1;
        this.lev = Number(levbar.value);
        if (this.trade) this.trade.n = Math.min(this.max(this.trade.buy), Math.round(this.max(this.trade.buy) * frac));
        this.render();
      });
      // the margin sub-panel's slider: the amount, its percent fill, and the after-op liquidation line
      const msl = this.el.querySelector<HTMLInputElement>('input.stk-slider.msl');
      if (msl) msl.addEventListener('input', () => {
        this.mn = Number(msl.value);
        msl.style.setProperty('--pct', `${Math.round((this.mn / Math.max(1, Number(msl.max))) * 100)}%`);
        const amt = this.el.querySelector<HTMLElement>('.js-mamt');
        if (amt) amt.textContent = this.mn.toLocaleString('en-US');
        const okk = this.el.querySelector<HTMLButtonElement>('[data-a=mmok]');
        if (okk) okk.disabled = !(this.mn > 0);
        const lq = this.el.querySelector<HTMLElement>('.js-liq2');
        const p2 = this.selected >= 0 ? this.st.position(this.p, this.selected) : undefined;
        if (lq && p2) {
          const adding = this.mmode === 'add';
          const sim = { ...p2, margin: Math.max(0, adding ? p2.margin + this.mn : p2.margin - this.mn) };
          lq.textContent = formatPrice(this.st.liquidationPrice(sim));
        }
      });
    };
    this.hper = 0; this.lean = false;
    draw();
    // The 持股表 wider than the sheet: fewer player columns a page until it fits across.
    const wide = () => {
      const t = this.el.querySelector<HTMLElement>('.stk-table.holders');
      return !!t && this.el.clientWidth > 0 && t.getBoundingClientRect().right > this.el.getBoundingClientRect().right + 1;
    };
    if (this.view === 'holders' && this.detail < 0 && wide()) { this.lean = true; draw(); }
    if (this.view === 'holders' && this.detail < 0 && wide()) {
      // Every page must fit (names differ in width); the page asked for stays.
      const n = this.holderCount(), want = this.hpage;
      for (let per = n - 1; per >= 1; per--) {
        this.hper = per;
        let fits = true;
        for (let pg = 0; pg < Math.ceil(n / per) && fits; pg++) { this.hpage = pg; draw(); fits = !wide(); }
        if (fits || per === 1) break;
      }
      this.hpage = Math.min(want, Math.ceil(n / this.hper) - 1);
      draw();
    }
  }

  private prices(): string {
    const rows = this.st.stocks.map((s, i) => {
      const h = this.st.holdings[this.p][i], c = this.company(i);
      const pos = this.st.leveraged ? this.st.position(this.p, i) : undefined;
      const have = pos ? pos.qty : h.shares, cost = pos ? pos.entry : h.avgCost;
      const mark = pos ? `<em class="stk-dir${pos.call ? ' str' : ''}"> ▲多${pos.leverage}×${pos.call ? '⚠' : ''}</em>`.replace('▲多', pos.dir === 1 ? '▲多' : '▼空') : '';
      const cls = this.trendClass(s), diff = s.price - s.prevClose;
      return `<tr class="${cls}${i === this.selected ? ' sel' : ''}" data-a="row" data-v="${i}">
        <td class="nm${c && s.companyId ? ' hq' : ''}">${badge(s.name)}<span>${s.name}</span></td>
        <td class="px"><span>${formatPrice(s.price)}</span></td>
        <td class="chg">${s.suspendDays ? '' : signed(diff, 0)}</td>
        <td>${s.suspendDays ? '暫停交易' : Math.max(0, s.turnQuota).toLocaleString('en-US')}</td>
        <td>${have ? `${have.toLocaleString('en-US')}${mark}` : ''}</td>
        <td>${have ? cost.toFixed(2) : ''}</td></tr>`;
    }).join('');
    return `<table class="stk-table"><thead><tr><th>名稱</th><th>成交價</th><th>漲跌</th><th>交易量</th><th>持有數額</th><th>平均成本</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  /** 12 players (大富豪模式): only those holding shares of this market get a column — a margin leg counts. */
  private holderPlayers() {
    const all = this.game.players;
    return all.length > 4 ? all.filter(q => this.st.stocks.some((_s, i) => this.st.holdsAny(q.id, i))) : all;
  }
  private holderCount() { return this.holderPlayers().length; }

  private holders(): string {
    const every = this.holderPlayers();
    const per = this.hper > 0 && this.hper < every.length ? this.hper : every.length;
    const pages = Math.max(1, Math.ceil(every.length / per));
    const page = Math.min(this.hpage, pages - 1);
    const ps = every.slice(page * per, (page + 1) * per);
    const extra = !this.lean;
    const pager = pages > 1 ? `<div class="fl-pager stk-hpager"><button type="button" class="fl-prev" data-a="hpage" data-v="-1"${page ? '' : ' disabled'} aria-label="上一頁">‹</button>
      <span class="fl-num">${page + 1} / ${pages}</span><button type="button" class="fl-next" data-a="hpage" data-v="1"${page < pages - 1 ? '' : ' disabled'} aria-label="下一頁">›</button></div>` : '';
    const rows = this.st.stocks.map((s, i) => {
      const c = this.company(i);
      const cells = ps.map(q => {
        const k = q.id, pos = this.st.leveraged ? this.st.position(k, i) : undefined;
        const n = this.st.netSharesOf(k, i), ctl = c && c.controller === k + 1;
        const tag = pos ? `<em class="stk-dir${pos.call ? ' str' : ''}"> ${pos.dir === 1 ? '▲' : '▼'}${pos.leverage}×${pos.call ? '⚠' : ''}</em>` : '';
        return `<td${ctl ? ' class="ctl"' : ''}>${n ? `${n.toLocaleString('en-US')}${tag}` : ''}</td>`;
      }).join('');
      return `<tr class="${i === this.selected ? 'sel' : ''}" data-a="row" data-v="${i}"><td class="nm">${badge(s.name)}<span>${s.name}</span></td>${cells}${extra ? `
        <td>${c && s.companyId ? c.freeShares.toLocaleString('en-US') : ''}</td><td>${c && s.companyId ? money(c.fundB) : ''}</td>` : ''}</tr>`;
    }).join('');
    return `<table class="stk-table holders"><thead><tr><th>名稱</th>${ps.map(q => `<th style="color:${onBlue(CHARACTERS[q.character].color)}">${playerName(q)}</th>`).join('')}${extra ? '<th>保留股份</th><th>累積盈餘</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>${pager}`;
  }

  /** Oldest to newest daily closes from the 144-day ring. */
  private history(s: Stock): number[] {
    const out: number[] = [], cur = this.st.cursor ?? 0;
    for (let k = 0; k < 144; k++) { const v = s.history[(cur + k) % 144]; if (v) out.push(v); }
    if (!out.length || out[out.length - 1] !== s.price) out.push(s.price);
    return out;
  }

  /** Daily candles (open = previous close) with a 5-day average, red up / green down. */
  /**
   * A professional-looking candlestick over the real closes (03 remake §7.6): each bar gets a stable
   * synthetic day-frame (open = the previous close, symmetric wicks scaled by the day's own move), the
   * MA5/MA10 pair, a turnover strip whose height carries the day's move, right-hand price labels and a
   * last-price flag. The per-market orientation (u/d classes) colors it.
   */
  private chart(s: Stock): string {
    const h = this.history(s).slice(-60);
    if (h.length < 2) return '<div class="stk-chart empty">還沒有走勢資料</div>';
    const W = 520, H = 320, padL = 6, padR = 92, top = 8, priceH = 208, volTop = 236, volH = 60;
    const days = h.length, step = W / 60, bw = step * 0.6, x = (i: number) => W - (days - i) * step + step / 2;
    // the jitter is a stable hash of the bar's own closes, so the chart never re-renders differently
    const rnd = (i: number, salt: number) => { let z = (i * 2654435761 + salt * 40503) >>> 0; z = Math.imul(z ^ z >>> 15, 1 | z); return (z >>> 0) % 1000 / 1000; };
    const bars = h.map((c, i) => {
      const o = i ? h[i - 1] : c;
      const move = Math.abs(c - o) / (o || 1);
      const up = c >= o, stretch = 0.4 + rnd(i, 1) * 0.6;
      const hi = Math.max(o, c) * (1 + move * 0.55 * stretch + 0.001);
      const lo = Math.min(o, c) * (1 - move * 0.55 * (1.4 - stretch) - 0.001);
      return { o, c, hi, lo, up, move, vol: 0.18 + move * 9 * (0.6 + rnd(i, 2)) };
    });
    const hiAll = Math.max(...bars.map(b => b.hi)), loAll = Math.min(...bars.map(b => b.lo));
    const span = hiAll - loAll || hiAll * 0.1 || 1;
    const y = (v: number) => top + (hiAll - v) / span * priceH;
    const maxVol = Math.max(...bars.map(b => Math.min(1, b.vol)));
    let wicks = '', bodies = '', vols = '';
    bars.forEach((b, i) => {
      const dir = b.up ? 'u' : 'd';
      wicks += `<line x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="${y(b.hi).toFixed(1)}" y2="${y(b.lo).toFixed(1)}" class="wick ${dir}"/>`;
      const topB = y(Math.max(b.o, b.c)), botB = y(Math.min(b.o, b.c));
      bodies += `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${topB.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1.5, botB - topB).toFixed(1)}" class="${dir}"/>`;
      const vh = Math.max(2, Math.min(1, b.vol) / maxVol * volH);
      vols += `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${(volTop + volH - vh).toFixed(1)}" width="${bw.toFixed(1)}" height="${vh.toFixed(1)}" class="v${dir}"/>`;
    });
    const ma = (n: number, cls: string) => {
      let d = '';
      for (let i = n - 1; i < days; i++) {
        const t = h.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n;
        d += `${d ? 'L' : 'M'}${x(i).toFixed(1)} ${y(t).toFixed(1)}`;
      }
      return d ? `<path d="${d}" class="${cls}"/>` : '';
    };
    const last = h[days - 1];
    return `<svg class="stk-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <rect x="0" y="0" width="${W}" height="${H}" class="bg"/>
      <line x1="${padL}" x2="${W - padR}" y1="${y(hiAll).toFixed(1)}" y2="${y(hiAll).toFixed(1)}" class="g"/>
      <line x1="${padL}" x2="${W - padR}" y1="${y(loAll).toFixed(1)}" y2="${y(loAll).toFixed(1)}" class="g"/>
      <line x1="${padL}" x2="${W - padR}" y1="${volTop}" y2="${volTop}" class="axis"/>
      <text x="${W - padR + 6}" y="${y(hiAll) + 4}" class="axis">${formatPrice(hiAll)}</text>
      <text x="${W - padR + 6}" y="${y(loAll) + 4}" class="axis">${formatPrice(loAll)}</text>
      ${wicks}${bodies}
      ${ma(5, 'maa')}${ma(10, 'mab')}
      ${vols}
      <rect x="${W - padR + 2}" y="${(y(last) - 8).toFixed(1)}" width="84" height="17" rx="3" class="lpflag"/>
      <text x="${W - padR + 8}" y="${(y(last) + 4.5).toFixed(1)}" class="lptext">${formatPrice(last)}</text>
      <line x1="${padL}" x2="${W - padR}" y1="${y(last).toFixed(1)}" y2="${y(last).toFixed(1)}" class="lpline"/>
    </svg>`;
  }

  private company_page(slot: number): string {
    const s = this.st.stocks[slot], c = this.company(slot), h = this.history(s), cls = this.trendClass(s);
    const avg = (n: number) => { const t = h.slice(-n); return t.reduce((a, b) => a + b, 0) / t.length; };
    const diff = s.price - s.prevClose, pct = s.prevClose ? diff / s.prevClose * 100 : 0;
    const total = 10000;
    const holders = this.game.players.map((q, k) => ({ q, n: this.st.holdings[k][slot].shares })).filter(x => x.n > 0).sort((a, b) => b.n - a.n);
    const ctl = c && c.controller ? playerName(this.game.players[c.controller - 1]) : '無';
    const fig = (k: string, v: string, cls2 = '') => `<div class="stk-fig ${cls2}"><span>${k}</span><b>${v}</b></div>`;
    // 大富豪模式: up to twelve shareholders — in columns across the page, never past its bottom.
    const many = holders.length > 6 ? ' many' : '';
    return `<div class="stk-company${many}">
      <div class="stk-title">${badge(s.name, true)}<b>${s.name}</b>${c && s.companyId ? `<span>經營者：${ctl}</span>` : '<span>未上市企業</span>'}<button class="chip" data-a="back">返回列表</button></div>
      ${this.chart(s)}
      <div class="stk-figs">
        ${fig('成交價', formatPrice(s.price), cls)}${fig('漲跌', s.suspendDays ? '暫停交易' : signed(diff, 0), cls)}${fig('漲跌幅', `${pct.toFixed(2)}%`, cls)}
        ${fig('交易量', Math.max(0, s.turnQuota).toLocaleString('en-US'))}${fig('週均價', formatPrice(avg(7)))}${fig('月均價', formatPrice(avg(30)))}
        ${fig('歷史高價', formatPrice(Math.max(...h)))}${fig('歷史低價', formatPrice(Math.min(...h)))}
        ${c && s.companyId ? `${fig('本月盈餘', money(c.fundA))}${fig('累積盈餘', money(c.fundB))}${fig('保留股份', c.freeShares.toLocaleString('en-US'))}` : ''}
      </div>
      <div class="stk-holders${many}"><h4>股東</h4>${holders.length ? holders.map(({ q, n }) => {
        const ch = CHARACTERS[q.character], r = n / total * 100;
        return `<div class="stk-holder${c && c.controller === q.id + 1 ? ' ctl' : ''}" style="--c:${hex(ch.color)}">
          <span class="nm">${playerName(q)}${c && c.controller === q.id + 1 ? '<em>經營者</em>' : ''}</span>
          <span class="bar"><i style="width:${Math.min(100, r).toFixed(1)}%"></i></span><span class="n" title="${n.toLocaleString('en-US')} 股 · ${r.toFixed(1)}%">${many ? `${(n / 1000).toLocaleString('en-US')}千股 ${r.toFixed(0)}%` : `${n.toLocaleString('en-US')} 股 · ${r.toFixed(1)}%`}</span></div>`;
      }).join('') : '<p class="info-none">目前沒有玩家持股</p>'}</div></div>`;
  }

  private tradeBox(): string {
    const s = this.st.stocks[this.selected], t = this.trade!;
    const pos = this.st.leveraged ? this.st.position(this.p, this.selected) : undefined;
    const max = this.max(t.buy);
    const x = `<button class="stk-x" data-a="cancel-trade" aria-label="關閉"><svg viewBox="0 0 20 20"><path d="M5.5 5.5 L14.5 14.5 M14.5 5.5 L5.5 14.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg></button>`;
    const pcts = `<i class="tk" style="left:25%"></i><i class="tk" style="left:50%"></i><i class="tk" style="left:75%"></i><i class="tk" style="left:calc(100% - 1px)"></i>` +
      `<b class="pct" data-a="pct" data-v="25" style="left:25%">25%</b><b class="pct" data-a="pct" data-v="50" style="left:50%">50%</b><b class="pct" data-a="pct" data-v="75" style="left:75%">75%</b><b class="pct" data-a="pct" data-v="100" style="left:calc(100% - 8px)">100%</b>`;
    const rows = (pairs: [string, string, string?][]) =>
      `<div class="stk-rows">${pairs.map(([k, v, c]) => `<div class="stk-row"><span>${k}</span><b${c ? ` class="${c}"` : ''}>${v}</b></div>`).join('')}</div>`;
    if (this.st.leveraged) {
      // The opposite tab closes the held leg: the proceeds are the leg's slice of the floating equity.
      if (pos && pos.dir === (t.buy ? -1 : 1)) {
        const eq = this.st.equityOf(pos, s.price);
        const slice = Math.max(0, (eq * Math.min(pos.qty, t.n)) / pos.qty);
        return `<div class="stk-trade"><div class="stk-trade-box">${x}
          <h4>${badge(s.name, true)}${s.name}<b class="side ${pos.dir === 1 ? 'long' : 'short'}">${pos.dir === 1 ? '平多倉' : '平空倉'}</b></h4>
          <div class="stk-slider-wrap">
          <input type="range" class="stk-slider" min="1" max="${pos.qty}" step="1" value="${Math.max(1, t.n)}" style="--pct:${Math.round((t.n / pos.qty) * 100)}%" aria-label="平倉股數">
          ${pcts}</div>
          <div class="stk-amt"><b>${Math.min(pos.qty, t.n).toLocaleString('en-US')}</b><span>股</span></div>
          ${rows([
            ['開倉均價 / 標記價', `${formatPrice(pos.entry)} / ${formatPrice(s.price)}`],
            ['強平價', formatPrice(pos.liq || this.st.liquidationPrice(pos))],
            ['保證金率', `${(this.st.marginRate(pos, s.price) * 100).toFixed(1)}%（強平線 ${(MMR * 100).toFixed(1)}%）`],
            ['退回存款（含盈虧）', money(Math.round(slice)), 'js-return'],
          ])}
          <div class="choices"><button class="candy ${t.buy ? 'buy' : 'sell'}" data-a="ok" ${t.n > 0 ? '' : 'disabled'}>確定平倉</button></div>
        </div></div>`;
      }
      const L = pos ? pos.leverage : this.lev;
      const margin = Math.trunc((t.n * s.price) / L);
      const probe = { dir: (t.buy ? 1 : -1) as 1 | -1, qty: L, leverage: L, entry: s.price, margin: Math.trunc(s.price), call: false, liq: 0 };
      const ticks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(xx => `<i${xx === L ? ' class="on"' : ''}>${xx}</i>`).join('');
      // A held leg: the frozen liquidation line (it never moves with the daily ticks), the after-add estimate,
      // and the margin row (add from the bank / pull back; both move the line).
      const wd = pos ? this.st.withdrawable(pos, s.price) : 0;
      if (pos && this.mmode) {
        const adding = this.mmode === 'add';
        const mmax = Math.max(1, adding ? this.game.players[this.p].bank : wd);
        return `<div class="stk-trade"><div class="stk-trade-box">${x}
          <h4>${badge(s.name, true)}${s.name}<b class="side ${pos!.dir === 1 ? 'long' : 'short'}">保證金管理</b></h4>
          <div class="stk-slider-wrap">
          <input type="range" class="stk-slider msl" min="0" max="${mmax}" step="1" value="${this.mn}" style="--pct:${Math.round((this.mn / mmax) * 100)}%" aria-label="保證金金額">
          ${pcts}</div>
          <div class="stk-amt"><b class="js-mamt">${this.mn.toLocaleString('en-US')}</b><span>元</span></div>
          ${rows([
            ['當前保證金', money(pos!.margin)],
            [adding ? '存款可用' : '可提取', money(adding ? this.game.players[this.p].bank : wd)],
            ['當前強平價', formatPrice(pos!.liq || this.st.liquidationPrice(pos!))],
            ['操作後強平價', '<b class="js-liq2">—</b>'],
          ])}
          <div class="choices"><button class="candy ghost" data-a="mmode" data-v="">返回</button>
            <button class="candy ${adding ? 'buy' : 'sell'}" data-a="mmok" ${this.mn > 0 ? '' : 'disabled'}>確認${adding ? '追加' : '提取'}</button></div>
        </div></div>`;
      }
      const nn = Math.min(t.n, 1e15);
      const blend = pos ? { ...pos, entry: f32((pos.entry * pos.qty + s.price * nn) / (pos.qty + nn)), qty: pos.qty + nn,
        margin: pos.margin + Math.trunc((nn * s.price) / L) } : probe;
      return `<div class="stk-trade"><div class="stk-trade-box">${x}
        <h4>${badge(s.name, true)}${s.name}<b class="side ${t.buy ? 'long' : 'short'}">${t.buy ? '買進' : '賣出'} ${L}×${pos ? ' 加倉' : ''}</b></h4>
        <div class="stk-lev">
          <span>槓桿</span><b class="stk-lev-val${pos ? ' lock' : ''}">${L}×</b>${pos ? '<em class="stk-lev-lock">持倉鎖定，不可改</em>' : ''}
          <input type="range" class="stk-levbar" min="1" max="10" step="1" value="${L}" ${pos ? 'disabled' : ''} style="--pct:${(((L - 1) / 9) * 100).toFixed(1)}%" aria-label="槓桿倍數">
          <div class="stk-lev-ticks">${ticks}</div>
        </div>
        <div class="stk-slider-wrap">
        <input type="range" class="stk-slider" min="0" max="${Math.max(max, 1)}" step="1" value="${t.n}" style="--pct:${max ? Math.round((t.n / max) * 100) : 0}%" aria-label="股數">
        ${pcts}</div>
        <div class="stk-amt"><b>${t.n.toLocaleString('en-US')}</b><span>股</span></div>
        ${rows([
          ['現價 / 股份上限', `${formatPrice(s.price)} 元 / ${max.toLocaleString('en-US')} 股`],
          ...(pos ? [
            ['持倉保證金 / 可提取', `${money(pos.margin)} / ${money(wd)}`],
            ['持倉強平價', formatPrice(pos.liq || this.st.liquidationPrice(pos))],
          ] as [string, string, string?][] : []),
          ['本次名義價值', money(t.n * s.price), 'js-notional'],
          ['本次保證金', money(margin), 'gold js-margin'],
          ...(pos ? [['本次加倉後強平價', `<b class="js-liq2">${formatPrice(this.st.liquidationPrice(blend))}</b>`] as [string, string, string?]] : []),
          ...(!pos ? [['預估強平價', `${formatPrice(this.st.liquidationPrice(probe))}（維持保證金率 ${(MMR * 100).toFixed(1)}%）`] as [string, string, string?]] : []),
        ])}
        ${pos ? `<div class="stk-marg"><span>保證金管理</span><button class="chip" data-a="mmode" data-v="add">＋ 追加</button><button class="chip" data-a="mmode" data-v="sub"${wd > 0 ? '' : ' disabled'}>－ 提取</button></div>` : ''}
        <div class="choices">${pos ? '<button class="candy no" data-a="closeall">全部平倉</button>' : ''}<button class="candy ${t.buy ? 'buy' : 'sell'}" data-a="ok" ${t.n > 0 ? '' : 'disabled'}>確定${t.buy ? '買進' : '賣出'}</button></div>
      </div></div>`;
    }
    const limit = !this.crypto && (t.buy ? trendOf(s) === Trend.LimitUp : trendOf(s) === Trend.LimitDown);
    return `<div class="stk-trade"><div class="stk-trade-box">${x}
      <h4>${badge(s.name, true)}${s.name}<b class="side ${t.buy ? 'long' : 'short'}">${t.buy ? '買進' : '賣出'}</b></h4>
      <div class="stk-slider-wrap">
      <input type="range" class="stk-slider" min="0" max="${Math.max(max, 1)}" step="1" value="${t.n}" ${limit ? 'disabled' : ''} style="--pct:${max ? Math.round((t.n / max) * 100) : 0}%" aria-label="股數">
      ${pcts}</div>
      <div class="stk-amt"><b>${t.n.toLocaleString('en-US')}</b><span>股</span></div>
      ${rows([
        ['現價', `${formatPrice(s.price)} 元`],
        ['金額', money(t.n * s.price), 'gold js-amount'],
        ['可用存款', money(this.game.players[this.p].bank)],
        ...(limit ? [[t.buy ? '漲停無法買進！' : '跌停無法賣出！', '', 'warn'] as [string, string, string?]] : []),
      ])}
      <div class="choices"><button class="candy ${t.buy ? 'buy' : 'sell'}" data-a="ok" ${t.n > 0 && !limit ? '' : 'disabled'}>確定${t.buy ? '買進' : '賣出'}</button></div>
    </div></div>`;
  }
}
