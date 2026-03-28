'use strict';

// ============================================================
// CPU Builder
// Constructs entire CPU hierarchy from logic gates
// ============================================================

const CPUBuilder = (() => {

    // --------------------------------------------------------
    // Half Adder: XOR + AND
    // Inputs: A, B  Outputs: Sum, Carry
    // --------------------------------------------------------
    function buildHalfAdder(name, x, y) {
        const comp = new Component('HALF_ADDER', name);
        comp.x = x || 0; comp.y = y || 0;
        comp.width = 24; comp.height = 16;
        comp.color = '#6c5ce7';

        const wA = comp.addWire(createWire(`${name}_A`));
        const wB = comp.addWire(createWire(`${name}_B`));

        const xorG = comp.addGate(createGate('XOR', `${name}_xor`, 10, 1));
        const andG = comp.addGate(createGate('AND', `${name}_and`, 10, 9));

        connectGate(xorG, [wA, wB], comp.addWire(createWire(`${name}_sum`)));
        connectGate(andG, [wA, wB], comp.addWire(createWire(`${name}_carry`)));

        // Wire segments for rendering
        wA.segments = [{ x1: 0, y1: 4, x2: 10, y2: 3 }, { x1: 0, y1: 4, x2: 10, y2: 11 }];
        wB.segments = [{ x1: 0, y1: 12, x2: 10, y2: 5 }, { x1: 0, y1: 12, x2: 10, y2: 13 }];
        xorG.output.segments = [{ x1: 16, y1: 3, x2: 24, y2: 4 }];
        andG.output.segments = [{ x1: 16, y1: 11, x2: 24, y2: 12 }];

        comp.setInputPin('A', wA, 0, 4);
        comp.setInputPin('B', wB, 0, 12);
        comp.setOutputPin('Sum', xorG.output, 24, 4);
        comp.setOutputPin('Carry', andG.output, 24, 12);

        return comp;
    }

    // --------------------------------------------------------
    // Full Adder: 2 Half Adders + OR gate
    // Inputs: A, B, Cin  Outputs: Sum, Cout
    // --------------------------------------------------------
    function buildFullAdder(name, x, y) {
        const comp = new Component('FULL_ADDER', name);
        comp.x = x || 0; comp.y = y || 0;
        comp.width = 55; comp.height = 40;
        comp.color = '#a29bfe';

        const wA = comp.addWire(createWire(`${name}_A`));
        const wB = comp.addWire(createWire(`${name}_B`));
        const wCin = comp.addWire(createWire(`${name}_Cin`));

        const ha1 = comp.addChild(buildHalfAdder(`${name}_HA1`, 5, 2));
        const ha2 = comp.addChild(buildHalfAdder(`${name}_HA2`, 5, 20));
        const orG = comp.addGate(createGate('OR', `${name}_or`, 38, 16));

        // Wire A, B to HA1
        ha1.inputPins['A'].wire = wA;
        ha1.inputPins['B'].wire = wB;
        // HA1.Sum and Cin to HA2
        ha2.inputPins['A'].wire = ha1.outputPins['Sum'].wire;
        ha2.inputPins['B'].wire = wCin;
        // Update HA2 internal gate inputs
        ha2.gates[0].inputs = [ha1.outputPins['Sum'].wire, wCin]; // XOR
        ha2.gates[1].inputs = [ha1.outputPins['Sum'].wire, wCin]; // AND
        // HA1.Carry and HA2.Carry to OR -> Cout
        connectGate(orG, [ha1.outputPins['Carry'].wire, ha2.outputPins['Carry'].wire],
            comp.addWire(createWire(`${name}_cout`)));

        // Wire segments
        wA.segments = [{ x1: 0, y1: 8, x2: 5, y2: 6 }];
        wB.segments = [{ x1: 0, y1: 16, x2: 5, y2: 14 }];
        wCin.segments = [{ x1: 0, y1: 32, x2: 5, y2: 32 }];
        ha1.outputPins['Sum'].wire.segments.push({ x1: 29, y1: 6, x2: 5, y2: 24 });
        ha1.outputPins['Carry'].wire.segments.push({ x1: 29, y1: 14, x2: 38, y2: 18 });
        ha2.outputPins['Carry'].wire.segments.push({ x1: 29, y1: 32, x2: 38, y2: 20 });
        orG.output.segments = [{ x1: 44, y1: 18, x2: 55, y2: 18 }];
        ha2.outputPins['Sum'].wire.segments.push({ x1: 29, y1: 24, x2: 55, y2: 8 });

        comp.setInputPin('A', wA, 0, 8);
        comp.setInputPin('B', wB, 0, 16);
        comp.setInputPin('Cin', wCin, 0, 32);
        comp.setOutputPin('Sum', ha2.outputPins['Sum'].wire, 55, 8);
        comp.setOutputPin('Cout', orG.output, 55, 18);

        return comp;
    }

    // --------------------------------------------------------
    // 8-bit Ripple Carry Adder
    // --------------------------------------------------------
    function buildAdder8(name, x, y) {
        const comp = new Component('ADDER_8BIT', name);
        comp.x = x || 0; comp.y = y || 0;
        comp.width = 480; comp.height = 55;
        comp.color = '#0984e3';

        const wCin = comp.addWire(createWire(`${name}_cin`));
        comp.setInputPin('Cin', wCin, 0, 45);

        let prevCarry = wCin;
        for (let i = 0; i < 8; i++) {
            const fa = comp.addChild(buildFullAdder(`${name}_FA${i}`, 5 + i * 58, 5));
            const wA = comp.addWire(createWire(`${name}_A${i}`));
            const wB = comp.addWire(createWire(`${name}_B${i}`));

            // Rewire FA inputs
            fa.inputPins['A'].wire = wA;
            fa.inputPins['B'].wire = wB;
            fa.inputPins['Cin'].wire = prevCarry;
            // Rewire internal: HA1 inputs = A, B
            fa.children[0].gates[0].inputs = [wA, wB];
            fa.children[0].gates[1].inputs = [wA, wB];
            // HA2 inputs = HA1.Sum, Cin
            fa.children[1].gates[0].inputs = [fa.children[0].gates[0].output, prevCarry];
            fa.children[1].gates[1].inputs = [fa.children[0].gates[0].output, prevCarry];
            // OR inputs = HA1.Carry, HA2.Carry
            fa.gates[0].inputs = [fa.children[0].gates[1].output, fa.children[1].gates[1].output];

            wA.segments = [{ x1: 5 + i * 58 + 2, y1: 0, x2: 5 + i * 58, y2: 13 }];
            wB.segments = [{ x1: 5 + i * 58 + 12, y1: 0, x2: 5 + i * 58, y2: 21 }];

            comp.setInputPin(`A${i}`, wA, 5 + i * 58 + 2, 0);
            comp.setInputPin(`B${i}`, wB, 5 + i * 58 + 12, 0);
            comp.setOutputPin(`S${i}`, fa.outputPins['Sum'].wire, 5 + i * 58 + 55, 13);

            prevCarry = fa.outputPins['Cout'].wire;
            // Carry chain wire segment
            if (i < 7) {
                prevCarry.segments.push({ x1: 5 + i * 58 + 55, y1: 23, x2: 5 + (i + 1) * 58, y2: 37 });
            }
        }
        comp.setOutputPin('Cout', prevCarry, 480, 45);

        return comp;
    }

    // --------------------------------------------------------
    // 8-bit AND/OR/XOR block (bitwise operation)
    // --------------------------------------------------------
    function buildBitwiseOp(name, type, x, y) {
        const comp = new Component(`BITWISE_${type}`, name);
        comp.x = x || 0; comp.y = y || 0;
        comp.width = 480; comp.height = 20;
        comp.color = type === 'AND' ? '#00b894' : type === 'OR' ? '#fdcb6e' : '#e17055';

        for (let i = 0; i < 8; i++) {
            const wA = comp.addWire(createWire(`${name}_A${i}`));
            const wB = comp.addWire(createWire(`${name}_B${i}`));
            const g = comp.addGate(createGate(type, `${name}_${type}${i}`, 5 + i * 58, 5));
            connectGate(g, [wA, wB], comp.addWire(createWire(`${name}_R${i}`)));

            comp.setInputPin(`A${i}`, wA, 5 + i * 58, 0);
            comp.setInputPin(`B${i}`, wB, 5 + i * 58 + 3, 0);
            comp.setOutputPin(`R${i}`, g.output, 5 + i * 58 + 6, 7);

            wA.segments = [{ x1: 5 + i * 58, y1: 0, x2: 5 + i * 58, y2: 7 }];
            wB.segments = [{ x1: 5 + i * 58 + 3, y1: 0, x2: 5 + i * 58 + 3, y2: 9 }];
            g.output.segments = [{ x1: 11 + i * 58, y1: 7, x2: 11 + i * 58, y2: 20 }];
        }

        return comp;
    }

    // --------------------------------------------------------
    // 8-bit NOT block
    // --------------------------------------------------------
    function buildNot8(name, x, y) {
        const comp = new Component('NOT_8BIT', name);
        comp.x = x || 0; comp.y = y || 0;
        comp.width = 480; comp.height = 18;
        comp.color = '#d63031';

        for (let i = 0; i < 8; i++) {
            const wA = comp.addWire(createWire(`${name}_A${i}`));
            const g = comp.addGate(createGate('NOT', `${name}_NOT${i}`, 5 + i * 58, 5));
            g.height = 3;
            connectGate(g, [wA], comp.addWire(createWire(`${name}_R${i}`)));

            comp.setInputPin(`A${i}`, wA, 5 + i * 58, 0);
            comp.setOutputPin(`R${i}`, g.output, 11 + i * 58, 7);

            wA.segments = [{ x1: 5 + i * 58, y1: 0, x2: 5 + i * 58, y2: 5 }];
            g.output.segments = [{ x1: 11 + i * 58, y1: 7, x2: 11 + i * 58, y2: 18 }];
        }
        return comp;
    }

    // --------------------------------------------------------
    // 2-to-1 MUX (1-bit)
    // sel=0 -> A, sel=1 -> B
    // Built from: NOT, 2x AND, OR
    // --------------------------------------------------------
    function buildMux2(name, x, y) {
        const comp = new Component('MUX2', name);
        comp.x = x || 0; comp.y = y || 0;
        comp.width = 24; comp.height = 18;
        comp.color = '#e84393';

        const wA = comp.addWire(createWire(`${name}_A`));
        const wB = comp.addWire(createWire(`${name}_B`));
        const wSel = comp.addWire(createWire(`${name}_Sel`));

        const notG = comp.addGate(createGate('NOT', `${name}_not`, 3, 1));
        notG.width = 4; notG.height = 3;
        const and1 = comp.addGate(createGate('AND', `${name}_and1`, 10, 0));
        and1.height = 3;
        const and2 = comp.addGate(createGate('AND', `${name}_and2`, 10, 8));
        and2.height = 3;
        const orG = comp.addGate(createGate('OR', `${name}_or`, 18, 4));
        orG.height = 3;

        const wNotSel = comp.addWire(createWire(`${name}_notsel`));
        const wAnd1Out = comp.addWire(createWire(`${name}_a1o`));
        const wAnd2Out = comp.addWire(createWire(`${name}_a2o`));

        connectGate(notG, [wSel], wNotSel);
        connectGate(and1, [wA, wNotSel], wAnd1Out);
        connectGate(and2, [wB, wSel], wAnd2Out);
        connectGate(orG, [wAnd1Out, wAnd2Out], comp.addWire(createWire(`${name}_out`)));

        comp.setInputPin('A', wA, 0, 2);
        comp.setInputPin('B', wB, 0, 10);
        comp.setInputPin('Sel', wSel, 0, 16);
        comp.setOutputPin('Out', orG.output, 24, 6);

        return comp;
    }

    // --------------------------------------------------------
    // 8-bit 4-to-1 MUX (for ALU operation select)
    // sel[1:0] selects among 4 8-bit inputs
    // Built from MUX2 trees
    // --------------------------------------------------------
    function buildMux4_8bit(name, x, y) {
        const comp = new Component('MUX4_8BIT', name);
        comp.x = x || 0; comp.y = y || 0;
        comp.width = 120; comp.height = 90;
        comp.color = '#e84393';

        const wSel0 = comp.addWire(createWire(`${name}_sel0`));
        const wSel1 = comp.addWire(createWire(`${name}_sel1`));

        for (let i = 0; i < 8; i++) {
            // 4 input wires per bit
            const wIn0 = comp.addWire(createWire(`${name}_in0_${i}`));
            const wIn1 = comp.addWire(createWire(`${name}_in1_${i}`));
            const wIn2 = comp.addWire(createWire(`${name}_in2_${i}`));
            const wIn3 = comp.addWire(createWire(`${name}_in3_${i}`));

            // Level 1: 2 MUX2 (select by sel0)
            const mux_a = comp.addChild(buildMux2(`${name}_m1a_${i}`, 10 + i * 13, 5));
            const mux_b = comp.addChild(buildMux2(`${name}_m1b_${i}`, 10 + i * 13, 30));
            // Level 2: 1 MUX2 (select by sel1)
            const mux_c = comp.addChild(buildMux2(`${name}_m2_${i}`, 10 + i * 13, 58));

            // Rewire level 1
            _rewireMux2(mux_a, wIn0, wIn1, wSel0);
            _rewireMux2(mux_b, wIn2, wIn3, wSel0);
            // Rewire level 2
            _rewireMux2(mux_c, mux_a.outputPins['Out'].wire, mux_b.outputPins['Out'].wire, wSel1);

            comp.setInputPin(`I0_${i}`, wIn0, 0, 8);
            comp.setInputPin(`I1_${i}`, wIn1, 0, 18);
            comp.setInputPin(`I2_${i}`, wIn2, 0, 38);
            comp.setInputPin(`I3_${i}`, wIn3, 0, 48);
            comp.setOutputPin(`O${i}`, mux_c.outputPins['Out'].wire, 120, 64 + i * 0);
        }

        comp.setInputPin('Sel0', wSel0, 60, 90);
        comp.setInputPin('Sel1', wSel1, 70, 90);

        return comp;
    }

    function _rewireMux2(mux, wA, wB, wSel) {
        mux.inputPins['A'].wire = wA;
        mux.inputPins['B'].wire = wB;
        mux.inputPins['Sel'].wire = wSel;
        // Rewire internal gates
        // notG inputs[0] = Sel
        mux.gates[0].inputs = [wSel];
        // and1 inputs = [A, notSel]
        mux.gates[1].inputs = [wA, mux.gates[0].output];
        // and2 inputs = [B, Sel]
        mux.gates[2].inputs = [wB, wSel];
        // orG stays connected to and1.out, and2.out
    }

    // --------------------------------------------------------
    // ALU (8-bit)
    // Operations: ADD(00), AND(01), OR(10), XOR(11)
    // Also handles SUB via carry-in and B inversion
    // --------------------------------------------------------
    function buildALU(name, x, y) {
        const comp = new Component('ALU', name);
        comp.x = x || 0; comp.y = y || 0;
        comp.width = 520; comp.height = 280;
        comp.color = '#e17055';
        comp.label = 'ALU';

        // Control wires
        const wSel0 = comp.addWire(createWire(`${name}_op0`));
        const wSel1 = comp.addWire(createWire(`${name}_op1`));
        const wSubMode = comp.addWire(createWire(`${name}_sub`));

        // B inversion for SUB: XOR each B bit with SubMode
        const bInvComp = new Component('B_INV', `${name}_binv`);
        bInvComp.x = 10; bInvComp.y = 5;
        bInvComp.width = 480; bInvComp.height = 16;
        bInvComp.color = '#636e72';
        comp.addChild(bInvComp);

        const bInvWires = [];
        for (let i = 0; i < 8; i++) {
            const wB = bInvComp.addWire(createWire(`${name}_B${i}`));
            const xorG = bInvComp.addGate(createGate('XOR', `${name}_bxor${i}`, 5 + i * 58, 4));
            xorG.height = 3;
            const wOut = bInvComp.addWire(createWire(`${name}_Binv${i}`));
            connectGate(xorG, [wB, wSubMode], wOut);
            bInvComp.setInputPin(`B${i}`, wB, 5 + i * 58, 0);
            bInvComp.setOutputPin(`R${i}`, wOut, 11 + i * 58, 7);
            bInvWires.push(wOut);
        }

        // Adder
        const adder = comp.addChild(buildAdder8(`${name}_add`, 10, 30));
        // Rewire adder carry-in to SubMode (for 2's complement)
        adder.inputPins['Cin'].wire = wSubMode;
        // Rewire adder first FA carry-in
        const fa0 = adder.children[0];
        fa0.inputPins['Cin'].wire = wSubMode;
        fa0.children[1].gates[0].inputs = [fa0.children[0].gates[0].output, wSubMode];
        fa0.children[1].gates[1].inputs = [fa0.children[0].gates[0].output, wSubMode];

        // AND block
        const andBlock = comp.addChild(buildBitwiseOp(`${name}_and`, 'AND', 10, 95));
        // OR block
        const orBlock = comp.addChild(buildBitwiseOp(`${name}_or`, 'OR', 10, 125));
        // XOR block
        const xorBlock = comp.addChild(buildBitwiseOp(`${name}_xor`, 'XOR', 10, 155));

        // MUX to select result
        const mux = comp.addChild(buildMux4_8bit(`${name}_mux`, 10, 180));

        // Wire A inputs and B-inverted to adder
        for (let i = 0; i < 8; i++) {
            const wA = comp.addWire(createWire(`${name}_A${i}`));

            // Adder: rewire A and B inputs
            adder.inputPins[`A${i}`].wire = wA;
            adder.inputPins[`B${i}`].wire = bInvWires[i];
            // Rewire internal FA
            const fa = adder.children[i];
            fa.inputPins['A'].wire = wA;
            fa.inputPins['B'].wire = bInvWires[i];
            fa.children[0].gates[0].inputs = [wA, bInvWires[i]];
            fa.children[0].gates[1].inputs = [wA, bInvWires[i]];

            // Bitwise ops: rewire A and B
            const origB = bInvComp.inputPins[`B${i}`].wire;
            andBlock.gates[i].inputs = [wA, origB];
            orBlock.gates[i].inputs = [wA, origB];
            xorBlock.gates[i].inputs = [wA, origB];

            // MUX inputs: ADD result, AND result, OR result, XOR result
            _rewireMux2(mux.children[i * 3], adder.outputPins[`S${i}`].wire, andBlock.gates[i].output, wSel0);
            _rewireMux2(mux.children[i * 3 + 1], orBlock.gates[i].output, xorBlock.gates[i].output, wSel0);
            _rewireMux2(mux.children[i * 3 + 2],
                mux.children[i * 3].outputPins['Out'].wire,
                mux.children[i * 3 + 1].outputPins['Out'].wire, wSel1);

            comp.setInputPin(`A${i}`, wA, 0, 40 + i * 6);
            comp.setInputPin(`B${i}`, origB, 0, 100 + i * 6);
            comp.setOutputPin(`R${i}`, mux.children[i * 3 + 2].outputPins['Out'].wire, 520, 190 + i * 6);
        }

        // Zero flag: NOR tree of all result bits
        const zeroTree = new Component('ZERO_DETECT', `${name}_zero`);
        zeroTree.x = 400; zeroTree.y = 190;
        zeroTree.width = 100; zeroTree.height = 60;
        zeroTree.color = '#ffeaa7';
        comp.addChild(zeroTree);

        // OR all 8 result bits, then NOT
        const or1 = zeroTree.addGate(createGate('OR', `${name}_zor1`, 5, 5));
        const or2 = zeroTree.addGate(createGate('OR', `${name}_zor2`, 5, 15));
        const or3 = zeroTree.addGate(createGate('OR', `${name}_zor3`, 5, 25));
        const or4 = zeroTree.addGate(createGate('OR', `${name}_zor4`, 5, 35));
        const or5 = zeroTree.addGate(createGate('OR', `${name}_zor5`, 30, 10));
        const or6 = zeroTree.addGate(createGate('OR', `${name}_zor6`, 30, 30));
        const or7 = zeroTree.addGate(createGate('OR', `${name}_zor7`, 55, 20));
        const notZ = zeroTree.addGate(createGate('NOT', `${name}_znot`, 75, 22));
        notZ.width = 4; notZ.height = 3;

        const zw1 = zeroTree.addWire(createWire(`${name}_zw1`));
        const zw2 = zeroTree.addWire(createWire(`${name}_zw2`));
        const zw3 = zeroTree.addWire(createWire(`${name}_zw3`));
        const zw4 = zeroTree.addWire(createWire(`${name}_zw4`));
        const zw5 = zeroTree.addWire(createWire(`${name}_zw5`));
        const zw6 = zeroTree.addWire(createWire(`${name}_zw6`));
        const zw7 = zeroTree.addWire(createWire(`${name}_zw7`));
        const zwZ = zeroTree.addWire(createWire(`${name}_zflag`));

        // Get result wires from MUX outputs
        const resBits = [];
        for (let i = 0; i < 8; i++) {
            resBits.push(mux.children[i * 3 + 2].outputPins['Out'].wire);
        }

        connectGate(or1, [resBits[0], resBits[1]], zw1);
        connectGate(or2, [resBits[2], resBits[3]], zw2);
        connectGate(or3, [resBits[4], resBits[5]], zw3);
        connectGate(or4, [resBits[6], resBits[7]], zw4);
        connectGate(or5, [zw1, zw2], zw5);
        connectGate(or6, [zw3, zw4], zw6);
        connectGate(or7, [zw5, zw6], zw7);
        connectGate(notZ, [zw7], zwZ);

        comp.setInputPin('Op0', wSel0, 200, 280);
        comp.setInputPin('Op1', wSel1, 220, 280);
        comp.setInputPin('Sub', wSubMode, 240, 280);
        comp.setOutputPin('Zero', zwZ, 520, 250);
        comp.setOutputPin('Cout', adder.outputPins['Cout'].wire, 520, 260);
        comp.meta.resultBits = resBits;

        return comp;
    }

    // --------------------------------------------------------
    // SR Latch from 2 NAND gates (cross-coupled)
    // Inputs: S̄, R̄  Outputs: Q, Q̄
    // --------------------------------------------------------
    function buildSRLatch(name, x, y) {
        const comp = new Component('SR_LATCH', name);
        comp.x = x || 0; comp.y = y || 0;
        comp.width = 20; comp.height = 14;
        comp.color = '#00cec9';

        const wSb = comp.addWire(createWire(`${name}_Sb`));
        const wRb = comp.addWire(createWire(`${name}_Rb`));

        const nand1 = comp.addGate(createGate('NAND', `${name}_n1`, 6, 1));
        nand1.width = 5; nand1.height = 4;
        const nand2 = comp.addGate(createGate('NAND', `${name}_n2`, 6, 8));
        nand2.width = 5; nand2.height = 4;

        const wQ = comp.addWire(createWire(`${name}_Q`));
        const wQb = comp.addWire(createWire(`${name}_Qb`));

        // Cross-coupled: NAND1 out = Q, NAND2 out = Qbar
        // NAND1 inputs: Sbar, Qbar
        // NAND2 inputs: Rbar, Q
        connectGate(nand1, [wSb, wQb], wQ);
        connectGate(nand2, [wRb, wQ], wQb);

        wSb.segments = [{ x1: 0, y1: 3, x2: 6, y2: 3 }];
        wRb.segments = [{ x1: 0, y1: 11, x2: 6, y2: 10 }];
        wQ.segments = [{ x1: 11, y1: 3, x2: 20, y2: 3 }];
        wQb.segments = [{ x1: 11, y1: 10, x2: 20, y2: 11 }, { x1: 13, y1: 10, x2: 13, y2: 3, }, { x1: 13, y1: 3, x2: 6, y2: 5 }];
        wQ.segments.push({ x1: 13, y1: 3, x2: 13, y2: 10 }, { x1: 13, y1: 10, x2: 6, y2: 12 });

        comp.setInputPin('Sb', wSb, 0, 3);
        comp.setInputPin('Rb', wRb, 0, 11);
        comp.setOutputPin('Q', wQ, 20, 3);
        comp.setOutputPin('Qb', wQb, 20, 11);

        return comp;
    }

    // --------------------------------------------------------
    // D Latch (transparent when EN=1)
    // Built from: NOT, 2 NAND (gating), SR Latch
    // --------------------------------------------------------
    function buildDLatch(name, x, y) {
        const comp = new Component('D_LATCH', name);
        comp.x = x || 0; comp.y = y || 0;
        comp.width = 44; comp.height = 22;
        comp.color = '#00b894';

        const wD = comp.addWire(createWire(`${name}_D`));
        const wEN = comp.addWire(createWire(`${name}_EN`));

        // NOT for D-bar
        const notD = comp.addGate(createGate('NOT', `${name}_notD`, 3, 2));
        notD.width = 4; notD.height = 3;
        const wDb = comp.addWire(createWire(`${name}_Db`));
        connectGate(notD, [wD], wDb);

        // NAND gates for gating
        const nand1 = comp.addGate(createGate('NAND', `${name}_g1`, 12, 1));
        nand1.width = 5; nand1.height = 4;
        const nand2 = comp.addGate(createGate('NAND', `${name}_g2`, 12, 14));
        nand2.width = 5; nand2.height = 4;
        const wSb = comp.addWire(createWire(`${name}_Sb`));
        const wRb = comp.addWire(createWire(`${name}_Rb`));
        connectGate(nand1, [wD, wEN], wSb);
        connectGate(nand2, [wDb, wEN], wRb);

        // SR Latch
        const sr = comp.addChild(buildSRLatch(`${name}_sr`, 22, 3));
        sr.inputPins['Sb'].wire = wSb;
        sr.inputPins['Rb'].wire = wRb;
        // Rewire SR internals
        sr.gates[0].inputs = [wSb, sr.gates[1].output];
        sr.gates[1].inputs = [wRb, sr.gates[0].output];

        comp.setInputPin('D', wD, 0, 4);
        comp.setInputPin('EN', wEN, 0, 18);
        comp.setOutputPin('Q', sr.outputPins['Q'].wire, 44, 6);
        comp.setOutputPin('Qb', sr.outputPins['Qb'].wire, 44, 16);

        return comp;
    }

    // --------------------------------------------------------
    // D Flip-Flop (master-slave, edge-triggered)
    // Master latch transparent on CLK=1, Slave on CLK=0
    // --------------------------------------------------------
    function buildDFF(name, x, y) {
        const comp = new Component('DFF', name);
        comp.x = x || 0; comp.y = y || 0;
        comp.width = 60; comp.height = 28;
        comp.color = '#00cec9';

        const wD = comp.addWire(createWire(`${name}_D`));
        const wCLK = comp.addWire(createWire(`${name}_CLK`));

        // NOT for clock inversion
        const notClk = comp.addGate(createGate('NOT', `${name}_notclk`, 3, 20));
        notClk.width = 4; notClk.height = 3;
        const wClkBar = comp.addWire(createWire(`${name}_clkbar`));
        connectGate(notClk, [wCLK], wClkBar);

        // Master D-latch (transparent when CLK=1)
        const master = comp.addChild(buildDLatch(`${name}_master`, 5, 0));
        master.inputPins['D'].wire = wD;
        master.inputPins['EN'].wire = wCLK;
        // Rewire master internals
        master.gates[0].inputs = [wD]; // NOT D
        master.gates[1].inputs = [wD, wCLK]; // NAND(D, CLK)
        master.gates[2].inputs = [master.gates[0].output, wCLK]; // NAND(Db, CLK)

        // Slave D-latch (transparent when CLK=0 → EN=CLKbar)
        const slave = comp.addChild(buildDLatch(`${name}_slave`, 25, 0));
        const masterQ = master.outputPins['Q'].wire;
        slave.inputPins['D'].wire = masterQ;
        slave.inputPins['EN'].wire = wClkBar;
        // Rewire slave internals
        slave.gates[0].inputs = [masterQ]; // NOT D
        slave.gates[1].inputs = [masterQ, wClkBar]; // NAND(D, EN)
        slave.gates[2].inputs = [slave.gates[0].output, wClkBar]; // NAND(Db, EN)

        comp.setInputPin('D', wD, 0, 4);
        comp.setInputPin('CLK', wCLK, 0, 22);
        comp.setOutputPin('Q', slave.outputPins['Q'].wire, 60, 6);
        comp.setOutputPin('Qb', slave.outputPins['Qb'].wire, 60, 19);

        return comp;
    }

    // --------------------------------------------------------
    // 8-bit Register (8 D Flip-Flops)
    // --------------------------------------------------------
    function buildRegister8(name, x, y) {
        const comp = new Component('REGISTER', name);
        comp.x = x || 0; comp.y = y || 0;
        comp.width = 80; comp.height = 240;
        comp.color = '#0984e3';
        comp.label = name;

        const wCLK = comp.addWire(createWire(`${name}_CLK`));
        comp.setInputPin('CLK', wCLK, 0, 235);

        for (let i = 0; i < 8; i++) {
            const dff = comp.addChild(buildDFF(`${name}_DFF${i}`, 8, 5 + i * 28));
            const wD = comp.addWire(createWire(`${name}_D${i}`));

            dff.inputPins['D'].wire = wD;
            dff.inputPins['CLK'].wire = wCLK;
            // Rewire DFF clock internal
            dff.gates[0].inputs = [wCLK]; // NOT CLK
            // Master rewire
            dff.children[0].gates[0].inputs = [wD];
            dff.children[0].gates[1].inputs = [wD, wCLK];
            dff.children[0].gates[2].inputs = [dff.children[0].gates[0].output, wCLK];
            // Slave rewire
            const masterQ = dff.children[0].outputPins['Q'].wire;
            const clkBar = dff.gates[0].output;
            dff.children[1].gates[0].inputs = [masterQ];
            dff.children[1].gates[1].inputs = [masterQ, clkBar];
            dff.children[1].gates[2].inputs = [dff.children[1].gates[0].output, clkBar];

            comp.setInputPin(`D${i}`, wD, 0, 10 + i * 28);
            comp.setOutputPin(`Q${i}`, dff.outputPins['Q'].wire, 80, 10 + i * 28);
        }

        return comp;
    }

    // --------------------------------------------------------
    // Instruction Decoder
    // Takes 8-bit opcode, generates control signals
    // Implemented as combinational logic (AND/OR/NOT)
    // --------------------------------------------------------
    function buildDecoder(name, x, y) {
        const comp = new Component('DECODER', name);
        comp.x = x || 0; comp.y = y || 0;
        comp.width = 200; comp.height = 160;
        comp.color = '#fdcb6e';
        comp.label = 'Instruction Decoder';

        // 8 opcode input wires
        const opBits = [];
        const opBitsInv = [];
        for (let i = 0; i < 8; i++) {
            const w = comp.addWire(createWire(`${name}_op${i}`));
            opBits.push(w);
            comp.setInputPin(`Op${i}`, w, 0, 10 + i * 16);

            const notG = comp.addGate(createGate('NOT', `${name}_not${i}`, 10, 8 + i * 16));
            notG.width = 4; notG.height = 3;
            const wInv = comp.addWire(createWire(`${name}_op${i}_inv`));
            connectGate(notG, [w], wInv);
            opBitsInv.push(wInv);
        }

        // Instruction patterns (simplified - only low 4 bits used):
        // 0001 = LOAD_A    → regWrite=1, aluSrc=imm, regDst=A
        // 0010 = LOAD_B    → regWrite=1, aluSrc=imm, regDst=B
        // 0011 = LOAD_A_M  → memRead=1, regWrite=1, regDst=A
        // 0100 = STORE_A   → memWrite=1
        // 0101 = ADD       → aluOp=00, regWrite=1
        // 0110 = SUB       → aluOp=00, sub=1, regWrite=1
        // 0111 = AND_OP    → aluOp=01, regWrite=1
        // 1000 = OR_OP     → aluOp=10, regWrite=1
        // 1001 = XOR_OP    → aluOp=11, regWrite=1
        // 1010 = NOT_OP    → special, regWrite=1
        // 1011 = JMP       → branch=1
        // 1100 = JZ        → branchZ=1
        // 1111 = HLT       → halt=1

        // Generate control signals using AND gates for each instruction
        // We'll generate simplified control using gate logic

        // For each instruction, create a detection AND gate
        function makeDetector(instrName, pattern, xPos, yPos) {
            const and = comp.addGate(createGate('AND', `${name}_det_${instrName}`, xPos, yPos));
            and.width = 5; and.height = 3;
            const inputs = [];
            for (let i = 0; i < 4; i++) {
                inputs.push((pattern >> i) & 1 ? opBits[i] : opBitsInv[i]);
            }
            const w = comp.addWire(createWire(`${name}_is_${instrName}`));
            connectGate(and, inputs, w);
            return w;
        }

        const isLoadA = makeDetector('load_a', 0x1, 50, 5);
        const isLoadB = makeDetector('load_b', 0x2, 50, 15);
        const isLoadAM = makeDetector('load_am', 0x3, 50, 25);
        const isStoreA = makeDetector('store', 0x4, 50, 35);
        const isAdd = makeDetector('add', 0x5, 50, 45);
        const isSub = makeDetector('sub', 0x6, 50, 55);
        const isAnd = makeDetector('and', 0x7, 50, 65);
        const isOr = makeDetector('or', 0x8, 50, 75);
        const isXor = makeDetector('xor', 0x9, 50, 85);
        const isNot = makeDetector('not', 0xA, 50, 95);
        const isJmp = makeDetector('jmp', 0xB, 50, 105);
        const isJz = makeDetector('jz', 0xC, 50, 115);
        const isHlt = makeDetector('hlt', 0xF, 50, 135);

        // Control signals (OR of relevant instruction detectors)
        function makeControl(ctrlName, sources, xPos, yPos) {
            if (sources.length === 1) {
                comp.setOutputPin(ctrlName, sources[0], 200, yPos);
                return sources[0];
            }
            const or = comp.addGate(createGate('OR', `${name}_${ctrlName}`, xPos, yPos));
            or.width = 5; or.height = 3;
            const w = comp.addWire(createWire(`${name}_${ctrlName}`));
            connectGate(or, sources, w);
            comp.setOutputPin(ctrlName, w, 200, yPos + 1);
            return w;
        }

        const wRegWrite = makeControl('RegWrite', [isLoadA, isLoadB, isLoadAM, isAdd, isSub, isAnd, isOr, isXor, isNot], 130, 10);
        const wMemRead = makeControl('MemRead', [isLoadAM], 130, 25);
        const wMemWrite = makeControl('MemWrite', [isStoreA], 130, 35);
        const wAluOp0 = makeControl('AluOp0', [isAnd, isXor], 130, 55);
        const wAluOp1 = makeControl('AluOp1', [isOr, isXor], 130, 65);
        const wSubMode = makeControl('SubMode', [isSub], 130, 75);
        const wBranch = makeControl('Branch', [isJmp], 130, 95);
        const wBranchZ = makeControl('BranchZ', [isJz], 130, 105);
        const wHalt = makeControl('Halt', [isHlt], 130, 135);
        const wLoadImm = makeControl('LoadImm', [isLoadA, isLoadB], 130, 145);
        const wRegDstB = makeControl('RegDstB', [isLoadB], 130, 155);

        return comp;
    }

    // --------------------------------------------------------
    // Memory Unit (hybrid: gate-level bus interface, JS array storage)
    // --------------------------------------------------------
    function buildMemory(name, x, y) {
        const comp = new Component('MEMORY', name);
        comp.x = x || 0; comp.y = y || 0;
        comp.width = 160; comp.height = 260;
        comp.color = '#6c5ce7';
        comp.label = 'Memory (256 bytes)';

        // Address bus input (8 bits)
        for (let i = 0; i < 8; i++) {
            const w = comp.addWire(createWire(`${name}_addr${i}`));
            comp.setInputPin(`Addr${i}`, w, 0, 10 + i * 14);
        }

        // Data bus input/output (8 bits)
        for (let i = 0; i < 8; i++) {
            const wIn = comp.addWire(createWire(`${name}_din${i}`));
            const wOut = comp.addWire(createWire(`${name}_dout${i}`));
            comp.setInputPin(`Din${i}`, wIn, 0, 130 + i * 14);
            comp.setOutputPin(`Dout${i}`, wOut, 160, 10 + i * 14);
        }

        // Control signals
        const wRead = comp.addWire(createWire(`${name}_read`));
        const wWrite = comp.addWire(createWire(`${name}_write`));
        comp.setInputPin('Read', wRead, 80, 0);
        comp.setInputPin('Write', wWrite, 100, 0);

        // Internal storage (not gate-level - too many gates for 256 bytes)
        comp.meta.storage = new Uint8Array(256);

        // Add some decorative gates to represent the memory array
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                const g = comp.addGate(createGate('AND', `${name}_cell_${row}_${col}`,
                    30 + col * 30, 30 + row * 50));
                g.width = 20; g.height = 12;
                // These are decorative - real memory is in meta.storage
                const dummyIn = comp.addWire(createWire(`${name}_dummy_${row}_${col}`));
                const dummyOut = comp.addWire(createWire(`${name}_dummyout_${row}_${col}`));
                connectGate(g, [dummyIn], dummyOut);
            }
        }

        return comp;
    }

    // --------------------------------------------------------
    // Program Counter (8-bit register + incrementer)
    // --------------------------------------------------------
    function buildPC(name, x, y) {
        const comp = new Component('PC', name);
        comp.x = x || 0; comp.y = y || 0;
        comp.width = 100; comp.height = 260;
        comp.color = '#e84393';
        comp.label = 'Program Counter';

        const reg = comp.addChild(buildRegister8(`${name}_reg`, 10, 5));

        // MUX for each bit: select between incremented value and branch target
        const wBranch = comp.addWire(createWire(`${name}_branch`));
        comp.setInputPin('Branch', wBranch, 50, 260);

        for (let i = 0; i < 8; i++) {
            const wNext = comp.addWire(createWire(`${name}_next${i}`));
            const wTarget = comp.addWire(createWire(`${name}_target${i}`));

            // Simple MUX: Branch=0 → wNext, Branch=1 → wTarget
            const mux = comp.addChild(buildMux2(`${name}_mux${i}`, 70, 10 + i * 28));
            _rewireMux2(mux, wNext, wTarget, wBranch);

            // Connect MUX output to register D input
            const muxOut = mux.outputPins['Out'].wire;
            reg.inputPins[`D${i}`].wire = muxOut;
            // Rewire register DFF
            const dff = reg.children[i];
            dff.inputPins['D'].wire = muxOut;
            dff.children[0].gates[0].inputs = [muxOut];
            dff.children[0].gates[1].inputs = [muxOut, reg.inputPins['CLK'].wire];
            dff.children[0].gates[2].inputs = [dff.children[0].gates[0].output, reg.inputPins['CLK'].wire];

            comp.setInputPin(`Next${i}`, wNext, 0, 10 + i * 28);
            comp.setInputPin(`Target${i}`, wTarget, 0, 20 + i * 28);
            comp.setOutputPin(`Q${i}`, reg.outputPins[`Q${i}`].wire, 100, 10 + i * 28);
        }

        comp.setInputPin('CLK', reg.inputPins['CLK'].wire, 50, 0);

        return comp;
    }

    // --------------------------------------------------------
    // Build the complete CPU
    // --------------------------------------------------------
    function buildCPU() {
        const cpu = new Component('CPU', 'CPU');
        cpu.x = 0; cpu.y = 0;
        cpu.width = 1200; cpu.height = 800;
        cpu.color = '#2d3436';
        cpu.label = 'CPU';

        // === Build sub-components ===
        const alu = cpu.addChild(buildALU('ALU', 450, 280));
        const regA = cpu.addChild(buildRegister8('RegA', 200, 280));
        const regB = cpu.addChild(buildRegister8('RegB', 310, 280));
        const pc = cpu.addChild(buildPC('PC', 50, 50));
        const decoder = cpu.addChild(buildDecoder('DEC', 450, 50));
        const memory = cpu.addChild(buildMemory('MEM', 200, 50));
        const ir = cpu.addChild(buildRegister8('IR_H', 700, 50)); // Opcode part
        const irL = cpu.addChild(buildRegister8('IR_L', 800, 50)); // Operand part

        ir.label = 'IR (Opcode)';
        ir.color = '#fd79a8';
        irL.label = 'IR (Operand)';
        irL.color = '#fab1a0';
        regA.label = 'Register A';
        regB.label = 'Register B';

        // === Create bus wires ===
        // Address bus (8-bit): PC → Memory
        const addrBus = [];
        for (let i = 0; i < 8; i++) {
            const w = cpu.addWire(createWire(`addr_bus_${i}`));
            addrBus.push(w);
            w.segments = [
                { x1: pc.x + 100, y1: pc.y + 10 + i * 28, x2: memory.x, y2: memory.y + 10 + i * 14 }
            ];
        }

        // Data bus from memory (8-bit): Memory → IR
        const dataBus = [];
        for (let i = 0; i < 8; i++) {
            const w = cpu.addWire(createWire(`data_bus_${i}`));
            dataBus.push(w);
        }

        // === Store references for runtime control ===
        cpu.meta = {
            alu, regA, regB, pc, decoder, memory, ir, irL,
            addrBus, dataBus,
            // Clock wires for each register
            clkRegA: regA.inputPins['CLK'].wire,
            clkRegB: regB.inputPins['CLK'].wire,
            clkPC: pc.children[0].inputPins['CLK'].wire, // PC's internal register CLK
            clkIR: ir.inputPins['CLK'].wire,
            clkIRL: irL.inputPins['CLK'].wire,
            // Memory storage
            memStorage: memory.meta.storage,
        };

        return cpu;
    }

    return { buildCPU, buildHalfAdder, buildFullAdder, buildAdder8, buildALU,
             buildDFF, buildRegister8, buildDecoder, buildMemory, buildPC,
             buildSRLatch, buildDLatch, buildMux2 };
})();
