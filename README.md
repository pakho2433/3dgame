# 清明上河圖：汴河一日

一個使用 Three.js、TypeScript 與 Vite 製作的第一人稱 3D 教育探索遊戲。玩家在受《清明上河圖》啟發的古代中國汴河城市中探索市集、茶樓、虹橋、碼頭和居民巷，完成主線任務「失蹤的商業帳簿」與支線任務。

本遊戲是教育性詮釋，不是完全精確的歷史重建。

## 功能

- 第一人稱移動、跑步、Pointer Lock 與 mobile touch controls
- 手機 / iPad 左搖桿、右側滑動視角、互動、背包、任務與暫停按鈕
- 城門、市集、虹橋、茶樓室內、樓梯、藥鋪、食攤、碼頭與居民巷
- 10 位 NPC、NPC 對話、任務狀態感知與簡單走動/待機動畫
- 主線任務「失蹤的商業帳簿」完整可完成
- 3 個支線任務、背包、歷史資訊點與 localStorage 儲存
- 程序化模型、WebAudio fallback、missing asset fallback

## 執行

```powershell
npm.cmd install
npm.cmd run dev
```

開啟：

```text
http://127.0.0.1:5173/
```

## 驗證

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd audit --json
node scripts/smoke-test.mjs
```

## 控制

桌面：

- WASD 移動
- Shift 跑步
- 滑鼠視角
- E 互動
- I 背包
- Q 任務
- Escape 暫停

Mobile / iPad：

- 左搖桿移動
- 右側滑動視角
- 互動、跑、包、任、停 按鈕

## Build

Production build 輸出在：

```text
dist/
```

## GitHub 上傳說明

如果此 repo 只看到 `qingming-riverside-3dgame-source.zip`，請下載並解壓，然後在解壓後的資料夾執行上面的 npm 指令。這個 ZIP 是完整 source project，不包含 `node_modules`、`dist` 或測試截圖輸出。
