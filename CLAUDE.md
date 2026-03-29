# CLAUDE.md - CPU Visualizer 開発ガイド

## プロジェクト概要

論理ゲートレベルからCPU全体までを可視化する学習用Webアプリ。
689個のゲートと2176本のワイヤで8bit CPUをシミュレーションする。

## 起動・テスト

```bash
# ローカルサーバー起動
python3 -m http.server 8080
# http://localhost:8080 をブラウザで開く

# ゲートレベルシミュレーションのテスト (Node.js)
node /tmp/test_alu.js      # ALU全演算テスト
node /tmp/test_full.js     # 統合テスト
node /tmp/test_exec.js     # CPU実行テスト (25+17=42)
```

ビルドステップは不要。HTML + Vanilla JS のみ。

## アーキテクチャ

### ファイル構成と依存関係

```
circuit.js  ← 基盤。他の全ファイルが依存
    ↓
builder.js  ← circuit.js の Wire/Gate/Component を使ってCPUを構築
    ↓
renderer.js ← Component の階層構造を Canvas に描画
    ↓
main.js     ← builder + renderer + circuit を統合してアプリを構成
```

`index.html` の `<script>` タグの読み込み順序がこの依存関係に対応している。

### circuit.js - シミュレーションエンジン

- `Wire`: 信号線。value (0/1)、segments (描画用線分)
- `Gate`: 論理ゲート (AND, OR, NOT, NAND, NOR, XOR, XNOR, BUF)。evaluate() で入力から出力を計算
- `Component`: 階層的コンテナ。children (子コンポーネント), gates (直下のゲート), wires (内部ワイヤ), inputPins/outputPins
- `Circuit`: トップレベル管理。トポロジカルソートで評価順序を決定し、フィードバックループ (SRラッチ等) は反復で安定化

### builder.js - CPUビルダー

`CPUBuilder` IIFE モジュール。階層的にコンポーネントを構築:

```
buildHalfAdder → buildFullAdder → buildAdder8 → buildALU
buildSRLatch → buildDLatch → buildDFF → buildRegister8
buildMux2 → buildMux4_8bit
buildDecoder
buildMemory (ハイブリッド: ゲートレベルバス + JS配列ストレージ)
buildPC (レジスタ + MUX)
buildCPU (全コンポーネントを統合)
```

コンポーネント間の配線は `_rewireMux2()` ヘルパーなどで内部ゲートの inputs を直接差し替える。
新しいコンポーネントを追加する場合は、同じパターンに従う。

### renderer.js - 描画エンジン

- Google Maps 風のズーム/パン (マウスホイール + ドラッグ)
- カメラ: `camX`, `camY`, `zoom` のスムーズ補間 (`targetZoom` → `zoom`)
- 階層的描画: コンポーネントの画面上サイズが `EXPAND_THRESHOLD` (80px) を超えたら内部展開
- ゲート描画: 標準論理記号 (AND=D型, OR=盾型, NOT=三角+バブル, etc.)
- 信号表示: アクティブ (1) は緑色 `#00ff88` + グロー、非アクティブは暗灰色
- バス接続: `_drawBusConnections()` でCPUコンポーネント間の矢印を描画

### main.js - アプリケーション

- `App` IIFE モジュール
- CPU状態 (`regA`, `regB`, `pc` 等) は JS 変数で管理し、ゲートレベルに反映
- `stepCPU()`: Fetch → Decode → Execute → Write-back の4フェーズ
- `setALUInputs()`: JS の値をゲートの入力ワイヤに bit 単位でセット → `circuit.evaluate()`
- メモリは `Uint8Array(256)` (ゲートレベルでは非現実的なため)

## コーディング規約

- `'use strict'` を各ファイル先頭に
- グローバルスコープの使用は最小限 (`CPUBuilder`, `Renderer`, `App`, `Circuit` 等のみ)
- IIFE パターンでモジュール化 (`CPUBuilder`, `App`)
- コンポーネント名は `UPPER_SNAKE_CASE`、変数は `camelCase`
- Wire/Gate/Component の id はグローバルカウンタで自動採番

## 重要な設計判断

- **メモリはハイブリッド実装**: 256バイトをゲートレベルで実装すると ~50,000 ゲートになるため、データパスのみゲートレベル、ストレージは JS 配列
- **DFF はマスタースレーブ方式**: NAND ゲートの SR ラッチ → D ラッチ → DFF。フィードバックループは反復評価で安定化 (通常2-3回で収束)
- **ALU の減算**: B を XOR で反転 + Carry-in=1 で2の補数減算
- **MUX ツリー**: 4-to-1 MUX は 2-to-1 MUX の2段ツリーで構築
- **描画の詳細度**: コンポーネントの画面上幅で自動判定。80px未満はボックス表示、以上は内部展開
