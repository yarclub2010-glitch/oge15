// Проверка имён и выполнение программы на школьном алгоритмическом языке.
// Выполнение — генератор: перед каждой командой он отдаёт номер строки,
// поэтому программу можно выполнять и по шагам, и целиком.

import { parse } from './parser.js';
import { KumirError, KEYWORDS } from './lexer.js';

const MAX_STRING = 100000; // длиннее строки в задачах ОГЭ не нужны, а бесконечный рост вешает вкладку

// ---------- Робот ----------

export const ROBOT_ACTIONS = {
  вверх: 'up',
  вниз: 'down',
  влево: 'left',
  вправо: 'right',
  закрасить: 'paint',
};

export const ROBOT_QUERIES = {
  'сверху свободно': { type: 'лог', q: ['free', 'up'] },
  'снизу свободно': { type: 'лог', q: ['free', 'down'] },
  'слева свободно': { type: 'лог', q: ['free', 'left'] },
  'справа свободно': { type: 'лог', q: ['free', 'right'] },
  'сверху стена': { type: 'лог', q: ['wall', 'up'] },
  'снизу стена': { type: 'лог', q: ['wall', 'down'] },
  'слева стена': { type: 'лог', q: ['wall', 'left'] },
  'справа стена': { type: 'лог', q: ['wall', 'right'] },
  'клетка закрашена': { type: 'лог', q: ['painted'] },
  'клетка чистая': { type: 'лог', q: ['clean'] },
  температура: { type: 'цел', q: ['temperature'] },
  радиация: { type: 'вещ', q: ['radiation'] },
};

// ---------- Встроенные функции ----------

const BUILTINS = {
  abs: { n: [1], f: Math.abs },
  iabs: { n: [1], f: Math.abs },
  sqrt: { n: [1], f: (x) => { if (x < 0) throw new Error('Корень из отрицательного числа'); return Math.sqrt(x); } },
  int: { n: [1], f: Math.floor },
  sign: { n: [1], f: Math.sign },
  sin: { n: [1], f: Math.sin },
  cos: { n: [1], f: Math.cos },
  tg: { n: [1], f: Math.tan },
  ctg: { n: [1], f: (x) => 1 / Math.tan(x) },
  arctg: { n: [1], f: Math.atan },
  ln: { n: [1], f: Math.log },
  lg: { n: [1], f: Math.log10 },
  exp: { n: [1], f: Math.exp },
  min: { n: [2], f: Math.min },
  max: { n: [2], f: Math.max },
  imin: { n: [2], f: Math.min },
  imax: { n: [2], f: Math.max },
  div: { n: [2], f: (a, b) => { if (b === 0) throw new Error('Деление на ноль'); return Math.floor(a / b); } },
  mod: { n: [2], f: (a, b) => { if (b === 0) throw new Error('Деление на ноль'); return a - Math.floor(a / b) * b; } },
  rnd: { n: [1], f: (x) => Math.random() * x },
  irnd: { n: [1], f: (x) => 1 + Math.floor(Math.random() * x) },
  длин: { n: [1], f: (s) => String(s).length },
  юникод: { n: [1], f: (s) => String(s).codePointAt(0) },
  код: { n: [1], f: (s) => String(s).codePointAt(0) },
  символ: { n: [1], f: (c) => String.fromCodePoint(c) },
  юнисимвол: { n: [1], f: (c) => String.fromCodePoint(c) },
  цел_в_лит: { n: [1], f: (x) => String(x) },
  вещ_в_лит: { n: [1], f: (x) => formatValue(x) },
  МАКСЦЕЛ: { n: [0], f: () => 2147483647 },
  МАКСВЕЩ: { n: [0], f: () => Number.MAX_VALUE },
};

export function formatValue(v) {
  if (typeof v === 'boolean') return v ? 'да' : 'нет';
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return String(v);
    return String(Number(v.toPrecision(8)));
  }
  return String(v);
}

// ---------- Подсказки при опечатках ----------

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return d[a.length][b.length];
}

function suggest(name, candidates) {
  const lower = name.toLowerCase().replace(/ё/g, 'е');
  if (KEYWORDS.has(lower)) return `Ключевые слова пишутся строчными буквами: «${lower}»`;
  let best = null;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = distance(lower, c.toLowerCase().replace(/ё/g, 'е'));
    if (d < bestD) { bestD = d; best = c; }
  }
  const limit = name.length <= 4 ? 1 : name.length <= 8 ? 2 : 3;
  return best && bestD <= limit ? `Может быть, имелось в виду «${best}»?` : '';
}

// ---------- Проверка имён до запуска ----------

export function analyze(program) {
  const errors = [];
  const warnings = [];
  const algs = new Map();
  for (const alg of program.algs) {
    if (alg.name && algs.has(alg.name)) {
      errors.push(new KumirError(`Алгоритм «${alg.name}» описан дважды`, alg.line));
    }
    if (alg.name) algs.set(alg.name, alg);
    if (alg.name && (ROBOT_ACTIONS[alg.name] || ROBOT_QUERIES[alg.name])) {
      errors.push(new KumirError(`Имя «${alg.name}» уже занято командой Робота`, alg.line));
    }
  }
  if (program.algs.length > 0 && program.algs[0].params.length > 0) {
    errors.push(new KumirError('Первый (главный) алгоритм программы не может иметь параметров', program.algs[0].line));
  }
  let usesRobot = false;

  const knownNames = (scope) => [
    ...Object.keys(ROBOT_ACTIONS), ...Object.keys(ROBOT_QUERIES), ...algs.keys(), ...scope.keys(), ...Object.keys(BUILTINS),
  ];

  function unknown(name, line, scope) {
    const hint = suggest(name, knownNames(scope));
    errors.push(new KumirError(`Неизвестное имя «${name}».${hint ? ' ' + hint : ''}`, line));
  }

  function checkExpr(e, scope) {
    if (!e) return;
    switch (e.e) {
      case 'bin': checkExpr(e.l, scope); checkExpr(e.r, scope); return;
      case 'un': checkExpr(e.x, scope); return;
      case 'name': {
        if (scope.has(e.name)) return;
        if (e.name === 'знач') {
          errors.push(new KumirError('«знач» можно использовать только внутри алгоритма-функции', e.line));
          return;
        }
        if (ROBOT_QUERIES[e.name]) { usesRobot = true; return; }
        if (ROBOT_ACTIONS[e.name]) {
          usesRobot = true;
          errors.push(new KumirError(`«${e.name}» — это команда Робота, а не условие. Условия: «справа свободно», «снизу стена», «клетка закрашена» и т. п.`, e.line));
          return;
        }
        const alg = algs.get(e.name);
        if (alg) {
          if (!alg.retType) errors.push(new KumirError(`Алгоритм «${e.name}» не возвращает значения, его нельзя использовать в выражении`, e.line));
          else if (alg.params.length) errors.push(new KumirError(`Алгоритму «${e.name}» нужны параметры: ${e.name}(…)`, e.line));
          return;
        }
        if (BUILTINS[e.name] && BUILTINS[e.name].n.includes(0)) return;
        unknown(e.name, e.line, scope);
        return;
      }
      case 'index':
        if (!scope.has(e.name)) unknown(e.name, e.line, scope);
        else if (!scope.get(e.name).table && scope.get(e.name).type !== 'лит') {
          errors.push(new KumirError(`«${e.name}» — не таблица, у неё не может быть индексов`, e.line));
        }
        e.idx.forEach((x) => checkExpr(x, scope));
        return;
      case 'call': {
        e.args.forEach((x) => checkExpr(x, scope));
        const alg = algs.get(e.name);
        if (alg) {
          if (!alg.retType) errors.push(new KumirError(`Алгоритм «${e.name}» не возвращает значения, его нельзя использовать в выражении`, e.line));
          if (alg.params.length !== e.args.length) errors.push(new KumirError(`У алгоритма «${e.name}» ${alg.params.length} параметр(ов), а передано ${e.args.length}`, e.line));
          return;
        }
        const b = BUILTINS[e.name];
        if (b) {
          if (!b.n.includes(e.args.length)) errors.push(new KumirError(`У функции «${e.name}» должно быть параметров: ${b.n.join(' или ')}`, e.line));
          return;
        }
        if (ROBOT_QUERIES[e.name] || ROBOT_ACTIONS[e.name]) {
          errors.push(new KumirError(`У «${e.name}» нет параметров — скобки не нужны`, e.line));
          return;
        }
        unknown(e.name, e.line, scope);
        return;
      }
      default:
    }
  }

  function declare(scope, name, info, line) {
    if (ROBOT_ACTIONS[name] || ROBOT_QUERIES[name]) {
      errors.push(new KumirError(`Имя «${name}» уже занято командой Робота`, line));
    }
    if (algs.has(name)) errors.push(new KumirError(`Имя «${name}» уже занято алгоритмом`, line));
    scope.set(name, info);
  }

  function checkBlock(stmts, scope) {
    for (const s of stmts) checkStmt(s, scope);
  }

  function checkStmt(s, scope) {
    switch (s.t) {
      case 'decl':
        for (const item of s.items) {
          if (item.dims) item.dims.forEach(([lo, hi]) => { checkExpr(lo, scope); checkExpr(hi, scope); });
          checkExpr(item.init, scope);
          declare(scope, item.name, { type: s.type, table: s.table }, s.line);
        }
        return;
      case 'assign': {
        checkExpr(s.expr, scope);
        const { name, idx } = s.target;
        if (name === 'знач' && !scope.has('знач')) {
          errors.push(new KumirError('«знач» можно использовать только внутри алгоритма-функции (например, «алг цел f»)', s.line));
          return;
        }
        if (!scope.has(name)) {
          if (ROBOT_QUERIES[name] || ROBOT_ACTIONS[name]) {
            errors.push(new KumirError(`«${name}» — команда Робота, ей нельзя присвоить значение`, s.line));
          } else {
            errors.push(new KumirError(`Величина «${name}» не описана. Опишите её перед использованием, например: цел ${name}`, s.line));
          }
          return;
        }
        if (idx) idx.forEach((x) => checkExpr(x, scope));
        return;
      }
      case 'call': {
        s.args.forEach((x) => checkExpr(x, scope));
        if (ROBOT_ACTIONS[s.name]) {
          usesRobot = true;
          if (s.parens) errors.push(new KumirError(`У команды «${s.name}» нет параметров — скобки не нужны`, s.line));
          return;
        }
        if (ROBOT_QUERIES[s.name]) {
          usesRobot = true;
          errors.push(new KumirError(`«${s.name}» — это условие, а не команда. Его используют в «если … то» или «нц пока …»`, s.line));
          return;
        }
        const alg = algs.get(s.name);
        if (alg) {
          if (alg.retType) errors.push(new KumirError(`«${s.name}» — алгоритм-функция, его значение нужно использовать в выражении`, s.line));
          if (alg.params.length !== s.args.length) {
            errors.push(new KumirError(`У алгоритма «${s.name}» ${alg.params.length} параметр(ов), а передано ${s.args.length}`, s.line));
          }
          alg.params.forEach((p, i) => {
            const a = s.args[i];
            if (a && p.mode !== 'арг' && a.e !== 'name' && a.e !== 'index') {
              errors.push(new KumirError(`Для параметра «${p.name}» (${p.mode}) нужно передать имя величины`, s.line));
            }
          });
          return;
        }
        if (scope.has(s.name)) {
          errors.push(new KumirError(`«${s.name}» — это величина, а не команда. Для присваивания пишите: ${s.name} := …`, s.line));
          return;
        }
        unknown(s.name, s.line, scope);
        return;
      }
      case 'if':
        checkExpr(s.cond, scope);
        checkBlock(s.then, scope);
        if (s.else) checkBlock(s.else, scope);
        return;
      case 'select':
        s.cases.forEach((c) => { checkExpr(c.cond, scope); checkBlock(c.body, scope); });
        if (s.else) checkBlock(s.else, scope);
        return;
      case 'while':
        checkExpr(s.cond, scope);
        checkBlock(s.body, scope);
        return;
      case 'times':
        checkExpr(s.count, scope);
        checkBlock(s.body, scope);
        return;
      case 'for':
        if (!scope.has(s.var)) {
          errors.push(new KumirError(`Переменная цикла «${s.var}» не описана. Добавьте перед циклом: цел ${s.var}`, s.line));
        }
        checkExpr(s.from, scope);
        checkExpr(s.to, scope);
        checkExpr(s.step, scope);
        checkBlock(s.body, scope);
        return;
      case 'loop':
        checkBlock(s.body, scope);
        return;
      case 'repeat':
        checkBlock(s.body, scope);
        checkExpr(s.until, scope);
        return;
      case 'output':
        s.items.forEach((x) => x.e !== 'nl' && checkExpr(x, scope));
        return;
      case 'input':
        s.targets.forEach((t) => { if (!scope.has(t.name)) unknown(t.name, s.line, scope); });
        return;
      case 'assert':
        checkExpr(s.cond, scope);
        return;
      default:
    }
  }

  const globals = new Map();
  checkBlock(program.intro, globals);
  for (const alg of program.algs) {
    const scope = new Map(globals);
    for (const p of alg.params) declare(scope, p.name, { type: p.type, table: p.table }, alg.line);
    if (alg.retType) scope.set('знач', { type: alg.retType, table: false });
    if (alg.pre) checkExpr(alg.pre.cond, scope);
    checkBlock(alg.body, scope);
    if (alg.post) checkExpr(alg.post.cond, scope);
  }

  if (usesRobot && program.uses.length === 0) {
    warnings.push({ line: 1, message: 'В Кумире программа для Робота начинается со строки «использовать Робот». Без неё настоящий Кумир не узнает команды Робота.' });
  }
  if (program.algs.length === 0 && program.intro.length > 0) {
    warnings.push({ line: 1, message: 'В Кумире команды обычно записывают внутри алгоритма: алг … нач … кон' });
  }
  return { errors, warnings };
}

// Разбор + проверка. Возвращает { program, errors, warnings }
export function compile(source) {
  let program;
  try {
    program = parse(source);
  } catch (err) {
    if (err instanceof KumirError) return { program: null, errors: [err], warnings: [] };
    throw err;
  }
  const { errors, warnings } = analyze(program);
  errors.sort((a, b) => a.line - b.line);
  return { program: errors.length ? null : program, errors, warnings };
}

// ---------- Выполнение ----------

class ExitSignal {}
const EXIT = new ExitSignal();

const TYPE_NAMES = { цел: 'целой', вещ: 'вещественной', лог: 'логической', лит: 'литерной', сим: 'символьной' };

function checkType(type, value, name, line) {
  const bad = (what) => new KumirError(`Нельзя присвоить ${what} ${TYPE_NAMES[type]} величине «${name}»`, line, 'runtime');
  switch (type) {
    case 'цел':
      if (typeof value !== 'number') throw bad(typeof value === 'boolean' ? 'логическое значение' : 'текст');
      if (!Number.isInteger(value)) throw bad(`вещественное значение ${formatValue(value)}`);
      return value;
    case 'вещ':
      if (typeof value !== 'number') throw bad(typeof value === 'boolean' ? 'логическое значение' : 'текст');
      return value;
    case 'лог':
      if (typeof value !== 'boolean') throw bad('не логическое значение');
      return value;
    case 'лит':
      if (typeof value !== 'string') throw bad('число');
      return value;
    case 'сим':
      if (typeof value !== 'string' || value.length !== 1) throw bad('не символ');
      return value;
    default:
      return value;
  }
}

function makeCell(type, table = false) {
  return { type, table, value: undefined, dims: null, data: null };
}

export class Interpreter {
  // robot: { move(dir), paint(), query(kind, dir) } — move бросает ошибку при отказе
  constructor(program, { robot, onOutput = () => {}, onInput = () => '', onNote = () => {} } = {}) {
    this.program = program;
    this.robot = robot;
    this.onOutput = onOutput;
    this.onInput = onInput;
    this.onNote = onNote;
    this.algs = new Map(program.algs.filter((a) => a.name).map((a) => [a.name, a]));
    this.depth = 0;
  }

  *run() {
    const globals = new Map();
    this.globals = globals;
    yield* this.execBlock(this.program.intro, globals);
    const main = this.program.algs[0];
    if (main) yield* this.callAlg(main, [], main.line);
  }

  // ----- выражения -----

  *ev(e, scope) {
    switch (e.e) {
      case 'num': return e.v;
      case 'str': return e.v;
      case 'bool': return e.v;
      case 'name': return yield* this.evName(e, scope);
      case 'index': {
        const cell = this.lookup(e.name, scope, e.line);
        const idx = [];
        for (const x of e.idx) idx.push(yield* this.ev(x, scope));
        if (!cell.table && cell.type === 'лит') {
          const s = this.valueOf(cell, e.name, e.line);
          const i = idx[0];
          if (i < 1 || i > s.length) throw new KumirError(`Индекс ${i} вне строки длины ${s.length}`, e.line, 'runtime');
          return s[i - 1];
        }
        return this.getItem(cell, idx, e.name, e.line);
      }
      case 'call': return yield* this.evCall(e, scope);
      case 'un': {
        const x = yield* this.ev(e.x, scope);
        if (e.op === 'не') return !this.asBool(x, e.line);
        this.asNumber(x, e.line);
        return e.op === '-' ? -x : x;
      }
      case 'bin': return yield* this.evBin(e, scope);
      default:
        throw new KumirError('Непонятное выражение', e.line, 'runtime');
    }
  }

  *evBin(e, scope) {
    if (e.op === 'и') {
      const l = this.asBool(yield* this.ev(e.l, scope), e.line);
      if (!l) return false;
      return this.asBool(yield* this.ev(e.r, scope), e.line);
    }
    if (e.op === 'или') {
      const l = this.asBool(yield* this.ev(e.l, scope), e.line);
      if (l) return true;
      return this.asBool(yield* this.ev(e.r, scope), e.line);
    }
    const l = yield* this.ev(e.l, scope);
    const r = yield* this.ev(e.r, scope);
    switch (e.op) {
      case '+':
        if (typeof l === 'string' && typeof r === 'string') {
          if (l.length + r.length > MAX_STRING) throw new KumirError(`Слишком длинная строка: больше ${MAX_STRING} символов`, e.line, 'runtime');
          return l + r;
        }
        return this.asNumber(l, e.line) + this.asNumber(r, e.line);
      case '-': return this.asNumber(l, e.line) - this.asNumber(r, e.line);
      case '*': return this.asNumber(l, e.line) * this.asNumber(r, e.line);
      case '/':
        if (this.asNumber(r, e.line) === 0) throw new KumirError('Деление на ноль', e.line, 'runtime');
        return this.asNumber(l, e.line) / r;
      case '**': return this.asNumber(l, e.line) ** this.asNumber(r, e.line);
      case '=': return l === r;
      case '<>': return l !== r;
      case '<': return l < r;
      case '>': return l > r;
      case '<=': return l <= r;
      case '>=': return l >= r;
      default:
        throw new KumirError(`Неизвестная операция ${e.op}`, e.line, 'runtime');
    }
  }

  *evName(e, scope) {
    if (scope.has(e.name)) {
      const cell = scope.get(e.name);
      if (cell.table) throw new KumirError(`«${e.name}» — таблица, укажите индекс: ${e.name}[…]`, e.line, 'runtime');
      return this.valueOf(cell, e.name, e.line);
    }
    if (ROBOT_QUERIES[e.name]) return this.robotQuery(e.name, e.line);
    const alg = this.algs.get(e.name);
    if (alg) return yield* this.callAlg(alg, [], e.line);
    if (BUILTINS[e.name]) return BUILTINS[e.name].f();
    throw new KumirError(`Неизвестное имя «${e.name}»`, e.line, 'runtime');
  }

  *evCall(e, scope) {
    const alg = this.algs.get(e.name);
    if (alg) return yield* this.callAlg(alg, e.args, e.line, scope);
    const b = BUILTINS[e.name];
    const args = [];
    for (const a of e.args) args.push(yield* this.ev(a, scope));
    try {
      return b.f(...args);
    } catch (err) {
      throw new KumirError(err.message, e.line, 'runtime');
    }
  }

  asBool(v, line) {
    if (typeof v !== 'boolean') throw new KumirError('Условие должно быть логическим (да или нет)', line, 'runtime');
    return v;
  }
  asNumber(v, line) {
    if (typeof v !== 'number') throw new KumirError('Здесь нужно число', line, 'runtime');
    return v;
  }

  lookup(name, scope, line) {
    const cell = scope.get(name);
    if (!cell) throw new KumirError(`Величина «${name}» не описана`, line, 'runtime');
    return cell;
  }
  valueOf(cell, name, line) {
    const v = cell.ref ? cell.ref.get() : cell.value;
    if (v === undefined) {
      throw new KumirError(`Величина «${name}» не имеет значения: ей ещё ничего не присвоили`, line, 'runtime');
    }
    return v;
  }
  setValue(cell, value, name, line) {
    const v = checkType(cell.type, value, name, line);
    if (cell.ref) cell.ref.set(v);
    else cell.value = v;
  }

  tableKey(cell, idx, name, line) {
    if (idx.length !== cell.dims.length) {
      throw new KumirError(`У таблицы «${name}» ${cell.dims.length} индекс(а), а указано ${idx.length}`, line, 'runtime');
    }
    idx.forEach((i, k) => {
      const [lo, hi] = cell.dims[k];
      if (!Number.isInteger(i)) {
        throw new KumirError(`Индекс таблицы «${name}» должен быть целым числом`, line, 'runtime');
      }
      if (i < lo || i > hi) {
        throw new KumirError(`Индекс ${i} выходит за границы таблицы «${name}» [${lo}:${hi}]`, line, 'runtime');
      }
    });
    return idx.join(',');
  }
  getItem(cell, idx, name, line) {
    const v = cell.data.get(this.tableKey(cell, idx, name, line));
    if (v === undefined) {
      throw new KumirError(`Элемент ${name}[${idx.join(',')}] не имеет значения`, line, 'runtime');
    }
    return v;
  }
  setItem(cell, idx, value, name, line) {
    cell.data.set(this.tableKey(cell, idx, name, line), checkType(cell.type, value, `${name}[${idx.join(',')}]`, line));
  }

  robotQuery(name, line) {
    const [kind, dir] = ROBOT_QUERIES[name].q;
    try {
      const v = this.robot.query(kind, dir);
      this.onNote(line, `${name} = ${formatValue(v)}`);
      return v;
    } catch (err) {
      throw new KumirError(err.message, line, 'robot');
    }
  }

  // ----- алгоритмы -----

  *callAlg(alg, argExprs, line, callerScope) {
    if (this.depth > 500) throw new KumirError('Слишком глубокая рекурсия: алгоритм вызывает сам себя слишком много раз', line, 'runtime');
    const scope = new Map(this.globals);
    for (let i = 0; i < alg.params.length; i++) {
      const p = alg.params[i];
      const a = argExprs[i];
      if (p.mode === 'арг' && !p.table) {
        const cell = makeCell(p.type);
        this.setValue(cell, yield* this.ev(a, callerScope), p.name, line);
        scope.set(p.name, cell);
      } else if (a.e === 'name') {
        const target = this.lookup(a.name, callerScope, line);
        scope.set(p.name, target);
      } else if (a.e === 'index') {
        const target = this.lookup(a.name, callerScope, line);
        const idx = [];
        for (const x of a.idx) idx.push(yield* this.ev(x, callerScope));
        const self = this;
        scope.set(p.name, {
          type: target.type,
          table: false,
          ref: {
            get: () => target.data.get(self.tableKey(target, idx, a.name, line)),
            set: (v) => self.setItem(target, idx, v, a.name, line),
          },
        });
      } else {
        throw new KumirError(`Для параметра «${p.name}» нужно передать имя величины`, line, 'runtime');
      }
    }
    if (alg.retType) scope.set('знач', makeCell(alg.retType));

    this.depth++;
    try {
      if (alg.pre) {
        yield alg.pre.line;
        if (!this.asBool(yield* this.ev(alg.pre.cond, scope), alg.pre.line)) {
          throw new KumirError('Не выполнено условие «дано»', alg.pre.line, 'runtime');
        }
      }
      try {
        yield* this.execBlock(alg.body, scope);
      } catch (sig) {
        if (sig !== EXIT) throw sig;
      }
      if (alg.post) {
        yield alg.post.line;
        if (!this.asBool(yield* this.ev(alg.post.cond, scope), alg.post.line)) {
          throw new KumirError('Не выполнено условие «надо»', alg.post.line, 'runtime');
        }
      }
    } finally {
      this.depth--;
    }
    yield alg.endLine;
    if (alg.retType) return this.valueOf(scope.get('знач'), 'знач', alg.endLine);
    return undefined;
  }

  // ----- команды -----

  *execBlock(stmts, scope) {
    for (const s of stmts) yield* this.exec(s, scope);
  }

  *loopBody(body, scope) {
    // true — цикл нужно прервать командой «выход»
    try {
      yield* this.execBlock(body, scope);
      return false;
    } catch (sig) {
      if (sig === EXIT) return true;
      throw sig;
    }
  }

  *exec(s, scope) {
    yield s.line;
    switch (s.t) {
      case 'decl':
        for (const item of s.items) {
          const cell = makeCell(s.type, s.table);
          if (item.dims) {
            cell.dims = [];
            for (const [lo, hi] of item.dims) {
              cell.dims.push([yield* this.ev(lo, scope), yield* this.ev(hi, scope)]);
            }
            cell.data = new Map();
          }
          scope.set(item.name, cell);
          if (item.init) {
            this.setValue(cell, yield* this.ev(item.init, scope), item.name, s.line);
            this.onNote(s.line, `${item.name} = ${formatValue(cell.value)}`);
          }
        }
        return;

      case 'assign': {
        const value = yield* this.ev(s.expr, scope);
        const { name, idx } = s.target;
        const cell = this.lookup(name, scope, s.line);
        if (idx) {
          const ix = [];
          for (const x of idx) ix.push(yield* this.ev(x, scope));
          this.setItem(cell, ix, value, name, s.line);
          this.onNote(s.line, `${name}[${ix.join(',')}] = ${formatValue(value)}`);
        } else {
          this.setValue(cell, value, name, s.line);
          this.onNote(s.line, `${name} = ${formatValue(value)}`);
        }
        return;
      }

      case 'call': {
        const action = ROBOT_ACTIONS[s.name];
        if (action) {
          try {
            if (action === 'paint') this.robot.paint();
            else this.robot.move(action);
          } catch (err) {
            throw new KumirError(err.message, s.line, 'robot');
          }
          return;
        }
        const alg = this.algs.get(s.name);
        yield* this.callAlg(alg, s.args, s.line, scope);
        return;
      }

      case 'if': {
        const c = this.asBool(yield* this.ev(s.cond, scope), s.line);
        this.onNote(s.line, c ? 'да' : 'нет');
        if (c) yield* this.execBlock(s.then, scope);
        else if (s.else) yield* this.execBlock(s.else, scope);
        return;
      }

      case 'select': {
        for (const c of s.cases) {
          yield c.line;
          const v = this.asBool(yield* this.ev(c.cond, scope), c.line);
          this.onNote(c.line, v ? 'да' : 'нет');
          if (v) {
            yield* this.execBlock(c.body, scope);
            return;
          }
        }
        if (s.else) yield* this.execBlock(s.else, scope);
        return;
      }

      case 'while': {
        let first = true;
        for (;;) {
          if (!first) yield s.line;
          first = false;
          const c = this.asBool(yield* this.ev(s.cond, scope), s.line);
          this.onNote(s.line, c ? 'да' : 'нет');
          if (!c) break;
          if (yield* this.loopBody(s.body, scope)) break;
          yield s.endLine;
        }
        return;
      }

      case 'times': {
        const n = yield* this.ev(s.count, scope);
        if (!Number.isInteger(n)) throw new KumirError('Число повторений должно быть целым', s.line, 'runtime');
        for (let k = 1; k <= n; k++) {
          if (k > 1) yield s.line;
          this.onNote(s.line, `${k}-й раз из ${n}`);
          if (yield* this.loopBody(s.body, scope)) break;
          yield s.endLine;
        }
        if (n <= 0) this.onNote(s.line, '0 раз');
        return;
      }

      case 'for': {
        const cell = this.lookup(s.var, scope, s.line);
        const from = yield* this.ev(s.from, scope);
        const to = yield* this.ev(s.to, scope);
        const step = s.step ? yield* this.ev(s.step, scope) : 1;
        if (step === 0) throw new KumirError('Шаг цикла не может быть равен нулю', s.line, 'runtime');
        let first = true;
        for (let i = from; step > 0 ? i <= to : i >= to; i += step) {
          if (!first) yield s.line;
          first = false;
          this.setValue(cell, i, s.var, s.line);
          this.onNote(s.line, `${s.var} = ${formatValue(i)}`);
          if (yield* this.loopBody(s.body, scope)) break;
          yield s.endLine;
        }
        return;
      }

      case 'loop':
        for (;;) {
          if (yield* this.loopBody(s.body, scope)) break;
          yield s.endLine;
        }
        return;

      case 'repeat':
        for (;;) {
          if (yield* this.loopBody(s.body, scope)) break;
          yield s.endLine;
          const c = this.asBool(yield* this.ev(s.until, scope), s.endLine);
          this.onNote(s.endLine, c ? 'да' : 'нет');
          if (c) break;
        }
        return;

      case 'output': {
        let text = '';
        for (const item of s.items) {
          if (item.e === 'nl') text += '\n';
          else text += formatValue(yield* this.ev(item, scope));
        }
        this.onOutput(text);
        return;
      }

      case 'input':
        for (const t of s.targets) {
          const cell = this.lookup(t.name, scope, s.line);
          const raw = this.onInput(t.name, cell.type);
          if (raw === null || raw === undefined) throw new KumirError('Ввод отменён', s.line, 'runtime');
          let v = raw;
          if (cell.type === 'цел' || cell.type === 'вещ') v = Number(String(raw).replace(',', '.'));
          if (cell.type === 'лог') v = raw === 'да';
          if (typeof v === 'number' && Number.isNaN(v)) throw new KumirError(`Введено не число: «${raw}»`, s.line, 'runtime');
          this.setValue(cell, v, t.name, s.line);
          this.onNote(s.line, `${t.name} = ${formatValue(v)}`);
        }
        return;

      case 'exit':
        throw EXIT;

      case 'assert': {
        const c = this.asBool(yield* this.ev(s.cond, scope), s.line);
        this.onNote(s.line, c ? 'да' : 'нет');
        if (!c) throw new KumirError('Утверждение «утв» неверно', s.line, 'runtime');
        return;
      }

      default:
    }
  }
}
