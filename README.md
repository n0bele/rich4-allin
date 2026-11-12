# 大富翁4 高清重制版 (Richman 4 Remake)

基于 Vite + TypeScript 的大富翁4（大宇 2001）开源重制：规则引擎按原汇编逐条还原，画面全部高清重绘，支持 Windows / Android / iOS。

## 主要特性

- **原版规则引擎**：回合/行动、地价与连锁街、股票分红、公司卡槽、事件、神明附身、道具商店、宝石赌场……逐条对照反汇编还原（`docs/rules/`）
- **交易市场**：四国股市（台/陆/日/美 Top20 真实行情）+ 加密货币 Top20（24/7）+ 商品期货 Top20，1–10× 杠杆、逐仓强平、追保告警；电脑玩家按波动率网格策略带杠杆交易
- **新玩法**：大富翁模式（五城联战）、歌舞伎町、派对模式（房间联机）、地图编辑器
- **多端打包**：Windows（electron-builder）、Android（Capacitor）、iOS（Capacitor）

## 构建

```bash
# 素材就位：从 Releases 下载 rich4-assets.tar 解压到 game/public/assets
cd game
npm install

# Windows 桌面版
npm run build:win            # 产物在 desktop/out/

# 网页版开发调试
npx vite

# 测试
npx vitest run
```

## 素材与版权

原版提取素材与高清重绘素材**不随源码分发**，见 Releases 的 `rich4-assets.tar`；原作素材归大宇资讯所有，仅供学习交流。源码以 GPL-3.0-or-later 授权（见 LICENSE）。

## 来源与致谢

本项目基于 [iam567/rich4-renew-app](https://github.com/iam567/rich4-renew-app) 的重制成果开发：规则引擎的反汇编还原文档（`docs/rules/`）、编辑器与多端工程均源自该项目，在其基础上持续迭代（交易市场、玩法、界面与多端打包等）。

## 文档

规则还原细节见 [`docs/rules/`](docs/rules/)；更新记录见 [CHANGELOG](CHANGELOG.md)。
