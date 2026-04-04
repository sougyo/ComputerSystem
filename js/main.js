'use strict';

// ============================================================
// Main Application
// CPU step execution, program loading, UI management
// ============================================================

const App = (() => {
    let cpu = null;
    let circuit = null;
    let renderer = null;

    // CPU state (maintained externally since memory is hybrid)
    let regA = 0;
    let regB = 0;
    let pc = 0;
    let irOpcode = 0;
    let irOperand = 0;
    let flagZ = 0;
    let flagC = 0;
    let flagN = 0;
    let halted = false;
    let running = false;
    let runTimer = null;
    let memory = null;

    // Instruction set
    const OP = {
        NOP: 0x00,
        LOAD_A: 0x01,
        LOAD_B: 0x02,
        LOAD_A_MEM: 0x03,
        STORE_A: 0x04,
        ADD: 0x05,
        SUB: 0x06,
        AND: 0x07,
        OR: 0x08,
        XOR: 0x09,
        NOT: 0x0A,
        JMP: 0x0B,
        JZ: 0x0C,
        JNZ: 0x0D,
        SHL: 0x0E,
        HLT: 0x0F,
    };

    const OP_NAMES = {};
    for (const [k, v] of Object.entries(OP)) OP_NAMES[v] = k;

    // Sample programs
    const PROGRAMS = {
        add: {
            name: 'Addition (A+B)',
            instructions: [
                [OP.LOAD_A, 25],    // A = 25
                [OP.LOAD_B, 17],    // B = 17
                [OP.ADD, 0],        // A = A + B = 42
                [OP.HLT, 0],
            ]
        },
        count: {
            name: 'Count Up',
            instructions: [
                [OP.LOAD_A, 0],     // A = 0
                [OP.LOAD_B, 1],     // B = 1
                [OP.ADD, 0],        // A = A + B (A++)
                [OP.STORE_A, 0x80], // MEM[128] = A
                [OP.LOAD_B, 10],    // B = 10
                [OP.SUB, 0],        // A = A - B
                [OP.JZ, 14],        // if A==0 goto HLT (addr 14)
                [OP.LOAD_A_MEM, 0x80], // A = MEM[128]
                [OP.LOAD_B, 1],     // B = 1
                [OP.JMP, 4],        // goto ADD (addr 4)
                [OP.HLT, 0],
            ]
        },
        logic: {
            name: 'Logic Operations',
            instructions: [
                [OP.LOAD_A, 0b11001100], // A = 0xCC
                [OP.LOAD_B, 0b10101010], // B = 0xAA
                [OP.AND, 0],        // A = A & B = 0x88
                [OP.STORE_A, 0x80], // MEM[128] = result
                [OP.LOAD_A, 0b11001100],
                [OP.OR, 0],         // A = A | B = 0xEE
                [OP.STORE_A, 0x81],
                [OP.LOAD_A, 0b11001100],
                [OP.XOR, 0],        // A = A ^ B = 0x66
                [OP.STORE_A, 0x82],
                [OP.NOT, 0],        // A = ~A = 0x99
                [OP.STORE_A, 0x83],
                [OP.HLT, 0],
            ]
        },
        fibonacci: {
            name: 'Fibonacci',
            instructions: [
                [OP.LOAD_A, 1],     // A = 1 (F1)
                [OP.STORE_A, 0x80], // MEM[128] = 1
                [OP.LOAD_A, 1],     // A = 1 (F2)
                [OP.STORE_A, 0x81], // MEM[129] = 1
                // Loop: compute next fib
                [OP.LOAD_A_MEM, 0x80], // A = F(n-2)
                [OP.LOAD_B, 0],     // placeholder - will be overwritten
                [OP.LOAD_A_MEM, 0x81], // A = F(n-1)
                [OP.STORE_A, 0x80], // MEM[128] = F(n-1) (shift)
                [OP.LOAD_B, 0],     // B = 0 placeholder
                [OP.LOAD_A_MEM, 0x80], // reload
                [OP.HLT, 0],       // simplified - full fib needs more instructions
            ]
        },
    };

    // ========================================
    // Initialization
    // ========================================
    function init() {
        // Build CPU
        cpu = CPUBuilder.buildCPU();
        circuit = new Circuit(cpu);
        circuit.build();
        memory = cpu.meta.memStorage;

        // Setup renderer
        const canvas = document.getElementById('mainCanvas');
        renderer = new Renderer(canvas);
        renderer.setCircuit(circuit);
        renderer.onZoomChange = (zoom, desc) => {
            document.getElementById('zoomInfo').textContent = `${zoom.toFixed(2)}x`;
            document.getElementById('zoomHint').textContent = desc;
        };
        renderer.startRenderLoop();

        // Load default program
        loadProgram('add');

        // Setup UI
        setupUI();
        updateUI();

        console.log(`CPU built: ${circuit.allGates.length} gates, ${circuit.allWires.length} wires`);
    }

    // ========================================
    // Program loading
    // ========================================
    function loadProgram(name) {
        resetCPU();

        if (name === 'custom') {
            const text = document.getElementById('customProgram').value;
            loadAssemblyText(text);
        } else {
            const prog = PROGRAMS[name];
            if (!prog) return;
            for (let i = 0; i < prog.instructions.length; i++) {
                const [opcode, operand] = prog.instructions[i];
                memory[i * 2] = opcode;
                memory[i * 2 + 1] = operand;
            }
        }

        updateProgramListing();
        updateUI();
    }

    function loadAssemblyText(text) {
        const lines = text.trim().split('\n');
        let addr = 0;
        for (const line of lines) {
            const trimmed = line.trim().toUpperCase();
            if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) continue;

            const parts = trimmed.split(/\s+/);
            const mnemonic = parts[0];
            const operand = parts[1] ? parseInt(parts[1]) : 0;

            const opcode = OP[mnemonic];
            if (opcode !== undefined) {
                memory[addr++] = opcode;
                memory[addr++] = isNaN(operand) ? 0 : operand;
            }
        }
    }

    // ========================================
    // CPU Execution
    // ========================================
    function resetCPU() {
        regA = 0; regB = 0; pc = 0;
        irOpcode = 0; irOperand = 0;
        flagZ = 0; flagC = 0; flagN = 0;
        halted = false;
        memory.fill(0);
        circuit.resetAll();
        setRegisterOutputs(cpu.meta.regA, 0);
        setRegisterOutputs(cpu.meta.regB, 0);
        setRegisterOutputs(cpu.meta.ir, 0);
        setRegisterOutputs(cpu.meta.irL, 0);
        setRegisterOutputs(cpu.meta.pc.children[0], 0);
    }

    function stepCPU() {
        if (halted) return;

        // === FETCH ===
        irOpcode = memory[pc];
        irOperand = memory[pc + 1];

        // Set signals on gate-level circuit
        setRegisterInputs(cpu.meta.ir, irOpcode);
        setRegisterInputs(cpu.meta.irL, irOperand);

        // Set decoder inputs (opcode bits)
        for (let i = 0; i < 8; i++) {
            const pin = cpu.meta.decoder.inputPins[`Op${i}`];
            if (pin) pin.wire.setValue((irOpcode >> i) & 1);
        }

        // Evaluate decoder (combinational)
        circuit.evaluate();

        // === DECODE ===
        // Read control signals from decoder outputs
        const ctrl = readDecoderOutputs();

        // === EXECUTE ===
        let result = regA;
        let nextPC = pc + 2;
        let writeA = false;
        let writeB = false;
        let aluOp = false;
        let subOp = false;

        switch (irOpcode) {
            case OP.LOAD_A:
                result = irOperand;
                writeA = true;
                break;
            case OP.LOAD_B:
                regB = irOperand;
                writeB = true;
                break;
            case OP.LOAD_A_MEM:
                result = memory[irOperand] || 0;
                writeA = true;
                break;
            case OP.STORE_A:
                memory[irOperand] = regA;
                break;
            case OP.ADD:
                writeA = true;
                aluOp = true;
                break;
            case OP.SUB:
                writeA = true;
                aluOp = true;
                subOp = true;
                break;
            case OP.AND:
                writeA = true;
                aluOp = true;
                break;
            case OP.OR:
                writeA = true;
                aluOp = true;
                break;
            case OP.XOR:
                writeA = true;
                aluOp = true;
                break;
            case OP.NOT:
                result = (~regA) & 0xFF;
                writeA = true;
                break;
            case OP.JMP:
                nextPC = irOperand;
                break;
            case OP.JZ:
                if (flagZ) nextPC = irOperand;
                break;
            case OP.JNZ:
                if (!flagZ) nextPC = irOperand;
                break;
            case OP.SHL:
                flagC = (regA >> 7) & 1;
                result = (regA << 1) & 0xFF;
                writeA = true;
                break;
            case OP.HLT:
                halted = true;
                break;
        }

        // Drive ALU inputs at gate level
        setALUInputs(regA, regB, irOpcode);
        circuit.evaluate();

        // Read result from gate-level ALU output pins
        if (aluOp) {
            const aluOut = readALUOutputs();
            result = aluOut.result;
            // For SUB, Cout=1 means no borrow (A>=B), so flagC is inverted
            flagC = subOp ? (1 - aluOut.cout) : aluOut.cout;
        }

        // === WRITE-BACK (JS state only) ===
        if (writeA) regA = result;

        // Update flags
        if (writeA) {
            flagZ = (result === 0) ? 1 : 0;
            flagN = (result & 0x80) ? 1 : 0;
        }

        // Update PC
        pc = nextPC & 0xFF;

        // Final circuit evaluation
        circuit.evaluate();

        // Update all register/PC/IR displays AFTER evaluate() to prevent NAND gate overwrite
        setRegisterOutputs(cpu.meta.regA, regA);
        setRegisterOutputs(cpu.meta.regB, regB);
        setRegisterOutputs(cpu.meta.pc.children[0], pc);
        setRegisterOutputs(cpu.meta.ir, irOpcode);
        setRegisterOutputs(cpu.meta.irL, irOperand);

        // Update memory address/data bus display
        setMemoryDisplay(irOpcode, irOperand);

        updateUI();
    }

    function setRegisterInputs(reg, value) {
        for (let i = 0; i < 8; i++) {
            const pin = reg.inputPins[`D${i}`];
            if (pin) pin.wire.setValue((value >> i) & 1);
        }
    }

    function setRegisterOutputs(reg, value) {
        for (let i = 0; i < 8; i++) {
            const pin = reg.outputPins[`Q${i}`];
            if (pin) pin.wire.setValue((value >> i) & 1);
        }
    }

    function setMemoryDisplay(opcode, operand) {
        const mem = cpu.meta.memory;
        const isLoad = opcode === OP.LOAD_A_MEM;
        const isStore = opcode === OP.STORE_A;
        const addr = (isLoad || isStore) ? operand : pc;
        const data = memory[addr] || 0;

        for (let i = 0; i < 8; i++) {
            const addrPin = mem.inputPins[`Addr${i}`];
            if (addrPin) addrPin.wire.setValue((addr >> i) & 1);
            const doutPin = mem.outputPins[`Dout${i}`];
            if (doutPin) doutPin.wire.setValue((data >> i) & 1);
            const dinPin = mem.inputPins[`Din${i}`];
            if (dinPin) dinPin.wire.setValue(isStore ? (regA >> i) & 1 : 0);
        }
        const readPin = mem.inputPins['Read'];
        const writePin = mem.inputPins['Write'];
        if (readPin) readPin.wire.setValue(isLoad ? 1 : 0);
        if (writePin) writePin.wire.setValue(isStore ? 1 : 0);

        // Drive address bus wires (PC → Memory visual connection)
        cpu.meta.addrBus.forEach((w, i) => w.setValue((addr >> i) & 1));
    }

    function setALUInputs(a, b, opcode) {
        const alu = cpu.meta.alu;
        for (let i = 0; i < 8; i++) {
            const pinA = alu.inputPins[`A${i}`];
            const pinB = alu.inputPins[`B${i}`];
            if (pinA) pinA.wire.setValue((a >> i) & 1);
            if (pinB) pinB.wire.setValue((b >> i) & 1);
        }

        // Set ALU control signals based on opcode
        let op0 = 0, op1 = 0, sub = 0;
        switch (opcode) {
            case OP.ADD: op0 = 0; op1 = 0; sub = 0; break;
            case OP.SUB: op0 = 0; op1 = 0; sub = 1; break;
            case OP.AND: op0 = 1; op1 = 0; break;
            case OP.OR:  op0 = 0; op1 = 1; break;
            case OP.XOR: op0 = 1; op1 = 1; break;
        }
        const pinOp0 = alu.inputPins['Op0'];
        const pinOp1 = alu.inputPins['Op1'];
        const pinSub = alu.inputPins['Sub'];
        if (pinOp0) pinOp0.wire.setValue(op0);
        if (pinOp1) pinOp1.wire.setValue(op1);
        if (pinSub) pinSub.wire.setValue(sub);
    }

    function readALUOutputs() {
        const alu = cpu.meta.alu;
        let result = 0;
        for (let i = 0; i < 8; i++) {
            const pin = alu.outputPins[`R${i}`];
            if (pin && pin.wire.value) result |= (1 << i);
        }
        const zeroPin = alu.outputPins['Zero'];
        const coutPin = alu.outputPins['Cout'];
        return {
            result,
            zero: zeroPin ? zeroPin.wire.value : 0,
            cout: coutPin ? coutPin.wire.value : 0,
        };
    }

    function readDecoderOutputs() {
        const dec = cpu.meta.decoder;
        const read = (name) => {
            const pin = dec.outputPins[name];
            return pin && pin.wire ? pin.wire.value : 0;
        };
        return {
            regWrite: read('RegWrite'),
            memRead: read('MemRead'),
            memWrite: read('MemWrite'),
            aluOp0: read('AluOp0'),
            aluOp1: read('AluOp1'),
            subMode: read('SubMode'),
            branch: read('Branch'),
            branchZ: read('BranchZ'),
            halt: read('Halt'),
            loadImm: read('LoadImm'),
            regDstB: read('RegDstB'),
        };
    }

    // ========================================
    // UI
    // ========================================
    function setupUI() {
        document.getElementById('btnStep').addEventListener('click', () => {
            stepCPU();
        });

        document.getElementById('btnRun').addEventListener('click', () => {
            if (halted) return;
            running = true;
            document.getElementById('btnRun').disabled = true;
            document.getElementById('btnPause').disabled = false;
            const speed = parseInt(document.getElementById('speedSlider').value);
            const delay = Math.max(50, 1100 - speed * 100);
            runTimer = setInterval(() => {
                if (halted || !running) {
                    stopRunning();
                    return;
                }
                stepCPU();
            }, delay);
        });

        document.getElementById('btnPause').addEventListener('click', () => {
            stopRunning();
        });

        document.getElementById('btnReset').addEventListener('click', () => {
            stopRunning();
            resetCPU();
            loadProgram(document.getElementById('programSelect').value);
        });

        document.getElementById('btnFitView').addEventListener('click', () => {
            renderer.fitView();
        });

        document.getElementById('speedSlider').addEventListener('input', (e) => {
            document.getElementById('speedLabel').textContent = e.target.value;
            if (running) {
                // Restart with new speed
                clearInterval(runTimer);
                const speed = parseInt(e.target.value);
                const delay = Math.max(50, 1100 - speed * 100);
                runTimer = setInterval(() => {
                    if (halted || !running) { stopRunning(); return; }
                    stepCPU();
                }, delay);
            }
        });

        document.getElementById('programSelect').addEventListener('change', (e) => {
            const custom = e.target.value === 'custom';
            document.getElementById('customProgram').style.display = custom ? 'block' : 'none';
        });

        document.getElementById('btnLoad').addEventListener('click', () => {
            stopRunning();
            loadProgram(document.getElementById('programSelect').value);
        });

        document.getElementById('btnHelp').addEventListener('click', () => {
            document.getElementById('helpOverlay').style.display = 'flex';
        });

        // Collapsible panels
        document.querySelectorAll('.panel h2').forEach(h2 => {
            h2.addEventListener('click', () => {
                h2.closest('.panel').classList.toggle('collapsed');
            });
        });

        // Collapse panels by default on small screens
        if (window.innerWidth < 600) {
            ['sidebar', 'programPanel', 'memoryPanel'].forEach(id => {
                document.getElementById(id).classList.add('collapsed');
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
            switch (e.key) {
                case ' ':
                case 's':
                    e.preventDefault();
                    stepCPU();
                    break;
                case 'r':
                    document.getElementById('btnRun').click();
                    break;
                case 'p':
                    document.getElementById('btnPause').click();
                    break;
                case 'Escape':
                    document.getElementById('helpOverlay').style.display = 'none';
                    break;
            }
        });
    }

    function stopRunning() {
        running = false;
        if (runTimer) { clearInterval(runTimer); runTimer = null; }
        document.getElementById('btnRun').disabled = false;
        document.getElementById('btnPause').disabled = true;
    }

    function updateUI() {
        // Registers
        document.getElementById('regA').textContent = `0x${regA.toString(16).padStart(2, '0').toUpperCase()}`;
        document.getElementById('regB').textContent = `0x${regB.toString(16).padStart(2, '0').toUpperCase()}`;
        document.getElementById('regPC').textContent = `0x${pc.toString(16).padStart(2, '0').toUpperCase()}`;
        document.getElementById('regIR').textContent = `0x${irOpcode.toString(16).padStart(2, '0').toUpperCase()}${irOperand.toString(16).padStart(2, '0').toUpperCase()}`;

        document.getElementById('regA-bin').textContent = regA.toString(2).padStart(8, '0');
        document.getElementById('regB-bin').textContent = regB.toString(2).padStart(8, '0');
        document.getElementById('regPC-bin').textContent = pc.toString(2).padStart(8, '0');
        document.getElementById('regIR-bin').textContent =
            irOpcode.toString(2).padStart(8, '0') + irOperand.toString(2).padStart(8, '0');

        // Flags
        const setFlag = (id, name, val) => {
            const el = document.getElementById(id);
            el.textContent = `${name}=${val}`;
            el.className = `flag${val ? ' active' : ''}`;
        };
        setFlag('flagZ', 'Z', flagZ);
        setFlag('flagC', 'C', flagC);
        setFlag('flagN', 'N', flagN);

        // Current instruction
        const opName = OP_NAMES[irOpcode] || 'NOP';
        const needsOperand = ![OP.ADD, OP.SUB, OP.AND, OP.OR, OP.XOR, OP.NOT, OP.SHL, OP.HLT, OP.NOP].includes(irOpcode);
        const instrText = needsOperand ? `${opName} ${irOperand}` : opName;
        document.getElementById('currentInstr').textContent = instrText;
        document.getElementById('currentPhase').textContent = halted ? 'HALTED' : 'READY';
        document.getElementById('currentPhase').style.color = halted ? '#e74c3c' : '#4a9eff';

        // Zoom info
        if (renderer) {
            document.getElementById('zoomInfo').textContent = `${renderer.zoom.toFixed(2)}x`;
            document.getElementById('zoomHint').textContent = renderer.getZoomDescription();
        }

        // Program listing highlight
        updateProgramListing();

        // Memory view
        updateMemoryView();
    }

    function updateProgramListing() {
        const listing = document.getElementById('programListing');
        let html = '';
        for (let addr = 0; addr < 64; addr += 2) {
            const opcode = memory[addr];
            const operand = memory[addr + 1];
            if (opcode === 0 && operand === 0 && addr > 0) continue;

            const isCurrent = addr === pc;
            const opName = OP_NAMES[opcode] || 'NOP';
            const needsOperand = ![OP.ADD, OP.SUB, OP.AND, OP.OR, OP.XOR, OP.NOT, OP.SHL, OP.HLT, OP.NOP].includes(opcode);
            const asmText = needsOperand ? `${opName} ${operand}` : opName;
            const hexText = `${opcode.toString(16).padStart(2, '0')} ${operand.toString(16).padStart(2, '0')}`;

            html += `<div class="prog-line${isCurrent ? ' current' : ''}">`;
            html += `<span class="prog-addr">${addr.toString(16).padStart(2, '0')}</span>`;
            html += `<span class="prog-hex">${hexText}</span>`;
            html += `<span class="prog-asm">${asmText}</span>`;
            html += `</div>`;
        }
        listing.innerHTML = html;
    }

    function updateMemoryView() {
        const view = document.getElementById('memoryView');
        let html = '';
        // Show first 32 bytes and 0x80-0x8F range
        const ranges = [[0, 32], [0x80, 0x90]];
        for (const [start, end] of ranges) {
            if (start > 0) html += '<div style="color:#333;margin:4px 0">···</div>';
            for (let addr = start; addr < end; addr += 8) {
                html += '<div class="mem-row">';
                html += `<span class="mem-addr">${addr.toString(16).padStart(2, '0')}</span>`;
                for (let i = 0; i < 8 && addr + i < 256; i++) {
                    const a = addr + i;
                    const val = memory[a];
                    const classes = ['mem-cell'];
                    if (val !== 0) classes.push('nonzero');
                    if (a === pc || a === pc + 1) classes.push('current');
                    html += `<span class="${classes.join(' ')}">${val.toString(16).padStart(2, '0')}</span>`;
                }
                html += '</div>';
            }
        }
        view.innerHTML = html;
    }

    // ========================================
    // Start
    // ========================================
    return { init };
})();

// Launch
window.addEventListener('DOMContentLoaded', App.init);
