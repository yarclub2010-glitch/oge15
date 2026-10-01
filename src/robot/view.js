
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
// Отрисовка поля Робота (SVG) и редактирование обстановки мышью или пальцем.
// Цвета — как в Кумире: зелёное поле, жёлтые стены, серые закрашенные клетки, Робот-ромбик.

const CELL = 40;
const PAD = 14;
const SVG_NS = 'http://www.w3.org/2000/svg';

export class FieldView {
  constructor(root, { onEdit = () => {}, onBeforeEdit = () => true } = {}) {
    this.root = root;
    this.onEdit = onEdit;
    this.onBeforeEdit = onBeforeEdit;
    this.field = null;
    this.tool = 'none';
    this.editable = true;
    this.overlay = { target: null, extra: [], missing: [] };
    this.hover = null;
    this.drag = null;

    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.classList.add('field-svg');
    this.svg.setAttribute('role', 'img');
    root.appendChild(this.svg);

    this.svg.addEventListener('pointerdown', (e) => this.onDown(e));
    this.svg.addEventListener('pointermove', (e) => this.onMove(e));
    this.svg.addEventListener('pointerup', () => this.onUp());
    this.svg.addEventListener('pointercancel', () => this.onUp());
    this.svg.addEventListener('pointerleave', () => {
      this.hover = null;
      this.render();
    });
  }

  setField(field) {
    this.field = field;
    this.render();
  }

  setTool(tool) {
    this.tool = tool;
    this.root.dataset.tool = tool;
    this.hover = null;
    this.render();
  }

  setEditable(on) {
    this.editable = on;
    this.root.classList.toggle('is-locked', !on);
  }

  setOverlay(overlay) {
    this.overlay = { target: null, extra: [], missing: [], ...overlay };
    this.render();
  }

  // Координаты указателя в клетках (дробные)
  toCell(e) {
    const pt = this.svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(this.svg.getScreenCTM().inverse());
    return { fx: (p.x - PAD) / CELL, fy: (p.y - PAD) / CELL };
  }

  // Ближайшая к указателю граница клетки. orient: 'h' — только горизонтальные, 'v' — только вертикальные
  edgeAt(fx, fy, orient = null) {
    const f = this.field;
    const x = Math.floor(fx);
    const y = Math.floor(fy);
    if (!f.inside(x, y)) return null;
    const dx = fx - x;
    const dy = fy - y;
    const options = [['up', dy], ['down', 1 - dy], ['left', dx], ['right', 1 - dx]]
      .filter(([d]) => !orient || (orient === 'h') === (d === 'up' || d === 'down'))
      .sort((a, b) => a[1] - b[1]);
    const [dir, dist] = options[0];
    if (dist > 0.34) return null;
    if (f.isBorder(x, y, dir)) return null;
    return { x, y, dir };
  }

  cellAt(fx, fy) {
    const x = Math.floor(fx);
    const y = Math.floor(fy);
    return this.field.inside(x, y) ? { x, y } : null;
  }

  onDown(e) {
    if (!this.field || !this.editable || this.tool === 'none') return;
    const { fx, fy } = this.toCell(e);
    if (this.tool === 'walls') {
      const edge = this.edgeAt(fx, fy);
      if (!edge || !this.onBeforeEdit()) return;
      const f = this.field;
      const state = !f.wall(edge.x, edge.y, edge.dir);
      f.setWall(edge.x, edge.y, edge.dir, state);
      const orient = edge.dir === 'up' || edge.dir === 'down' ? 'h' : 'v';
      this.drag = { kind: 'walls', state, orient, last: { fx, fy } };
    } else if (this.tool === 'paint') {
      const cell = this.cellAt(fx, fy);
      if (!cell || !this.onBeforeEdit()) return;
      const state = !this.field.isPainted(cell.x, cell.y);
      this.field.setPainted(cell.x, cell.y, state);
      this.drag = { kind: 'paint', state, last: { fx, fy } };
    } else if (this.tool === 'robot') {
      const cell = this.cellAt(fx, fy);
      if (!cell || !this.onBeforeEdit()) return;
      this.field.robot = cell;
      this.field.broken = null;
      this.drag = { kind: 'robot' };
    }
    this.svg.setPointerCapture?.(e.pointerId);
    e.preventDefault();
    this.render();
    this.onEdit(this.field);
  }

  onMove(e) {
    if (!this.field || !this.editable) return;
    const { fx, fy } = this.toCell(e);
    let changed = false;
    if (this.drag) {
      const f = this.field;
      // Указатель может перескочить через несколько клеток — проходим весь путь с малым шагом
      const last = this.drag.last || { fx, fy };
      const n = Math.max(1, Math.ceil(Math.hypot(fx - last.fx, fy - last.fy) / 0.2));
      const points = Array.from({ length: n }, (_, i) => ({
        px: last.fx + ((fx - last.fx) * (i + 1)) / n,
        py: last.fy + ((fy - last.fy) * (i + 1)) / n,
      }));
      this.drag.last = { fx, fy };
      if (this.drag.kind === 'walls') {
        for (const { px, py } of points) {
          const edge = this.edgeAt(px, py, this.drag.orient);
          if (edge && f.wall(edge.x, edge.y, edge.dir) !== this.drag.state) {
            f.setWall(edge.x, edge.y, edge.dir, this.drag.state);
            changed = true;
          }
        }
      } else if (this.drag.kind === 'paint') {
        for (const { px, py } of points) {
          const cell = this.cellAt(px, py);
          if (cell && f.isPainted(cell.x, cell.y) !== this.drag.state) {
            f.setPainted(cell.x, cell.y, this.drag.state);
            changed = true;
          }
        }
      } else if (this.drag.kind === 'robot') {
        const cell = this.cellAt(fx, fy);
        if (cell && (cell.x !== f.robot.x || cell.y !== f.robot.y)) {
          f.robot = cell;
          changed = true;
        }
      }
    }
    const hover = this.tool === 'walls' ? this.edgeAt(fx, fy) : (this.tool === 'none' ? null : this.cellAt(fx, fy));
    const sameHover = JSON.stringify(hover) === JSON.stringify(this.hover);
    this.hover = hover;
    if (changed || !sameHover) this.render();
    if (changed) this.onEdit(this.field);
  }

  onUp() {
    this.drag = null;
  }

  render() {
    const f = this.field;
    if (!f) return;
    const W = f.w * CELL + PAD * 2;
    const H = f.h * CELL + PAD * 2;
    this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    this.svg.setAttribute('aria-label', `Поле Робота ${f.w}×${f.h}, Робот в клетке ${f.robot.x + 1}, ${f.robot.y + 1}`);
    const cx = (x) => PAD + x * CELL;
    const cy = (y) => PAD + y * CELL;
    const parts = [];

    parts.push(`<rect class="f-bg" x="0" y="0" width="${W}" height="${H}" rx="6"/>`);

    // Закрашенные клетки
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        if (f.isPainted(x, y)) parts.push(`<rect class="f-paint" x="${cx(x)}" y="${cy(y)}" width="${CELL}" height="${CELL}"/>`);
      }
    }

    // Сетка
    let grid = '';
    for (let x = 0; x <= f.w; x++) grid += `M${cx(x)} ${cy(0)}V${cy(f.h)}`;
    for (let y = 0; y <= f.h; y++) grid += `M${cx(0)} ${cy(y)}H${cx(f.w)}`;
    parts.push(`<path class="f-grid" d="${grid}"/>`);

    // Цель: какие клетки нужно закрасить
    if (this.overlay.target) {
      for (const k of this.overlay.target) {
        const [x, y] = k.split(',').map(Number);
        parts.push(`<rect class="f-target" x="${cx(x) + 7}" y="${cy(y) + 7}" width="${CELL - 14}" height="${CELL - 14}" rx="3"/>`);
      }
    }
    for (const [x, y] of this.overlay.missing) {
      parts.push(`<rect class="f-missing" x="${cx(x) + 4}" y="${cy(y) + 4}" width="${CELL - 8}" height="${CELL - 8}" rx="3"/>`);
    }
    for (const [x, y] of this.overlay.extra) {
      const a = 11;
      parts.push(`<path class="f-extra" d="M${cx(x) + a} ${cy(y) + a}L${cx(x + 1) - a} ${cy(y + 1) - a}M${cx(x + 1) - a} ${cy(y) + a}L${cx(x) + a} ${cy(y + 1) - a}"/>`);
    }

    // Пометки из файлов Кумира
    for (const [i, e] of f.extra) {
      const x = i % f.w;
      const y = Math.floor(i / f.w);
      if (e.mark) parts.push(`<circle class="f-mark" cx="${cx(x + 1) - 6}" cy="${cy(y + 1) - 6}" r="3"/>`);
      if (e.up) parts.push(`<text class="f-char" x="${cx(x) + 4}" y="${cy(y) + 13}">${escHtml(e.up)}</text>`);
      if (e.down) parts.push(`<text class="f-char" x="${cx(x) + 4}" y="${cy(y + 1) - 4}">${escHtml(e.down)}</text>`);
    }

    // Стены
    let walls = '';
    for (let y = 1; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        if (f.wall(x, y, 'up')) walls += `M${cx(x)} ${cy(y)}H${cx(x + 1)}`;
      }
    }
    for (let y = 0; y < f.h; y++) {
      for (let x = 1; x < f.w; x++) {
        if (f.wall(x, y, 'left')) walls += `M${cx(x)} ${cy(y)}V${cy(y + 1)}`;
      }
    }
    if (walls) parts.push(`<path class="f-wall" d="${walls}"/>`);
    // На бесконечном поле (в заданиях) забора нет
    if (!f.open) parts.push(`<rect class="f-fence" x="${cx(0)}" y="${cy(0)}" width="${f.w * CELL}" height="${f.h * CELL}"/>`);

    // Подсветка под указателем в режиме редактирования
    if (this.hover && this.editable) {
      const h = this.hover;
      if (h.dir) {
        const onWall = f.wall(h.x, h.y, h.dir);
        const d = {
          up: `M${cx(h.x)} ${cy(h.y)}H${cx(h.x + 1)}`,
          down: `M${cx(h.x)} ${cy(h.y + 1)}H${cx(h.x + 1)}`,
          left: `M${cx(h.x)} ${cy(h.y)}V${cy(h.y + 1)}`,
          right: `M${cx(h.x + 1)} ${cy(h.y)}V${cy(h.y + 1)}`,
        }[h.dir];
        parts.push(`<path class="f-hover-wall${onWall ? ' is-remove' : ''}" d="${d}"/>`);
      } else {
        parts.push(`<rect class="f-hover-cell" x="${cx(h.x) + 2}" y="${cy(h.y) + 2}" width="${CELL - 4}" height="${CELL - 4}" rx="4"/>`);
      }
    }

    // Робот — ромбик; при отказе угол в сторону стены красный.
    // Ушедшего за край рисунка Робота не рисуем
    if (!f.inside(f.robot.x, f.robot.y)) {
      this.svg.innerHTML = parts.join('');
      return;
    }
    const rx = cx(f.robot.x) + CELL / 2;
    const ry = cy(f.robot.y) + CELL / 2;
    const r = CELL * 0.36;
    parts.push(`<path class="f-robot" d="M${rx} ${ry - r}L${rx + r} ${ry}L${rx} ${ry + r}L${rx - r} ${ry}Z"/>`);
    if (f.broken) {
      const t = {
        up: [[rx, ry - r], [rx + r / 2, ry - r / 2], [rx - r / 2, ry - r / 2]],
        down: [[rx, ry + r], [rx + r / 2, ry + r / 2], [rx - r / 2, ry + r / 2]],
        left: [[rx - r, ry], [rx - r / 2, ry - r / 2], [rx - r / 2, ry + r / 2]],
        right: [[rx + r, ry], [rx + r / 2, ry - r / 2], [rx + r / 2, ry + r / 2]],
      }[f.broken];
      parts.push(`<path class="f-robot-broken" d="M${t.map((p) => p.join(' ')).join('L')}Z"/>`);
    }

    this.svg.innerHTML = parts.join('');
  }
}
