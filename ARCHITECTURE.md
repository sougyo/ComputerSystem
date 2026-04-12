# コンピュータアーキテクチャ 教育資料

> このビジュアライザで動いている 8bit CPU の仕組みを、論理回路の基礎から順に解説します。  
> 各章の末尾に **「実装との対応」** セクションを設け、ソースコードの該当箇所と照らし合わせられるようにしています。

---

## 目次

1. [論理ゲート — 計算の最小単位](#1-論理ゲート--計算の最小単位)
2. [組み合わせ回路 — ゲートを繋いで計算する](#2-組み合わせ回路--ゲートを繋いで計算する)
3. [加算器 — 足し算を論理で作る](#3-加算器--足し算を論理で作る)
4. [マルチプレクサ (MUX) — 経路を選ぶ](#4-マルチプレクサ-mux--経路を選ぶ)
5. [ALU — 演算装置](#5-alu--演算装置)
6. [順序回路とラッチ — 状態を保つ](#6-順序回路とラッチ--状態を保つ)
7. [フリップフロップ (DFF) — クロックで動くメモリ](#7-フリップフロップ-dff--クロックで動くメモリ)
8. [レジスタ — CPU 内部の高速記憶](#8-レジスタ--cpu-内部の高速記憶)
9. [メモリ — プログラムとデータを格納](#9-メモリ--プログラムとデータを格納)
10. [命令セットアーキテクチャ (ISA)](#10-命令セットアーキテクチャ-isa)
11. [アセンブリ言語とアセンブラ](#11-アセンブリ言語とアセンブラ)
12. [命令デコーダ — 制御信号を生成する](#12-命令デコーダ--制御信号を生成する)
13. [CPU の動作サイクル — Fetch / Decode / Execute](#13-cpu-の動作サイクル--fetch--decode--execute)
14. [プログラム例で理解する実行フロー](#14-プログラム例で理解する実行フロー)

---

## 1. 論理ゲート — 計算の最小単位

### 概念

CPU の中で起きていることはすべて「0 か 1 か」の判断の積み重ねです。その判断を行う最小部品が **論理ゲート** です。

| ゲート | 記号 | 動作 | 真理値表 (A, B → 出力) |
|--------|------|------|------------------------|
| AND  | D 型 | 両方 1 のとき 1 | 0,0→0 / 0,1→0 / 1,0→0 / 1,1→**1** |
| OR   | 盾型 | どちらか 1 のとき 1 | 0,0→0 / 0,1→**1** / 1,0→**1** / 1,1→**1** |
| NOT  | 三角+バブル | 反転 | 0→**1** / 1→**0** |
| NAND | AND+バブル | AND の逆 | 1,1→**0** それ以外→**1** |
| NOR  | OR+バブル | OR の逆 | 0,0→**1** それ以外→**0** |
| XOR  | 丸み型 | 異なるとき 1 | 0,1→**1** / 1,0→**1** それ以外→0 |
| XNOR | XOR+バブル | 等しいとき 1 | 0,0→**1** / 1,1→**1** それ以外→0 |
| BUF  | 三角 | そのまま通す | 0→0 / 1→1 |

**NAND と NOR は「万能ゲート」**です。この 2 種類だけで他のすべてのゲートを構成できます（このシミュレータの SR ラッチも NAND のみで構成されています）。

### シミュレーションモデル

ゲートは「入力ワイヤの値を読んで出力ワイヤに書く」という単純な関数として実装されています。

```
gate.evaluate()
  → inputs の value を読む
  → 論理演算を実行
  → output.setValue(result)
```

### 実装との対応

`js/circuit.js` の `Gate` クラス（38〜84 行）がゲートの本体です。

```js
// circuit.js:53-67
evaluate() {
    const vals = this.inputs.map(w => w.value);
    switch (this.type) {
        case 'AND':  result = vals.reduce((a, b) => a & b, 1); break;
        case 'XOR':  result = vals.reduce((a, b) => a ^ b, 0); break;
        // ...
    }
}
```

ビジュアライザでゲートをズームインすると、AND ゲートは D 型、OR ゲートは盾型の標準記号で描画されます（`renderer.js` の `_drawGate()` が担当）。

---

## 2. 組み合わせ回路 — ゲートを繋いで計算する

### 概念

複数のゲートを繋いで「より複雑な計算」を行う回路を **組み合わせ回路** と呼びます。特徴は **記憶を持たない** こと。入力が決まれば出力が一意に決まります。

```
入力 → [ゲートの組み合わせ] → 出力
        ↑
        時刻 t の入力のみに依存（過去の値は無関係）
```

### 評価順序 — トポロジカルソート

ゲートが連鎖するとき、前段の出力が決まってから後段を評価しなければなりません。この「正しい評価順序」を求めるアルゴリズムが **トポロジカルソート（カーン法）** です。

```
A → B → D
       ↗
C ───→
```

上の例では A, C を先に評価してから B, 最後に D を評価します。

フィードバックループ（SR ラッチ等）はトポロジカル順が存在しないため、「変化がなくなるまで繰り返す（反復評価）」で安定化させます。通常 2〜3 回で収束します。

### 実装との対応

`js/circuit.js` の `Circuit` クラス（176〜262 行）が評価エンジンです。

```js
// circuit.js:186-253
build() {
    this.sortedGates = this._topologicalSort(); // カーン法でソート
}
evaluate(maxIter = 20) {
    for (let i = 0; i < maxIter; i++) {
        let anyChanged = false;
        for (const g of this.sortedGates) {
            if (g.evaluate()) anyChanged = true;
        }
        if (!anyChanged) return; // 安定したら終了
    }
}
```

---

## 3. 加算器 — 足し算を論理で作る

### 半加算器 (Half Adder)

1 桁の 2 進数 2 つを足す最小の回路です。

```
入力: A, B
出力: Sum (合計の1の位), Carry (繰り上がり)

Sum   = A XOR B   (2つが異なれば1)
Carry = A AND B   (両方1のとき繰り上がり)
```

```
A ──┬─[ XOR ]── Sum
    │
B ──┴─[ AND ]── Carry
```

### 全加算器 (Full Adder)

下の桁からの繰り上がり (Cin) も含めて足す回路。**半加算器 2 個 + OR ゲート 1 個** で構成します。

```
A, B → HA1 → Sum1, Carry1
Sum1, Cin → HA2 → Sum (最終), Carry2
Carry1 OR Carry2 → Cout (繰り上がり出力)
```

### 8 ビットリップルキャリー加算器

全加算器を 8 個直列に繋ぎ、各段の Cout を次の段の Cin に繋ぐ構造です。「繰り上がりが波のように伝播する (ripple)」ことが名前の由来です。

```
    A7  B7   A6  B6  ...  A0  B0
     ↓   ↓    ↓   ↓        ↓   ↓
    [FA7]←[FA6]← ... ←[FA0]← Cin(=0 or SubMode)
     ↓    ↓              ↓
    S7   S6             S0    Cout
```

### 減算 — 2 の補数トリック

`A - B` は `A + (~B) + 1` と等価です（2 の補数による減算）。  
このシミュレータでは `SubMode` 信号が 1 になると：
1. B の各ビットを XOR で反転 (`~B`)
2. Cin を 1 にして `+1`

これにより加算器をそのまま減算器として使い回しています。

### 実装との対応

```
builder.js:buildHalfAdder() (14行〜)
builder.js:buildFullAdder() (47行〜)
builder.js:buildAdder8()    (101行〜)
```

8 ビット加算器はビジュアライザで「ADDER_8BIT」ブロックとして表示されます。ズームインすると 8 個の全加算器、さらにズームインすると半加算器、ゲートの順に展開されます。

ALU の B 入力前段にある `B_INV` ブロック（灰色）が XOR による B 反転を行っています（`builder.js:329` 付近）。

---

## 4. マルチプレクサ (MUX) — 経路を選ぶ

### 概念

複数の入力のうち「どれを出力するか」を選択する回路です。セレクタ信号で経路を切り替えます。

### 2-to-1 MUX (1 ビット)

```
入力: A, B, Sel
出力: A (Sel=0 のとき) または B (Sel=1 のとき)

Out = (A AND NOT Sel) OR (B AND Sel)
```

```
Sel ─┬─[ NOT ]─────────────┐
     │                     ↓
A ───────────────────────[AND]─┐
                               ↓
B ──────────────────────[AND]─[OR]── Out
     ↑
Sel ─┘
```

**NOT ゲート 1 個 + AND ゲート 2 個 + OR ゲート 1 個 = 計 4 ゲート** で 1 ビット MUX が完成します。

### 4-to-1 MUX (8 ビット)

2 ビットのセレクタ (Sel1, Sel0) で 4 つの 8 ビット入力から 1 つを選びます。  
2-to-1 MUX を 2 段ツリーで構成します。

```
       Sel0
        │
I0 ─[MUX2]─┐
I1 ─       │  Sel1
            ├─[MUX2]── Out
I2 ─[MUX2]─┘
I3 ─       Sel0
```

ALU では `{Sel1, Sel0}` の値によって以下の演算結果を選びます。

| Sel1 | Sel0 | 選択結果 |
|------|------|---------|
| 0 | 0 | 加算 (ADD / SUB) |
| 0 | 1 | 論理 AND |
| 1 | 0 | 論理 OR |
| 1 | 1 | 論理 XOR |

### 実装との対応

```
builder.js:buildMux2()      (204行〜)
builder.js:buildMux4_8bit() (245行〜)
builder.js:_rewireMux2()    (290行〜)
```

`_rewireMux2()` は MUX2 内部のゲート入力を直接差し替えるヘルパーです。JavaScript は参照渡しなので、Wire オブジェクトを差し替えることで配線変更を実現しています。

---

## 5. ALU — 演算装置

### 概念

**ALU (Arithmetic Logic Unit)** は CPU の計算中枢です。2 つのオペランド (A, B) と制御信号を受け取り、指定された演算を行って結果を出力します。

### このシミュレータの ALU 構成

```
        A[7:0]  B[7:0]
           ↓      ↓
         [B_INV (XOR×8)]  ← SubMode で B を反転
           ↓       ↓
         [Adder8 (加算器)]── Cout
         [AND×8  (AND演算)]
         [OR×8   (OR演算)]
         [XOR×8  (XOR演算)]
               ↓
         [MUX4_8bit] ← Op0, Op1 で選択
               ↓
         Result[7:0]
               ↓
         [ZERO_DETECT] ── Zero フラグ
```

### ゼロフラグ検出

結果が 0 かどうかを検出するために OR ツリーで全ビットを OR し、NOT で反転します。

```
R0 OR R1 → zw1
R2 OR R3 → zw2
zw1 OR zw2 → zw5
...（8ビット全部を段階的にOR）
zw7 → [NOT] → Zero フラグ
```

いずれかのビットが 1 なら zw7=1 → Zero=0。  
全ビットが 0 なら zw7=0 → Zero=1。

### 実装との対応

```
builder.js:buildALU()       (309行〜)
builder.js:buildBitwiseOp() (151行〜)  ← AND/OR/XOR の8ビットブロック
```

`main.js:setALUInputs()` が ALU への入力設定、`main.js:readALUOutputs()` が結果の読み取りを担当します。演算の実体はゲートレベルで計算され、JavaScript はその結果を読み取っているだけです。

---

## 6. 順序回路とラッチ — 状態を保つ

### 組み合わせ回路との違い

組み合わせ回路は過去を忘れます。**順序回路**は過去の状態を記憶し、現在の入力と過去の状態から次の状態を決めます。

```
組み合わせ: 出力 = f(入力)
順序回路:   出力 = f(入力, 現在の状態)
            次の状態 = g(入力, 現在の状態)
```

### SR ラッチ — 最もシンプルな記憶素子

NAND ゲートを 2 つ **クロス接続** します（一方の出力が他方の入力に）。

```
S̄ ─[NAND1]─── Q
        ↑   ↘
        │    ↘
        ↑    ↗
R̄ ─[NAND2]─── Q̄
```

| S̄ | R̄ | Q (次) | 動作 |
|----|-----|--------|------|
| 1 | 1 | Q (変化なし) | 保持 |
| 0 | 1 | 1 | セット (Q=1) |
| 1 | 0 | 0 | リセット (Q=0) |
| 0 | 0 | 不定 | 禁止状態 |

フィードバックループがあるため、評価を繰り返して安定状態に収束させます（反復評価）。

### D ラッチ — イネーブル付きラッチ

SR ラッチの禁止状態を避けるため、入力を 1 本 (D) にした回路です。  
**NOT ゲート 1 個 + NAND ゲート 2 個 (ゲーティング) + SR ラッチ** で構成します。

```
D  ─┬─[NAND1]─── S̄ ─┐
    │                 ↓
    └─[NOT]─[NAND2]─ R̄ ─[SR Latch]─ Q
                EN ─────────────────┘
```

`EN=1` のとき D の値が Q に透過（ラッチが「開く」）。  
`EN=0` のとき Q は変化しない（ラッチが「閉じる」）。

### 実装との対応

```
builder.js:buildSRLatch() (474行〜)
builder.js:buildDLatch()  (515行〜)
```

`circuit.js:evaluate()` の反復評価により、SR ラッチのフィードバックループが正しく安定化されます。

---

## 7. フリップフロップ (DFF) — クロックで動くメモリ

### 問題: D ラッチの透過

D ラッチは EN=1 の間、D の変化がそのまま Q に伝わります。これでは「クロックの立ち上がりの瞬間だけ値を取り込む」という精密な制御ができません。

### 解決: マスタースレーブ方式

**マスター** と **スレーブ** の 2 つの D ラッチを直列につなぎ、クロックの極性を逆にします。

```
D ─[Master D-Latch (EN=CLK)]─ 中間値 ─[Slave D-Latch (EN=CLK̄)]─ Q
                                                                    ↑
                                             クロックの立ち下がりで確定
```

- CLK=1 のとき: Master が開く（D を取り込む）、Slave は閉じる
- CLK=0 のとき: Master が閉じる（値を保持）、Slave が開く（Q に反映）

→ **CLK の立ち下がりエッジで Q が確定**するエッジトリガー型になります。

```
CLK:  ___╔═══╗___╔═══╗___
D:    ───╫─A─╫───╫─B─╫───
Q:    _______╚═A═╝___╚═B═╝
             ↑       ↑
             立ち下がりで確定
```

### 実装との対応

```
builder.js:buildDFF() (560行〜)
```

```js
// CLK の反転
const notClk = createGate('NOT');
connectGate(notClk, [wCLK], wClkBar);

// マスター: EN=CLK
const master = buildDLatch(...);
master.inputPins['EN'].wire = wCLK;

// スレーブ: EN=CLKbar
const slave = buildDLatch(...);
slave.inputPins['EN'].wire = wClkBar;
```

このシミュレータでは DFF は「1 命令ステップ = 1 クロック」としてソフトウェア的に管理されているため、実際には `setRegisterOutputs()` で直接 Q ピンの値を設定しています。

---

## 8. レジスタ — CPU 内部の高速記憶

### 概念

**レジスタ** は DFF を複数並べた記憶素子です。8 ビットのデータを 1 クロックで読み書きできます。

```
     D0 D1 D2 D3 D4 D5 D6 D7  ← 入力 (8 ビット)
      ↓  ↓  ↓  ↓  ↓  ↓  ↓  ↓
   [DFF0][DFF1]...[DFF7]       ← 8 個の DFF
              ↑ CLK (共通)
      ↓  ↓  ↓  ↓  ↓  ↓  ↓  ↓
     Q0 Q1 Q2 Q3 Q4 Q5 Q6 Q7  ← 出力 (8 ビット)
```

### このシミュレータのレジスタ構成

| レジスタ | 役割 |
|----------|------|
| A (アキュムレータ) | ALU 演算の主オペランド、結果の格納先 |
| B | ALU 演算のサブオペランド |
| PC (プログラムカウンタ) | 次に実行する命令のアドレス |
| IR (命令レジスタ) | 実行中の命令のオペコード部 |
| IR-L (命令レジスタ下位) | 実行中の命令のオペランド部 |

### 実装との対応

```
builder.js:buildRegister8() (610行〜)
```

```js
// 8 個の DFF を並べる
for (let i = 0; i < 8; i++) {
    const dff = buildDFF(`${name}_DFF${i}`, ...);
    dff.inputPins['CLK'].wire = wCLK; // クロック共通
}
```

`main.js:setRegisterOutputs()` でレジスタの Q ピンに直接値を書き込み、可視化しています。

---

## 9. メモリ — プログラムとデータを格納

### 概念

メモリは「アドレス → データ」の巨大なテーブルです。256 バイトのメモリなら：

```
Address 0x00: [opcode0][operand0]  ← 命令 0
Address 0x02: [opcode1][operand1]  ← 命令 1
...
Address 0x80: [data]               ← データ領域
```

### なぜゲートレベルで実装しないのか

256 バイト = 2048 ビットをすべて DFF で実装すると、SR ラッチ 2 個 × 2048 = **約 4096 NAND ゲート** が必要です。さらにアドレスデコーダ（どのセルを選ぶか）に数千ゲートが加わり、合計 **数万ゲート** になります。

このシミュレータは **ハイブリッド実装** を採用しています。

```
データパス (バス) のみ → ゲートレベル（可視化のため）
ストレージ実体       → JavaScript の Uint8Array(256)
```

### 実装との対応

```
builder.js:buildMemory()      (751行〜)  ← 外観用のゲート (AND ×16 のグリッド)
main.js:memory = Uint8Array(256)         ← 実際のデータ格納先
```

```js
// main.js の実装
memory[address] = data;         // 書き込み
const data = memory[address];   // 読み出し
```

ビジュアライザの Memory ブロックをズームインすると 4×4 のグリッド（それぞれ 16 バイト分を表す）が見えますが、これは表示専用で、実際の動作は JavaScript 配列が担っています。

---

## 10. 命令セットアーキテクチャ (ISA)

### 概念

**ISA (Instruction Set Architecture)** は「CPUが理解できる命令の仕様」です。ハードウェアとソフトウェアの境界線を定義します。

### 命令フォーマット

このシミュレータは **固定長 2 バイト命令** を採用しています。

```
バイト 0: オペコード (8 ビット)
バイト 1: オペランド (8 ビット)

例: 0x01 0x19
    ↑    ↑
    LOAD_A  25 → "A レジスタに 25 を読み込め"
```

### 命令一覧

| オペコード | ニーモニック | 動作 | オペランド |
|-----------|-------------|------|----------|
| 0x00 | NOP | 何もしない | - |
| 0x01 | LOAD_A | A = 即値 | 値 (0〜255) |
| 0x02 | LOAD_B | B = 即値 | 値 (0〜255) |
| 0x03 | LOAD_A_MEM | A = Memory[addr] | アドレス |
| 0x04 | STORE_A | Memory[addr] = A | アドレス |
| 0x05 | ADD | A = A + B | - |
| 0x06 | SUB | A = A - B | - |
| 0x07 | AND | A = A AND B | - |
| 0x08 | OR  | A = A OR B | - |
| 0x09 | XOR | A = A XOR B | - |
| 0x0A | NOT | A = NOT A | - |
| 0x0B | JMP | PC = addr | アドレス |
| 0x0C | JZ  | if Z: PC = addr | アドレス |
| 0x0D | JNZ | if !Z: PC = addr | アドレス |
| 0x0E | SHL | A = A << 1 (左シフト) | - |
| 0x0F | HLT | 停止 | - |

### フラグレジスタ

演算結果の性質を記録する 1 ビットフラグです。

| フラグ | 意味 | セットされる条件 |
|--------|------|----------------|
| Z (Zero) | 結果が 0 | 演算結果 = 0 |
| C (Carry) | 桁あふれ | 加算で 8 ビットを超えた / SUB で借り |
| N (Negative) | 負数 | 結果の最上位ビット = 1 |

### 実装との対応

```js
// main.js:28-45
const OP = {
    NOP: 0x00, LOAD_A: 0x01, LOAD_B: 0x02, ...
};
```

PC は 8 ビットなので、アドレス空間は 0x00〜0xFF = 256 バイト。命令は 2 バイト固定なので、最大 **128 命令** を格納できます。

---

## 11. アセンブリ言語とアセンブラ

### 概念

機械語 (0x01 0x19) をそのまま書くのは辛いため、**ニーモニック** (人間が読める命令名) を使います。これが **アセンブリ言語** です。

```asm
; アセンブリ言語 (人間が書く)
LOAD_A 25    ; A = 25
LOAD_B 17    ; B = 17
ADD          ; A = A + B

↓ アセンブラが変換

; 機械語 (バイト列)
0x01 0x19
0x02 0x11
0x05 0x00
```

**アセンブラ** とはこの変換プログラムのことです。

### このシミュレータのアセンブラ

1 パスの単純なアセンブラで、ニーモニックを直接オペコードに変換します。

```js
// main.js:167-184 (loadAssemblyText)
for (const line of lines) {
    const mnemonic = parts[0];       // "LOAD_A"
    const operand = parseInt(parts[1]); // "25" → 25
    const opcode = OP[mnemonic];     // "LOAD_A" → 0x01
    memory[addr++] = opcode;
    memory[addr++] = operand;
}
```

### サポートする文法

```asm
; セミコロンでコメント
# シャープでもコメント

LOAD_A 25       ; ニーモニック + 整数
LOAD_A 0xFF     ; 16進数も可 (JavaScriptのparseIntが処理)
LOAD_A 0b11001100  ; 2進数も可
ADD             ; オペランドなし命令
```

### アセンブラの限界と次のステップ

このシミュレータのアセンブラは **ラベルをサポートしていません**。実際のアセンブラでは：

```asm
; 実際のアセンブラではこう書ける
loop:
    ADD
    JNZ loop    ; アドレスではなくラベルで参照

; このシミュレータでは手動でアドレスを計算する必要がある
    ADD          ; addr 4 (2バイト × 2命令目)
    JNZ 4        ; アドレスを直接指定
```

2 パスアセンブラにすれば解決できます（1 パス目でラベルのアドレスを収集、2 パス目で参照を解決）。

---

## 12. 命令デコーダ — 制御信号を生成する

### 概念

CPU は命令の種類によって「何をすべきか」が変わります。この「オペコード → 制御信号」の変換を行う組み合わせ回路が **命令デコーダ** です。

### 動作原理

```
オペコード = 0x05 (ADD)
    ↓
デコーダ
    ↓
RegWrite = 1  (A レジスタに書き込む)
AluOp0   = 0  (加算を選択)
AluOp1   = 0
SubMode  = 0  (引かない)
MemRead  = 0
MemWrite = 0
...
```

### 実装: AND ゲートでパターンマッチング

各命令に対応する AND ゲートで、オペコードのビットパターンを検出します。

```
LOAD_A のオペコード = 0x01 = 0000 0001

検出回路:
    Op3_inv AND Op2_inv AND Op1_inv AND Op0 → isLoadA
           ↑              ↑             ↑
          ビット3=0     ビット1=0    ビット0=1
```

その後、各制御信号を「どの命令が有効にするか」の OR でまとめます。

```
RegWrite = isLoadA OR isLoadB OR isAdd OR isSub OR isAnd OR ...
           ↑
    A または B に書き込む命令すべてで RegWrite=1
```

### 実装との対応

```
builder.js:buildDecoder() (652行〜)
```

```js
function makeDetector(instrName, pattern, xPos, yPos) {
    const and = createGate('AND');
    // オペコードの各ビットが pattern に一致するか確認
    for (let i = 0; i < 4; i++) {
        inputs.push((pattern >> i) & 1 ? opBits[i] : opBitsInv[i]);
    }
    connectGate(and, inputs, outputWire);
}

const wRegWrite = makeControl('RegWrite',
    [isLoadA, isLoadB, isLoadAM, isAdd, isSub, isAnd, isOr, isXor, isNot], ...
);
```

---

## 13. CPU の動作サイクル — Fetch / Decode / Execute

### 古典的な 3 ステージパイプライン

```
┌────────────┐   ┌────────────┐   ┌────────────────┐
│   FETCH    │ → │   DECODE   │ → │    EXECUTE     │
│            │   │            │   │                │
│ メモリから  │   │ オペコードを │   │ ALU 演算、      │
│ 命令を     │   │ デコードして │   │ レジスタ書き込み、│
│ 取り込む   │   │ 制御信号生成 │   │ PC 更新         │
└────────────┘   └────────────┘   └────────────────┘
      ↑                                    ↓
      └──────── PC が指すアドレス ──────────┘
                  (次の命令へ)
```

### このシミュレータの実行フロー

`main.js:stepCPU()` に 1 命令の実行フローが実装されています（203〜332 行）。

#### FETCH

```js
irOpcode = memory[pc];     // オペコードをメモリから取得
irOperand = memory[pc + 1]; // オペランドを取得
setRegisterInputs(cpu.meta.ir, irOpcode);   // IR レジスタに設定
setRegisterInputs(cpu.meta.irL, irOperand); // IR-L レジスタに設定
```

#### DECODE

```js
// デコーダのオペコード入力を設定
for (let i = 0; i < 8; i++) {
    pin.wire.setValue((irOpcode >> i) & 1);
}
circuit.evaluate(); // 組み合わせ回路を評価 → 制御信号が確定
const ctrl = readDecoderOutputs(); // 制御信号を読み出し
```

#### EXECUTE

```js
setALUInputs(regA, regB, irOpcode); // ALU に入力を設定
circuit.evaluate();                  // ゲートレベル演算を実行
if (aluOp) {
    const aluOut = readALUOutputs(); // ゲートレベルから結果を読み出し
    result = aluOut.result;
}
```

#### WRITE-BACK

```js
if (writeA) regA = result;    // A レジスタを更新
pc = nextPC & 0xFF;           // PC を更新
setRegisterOutputs(cpu.meta.regA, regA); // 可視化のためレジスタ表示を更新
```

### PC の更新

通常は `PC = PC + 2`（2 バイト固定長命令なので +2）。  
ジャンプ命令の場合は `PC = operand` で指定アドレスへ飛びます。

---

## 14. プログラム例で理解する実行フロー

### 例1: `25 + 17 = 42` の計算

```asm
LOAD_A 25    ; A = 25 (0x19)
LOAD_B 17    ; B = 17 (0x11)
ADD          ; A = A + B = 42 (0x2A)
HLT          ; 停止
```

ゲートレベルでの ADD 実行時の信号の流れ：

```
1. setALUInputs(25, 17, 0x05)
   └→ A ワイヤに 00011001 をセット
   └→ B ワイヤに 00010001 をセット
   └→ Op0=1, Op1=0, Sub=0 (加算モード)

2. circuit.evaluate()
   └→ B_INV: SubMode=0 なので B はそのまま
   └→ Adder8: 00011001 + 00010001 = 00101010
   └→ MUX: Op0=0, Op1=0 なので加算結果を選択
   └→ Result = 00101010 = 42

3. Zero フラグ: 42 ≠ 0 なので Z=0
4. readALUOutputs() → result=42, cout=0
```

### 例2: カウントアップ（ループ）

```asm
LOAD_A 0      ; A = 0
LOAD_B 1      ; B = 1
ADD           ; A = A + 1     ← ループの先頭 (addr=4)
STORE_A 0x80  ; Memory[128] = A
LOAD_B 10     ; B = 10
SUB           ; A = A - 10
JZ 14         ; A == 0 なら HLT へ
LOAD_A_MEM 0x80  ; A = Memory[128] (元の A を復元)
LOAD_B 1      ; B = 1
JMP 4         ; ループの先頭へ戻る
HLT           ; addr=14
```

SUB の実行時の 2 の補数トリック：

```
A=5, B=10 の場合

1. SubMode = 1
2. B_INV: 00001010 → XOR → 11110101 (B の反転)
3. Adder8: 00000101 + 11110101 + 1(Cin) = 11111011 = -5 (8ビット符号付き)
4. Z=0 (結果≠0) → JZ は不成立
5. MEM[128] から A を復元して再びループ
```

### 例3: 論理演算の確認

```asm
LOAD_A 0b11001100  ; A = 0xCC
LOAD_B 0b10101010  ; B = 0xAA
AND                ; A = 0xCC AND 0xAA = 0x88
```

ゲートレベルでは `AND×8` ブロックで各ビット独立に計算されます。

```
A: 1 1 0 0 1 1 0 0
B: 1 0 1 0 1 0 1 0
   ─ ─ ─ ─ ─ ─ ─ ─
R: 1 0 0 0 1 0 0 0  = 0x88
```

---

## まとめ — 階層の全体像

```
アセンブリ言語 (LOAD_A 25, ADD, JZ 14, ...)
        ↓  アセンブラが変換
機械語バイト列 (0x01 0x19 0x05 0x00 ...)
        ↓  メモリに格納、PC が指す
命令フェッチ + デコーダが制御信号生成
        ↓
制御信号 (RegWrite, AluOp, SubMode, ...)
        ↓
ALU / レジスタ / メモリへの制御
        ↓  組み合わせ回路が演算
MUX → 8bit 加算器 → AND/OR/XOR ブロック → ゼロ検出
        ↓  全加算器が連鎖
半加算器 (XOR + AND) × 8段
        ↓  ゲートが演算
AND / OR / NOT / NAND / XOR / ...
        ↓  ワイヤが信号を伝達
0 か 1 か (電圧の高低)
```

このビジュアライザはこの階層のどの段でも「ズームイン」して見ることができます。CPU全体 → ALU → 加算器 → 全加算器 → 半加算器 → ゲート → ワイヤの信号と、上から下まで一気通貫で観察できるのがこのプロジェクトの核心です。

---

## 参考: 主要ファイルとコンポーネント対応表

| 概念 | ファイル | 関数/クラス | 行番号 |
|------|---------|------------|--------|
| ワイヤ | circuit.js | `Wire` | 13 |
| ゲート | circuit.js | `Gate` | 39 |
| 評価エンジン | circuit.js | `Circuit.evaluate()` | 244 |
| 半加算器 | builder.js | `buildHalfAdder()` | 14 |
| 全加算器 | builder.js | `buildFullAdder()` | 47 |
| 8bit 加算器 | builder.js | `buildAdder8()` | 101 |
| MUX (1bit) | builder.js | `buildMux2()` | 204 |
| MUX (4-to-1, 8bit) | builder.js | `buildMux4_8bit()` | 245 |
| ALU | builder.js | `buildALU()` | 309 |
| SR ラッチ | builder.js | `buildSRLatch()` | 474 |
| D ラッチ | builder.js | `buildDLatch()` | 515 |
| D フリップフロップ | builder.js | `buildDFF()` | 560 |
| 8bit レジスタ | builder.js | `buildRegister8()` | 610 |
| 命令デコーダ | builder.js | `buildDecoder()` | 652 |
| メモリ (ハイブリッド) | builder.js | `buildMemory()` | 751 |
| CPU 実行サイクル | main.js | `stepCPU()` | 203 |
| アセンブラ | main.js | `loadAssemblyText()` | 167 |
| 命令セット定義 | main.js | `OP` | 28 |
