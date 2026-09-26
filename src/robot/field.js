// Обстановка Робота: клетчатое поле со стенами, закрашенными клетками и Роботом.
// Клетка (x, y): x — столбец слева направо, y — строка сверху вниз, счёт с нуля.
// По периметру поля стоит стена («забор»), как в Кумире.
// Исключение — открытое поле (open): в заданиях ОГЭ поле бесконечное, забора нет,
// Робот может уйти за нарисованную часть, а закраску там помнит outPaint.

export const DIRS = {
  up: { dx: 0, dy: -1, side: 'сверху' },
  down: { dx: 0, dy: 1, side: 'снизу' },
  left: { dx: -1, dy: 0, side: 'слева' },
  right: { dx: 1, dy: 0, side: 'справа' },
};

// На бесконечном поле Робот, ушедший от рисунка дальше чем на столько клеток,
// идёт по пустому полю без стен: выполнение алгоритма не завершится
export const ESCAPE = 5;

export const MAX_W = 40;
export const MAX_H = 30;

export class Field {
  constructor(w = 7, h = 7) {
    this.w = w;
    this.h = h;
    // hw[y*w + x] — стена над клеткой (x, y); строки линий 0..h
    this.hw = new Uint8Array((h + 1) * w);
    // vw[y*(w+1) + x] — стена слева от клетки (x, y); столбцы линий 0..w
    this.vw = new Uint8Array(h * (w + 1));
    this.painted = new Uint8Array(w * h);
    // Пометки из файлов Кумира: точка, буквы, температура, радиация. key = y*w + x
    this.extra = new Map();
    this.robot = { x: 0, y: 0 };
    this.broken = null; // направление, в котором Робот разбился
    this.open = false;
    this.outPaint = new Set(); // закрашенные клетки за пределами нарисованной части, "x,y"
    this.setBorder();
  }

  // Бесконечное поле: убираем забор
  makeOpen() {
    this.open = true;
    const { w, h } = this;
    for (let x = 0; x < w; x++) {
      this.hw[x] = 0;
      this.hw[h * w + x] = 0;
    }
    for (let y = 0; y < h; y++) {
      this.vw[y * (w + 1)] = 0;
      this.vw[y * (w + 1) + w] = 0;
    }
    return this;
  }

  setBorder() {
    const { w, h } = this;
    for (let x = 0; x < w; x++) {
      this.hw[x] = 1;
      this.hw[h * w + x] = 1;
    }
    for (let y = 0; y < h; y++) {
      this.vw[y * (w + 1)] = 1;
      this.vw[y * (w + 1) + w] = 1;
    }
  }

  // На сколько клеток Робот ушёл за нарисованную часть поля (0 — он на рисунке)
  robotOutside() {
    const { x, y } = this.robot;
    return Math.max(-x, x - this.w + 1, -y, y - this.h + 1, 0);
  }

  // Робот ушёл по бесконечному полю так далеко, что стен вокруг уже нет
  escaped() {
    return this.open && this.robotOutside() > ESCAPE;
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  wall(x, y, dir) {
    const { w } = this;
    // За нарисованной частью открытого поля стен нет
    if (this.open && (!this.inside(x, y) || !this.inside(x + DIRS[dir].dx, y + DIRS[dir].dy))) return false;
    switch (dir) {
      case 'up': return this.hw[y * w + x] === 1;
      case 'down': return this.hw[(y + 1) * w + x] === 1;
      case 'left': return this.vw[y * (w + 1) + x] === 1;
      case 'right': return this.vw[y * (w + 1) + x + 1] === 1;
      default: return false;
    }
  }

  // Ставит или убирает стену у клетки (x, y) с указанной стороны. Забор не трогает.
  setWall(x, y, dir, on) {
    const { w, h } = this;
    const v = on ? 1 : 0;
    switch (dir) {
      case 'up': if (y > 0) this.hw[y * w + x] = v; break;
      case 'down': if (y < h - 1) this.hw[(y + 1) * w + x] = v; break;
      case 'left': if (x > 0) this.vw[y * (w + 1) + x] = v; break;
      case 'right': if (x < w - 1) this.vw[y * (w + 1) + x + 1] = v; break;
      default:
    }
  }

  isBorder(x, y, dir) {
    return (dir === 'up' && y === 0) || (dir === 'down' && y === this.h - 1)
      || (dir === 'left' && x === 0) || (dir === 'right' && x === this.w - 1);
  }

  // Горизонтальная стена по линии y (над строкой y) от столбца x1 до x2 включительно
  hLine(y, x1, x2, gaps = []) {
    for (let x = x1; x <= x2; x++) {
      if (!gaps.includes(x)) this.hw[y * this.w + x] = 1;
    }
  }

  // Вертикальная стена по линии x (левее столбца x) от строки y1 до y2 включительно
  vLine(x, y1, y2, gaps = []) {
    for (let y = y1; y <= y2; y++) {
      if (!gaps.includes(y)) this.vw[y * (this.w + 1) + x] = 1;
    }
  }

  isPainted(x, y) {
    if (!this.inside(x, y)) return this.outPaint.has(`${x},${y}`);
    return this.painted[y * this.w + x] === 1;
  }

  setPainted(x, y, on) {
    if (!this.inside(x, y)) {
      if (on) this.outPaint.add(`${x},${y}`);
      else this.outPaint.delete(`${x},${y}`);
      return;
    }
    this.painted[y * this.w + x] = on ? 1 : 0;
  }

  paintedCells() {
    const cells = [];
    for (let i = 0; i < this.painted.length; i++) {
      if (this.painted[i]) cells.push(i);
    }
    return cells;
  }

  clearWalls() {
    this.hw.fill(0);
    this.vw.fill(0);
    this.setBorder();
  }

  clearPaint() {
    this.painted.fill(0);
    this.outPaint.clear();
  }

  clone() {
    const f = new Field(this.w, this.h);
    f.hw.set(this.hw);
    f.vw.set(this.vw);
    f.painted.set(this.painted);
    f.open = this.open;
    f.outPaint = new Set(this.outPaint);
    f.extra = new Map([...this.extra].map(([k, v]) => [k, { ...v }]));
    f.robot = { ...this.robot };
    f.broken = this.broken;
    return f;
  }

  // Новое поле другого размера; содержимое сохраняется, насколько помещается
  resized(w, h) {
    const f = new Field(w, h);
    for (let y = 0; y < Math.min(h, this.h); y++) {
      for (let x = 0; x < Math.min(w, this.w); x++) {
        f.setPainted(x, y, this.isPainted(x, y));
        for (const dir of ['up', 'left', 'down', 'right']) {
          if (!this.isBorder(x, y, dir) && this.wall(x, y, dir)) f.setWall(x, y, dir, true);
        }
        const e = this.extra.get(y * this.w + x);
        if (e) f.extra.set(y * w + x, { ...e });
      }
    }
    f.robot = { x: Math.min(this.robot.x, w - 1), y: Math.min(this.robot.y, h - 1) };
    return f;
  }

  // ----- Команды Робота -----

  move(dir) {
    const { x, y } = this.robot;
    if (this.wall(x, y, dir)) {
      this.broken = dir;
      throw new Error(`Робот разбился: ${DIRS[dir].side} стена!`);
    }
    this.robot = { x: x + DIRS[dir].dx, y: y + DIRS[dir].dy };
  }

  paint() {
    this.setPainted(this.robot.x, this.robot.y, true);
  }

  query(kind, dir) {
    const { x, y } = this.robot;
    const e = (this.inside(x, y) && this.extra.get(y * this.w + x)) || {};
    switch (kind) {
      case 'free': return !this.wall(x, y, dir);
      case 'wall': return this.wall(x, y, dir);
      case 'painted': return this.isPainted(x, y);
      case 'clean': return !this.isPainted(x, y);
      case 'temperature': return Math.round(e.temp || 0);
      case 'radiation': return e.rad || 0;
      default: return false;
    }
  }

  // ----- Сохранение -----

  toJSON() {
    const walls = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        let mask = 0;
        if (!this.isBorder(x, y, 'up') && this.wall(x, y, 'up')) mask |= 8;
        if (!this.isBorder(x, y, 'left') && this.wall(x, y, 'left')) mask |= 1;
        if (mask) walls.push([x, y, mask]);
      }
    }
    return {
      w: this.w,
      h: this.h,
      robot: [this.robot.x, this.robot.y],
      walls,
      painted: this.paintedCells().map((i) => [i % this.w, Math.floor(i / this.w)]),
    };
  }

  static fromJSON(data) {
    const f = new Field(data.w, data.h);
    for (const [x, y, mask] of data.walls || []) {
      if (mask & 8) f.setWall(x, y, 'up', true);
      if (mask & 1) f.setWall(x, y, 'left', true);
      if (mask & 4) f.setWall(x, y, 'down', true);
      if (mask & 2) f.setWall(x, y, 'right', true);
    }
    for (const [x, y] of data.painted || []) f.setPainted(x, y, true);
    const [rx, ry] = data.robot || [0, 0];
    f.robot = { x: rx, y: ry };
    return f;
  }

  // Формат обстановок Кумира (.fil).
  // Стены: 1 — слева, 2 — справа, 4 — снизу, 8 — сверху (как в исходниках Кумира 2).
  toFil() {
    const out = [
      '; Field Size: x, y',
      `${this.w} ${this.h}`,
      '; Robot position: x, y',
      `${this.robot.x} ${this.robot.y}`,
      '; A set of special Fields: x, y, Walls, Color, Radiation, Temperature, USymbol, DSymbol, Point',
    ];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        let mask = 0;
        if (!this.isBorder(x, y, 'left') && this.wall(x, y, 'left')) mask |= 1;
        if (!this.isBorder(x, y, 'right') && this.wall(x, y, 'right')) mask |= 2;
        if (!this.isBorder(x, y, 'down') && this.wall(x, y, 'down')) mask |= 4;
        if (!this.isBorder(x, y, 'up') && this.wall(x, y, 'up')) mask |= 8;
        const e = this.extra.get(y * this.w + x) || {};
        const color = this.isPainted(x, y) ? 1 : 0;
        if (!mask && !color && !e.rad && !e.temp && !e.up && !e.down && !e.mark) continue;
        out.push([
          x, y, mask, color,
          (e.rad || 0).toFixed(6), (e.temp || 0).toFixed(6),
          e.up || '$', e.down || '$', e.mark ? 1 : 0,
        ].join(' '));
      }
    }
    out.push('; End Of File');
    return out.join('\n') + '\n';
  }

  static fromFil(text) {
    const lines = text.replace(/\r/g, '').split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith(';'));
    if (lines.length < 2) throw new Error('Файл обстановки пустой или повреждён');
    const [w, h] = lines[0].split(/\s+/).map(Number);
    if (!(w > 0 && h > 0)) throw new Error('В файле обстановки неверный размер поля');
    if (w > MAX_W || h > MAX_H) throw new Error(`Поле ${w}×${h} слишком большое: максимум ${MAX_W}×${MAX_H}`);
    const f = new Field(w, h);
    const [rx, ry] = lines[1].split(/\s+/).map(Number);
    f.robot = { x: Math.min(Math.max(rx || 0, 0), w - 1), y: Math.min(Math.max(ry || 0, 0), h - 1) };
    for (const line of lines.slice(2)) {
      const p = line.split(/\s+/);
      const x = Number(p[0]);
      const y = Number(p[1]);
      if (!f.inside(x, y)) continue;
      const mask = Number(p[2]) || 0;
      if (mask & 1) f.setWall(x, y, 'left', true);
      if (mask & 2) f.setWall(x, y, 'right', true);
      if (mask & 4) f.setWall(x, y, 'down', true);
      if (mask & 8) f.setWall(x, y, 'up', true);
      if (Number(p[3])) f.setPainted(x, y, true);
      const e = {};
      const rad = Number(String(p[4] || '0').replace(',', '.'));
      const temp = Number(String(p[5] || '0').replace(',', '.'));
      if (rad) e.rad = rad;
      if (temp) e.temp = temp;
      if (p[6] && p[6] !== '$') e.up = p[6];
      if (p[7] && p[7] !== '$') e.down = p[7];
      if (p[8] === '1') e.mark = true;
      if (Object.keys(e).length) f.extra.set(y * w + x, e);
    }
    return f;
  }
}
