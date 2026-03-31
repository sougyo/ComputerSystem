'use strict';

// ============================================================
// Canvas Renderer
// Google Maps-like zoom/pan with hierarchical detail levels
// ============================================================

class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Camera state
        this.camX = 0;      // World X at center of viewport
        this.camY = 0;      // World Y at center of viewport
        this.zoom = 1.0;    // Pixels per world unit
        this.targetZoom = 1.0;
        this.targetCamX = 0;
        this.targetCamY = 0;

        // Zoom limits
        this.minZoom = 0.3;
        this.maxZoom = 80;

        // Interaction state
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragCamStartX = 0;
        this.dragCamStartY = 0;

        // Rendering thresholds (in screen pixels)
        this.MIN_VISIBLE = 6;
        this.EXPAND_THRESHOLD = 80;
        this.GATE_LABEL_THRESHOLD = 40;
        this.WIRE_LABEL_THRESHOLD = 15;

        // Animation
        this.time = 0;
        this.signalPulses = []; // {wire, progress, startTime}
        this.animationPhase = ''; // 'fetch', 'decode', 'execute', 'writeback'

        // Circuit reference
        this.circuit = null;
        this.cpu = null;

        // Performance
        this._frameCount = 0;

        this._setupCanvas();
        this._setupEvents();
    }

    _setupCanvas() {
        const resize = () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', resize);
        resize();
    }

    _setupEvents() {
        const c = this.canvas;

        // Mouse wheel zoom
        c.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = c.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            // World position under mouse before zoom
            const wx = this.camX + (mx - c.width / 2) / this.zoom;
            const wy = this.camY + (my - c.height / 2) / this.zoom;

            const factor = e.deltaY > 0 ? 0.85 : 1.18;
            this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.targetZoom * factor));

            // Adjust camera so the point under the mouse stays put
            this.targetCamX = wx - (mx - c.width / 2) / this.targetZoom;
            this.targetCamY = wy - (my - c.height / 2) / this.targetZoom;
        }, { passive: false });

        // Mouse drag
        c.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                this.isDragging = true;
                this.dragStartX = e.clientX;
                this.dragStartY = e.clientY;
                this.dragCamStartX = this.targetCamX;
                this.dragCamStartY = this.targetCamY;
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                const dx = (e.clientX - this.dragStartX) / this.zoom;
                const dy = (e.clientY - this.dragStartY) / this.zoom;
                this.targetCamX = this.dragCamStartX - dx;
                this.targetCamY = this.dragCamStartY - dy;
            }
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        // Touch support
        let lastTouchDist = 0;
        let lastTouchX = 0, lastTouchY = 0;

        c.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (e.touches.length === 1) {
                this.isDragging = true;
                this.dragStartX = e.touches[0].clientX;
                this.dragStartY = e.touches[0].clientY;
                this.dragCamStartX = this.targetCamX;
                this.dragCamStartY = this.targetCamY;
            } else if (e.touches.length === 2) {
                lastTouchDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                lastTouchX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                lastTouchY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            }
        }, { passive: false });

        c.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (e.touches.length === 1 && this.isDragging) {
                const dx = (e.touches[0].clientX - this.dragStartX) / this.zoom;
                const dy = (e.touches[0].clientY - this.dragStartY) / this.zoom;
                this.targetCamX = this.dragCamStartX - dx;
                this.targetCamY = this.dragCamStartY - dy;
            } else if (e.touches.length === 2) {
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                const factor = dist / lastTouchDist;
                this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.targetZoom * factor));
                lastTouchDist = dist;
            }
        }, { passive: false });

        c.addEventListener('touchend', () => {
            this.isDragging = false;
        });
    }

    setCircuit(circuit) {
        this.circuit = circuit;
        this.cpu = circuit.root;
        this.fitView();
    }

    fitView() {
        if (!this.cpu) return;
        const margin = 50;
        const zx = (this.canvas.width - margin * 2) / this.cpu.width;
        const zy = (this.canvas.height - margin * 2) / this.cpu.height;
        this.targetZoom = Math.min(zx, zy);
        this.targetCamX = this.cpu.width / 2;
        this.targetCamY = this.cpu.height / 2;
        this.zoom = this.targetZoom;
        this.camX = this.targetCamX;
        this.camY = this.targetCamY;
    }

    // World <-> Screen conversions
    worldToScreen(wx, wy) {
        return {
            x: (wx - this.camX) * this.zoom + this.canvas.width / 2,
            y: (wy - this.camY) * this.zoom + this.canvas.height / 2
        };
    }

    screenToWorld(sx, sy) {
        return {
            x: (sx - this.canvas.width / 2) / this.zoom + this.camX,
            y: (sy - this.canvas.height / 2) / this.zoom + this.camY
        };
    }

    // Check if a world-space rect is visible on screen
    isVisible(x, y, w, h) {
        const s1 = this.worldToScreen(x, y);
        const s2 = this.worldToScreen(x + w, y + h);
        return s2.x > 0 && s1.x < this.canvas.width &&
               s2.y > 0 && s1.y < this.canvas.height;
    }

    // Get zoom level description for UI
    getZoomDescription() {
        if (this.zoom < 1) return 'Macro View: CPU全体';
        if (this.zoom < 3) return 'CPU コンポーネント';
        if (this.zoom < 8) return 'サブコンポーネント';
        if (this.zoom < 20) return 'フリップフロップ / 加算器';
        if (this.zoom < 40) return '論理ゲート';
        return 'ゲート詳細 + 信号';
    }

    // ========================================
    // Main render loop
    // ========================================
    startRenderLoop() {
        const loop = (timestamp) => {
            this.time = timestamp / 1000;
            this._update();
            this._render();
            this._frameCount++;
            // Update zoom UI every 10 frames
            if (this._frameCount % 10 === 0 && this.onZoomChange) {
                this.onZoomChange(this.zoom, this.getZoomDescription());
            }
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    _update() {
        // Smooth camera interpolation
        const lerp = 0.15;
        this.camX += (this.targetCamX - this.camX) * lerp;
        this.camY += (this.targetCamY - this.camY) * lerp;
        this.zoom += (this.targetZoom - this.zoom) * lerp;
    }

    _render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Clear
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, w, h);

        // Draw grid
        this._drawGrid();

        if (!this.cpu) return;

        // Save and apply camera transform
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(this.zoom, this.zoom);
        ctx.translate(-this.camX, -this.camY);

        // Draw bus connections between CPU components
        this._drawBusConnections();

        // Render component hierarchy
        this._renderComponent(this.cpu, 0, 0);

        ctx.restore();

        // Draw signal animation overlay
        this._drawSignalPulses();
    }

    _drawGrid() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Determine grid spacing based on zoom
        let gridSize = 10;
        if (this.zoom < 2) gridSize = 100;
        else if (this.zoom < 5) gridSize = 50;
        else if (this.zoom < 15) gridSize = 20;

        const worldTL = this.screenToWorld(0, 0);
        const worldBR = this.screenToWorld(w, h);

        const startX = Math.floor(worldTL.x / gridSize) * gridSize;
        const startY = Math.floor(worldTL.y / gridSize) * gridSize;

        ctx.strokeStyle = 'rgba(74, 158, 255, 0.04)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = startX; x <= worldBR.x; x += gridSize) {
            const sx = this.worldToScreen(x, 0).x;
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, h);
        }
        for (let y = startY; y <= worldBR.y; y += gridSize) {
            const sy = this.worldToScreen(0, y).y;
            ctx.moveTo(0, sy);
            ctx.lineTo(w, sy);
        }
        ctx.stroke();
    }

    // ========================================
    // Hierarchical component rendering
    // ========================================
    _renderComponent(comp, parentAbsX, parentAbsY) {
        const ctx = this.ctx;
        const absX = parentAbsX + comp.x;
        const absY = parentAbsY + comp.y;

        // Viewport culling
        if (!this.isVisible(absX, absY, comp.width, comp.height)) return;

        // Screen size of component
        const screenW = comp.width * this.zoom;
        const screenH = comp.height * this.zoom;

        // Too small to see
        if (screenW < this.MIN_VISIBLE && screenH < this.MIN_VISIBLE) return;

        const isGate = comp.gates && comp.gates.length > 0 && comp.children.length === 0;
        const shouldExpand = screenW > this.EXPAND_THRESHOLD && (comp.children.length > 0 || comp.gates.length > 0);

        if (shouldExpand && !isGate) {
            // Show component background and label, then recurse into children
            this._drawComponentBackground(comp, absX, absY);

            // Draw internal wires
            for (const wire of comp.wires) {
                this._drawWireSegments(wire, absX, absY, comp);
            }

            // Render children
            for (const child of comp.children) {
                this._renderComponent(child, absX, absY);
            }

            // Render gates
            for (const gate of comp.gates) {
                this._renderGate(gate, absX, absY, comp);
            }
        } else {
            // Draw as a box
            this._drawComponentBox(comp, absX, absY, screenW, screenH);
        }
    }

    _drawComponentBackground(comp, absX, absY) {
        const ctx = this.ctx;
        const screenW = comp.width * this.zoom;

        // Background
        ctx.fillStyle = 'rgba(15, 20, 40, 0.3)';
        ctx.strokeStyle = comp.color + '40';
        ctx.lineWidth = 1 / this.zoom;

        this._roundRect(absX, absY, comp.width, comp.height, 3 / this.zoom);
        ctx.fill();
        ctx.stroke();

        // Label
        if (screenW > 60) {
            const fontSize = Math.max(4, Math.min(14, comp.height * 0.08));
            ctx.font = `bold ${fontSize}px Consolas, monospace`;
            ctx.fillStyle = comp.color + '80';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(comp.label, absX + 3 / this.zoom, absY + 2 / this.zoom);
        }
    }

    _drawComponentBox(comp, absX, absY, screenW, screenH) {
        const ctx = this.ctx;

        // Determine if this component has active signals
        let hasActiveSignal = false;
        const allWires = comp.getAllWires();
        for (const w of allWires) {
            if (w.value === 1) { hasActiveSignal = true; break; }
        }

        // Box fill
        const alpha = hasActiveSignal ? '60' : '30';
        ctx.fillStyle = comp.color + alpha;
        ctx.strokeStyle = hasActiveSignal ? comp.color : comp.color + '80';
        ctx.lineWidth = Math.max(1, 2 / this.zoom);

        this._roundRect(absX, absY, comp.width, comp.height, Math.min(4, comp.width * 0.1));
        ctx.fill();
        ctx.stroke();

        // Active glow
        if (hasActiveSignal) {
            ctx.shadowColor = comp.color;
            ctx.shadowBlur = 8 / this.zoom;
            ctx.strokeStyle = comp.color;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Label
        if (screenW > 25) {
            const fontSize = Math.min(comp.height * 0.35, comp.width * 0.15, 12);
            if (fontSize * this.zoom > 6) {
                ctx.font = `bold ${fontSize}px Consolas, monospace`;
                ctx.fillStyle = '#fff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const label = comp.label || comp.type;
                ctx.fillText(label, absX + comp.width / 2, absY + comp.height / 2);
            }
        }

        // Show value for registers
        if (comp.type === 'REGISTER' && screenW > 40) {
            let val = 0;
            for (let i = 0; i < 8; i++) {
                const pin = comp.outputPins[`Q${i}`];
                if (pin && pin.wire) {
                    val |= (pin.wire.value << i);
                }
            }
            const fontSize = Math.min(comp.height * 0.2, 10);
            if (fontSize * this.zoom > 5) {
                ctx.font = `${fontSize}px Consolas, monospace`;
                ctx.fillStyle = '#00ff88';
                ctx.textAlign = 'center';
                ctx.fillText(`0x${val.toString(16).padStart(2, '0').toUpperCase()}`,
                    absX + comp.width / 2, absY + comp.height * 0.75);
            }
        }

        // Pin indicators (when zoomed in enough)
        if (screenW > 60) {
            this._drawPins(comp, absX, absY);
        }
    }

    _drawPins(comp, absX, absY) {
        const ctx = this.ctx;
        const pinSize = Math.max(1, 2 / this.zoom);

        // Input pins
        for (const [name, pin] of Object.entries(comp.inputPins)) {
            const val = pin.wire ? pin.wire.value : 0;
            ctx.fillStyle = val ? '#00ff88' : '#333';
            ctx.beginPath();
            ctx.arc(absX + pin.x, absY + pin.y, pinSize, 0, Math.PI * 2);
            ctx.fill();
        }

        // Output pins
        for (const [name, pin] of Object.entries(comp.outputPins)) {
            const val = pin.wire ? pin.wire.value : 0;
            ctx.fillStyle = val ? '#00ff88' : '#333';
            ctx.beginPath();
            ctx.arc(absX + pin.x, absY + pin.y, pinSize, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ========================================
    // Gate rendering
    // ========================================
    _renderGate(gate, parentAbsX, parentAbsY, parentComp) {
        const ctx = this.ctx;
        const gx = parentAbsX + gate.x;
        const gy = parentAbsY + gate.y;
        const gw = gate.width;
        const gh = gate.height;

        const screenW = gw * this.zoom;
        if (screenW < this.MIN_VISIBLE) return;

        // Output value determines color
        const active = gate.output && gate.output.value === 1;
        const baseColor = this._gateColor(gate.type);

        if (screenW > this.GATE_LABEL_THRESHOLD) {
            // Detailed gate rendering with symbol
            this._drawGateSymbol(gate, gx, gy, active);
        } else {
            // Simple rectangle
            ctx.fillStyle = active ? baseColor : baseColor + '40';
            ctx.strokeStyle = active ? '#00ff88' : '#555';
            ctx.lineWidth = 0.5 / this.zoom;
            ctx.fillRect(gx, gy, gw, gh);
            ctx.strokeRect(gx, gy, gw, gh);
        }

        // Wire to output
        if (gate.output && gate.output.segments) {
            for (const seg of gate.output.segments) {
                if (parentComp && this._segOutOfBounds(seg, parentComp)) continue;
                this._drawWireSegment(seg, parentAbsX, parentAbsY, gate.output.value);
            }
        }
    }

    _drawGateSymbol(gate, x, y, active) {
        const ctx = this.ctx;
        const w = gate.width;
        const h = gate.height;

        ctx.save();
        ctx.translate(x, y);

        const bodyColor = active ? '#1a3a2a' : '#1a1a2e';
        const strokeColor = active ? '#00ff88' : '#4a5568';
        const labelColor = active ? '#00ff88' : '#a0aec0';

        ctx.lineWidth = Math.max(0.3, 1.5 / this.zoom);

        switch (gate.type) {
            case 'AND':
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(w * 0.5, 0);
                ctx.arc(w * 0.5, h / 2, h / 2, -Math.PI / 2, Math.PI / 2);
                ctx.lineTo(0, h);
                ctx.closePath();
                ctx.fillStyle = bodyColor;
                ctx.fill();
                ctx.strokeStyle = strokeColor;
                ctx.stroke();
                break;

            case 'OR':
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(w * 0.3, 0, w * 0.85, h / 2);
                ctx.quadraticCurveTo(w * 0.3, h, 0, h);
                ctx.quadraticCurveTo(w * 0.2, h / 2, 0, 0);
                ctx.fillStyle = bodyColor;
                ctx.fill();
                ctx.strokeStyle = strokeColor;
                ctx.stroke();
                break;

            case 'NOT':
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(w * 0.75, h / 2);
                ctx.lineTo(0, h);
                ctx.closePath();
                ctx.fillStyle = bodyColor;
                ctx.fill();
                ctx.strokeStyle = strokeColor;
                ctx.stroke();
                // Bubble
                ctx.beginPath();
                ctx.arc(w * 0.85, h / 2, h * 0.15, 0, Math.PI * 2);
                ctx.stroke();
                break;

            case 'NAND':
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(w * 0.4, 0);
                ctx.arc(w * 0.4, h / 2, h / 2, -Math.PI / 2, Math.PI / 2);
                ctx.lineTo(0, h);
                ctx.closePath();
                ctx.fillStyle = bodyColor;
                ctx.fill();
                ctx.strokeStyle = strokeColor;
                ctx.stroke();
                // Bubble
                ctx.beginPath();
                ctx.arc(w * 0.4 + h / 2 + h * 0.12, h / 2, h * 0.12, 0, Math.PI * 2);
                ctx.stroke();
                break;

            case 'XOR':
                ctx.beginPath();
                ctx.moveTo(w * 0.1, 0);
                ctx.quadraticCurveTo(w * 0.4, 0, w * 0.85, h / 2);
                ctx.quadraticCurveTo(w * 0.4, h, w * 0.1, h);
                ctx.quadraticCurveTo(w * 0.3, h / 2, w * 0.1, 0);
                ctx.fillStyle = bodyColor;
                ctx.fill();
                ctx.strokeStyle = strokeColor;
                ctx.stroke();
                // Extra curve
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(w * 0.2, h / 2, 0, h);
                ctx.stroke();
                break;

            default: // BUF and others
                ctx.fillStyle = bodyColor;
                ctx.strokeStyle = strokeColor;
                ctx.fillRect(0, 0, w, h);
                ctx.strokeRect(0, 0, w, h);
        }

        // Gate type label
        const fontSize = Math.min(h * 0.45, w * 0.25);
        if (fontSize * this.zoom > 5) {
            ctx.font = `bold ${fontSize}px Consolas, monospace`;
            ctx.fillStyle = labelColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(gate.type, w * 0.4, h / 2);
        }

        // Input/output dots
        if (w * this.zoom > 50) {
            const dotR = Math.max(0.3, 1 / this.zoom);
            // Inputs
            const nInputs = gate.inputs.length;
            for (let i = 0; i < nInputs; i++) {
                const py = h * (i + 1) / (nInputs + 1);
                const val = gate.inputs[i] ? gate.inputs[i].value : 0;
                ctx.fillStyle = val ? '#00ff88' : '#555';
                ctx.beginPath();
                ctx.arc(0, py, dotR, 0, Math.PI * 2);
                ctx.fill();

                // Value label
                if (fontSize * this.zoom > 8) {
                    ctx.font = `${fontSize * 0.6}px Consolas, monospace`;
                    ctx.fillStyle = val ? '#00ff88' : '#444';
                    ctx.textAlign = 'right';
                    ctx.fillText(val.toString(), -dotR * 2, py + fontSize * 0.2);
                }
            }
            // Output
            const outVal = gate.output ? gate.output.value : 0;
            ctx.fillStyle = outVal ? '#00ff88' : '#555';
            ctx.beginPath();
            ctx.arc(w, h / 2, dotR, 0, Math.PI * 2);
            ctx.fill();

            if (fontSize * this.zoom > 8) {
                ctx.font = `${fontSize * 0.6}px Consolas, monospace`;
                ctx.fillStyle = outVal ? '#00ff88' : '#444';
                ctx.textAlign = 'left';
                ctx.fillText(outVal.toString(), w + dotR * 2, h / 2 + fontSize * 0.2);
            }
        }

        ctx.restore();
    }

    _gateColor(type) {
        switch (type) {
            case 'AND': return '#4a90d9';
            case 'OR': return '#27ae60';
            case 'NOT': return '#e74c3c';
            case 'NAND': return '#8e44ad';
            case 'NOR': return '#d35400';
            case 'XOR': return '#f39c12';
            case 'XNOR': return '#16a085';
            case 'BUF': return '#7f8c8d';
            default: return '#95a5a6';
        }
    }

    // ========================================
    // Wire rendering
    // ========================================
    _drawWireSegments(wire, parentAbsX, parentAbsY, parentComp) {
        for (const seg of wire.segments) {
            if (parentComp && this._segOutOfBounds(seg, parentComp)) continue;
            this._drawWireSegment(seg, parentAbsX, parentAbsY, wire.value);
        }
    }

    _segOutOfBounds(seg, comp) {
        // If the segment has an owner tag, only draw it from the matching component
        if (seg.owner !== undefined) {
            return seg.owner !== comp.id;
        }
        return false;
    }

    _drawWireSegment(seg, offX, offY, value) {
        const ctx = this.ctx;
        const x1 = offX + seg.x1;
        const y1 = offY + seg.y1;
        const x2 = offX + seg.x2;
        const y2 = offY + seg.y2;

        // Check visibility
        const s1 = this.worldToScreen(Math.min(x1, x2), Math.min(y1, y2));
        const s2 = this.worldToScreen(Math.max(x1, x2), Math.max(y1, y2));
        if (s2.x < 0 || s1.x > this.canvas.width || s2.y < 0 || s1.y > this.canvas.height) return;

        const active = value === 1;
        ctx.strokeStyle = active ? '#00ff88' : '#2a3a4a';
        ctx.lineWidth = Math.max(0.3, (active ? 1.5 : 0.8) / this.zoom);

        if (active) {
            ctx.shadowColor = '#00ff88';
            ctx.shadowBlur = 3 / this.zoom;
        }

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        ctx.shadowBlur = 0;

        // Signal dot animation on active wires
        if (active && this.zoom > 5) {
            const t = (this.time * 2) % 1;
            const dx = x2 - x1;
            const dy = y2 - y1;
            const px = x1 + dx * t;
            const py = y1 + dy * t;
            const dotSize = Math.max(0.5, 1.5 / this.zoom);

            ctx.fillStyle = '#00ff88';
            ctx.shadowColor = '#00ff88';
            ctx.shadowBlur = 4 / this.zoom;
            ctx.beginPath();
            ctx.arc(px, py, dotSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }

    // ========================================
    // Bus connections between CPU components (macro level)
    // ========================================
    _drawBusConnections() {
        if (!this.cpu || !this.cpu.meta) return;
        const ctx = this.ctx;
        const m = this.cpu.meta;

        // Only draw at macro zoom levels
        const cpuScreenW = this.cpu.width * this.zoom;
        if (cpuScreenW < 200) return;

        const busWidth = Math.max(1, 4 / this.zoom);

        // Helper: draw a bus line with label
        const drawBus = (x1, y1, x2, y2, label, active, color) => {
            color = color || (active ? '#00ff88' : '#1a3a5a');
            ctx.strokeStyle = color;
            ctx.lineWidth = busWidth;
            ctx.setLineDash(active ? [] : [3 / this.zoom, 3 / this.zoom]);

            if (active) {
                ctx.shadowColor = color;
                ctx.shadowBlur = 6 / this.zoom;
            }

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            // Use L-shaped routing
            if (Math.abs(x2 - x1) > Math.abs(y2 - y1)) {
                ctx.lineTo(x2, y1);
                ctx.lineTo(x2, y2);
            } else {
                ctx.lineTo(x1, y2);
                ctx.lineTo(x2, y2);
            }
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.shadowBlur = 0;

            // Arrow at endpoint
            const arrowSize = Math.max(2, 6 / this.zoom);
            const angle = Math.atan2(y2 - y1, x2 - x1);
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - arrowSize * Math.cos(angle - 0.4), y2 - arrowSize * Math.sin(angle - 0.4));
            ctx.lineTo(x2 - arrowSize * Math.cos(angle + 0.4), y2 - arrowSize * Math.sin(angle + 0.4));
            ctx.closePath();
            ctx.fill();

            // Label
            if (label && cpuScreenW > 400) {
                const fontSize = Math.max(4, Math.min(10, 14 / this.zoom));
                ctx.font = `${fontSize}px Consolas, monospace`;
                ctx.fillStyle = active ? '#00ff88aa' : '#335';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                const mx = (x1 + x2) / 2;
                const my = Math.min(y1, y2) - 3 / this.zoom;
                ctx.fillText(label, mx, my);
            }

            // Animated signal flow on active buses (follows L-shaped path)
            if (active) {
                // Build the same L-shaped path used for drawing
                let mx, my;
                if (Math.abs(x2 - x1) > Math.abs(y2 - y1)) {
                    mx = x2; my = y1;
                } else {
                    mx = x1; my = y2;
                }
                const seg1Len = Math.hypot(mx - x1, my - y1);
                const seg2Len = Math.hypot(x2 - mx, y2 - my);
                const totalLen = seg1Len + seg2Len;
                if (totalLen < 1) return;

                const t = (this.time * 1.5) % 1;
                const dotCount = Math.max(1, Math.floor(totalLen / 30));
                const dotR = Math.max(0.8, 2 / this.zoom);
                ctx.fillStyle = '#00ff88';
                for (let d = 0; d < dotCount; d++) {
                    const dt = ((t + d / dotCount) % 1);
                    const dist = dt * totalLen;
                    let px, py;
                    if (dist <= seg1Len) {
                        const f = dist / seg1Len;
                        px = x1 + (mx - x1) * f;
                        py = y1 + (my - y1) * f;
                    } else {
                        const f = (dist - seg1Len) / seg2Len;
                        px = mx + (x2 - mx) * f;
                        py = my + (y2 - my) * f;
                    }
                    ctx.beginPath();
                    ctx.arc(px, py, dotR, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        };

        // Read some bus values for active state
        let pcActive = false, dataActive = false, aluActive = false;
        for (const w of (m.addrBus || [])) {
            if (w.value) { pcActive = true; break; }
        }
        for (const w of (m.dataBus || [])) {
            if (w.value) { dataActive = true; break; }
        }

        // PC → Memory (Address Bus)
        drawBus(
            m.pc.x + m.pc.width, m.pc.y + m.pc.height / 2,
            m.memory.x, m.memory.y + 60,
            'Address Bus', pcActive, pcActive ? '#4a9eff' : '#1a2a4a'
        );

        // Memory → IR (Data Bus)
        drawBus(
            m.memory.x + m.memory.width, m.memory.y + m.memory.height / 2,
            m.ir.x, m.ir.y + m.ir.height / 2,
            'Data Bus', dataActive, dataActive ? '#fdcb6e' : '#2a2a1a'
        );

        // IR → Decoder
        drawBus(
            m.ir.x, m.ir.y + m.ir.height,
            m.decoder.x + m.decoder.width / 2, m.decoder.y,
            'Opcode', true, '#fd79a8'
        );

        // RegA → ALU
        drawBus(
            m.regA.x + m.regA.width, m.regA.y + m.regA.height / 2,
            m.alu.x, m.alu.y + 80,
            'A', true, '#0984e3'
        );

        // RegB → ALU
        drawBus(
            m.regB.x + m.regB.width, m.regB.y + m.regB.height / 2,
            m.alu.x, m.alu.y + 160,
            'B', true, '#0984e3'
        );

        // ALU → RegA (Result)
        const hasResult = m.alu.outputPins && m.alu.outputPins['R0'] && m.alu.outputPins['R0'].wire.value;
        drawBus(
            m.alu.x + m.alu.width / 2, m.alu.y + m.alu.height,
            m.regA.x + m.regA.width / 2, m.regA.y + m.regA.height,
            'Result', hasResult, hasResult ? '#00ff88' : '#1a3a2a'
        );

        // Decoder → ALU (Control)
        drawBus(
            m.decoder.x + m.decoder.width, m.decoder.y + m.decoder.height / 2,
            m.alu.x + m.alu.width / 2, m.alu.y,
            'Control', true, '#fdcb6e80'
        );
    }

    // ========================================
    // Signal pulse animation
    // ========================================
    addSignalPulse(wire) {
        this.signalPulses.push({
            wire,
            startTime: this.time,
            duration: 0.5
        });
    }

    _drawSignalPulses() {
        // Remove expired pulses
        this.signalPulses = this.signalPulses.filter(p => this.time - p.startTime < p.duration);
    }

    // ========================================
    // Utility
    // ========================================
    _roundRect(x, y, w, h, r) {
        const ctx = this.ctx;
        r = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
    }
}
