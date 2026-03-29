# CPU Visualizer - コンピュータの仕組みを可視化

論理ゲートレベルからCPU全体まで、コンピュータの動作をGoogle Maps風のズーム/パンで探索できるWebアプリケーション。

## 概要

8bit CPUを**689個の論理ゲート**と**2176本のワイヤ**でシミュレーションし、マクロ（ALU・レジスタ等のブロック図）からミクロ（AND・NAND・OR等の個々のゲートと電気信号）まで、マウス操作で自由に行き来できます。

## スクリーンショットイメージ

```
ズームアウト (マクロ)          ズームイン (ミクロ)
┌─────────────────────┐      ┌─────────────────────┐
│  [PC] → [Memory]    │      │  ┌─XOR─┐            │
│          ↓          │  →   │ A┤     ├─ Sum       │
│  [IR] → [Decoder]   │      │ B┤     │   ┌─AND─┐  │
│          ↓          │      │  └─────┘  A┤     ├─C│
│  [RegA][RegB]→[ALU] │      │           B┤     │  │
└─────────────────────┘      └────────────└─────┘──┘
```

## 起動方法

```bash
# リポジトリ直下で
python3 -m http.server 8080

# ブラウザで開く
# http://localhost:8080
```

Node.jsやビルドツールは不要です。HTMLとJavaScriptだけで動作します。

## 操作方法

| 操作 | 動作 |
|------|------|
| マウスホイール | ズーム（マクロ ↔ ミクロ） |
| ドラッグ | 画面移動 |
| Step / `Space`キー | 1命令ずつ実行 |
| Run / `R`キー | 連続実行 |
| Pause / `P`キー | 一時停止 |
| Reset | CPUリセット |
| Fit View | 全体表示に戻す |

## ズームレベルと見えるもの

| ズーム | 表示内容 |
|--------|----------|
| 0.3x - 1x | CPU全体のブロック図、バス接続 |
| 1x - 3x | 各コンポーネント（ALU, レジスタ, メモリ等） |
| 3x - 8x | サブコンポーネント（加算器, MUX, デコーダ内部） |
| 8x - 20x | フリップフロップ, 半加算器 |
| 20x - 40x | 個々の論理ゲート（AND, OR, NAND, XOR, NOT） |
| 40x+ | ゲートの入出力信号値（0/1）の詳細表示 |

## CPUアーキテクチャ

### コンポーネント構成

- **ALU** (8bit) - 加算/減算/AND/OR/XOR + ゼロフラグ検出
- **Register A, B** - 汎用8bitレジスタ
- **Program Counter** - 8bitプログラムカウンタ + 分岐MUX
- **Instruction Register** - 命令レジスタ（オペコード8bit + オペランド8bit）
- **Instruction Decoder** - 命令デコーダ（組み合わせ回路）
- **Memory** - 256バイトメモリ

### ゲートレベルの階層構造

```
CPU (689 gates)
├── ALU
│   ├── B Inverter (SUB用 XOR x8)
│   ├── 8bit Ripple Carry Adder
│   │   └── Full Adder x8
│   │       ├── Half Adder (XOR + AND)
│   │       ├── Half Adder (XOR + AND)
│   │       └── OR gate
│   ├── Bitwise AND (AND x8)
│   ├── Bitwise OR (OR x8)
│   ├── Bitwise XOR (XOR x8)
│   ├── 4-to-1 MUX (演算選択)
│   │   └── 2-to-1 MUX (NOT + AND x2 + OR)
│   └── Zero Detect (OR tree + NOT)
├── Register A / B
│   └── D Flip-Flop x8
│       ├── Master D-Latch
│       │   ├── NOT gate
│       │   ├── NAND x2 (gating)
│       │   └── SR Latch (NAND x2)
│       ├── Slave D-Latch (同上)
│       └── NOT gate (clock inversion)
├── Program Counter
│   ├── 8bit Register
│   └── 2-to-1 MUX x8 (branch select)
├── Instruction Decoder
│   ├── NOT x8 (opcode inversion)
│   ├── AND x13 (instruction detect)
│   └── OR x11 (control signal generation)
└── Memory (hybrid: gate-level bus + JS array storage)
```

### 命令セット

| オペコード | ニーモニック | 動作 |
|-----------|------------|------|
| 0x01 | LOAD_A imm | A = imm |
| 0x02 | LOAD_B imm | B = imm |
| 0x03 | LOAD_A_MEM addr | A = MEM[addr] |
| 0x04 | STORE_A addr | MEM[addr] = A |
| 0x05 | ADD | A = A + B |
| 0x06 | SUB | A = A - B |
| 0x07 | AND | A = A & B |
| 0x08 | OR | A = A \| B |
| 0x09 | XOR | A = A ^ B |
| 0x0A | NOT | A = ~A |
| 0x0B | JMP addr | PC = addr |
| 0x0C | JZ addr | if Z flag: PC = addr |
| 0x0D | JNZ addr | if !Z flag: PC = addr |
| 0x0E | SHL | A = A << 1 |
| 0x0F | HLT | 停止 |

### サンプルプログラム

- **Addition**: 25 + 17 = 42 を計算
- **Count Up**: 1から10までカウントアップ
- **Logic Ops**: AND/OR/XOR/NOT の論理演算デモ
- **Fibonacci**: フィボナッチ数列
- **Custom**: 自由にアセンブリを記述

## ファイル構成

```
├── index.html          メインHTML
├── css/
│   └── style.css       ダークテーマスタイル
├── js/
│   ├── circuit.js      論理回路シミュレーションエンジン (Wire, Gate, Component, Circuit)
│   ├── builder.js      CPUビルダー (ゲートから階層的にCPU全体を構築)
│   ├── renderer.js     Canvas描画エンジン (ズーム/パン, 階層的詳細度, 信号アニメーション)
│   └── main.js         アプリケーションロジック (ステップ実行, UI, プログラム管理)
├── CLAUDE.md           開発ガイド
└── README.md           このファイル
```

## 技術スタック

- HTML5 Canvas (描画)
- Vanilla JavaScript (ビルドツール不要)
- CSS3 (ダークテーマ, backdrop-filter)
