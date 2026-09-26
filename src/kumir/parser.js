// Синтаксический разбор программы на школьном алгоритмическом языке.
// Результат — дерево программы (AST), которое выполняет interpreter.js.

import { tokenize, KumirError, KEYWORDS } from './lexer.js';

const TYPE_WORDS = ['цел', 'вещ', 'лог', 'лит', 'сим'];
const TABLE_WORDS = { целтаб: 'цел', вещтаб: 'вещ', логтаб: 'лог', литтаб: 'лит', симтаб: 'сим' };

// Слова, которые закрывают конструкции. Встретив такое слово, блок команд заканчивается.
const CLOSERS = new Set(['кц', 'кц_при', 'все', 'иначе', 'при', 'кон', 'алг']);

const OPENER_CLOSER = { нц: 'кц', если: 'все', выбор: 'все', нач: 'кон' };

const describe = (tok) => {
  if (tok.type === 'eof') return 'конец программы';
  if (tok.type === 'nl') return 'конец строки';
  if (tok.type === 'str') return `строка "${tok.value}"`;
  return `«${tok.value}»`;
};

export function parse(source) {
  const tokens = tokenize(source);
  let pos = 0;

  const peek = (k = 0) => tokens[Math.min(pos + k, tokens.length - 1)];
  const next = () => tokens[pos++];
  const isKw = (v, t = peek()) => t.type === 'kw' && t.value === v;
  const isOp = (v, t = peek()) => t.type === 'op' && t.value === v;

  function expectKw(v, message) {
    if (!isKw(v)) throw new KumirError(message || `Ожидалось «${v}», а встретилось ${describe(peek())}`, peek().line);
    return next();
  }
  function expectOp(v, message) {
    if (!isOp(v)) throw new KumirError(message || `Ожидалось «${v}», а встретилось ${describe(peek())}`, peek().line);
    return next();
  }
  function skipNewlines() {
    while (peek().type === 'nl') next();
  }
  function endOfStatement() {
    const t = peek();
    if (t.type === 'nl') { next(); return; }
    if (t.type === 'eof') return;
    if (t.type === 'kw' && CLOSERS.has(t.value)) return;
    if (isOp('=')) {
      throw new KumirError('Для присваивания используется «:=», а не «=»', t.line);
    }
    throw new KumirError(`Лишнее в конце команды: ${describe(t)}. Каждую команду пишите с новой строки или через «;»`, t.line);
  }

  // Имя в Кумире может состоять из нескольких слов: «справа свободно», «закрасить ряд»
  function parseName(what = 'имя') {
    const t = peek();
    if (t.type !== 'word') {
      if (t.type === 'kw') {
        throw new KumirError(`Ожидалось ${what}, а встретилось ключевое слово «${t.value}»`, t.line);
      }
      throw new KumirError(`Ожидалось ${what}, а встретилось ${describe(t)}`, t.line);
    }
    const words = [];
    while (peek().type === 'word' && peek().line === t.line) words.push(next().value);
    return { name: words.join(' '), line: t.line };
  }

  // ---------- Выражения ----------

  function parseExpr() {
    return parseOr();
  }
  function parseOr() {
    let left = parseAnd();
    while (isKw('или')) {
      next();
      left = { e: 'bin', op: 'или', l: left, r: parseAnd(), line: left.line };
    }
    return left;
  }
  function parseAnd() {
    let left = parseNot();
    while (isKw('и')) {
      next();
      left = { e: 'bin', op: 'и', l: left, r: parseNot(), line: left.line };
    }
    return left;
  }
  function parseNot() {
    if (isKw('не')) {
      const t = next();
      return { e: 'un', op: 'не', x: parseNot(), line: t.line };
    }
    return parseCompare();
  }
  function parseCompare() {
    const left = parseAdd();
    const t = peek();
    if (t.type === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(t.value)) {
      next();
      return { e: 'bin', op: t.value, l: left, r: parseAdd(), line: left.line };
    }
    return left;
  }
  function parseAdd() {
    let left = parseMul();
    while (isOp('+') || isOp('-')) {
      const op = next().value;
      left = { e: 'bin', op, l: left, r: parseMul(), line: left.line };
    }
    return left;
  }
  function parseMul() {
    let left = parseUnary();
    while (isOp('*') || isOp('/')) {
      const op = next().value;
      left = { e: 'bin', op, l: left, r: parseUnary(), line: left.line };
    }
    return left;
  }
  function parseUnary() {
    if (isOp('-') || isOp('+')) {
      const t = next();
      return { e: 'un', op: t.value, x: parseUnary(), line: t.line };
    }
    return parsePower();
  }
  function parsePower() {
    const base = parsePrimary();
    if (isOp('**')) {
      next();
      return { e: 'bin', op: '**', l: base, r: parseUnary(), line: base.line };
    }
    return base;
  }
  function parseArgs(close) {
    const args = [];
    if (isOp(close)) { next(); return args; }
    for (;;) {
      args.push(parseExpr());
      if (isOp(',')) { next(); continue; }
      expectOp(close, `Ожидалось «,» или «${close}», а встретилось ${describe(peek())}`);
      return args;
    }
  }
  function parsePrimary() {
    const t = peek();
    if (t.type === 'num') {
      next();
      return { e: 'num', v: t.value, real: t.isReal, line: t.line };
    }
    if (t.type === 'str') {
      next();
      return { e: 'str', v: t.value, line: t.line };
    }
    if (isKw('да') || isKw('нет')) {
      next();
      return { e: 'bool', v: t.value === 'да', line: t.line };
    }
    if (isOp('(')) {
      next();
      const inner = parseExpr();
      expectOp(')', `Не хватает закрывающей скобки «)»`);
      return inner;
    }
    if (isKw('знач')) {
      next();
      return { e: 'name', name: 'знач', line: t.line };
    }
    if (t.type === 'word') {
      const { name, line } = parseName();
      if (isOp('(')) {
        next();
        return { e: 'call', name, args: parseArgs(')'), line };
      }
      if (isOp('[')) {
        next();
        return { e: 'index', name, idx: parseArgs(']'), line };
      }
      return { e: 'name', name, line };
    }
    if (t.type === 'nl' || t.type === 'eof') {
      throw new KumirError('Выражение не закончено', t.line);
    }
    throw new KumirError(`Неожиданное ${describe(t)} в выражении`, t.line);
  }

  // ---------- Команды ----------

  // Блок команд до одного из слов terminators. opener — конструкция, которую блок должен закрыть.
  function parseBlock(terminators, opener) {
    const body = [];
    for (;;) {
      skipNewlines();
      const t = peek();
      if (t.type === 'kw' && terminators.includes(t.value)) return body;
      if (t.type === 'eof' || (t.type === 'kw' && CLOSERS.has(t.value))) {
        if (!opener) {
          throw new KumirError(`«${t.value}» здесь не к месту: нет конструкции, которую оно закрывает`, t.line);
        }
        const closer = terminators[0];
        if (t.type === 'eof' || t.value === 'кон' || t.value === 'алг') {
          throw new KumirError(`«${opener.word}» (строка ${opener.line}) не закрыт: не хватает «${closer}»`, opener.line);
        }
        throw new KumirError(`Встретилось «${t.value}», но сначала нужно закрыть «${opener.word}» (строка ${opener.line}) словом «${closer}»`, t.line);
      }
      body.push(parseStatement());
    }
  }

  function parseType() {
    const t = next();
    if (TABLE_WORDS[t.value]) return { type: TABLE_WORDS[t.value], table: true };
    if (isKw('таб')) {
      next();
      return { type: t.value, table: true };
    }
    return { type: t.value, table: false };
  }

  function parseBounds() {
    // [1:10] или [1:5, 1:5]
    const dims = [];
    expectOp('[');
    for (;;) {
      const lo = parseExpr();
      expectOp(':', 'Границы таблицы записываются так: [1:10]');
      const hi = parseExpr();
      dims.push([lo, hi]);
      if (isOp(',')) { next(); continue; }
      expectOp(']');
      return dims;
    }
  }

  function parseDecl() {
    const line = peek().line;
    const { type, table } = parseType();
    const items = [];
    for (;;) {
      const { name } = parseName('имя величины');
      const item = { name, dims: null, init: null };
      if (table) {
        if (!isOp('[')) throw new KumirError(`Для таблицы «${name}» нужно указать границы, например: ${name}[1:10]`, line);
        item.dims = parseBounds();
      }
      if (isOp(':=') || isOp('=')) {
        next();
        item.init = parseExpr();
      }
      items.push(item);
      if (isOp(',')) { next(); continue; }
      break;
    }
    return { t: 'decl', line, type, table, items };
  }

  function parseLoop() {
    const start = next(); // нц
    const line = start.line;
    const opener = { word: 'нц', line };
    let node;

    if (isKw('пока')) {
      next();
      if (peek().type === 'nl') throw new KumirError('После «нц пока» нужно написать условие', line);
      node = { t: 'while', line, cond: parseExpr() };
    } else if (isKw('для')) {
      next();
      const { name } = parseName('имя переменной цикла');
      expectKw('от', 'Цикл «для» записывается так: нц для i от 1 до 10');
      const from = parseExpr();
      expectKw('до', 'Цикл «для» записывается так: нц для i от 1 до 10');
      const to = parseExpr();
      let step = null;
      if (isKw('шаг')) {
        next();
        step = parseExpr();
      }
      node = { t: 'for', line, var: name, from, to, step };
    } else if (peek().type === 'nl' || peek().type === 'eof') {
      node = { t: 'loop', line };
    } else {
      const startPos = pos;
      let count;
      try {
        count = parseExpr();
      } catch {
        count = null;
      }
      if (!count || !isKw('раз')) {
        pos = startPos;
        throw new KumirError('После «нц» ожидалось «пока <условие>», «для i от … до …» или «<число> раз»', line);
      }
      next();
      node = { t: 'times', line, count };
    }

    // Тело может начинаться на той же строке: нц 3 раз вправо кц
    if (peek().type === 'nl') next();
    node.body = parseBlock(['кц', 'кц_при'], opener);
    const close = next();
    node.endLine = close.line;
    if (close.value === 'кц_при' || isKw('при')) {
      if (close.value === 'кц') next();
      if (node.t !== 'loop') {
        throw new KumirError('«кц при» можно использовать только в цикле «нц … кц при <условие>»', close.line);
      }
      node.t = 'repeat';
      node.until = parseExpr();
    }
    return node;
  }

  function parseIf() {
    const start = next(); // если
    const line = start.line;
    if (peek().type === 'nl') throw new KumirError('После «если» нужно написать условие', line);
    const cond = parseExpr();
    skipNewlines();
    if (!isKw('то')) {
      throw new KumirError(`После условия в «если» должно быть слово «то», а встретилось ${describe(peek())}`, peek().line);
    }
    next();
    const opener = { word: 'если', line };
    const then = parseBlock(['иначе', 'все'], opener);
    let otherwise = null;
    if (isKw('иначе')) {
      next();
      otherwise = parseBlock(['все'], opener);
    }
    const end = expectKw('все');
    return { t: 'if', line, cond, then, else: otherwise, endLine: end.line };
  }

  function parseSelect() {
    const start = next(); // выбор
    const line = start.line;
    const opener = { word: 'выбор', line };
    const cases = [];
    let otherwise = null;
    skipNewlines();
    if (!isKw('при')) throw new KumirError('После «выбор» должны идти варианты «при <условие>: …»', peek().line);
    while (isKw('при')) {
      const caseLine = next().line;
      const cond = parseExpr();
      expectOp(':', 'После условия в «при» нужно поставить двоеточие «:»');
      cases.push({ line: caseLine, cond, body: parseBlock(['при', 'иначе', 'все'], opener) });
    }
    if (isKw('иначе')) {
      next();
      otherwise = parseBlock(['все'], opener);
    }
    const end = expectKw('все');
    return { t: 'select', line, cases, else: otherwise, endLine: end.line };
  }

  function parseStatement() {
    const t = peek();
    const line = t.line;
    let node;

    if (t.type === 'kw') {
      switch (t.value) {
        case 'нц': return parseLoop();
        case 'если': return parseIf();
        case 'выбор': return parseSelect();
        case 'цел': case 'вещ': case 'лог': case 'лит': case 'сим':
        case 'целтаб': case 'вещтаб': case 'логтаб': case 'литтаб': case 'симтаб':
          node = parseDecl();
          break;
        case 'вывод': {
          next();
          const items = [];
          for (;;) {
            if (isKw('нс')) {
              next();
              items.push({ e: 'nl' });
            } else {
              items.push(parseExpr());
            }
            if (isOp(',')) { next(); continue; }
            break;
          }
          node = { t: 'output', line, items };
          break;
        }
        case 'ввод': {
          next();
          const targets = [];
          for (;;) {
            const { name } = parseName('имя величины');
            let idx = null;
            if (isOp('[')) { next(); idx = parseArgs(']'); }
            targets.push({ name, idx });
            if (isOp(',')) { next(); continue; }
            break;
          }
          node = { t: 'input', line, targets };
          break;
        }
        case 'выход':
          next();
          node = { t: 'exit', line };
          break;
        case 'утв':
          next();
          node = { t: 'assert', line, cond: parseExpr() };
          break;
        case 'знач': {
          next();
          expectOp(':=', 'Значение функции задаётся так: знач := <выражение>');
          node = { t: 'assign', line, target: { name: 'знач', idx: null }, expr: parseExpr() };
          break;
        }
        case 'то':
          throw new KumirError('«то» без «если»', line);
        case 'нач':
          throw new KumirError('Лишнее «нач»: оно пишется один раз после строки «алг»', line);
        case 'использовать':
          throw new KumirError('Строку «использовать Робот» пишут в самом начале программы, до «алг»', line);
        case 'пока':
          throw new KumirError('Цикл записывается так: нц пока <условие> … кц', line);
        default:
          throw new KumirError(`Здесь не может стоять ключевое слово «${t.value}»`, line);
      }
      endOfStatement();
      return node;
    }

    if (t.type === 'word') {
      const { name } = parseName();
      if (isOp('[')) {
        next();
        const idx = parseArgs(']');
        expectOp(':=', `Ожидалось «:=» после «${name}[…]»`);
        node = { t: 'assign', line, target: { name, idx }, expr: parseExpr() };
      } else if (isOp(':=')) {
        next();
        node = { t: 'assign', line, target: { name, idx: null }, expr: parseExpr() };
      } else if (isOp('=')) {
        throw new KumirError(`Для присваивания используется «:=», а не «=». Например: ${name} := 5`, line);
      } else if (isOp('(')) {
        next();
        node = { t: 'call', line, name, args: parseArgs(')'), parens: true };
      } else {
        node = { t: 'call', line, name, args: [], parens: false };
      }
      endOfStatement();
      return node;
    }

    if (t.type === 'num') throw new KumirError(`Команда не может начинаться с числа ${t.value}`, line);
    if (t.type === 'op' && t.value === '|') return null;
    throw new KumirError(`Непонятная команда: ${describe(t)}`, line);
  }

  // ---------- Алгоритмы и программа ----------

  function parseParams() {
    const params = [];
    expectOp('(');
    let mode = 'арг';
    let type = null;
    let table = false;
    for (;;) {
      if (isKw('арг') || isKw('рез') || isKw('аргрез')) {
        mode = next().value;
        type = null;
      }
      const t = peek();
      if (t.type === 'kw' && (TYPE_WORDS.includes(t.value) || TABLE_WORDS[t.value])) {
        ({ type, table } = parseType());
      }
      if (!type) throw new KumirError('У параметра нужно указать тип: цел, вещ, лог, лит или сим', peek().line);
      const { name } = parseName('имя параметра');
      if (table && isOp('[')) parseBounds();
      params.push({ name, mode, type, table });
      if (isOp(',')) { next(); continue; }
      expectOp(')', `Ожидалось «,» или «)» в списке параметров, а встретилось ${describe(peek())}`);
      return params;
    }
  }

  function parseAlg() {
    const start = next(); // алг
    const line = start.line;
    let retType = null;
    const t = peek();
    if (t.type === 'kw' && TYPE_WORDS.includes(t.value)) {
      retType = next().value;
    }
    let name = '';
    if (peek().type === 'word') name = parseName('имя алгоритма').name;
    let params = [];
    if (isOp('(')) params = parseParams();
    if (retType && !name) throw new KumirError('У алгоритма-функции должно быть имя', line);
    endOfStatement();

    let pre = null;
    let post = null;
    skipNewlines();
    while (isKw('дано') || isKw('надо')) {
      const kw = next();
      let cond = null;
      if (peek().type !== 'nl' && peek().type !== 'eof') cond = parseExpr();
      if (kw.value === 'дано') pre = cond && { cond, line: kw.line };
      else post = cond && { cond, line: kw.line };
      endOfStatement();
      skipNewlines();
    }
    if (!isKw('нач')) {
      throw new KumirError(`После строки «алг» должно идти «нач», а встретилось ${describe(peek())}`, peek().line);
    }
    const begin = next();
    endOfStatement();
    const body = parseBlock(['кон'], { word: 'нач', line: begin.line });
    const end = expectKw('кон');
    endOfStatement();
    return { name, retType, params, body, line, endLine: end.line, pre, post };
  }

  const program = { uses: [], intro: [], algs: [] };
  for (;;) {
    skipNewlines();
    const t = peek();
    if (t.type === 'eof') break;
    if (isKw('использовать') || isKw('исп')) {
      if (t.value === 'исп') throw new KumirError('Собственные исполнители («исп») в тренажёре не поддерживаются', t.line);
      next();
      const { name } = parseName('имя исполнителя');
      if (name !== 'Робот') {
        const hint = name.toLowerCase() === 'робот' ? ' Пишите с большой буквы: использовать Робот' : '';
        throw new KumirError(`Исполнитель «${name}» не поддерживается. Доступен только Робот.${hint}`, t.line);
      }
      program.uses.push({ name, line: t.line });
      endOfStatement();
      continue;
    }
    if (isKw('алг')) {
      program.algs.push(parseAlg());
      continue;
    }
    if (program.algs.length > 0) {
      if (isKw('кон')) throw new KumirError('Лишнее «кон»: у алгоритма уже есть «кон»', t.line);
      throw new KumirError('Команда вне алгоритма: после «кон» может идти только новый «алг»', t.line);
    }
    const stmt = parseBlockItemTop();
    if (stmt) program.intro.push(stmt);
  }
  return program;

  function parseBlockItemTop() {
    const t = peek();
    if (t.type === 'kw' && CLOSERS.has(t.value)) {
      const opener = Object.keys(OPENER_CLOSER).find((k) => OPENER_CLOSER[k] === t.value);
      if (t.value === 'кон') throw new KumirError('«кон» без «нач»', t.line);
      throw new KumirError(`«${t.value}» без ${opener ? `«${opener}»` : 'открывающей конструкции'}`, t.line);
    }
    return parseStatement();
  }
}

export { KumirError, KEYWORDS };
