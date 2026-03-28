'use strict';

// ============================================================
// Circuit Simulation Engine
// Gate-level simulation with hierarchical components
// ============================================================

let _wireId = 0;
let _gateId = 0;
let _compId = 0;

// --- Wire ---
class Wire {
    constructor(name) {
        this.id = _wireId++;
        this.name = name || `w${this.id}`;
        this.value = 0;
        this.prevValue = 0;
        this.changed = false;
        // Rendering: line segments in parent-local coordinates
        this.segments = []; // [{x1, y1, x2, y2}, ...]
    }

    setValue(v) {
        this.prevValue = this.value;
        this.value = v ? 1 : 0;
        this.changed = (this.value !== this.prevValue);
        return this.changed;
    }

    reset() {
        this.value = 0;
        this.prevValue = 0;
        this.changed = false;
    }
}

// --- Gate ---
class Gate {
    constructor(type, name) {
        this.id = _gateId++;
        this.type = type; // AND, OR, NOT, NAND, NOR, XOR, XNOR, BUF
        this.name = name || `${type}_${this.id}`;
        this.inputs = [];   // [Wire, ...]
        this.output = null;  // Wire
        // Position in parent component (local coords)
        this.x = 0;
        this.y = 0;
        this.width = 6;
        this.height = 4;
    }

    evaluate() {
        const vals = this.inputs.map(w => w.value);
        if (vals.length === 0) return false;
        let result;
        switch (this.type) {
            case 'AND':  result = vals.reduce((a, b) => a & b, 1); break;
            case 'OR':   result = vals.reduce((a, b) => a | b, 0); break;
            case 'NOT':  result = vals[0] ^ 1; break;
            case 'NAND': result = vals.reduce((a, b) => a & b, 1) ^ 1; break;
            case 'NOR':  result = vals.reduce((a, b) => a | b, 0) ^ 1; break;
            case 'XOR':  result = vals.reduce((a, b) => a ^ b, 0); break;
            case 'XNOR': result = vals.reduce((a, b) => a ^ b, 0) ^ 1; break;
            case 'BUF':  result = vals[0] || 0; break;
            default:     result = 0;
        }
        if (this.output) {
            return this.output.setValue(result);
        }
        return false;
    }

    // Get input pin positions (local coords, relative to gate)
    getInputPinPos(index) {
        const count = this.inputs.length || 1;
        const spacing = this.height / (count + 1);
        return { x: this.x, y: this.y + spacing * (index + 1) };
    }

    getOutputPinPos() {
        return { x: this.x + this.width, y: this.y + this.height / 2 };
    }
}

// --- Component ---
// Hierarchical container: can contain sub-components and/or gates
class Component {
    constructor(type, name) {
        this.id = _compId++;
        this.type = type;
        this.name = name || `${type}_${this.id}`;
        this.label = name || type;
        // Hierarchy
        this.children = [];   // Component[]
        this.gates = [];       // Gate[] (leaf-level gates)
        this.wires = [];       // Wire[] (internal wires)
        this.parent = null;
        // Pins: named external connections
        this.inputPins = {};   // { name: { wire: Wire, x: number, y: number } }
        this.outputPins = {};  // { name: { wire: Wire, x: number, y: number } }
        // Layout (in parent's coordinate system)
        this.x = 0;
        this.y = 0;
        this.width = 0;
        this.height = 0;
        // Visual style
        this.color = '#4a9eff';
        this.labelColor = '#fff';
        // Arbitrary metadata for rendering
        this.meta = {};
    }

    addChild(child) {
        child.parent = this;
        this.children.push(child);
        return child;
    }

    addGate(gate) {
        this.gates.push(gate);
        return gate;
    }

    addWire(wire) {
        this.wires.push(wire);
        return wire;
    }

    setInputPin(name, wire, x, y) {
        this.inputPins[name] = { wire, x: x || 0, y: y || 0 };
    }

    setOutputPin(name, wire, x, y) {
        this.outputPins[name] = { wire, x: x || this.width, y: y || 0 };
    }

    // Get all gates recursively (for simulation)
    getAllGates() {
        let result = [...this.gates];
        for (const child of this.children) {
            result.push(...child.getAllGates());
        }
        return result;
    }

    // Get all wires recursively
    getAllWires() {
        let result = [...this.wires];
        for (const gate of this.gates) {
            if (gate.output) result.push(gate.output);
        }
        for (const child of this.children) {
            result.push(...child.getAllWires());
        }
        return result;
    }

    // Get absolute position (for rendering)
    getAbsX() {
        let ax = this.x;
        let p = this.parent;
        while (p) { ax += p.x; p = p.parent; }
        return ax;
    }

    getAbsY() {
        let ay = this.y;
        let p = this.parent;
        while (p) { ay += p.y; p = p.parent; }
        return ay;
    }
}

// --- Circuit ---
// Top-level manager: holds root component, evaluates all gates
class Circuit {
    constructor(root) {
        this.root = root;
        this.allGates = [];
        this.allWires = [];
        this.sortedGates = [];
    }

    // Build flat gate/wire lists and compute evaluation order
    build() {
        this.allGates = this.root.getAllGates();
        this.allWires = this.root.getAllWires();
        this.sortedGates = this._topologicalSort();
    }

    _topologicalSort() {
        const gates = this.allGates;
        const outputToGate = new Map();
        for (const g of gates) {
            if (g.output) outputToGate.set(g.output, g);
        }

        // Build dependency: gate -> set of gates it depends on
        const deps = new Map();
        for (const g of gates) {
            const s = new Set();
            for (const iw of g.inputs) {
                const src = outputToGate.get(iw);
                if (src && src !== g) s.add(src);
            }
            deps.set(g, s);
        }

        // Kahn's algorithm
        const sorted = [];
        const inDeg = new Map();
        const queue = [];
        for (const [g, d] of deps) {
            inDeg.set(g, d.size);
            if (d.size === 0) queue.push(g);
        }

        const visited = new Set();
        while (queue.length > 0) {
            const g = queue.shift();
            if (visited.has(g)) continue;
            visited.add(g);
            sorted.push(g);
            for (const [other, d] of deps) {
                if (d.has(g)) {
                    d.delete(g);
                    const nd = inDeg.get(other) - 1;
                    inDeg.set(other, nd);
                    if (nd === 0 && !visited.has(other)) queue.push(other);
                }
            }
        }

        // Append any remaining (feedback cycles in flip-flops)
        for (const g of gates) {
            if (!visited.has(g)) sorted.push(g);
        }

        return sorted;
    }

    // Evaluate until stable
    evaluate(maxIter) {
        maxIter = maxIter || 20;
        for (let i = 0; i < maxIter; i++) {
            let anyChanged = false;
            for (const g of this.sortedGates) {
                if (g.evaluate()) anyChanged = true;
            }
            if (!anyChanged) return i + 1; // settled
        }
        return maxIter; // didn't settle
    }

    // Reset all wires to 0
    resetAll() {
        for (const w of this.allWires) {
            w.reset();
        }
    }
}

// --- Helper functions ---
function createWire(name) {
    return new Wire(name);
}

function createGate(type, name, x, y) {
    const g = new Gate(type, name);
    if (x !== undefined) g.x = x;
    if (y !== undefined) g.y = y;
    return g;
}

function connectGate(gate, inputWires, outputWire) {
    gate.inputs = inputWires;
    gate.output = outputWire;
}
