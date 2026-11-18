# PRIVATE MODULE K-12

SF の個室を主観視点で歩けるブラウザ用の試作です。モデル、テクスチャ、照明、音はすべてコードで生成しています（画像・音声ファイルなし）。ゲームとしての目的はまだありません。

## 操作

| | PC | スマホ |
|---|---|---|
| 移動 | W A S D（Shift で早歩き） | 画面の左半分をドラッグ |
| 視点 | マウス | 画面の右半分をドラッグ |
| 操作 | E または左クリック | ACT ボタン |
| メニュー | Esc | 右上のボタン |

- 扉は近づくと開きます。
- 端末で照明を切り替えられます（AMBER / GLACIER / NIGHT）。
- 中央の卓で投影を切り替えられます（PLANET / TERRAIN / GALAXY / OFF）。
- 洗浄ポッドでシャワーを出せます。
- メニューで、画質（高 / 軽量）、音の入切、BGM と SE の音量を変えられます。音量はブラウザに保存されます。

## 構成

ビルドなしで、リポジトリ直下をそのまま配信します。

```
index.html        画面とメニュー
js/game.js        部屋、照明、後処理、移動、当たり判定、操作
js/audio.js       音（Web Audio の合成）
lib/              three.js r170 と後処理・形状のモジュール（同梱）
```

## 確認用の機能

- URL の末尾に `#debug` を付けると、左下に fps、位置、向き、画質、描画回数が出ます。
- ブラウザのコンソールから `window.ROOM` を使えます。
  - `ROOM.pose(x, z, yaw, pitch)` 位置と向きを指定
  - `ROOM.mood(0〜2)` 照明　`ROOM.holo(0〜3)` 投影　`ROOM.shower(true/false)` シャワー
  - `ROOM.quality('high' | 'low')` 画質　`ROOM.state` 現在の状態

## 使用ライブラリ

- [three.js](https://threejs.org/) r170（MIT License）
