// Автотесты: язык, Робот и библиотека заданий. Открыть tests/index.html через локальный сервер.

import { compile, Interpreter } from '../src/kumir/interpreter.js';
import { Field } from '../src/robot/field.js';
import { TASKS, checkVariants } from '../src/tasks/tasks.js';
import { checkTask, runSilently, compare } from '../src/tasks/checker.js';

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (err) {
    results.push({ name, ok: false, message: err.message });
  }
}
function assert(cond, message) {
  if (!cond) throw new Error(message || 'условие не выполнено');
}
function eq(actual, expected, message = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message} ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)}`);
  }
}

// Запуск программы: возвращает вывод и поле
function run(source, field = new Field(7, 7)) {
  const { program, errors } = compile(source);
  if (errors.length) throw new Error(`строка ${errors[0].line}: ${errors[0].message}`);
  const out = [];
  const notes = new Map();
  const interp = new Interpreter(program, {
    robot: field,
    onOutput: (t) => out.push(t),
    onNote: (l, t) => notes.set(l, t),
  });
  const gen = interp.run();
  let steps = 0;
  while (!gen.next().done) {
    if (++steps > 1e6) throw new Error('зациклилось');
  }
  return { out: out.join(''), field, notes, steps };
}

function compileError(source) {
  const { errors } = compile(source);
  assert(errors.length > 0, 'ожидалась ошибка компиляции');
  return errors[0];
}

function runtimeError(source, field = new Field(7, 7)) {
  try {
    run(source, field);
  } catch (err) {
    return err;
  }
  throw new Error('ожидалась ошибка выполнения');
}

// ---------- Язык ----------

test('вывод и арифметика', () => {
  const r = run('алг\nнач\n  цел a, b\n  a := 7\n  b := a * 3 - 1\n  вывод b, " ", div(b, 3), " ", mod(b, 3), " ", b / 4, нс\nкон');
  eq(r.out, '20 6 2 5\n');
});

test('приоритет операций и степень', () => {
  eq(run('алг\nнач\n  вывод 2 + 3 * 4 ** 2, " ", -2 ** 2, " ", (2 + 3) * 4\nкон').out, '50 -4 20');
});

test('логика: и, или, не', () => {
  eq(run('алг\nнач\n  лог x\n  x := не да или нет и да\n  вывод x, " ", не (1 > 2) и 3 >= 3, " ", 1 <> 2\nкон').out, 'нет да да');
});

test('нц N раз', () => {
  eq(run('алг\nнач\n  цел s\n  s := 0\n  нц 5 раз\n    s := s + 2\n  кц\n  вывод s\nкон').out, '10');
});

test('нц для с шагом и в обратную сторону', () => {
  eq(run('алг\nнач\n  цел i\n  нц для i от 1 до 9 шаг 3\n    вывод i, " "\n  кц\n  нц для i от 3 до 1 шаг -1\n    вывод i\n  кц\nкон').out, '1 4 7 321');
});

test('нц пока и кц при', () => {
  eq(run('алг\nнач\n  цел n\n  n := 1\n  нц пока n < 100\n    n := n * 2\n  кц\n  вывод n, " "\n  нц\n    n := n - 50\n  кц при n < 0\n  вывод n\nкон').out, '128 -22');
  eq(run('алг\nнач\n  цел n\n  n := 0\n  нц\n    n := n + 1\n  кц_при n = 3\n  вывод n\nкон').out, '3');
});

test('если / иначе, в том числе в одну строку и с «то» на новой строке', () => {
  eq(run('алг\nнач\n  цел a\n  a := 5\n  если a > 3 то вывод "б" иначе вывод "м" все\n  если a > 10\n    то вывод "Б"\n    иначе вывод "М"\n  все\nкон').out, 'бМ');
  eq(run('алг\nнач\n  если да то\n    вывод 1\n  всё\nкон').out, '1');
});

test('выбор при', () => {
  const src = (v) => `алг\nнач\n  цел a\n  a := ${v}\n  выбор\n    при a = 1: вывод "один"\n    при a = 2: вывод "два"\n    иначе вывод "много"\n  все\nкон`;
  eq(run(src(1)).out, 'один');
  eq(run(src(2)).out, 'два');
  eq(run(src(9)).out, 'много');
});

test('выход из цикла и из алгоритма', () => {
  eq(run('алг\nнач\n  цел i\n  нц для i от 1 до 10\n    если i = 4 то выход все\n    вывод i\n  кц\n  вывод "!"\n  выход\n  вывод "не должно"\nкон').out, '123!');
});

test('вспомогательный алгоритм, функция, рез-параметр, рекурсия', () => {
  const src = [
    'алг',
    'нач',
    '  цел r',
    '  удвоить(21, r)',
    '  вывод r, " ", факториал(5), " ", квадрат суммы(1, 2)',
    'кон',
    'алг удвоить(арг цел x, рез цел y)',
    'нач',
    '  y := x * 2',
    'кон',
    'алг цел факториал(цел n)',
    'нач',
    '  если n <= 1 то знач := 1 иначе знач := n * факториал(n - 1) все',
    'кон',
    'алг цел квадрат суммы(цел a, b)',
    'нач',
    '  знач := (a + b) ** 2',
    'кон',
  ].join('\n');
  eq(run(src).out, '42 120 9');
});

test('таблицы', () => {
  eq(run('алг\nнач\n  цел таб a[1:5]\n  цел i, s\n  нц для i от 1 до 5\n    a[i] := i * i\n  кц\n  s := 0\n  нц для i от 1 до 5\n    s := s + a[i]\n  кц\n  вывод s, " ", a[3]\nкон').out, '55 9');
  eq(run('алг\nнач\n  целтаб m[1:2, 1:2]\n  m[2, 1] := 7\n  вывод m[2, 1]\nкон').out, '7');
});

test('строки', () => {
  eq(run('алг\nнач\n  лит s\n  s := "При" + \'вет\'\n  вывод s, " ", длин(s), " ", s[1]\nкон').out, 'Привет 6 П');
});

test('вступление без алг и точка с запятой', () => {
  eq(run('цел a; a := 2\nвывод a + 1').out, '3');
});

test('комментарии', () => {
  eq(run('| комментарий\nалг | ещё\nнач\n  вывод 1 | и тут\nкон').out, '1');
});

test('значения на полях', () => {
  const r = run('алг\nнач\n  цел a\n  a := 5\n  нц пока a > 3\n    a := a - 1\n  кц\nкон');
  eq(r.notes.get(4), 'a = 5');
  eq(r.notes.get(6), 'a = 3');
  eq(r.notes.get(5), 'нет');
});

// ---------- Ошибки и подсказки ----------

test('ошибка: нет кц', () => {
  const e = compileError('алг\nнач\n  нц пока справа свободно\n    вправо\nкон');
  eq(e.line, 3);
  assert(e.message.includes('кц'), e.message);
});

test('ошибка: нет то', () => {
  const e = compileError('алг\nнач\n  если справа свободно\n    вправо\n  все\nкон');
  assert(e.message.includes('«то»'), e.message);
});

test('ошибка: опечатка в команде — подсказка', () => {
  const e = compileError('использовать Робот\nалг\nнач\n  вправа\nкон');
  eq(e.line, 4);
  assert(e.message.includes('вправо'), e.message);
});

test('ошибка: условие вместо команды', () => {
  const e = compileError('использовать Робот\nалг\nнач\n  справа свободно\nкон');
  assert(e.message.includes('условие'), e.message);
});

test('ошибка: команда вместо условия', () => {
  const e = compileError('использовать Робот\nалг\nнач\n  если вправо то закрасить все\nкон');
  assert(e.message.includes('команда'), e.message);
});

test('ошибка: = вместо :=', () => {
  const e = compileError('алг\nнач\n  цел a\n  a = 5\nкон');
  assert(e.message.includes(':='), e.message);
});

test('ошибка: не описана величина', () => {
  const e = compileError('алг\nнач\n  a := 5\nкон');
  assert(e.message.includes('не описана'), e.message);
});

test('ошибка: заглавные буквы в ключевом слове', () => {
  const e = compileError('алг\nнач\n  Нц 3 раз\n  кц\nкон');
  assert(e.line === 3 || e.line === 4, `строка ${e.line}`);
});

test('ошибка выполнения: деление на ноль и нет значения', () => {
  assert(runtimeError('алг\nнач\n  вывод 1 / 0\nкон').message.includes('ноль'));
  assert(runtimeError('алг\nнач\n  цел a\n  вывод a\nкон').message.includes('не имеет значения'));
  assert(runtimeError('алг\nнач\n  цел a\n  a := 7 / 2\nкон').message.includes('вещественное'));
});

// ---------- Робот ----------

test('Робот: движение, закраска, условия', () => {
  const f = new Field(5, 5);
  f.setWall(2, 0, 'right', true);
  const r = run('использовать Робот\nалг\nнач\n  нц пока справа свободно\n    закрасить\n    вправо\n  кц\n  вывод клетка закрашена, " ", справа стена, " ", снизу свободно\nкон', f);
  eq(r.field.robot, { x: 2, y: 0 });
  eq(r.field.paintedCells(), [0, 1]);
  eq(r.out, 'нет да да');
});

test('Робот разбивается о стену и о забор', () => {
  const f = new Field(3, 3);
  const e = runtimeError('использовать Робот\nалг\nнач\n  влево\nкон', f);
  eq(e.kind, 'robot');
  eq(e.message, 'Робот разбился: слева стена!');
  eq(f.broken, 'left');
});

test('Формат .fil: запись и чтение', () => {
  const f = new Field(6, 4);
  f.setWall(1, 1, 'up', true);
  f.setWall(3, 2, 'right', true);
  f.setPainted(2, 3, true);
  f.robot = { x: 4, y: 1 };
  const g = Field.fromFil(f.toFil());
  eq([g.w, g.h], [6, 4]);
  eq(g.robot, { x: 4, y: 1 });
  assert(g.wall(1, 1, 'up') && g.wall(1, 0, 'down'), 'стена сверху');
  assert(g.wall(3, 2, 'right') && g.wall(4, 2, 'left'), 'стена справа');
  assert(g.isPainted(2, 3), 'закраска');
  assert(!g.wall(0, 0, 'right'), 'лишняя стена');
});

test('Формат .fil из Кумира (practicum 1_1.fil)', () => {
  const text = '; Field Size: x, y\n5 2\n; Robot position: x, y\n0 0\n; A set of special Fields: x, y, Wall, Color, Radiation, Temperature, Symbol, Symbol1, Point\n0 0 0 0 0.000000 0.000000 А $ \n0 1 8 0 0.000000 0.000000 $ Б \n1 1 8 0 0.000000 0.000000 $ $ \n; End Of File\n';
  const g = Field.fromFil(text);
  eq([g.w, g.h], [5, 2]);
  assert(g.wall(0, 0, 'down') && g.wall(1, 0, 'down') && !g.wall(2, 0, 'down'));
  eq(g.extra.get(0).up, 'А');
});

test('JSON обстановки', () => {
  const f = new Field(4, 4);
  f.setWall(1, 1, 'left', true);
  f.setPainted(3, 3, true);
  const g = Field.fromJSON(JSON.parse(JSON.stringify(f.toJSON())));
  assert(g.wall(1, 1, 'left') && g.isPainted(3, 3));
});

// ---------- Задания ----------

for (const task of TASKS) {
  test(`задание «${task.title}»: эталонное решение получает 2 балла`, () => {
    const { program, errors } = compile(task.solution);
    if (errors.length) throw new Error(`решение не компилируется: строка ${errors[0].line}: ${errors[0].message}`);
    const res = checkTask(task, program);
    const bad = res.results.filter((r) => !r.ok);
    if (bad.length) throw new Error(`${bad[0].variant.label}: ${bad[0].text}`);
    eq(res.score, 2);
  });

  test(`задание «${task.title}»: варианты корректны`, () => {
    for (const v of checkVariants(task)) {
      assert(v.target.size > 0, 'нечего закрашивать');
      assert(v.field.inside(v.field.robot.x, v.field.robot.y), 'Робот вне поля');
      for (const k of v.target) {
        const [x, y] = k.split(',').map(Number);
        assert(v.field.inside(x, y), `клетка ${k} вне поля`);
      }
    }
  });
}

for (const task of TASKS) {
  test(`задание «${task.title}»: пустая программа — 0 баллов`, () => {
    const res = checkTask(task, compile('использовать Робот\nалг\nнач\nкон').program);
    eq(res.score, 0);
  });

  test(`задание «${task.title}»: закрасить одну клетку — 0 баллов`, () => {
    const res = checkTask(task, compile('использовать Робот\nалг\nнач\n  закрасить\nкон').program);
    eq(res.score, 0);
  });
}

test('решение под один рисунок не проходит проверку', () => {
  const task = TASKS.find((t) => t.id === 'both-sides');
  // Стена «как на рисунке» — ровно 3 клетки; на других вариантах длина другая
  const fixed = [
    'использовать Робот', 'алг', 'нач',
    '  нц 3 раз', '    закрасить', '    вправо', '  кц',
    '  вниз', '  влево',
    '  нц 3 раз', '    закрасить', '    влево', '  кц',
    'кон',
  ].join('\n');
  const res = checkTask(task, compile(fixed).program);
  assert(res.score < 2, `получено ${res.score} баллов`);
});

test('закрашен проход — 0 баллов: проход может быть сколь угодно широким', () => {
  const task = TASKS.find((t) => t.id === 'h-pass');
  const wrong = [
    'использовать Робот', 'алг', 'нач',
    '  нц пока не снизу свободно', '    закрасить', '    вправо', '  кц',
    '  нц пока снизу свободно', '    закрасить', '    вправо', '  кц',
    '  нц пока не снизу свободно', '    закрасить', '    вправо', '  кц',
    'кон',
  ].join('\n');
  eq(checkTask(task, compile(wrong).program).score, 0);
});

test('пропущена одна клетка в начале — 1 балл: ошибка не растёт с длиной стены', () => {
  const task = TASKS.find((t) => t.id === 'h-pass');
  const almost = [
    'использовать Робот', 'алг', 'нач',
    '  вправо',
    '  нц пока не снизу свободно', '    закрасить', '    вправо', '  кц',
    '  нц пока снизу свободно', '    вправо', '  кц',
    '  нц пока не снизу свободно', '    закрасить', '    вправо', '  кц',
    'кон',
  ].join('\n');
  eq(checkTask(task, compile(almost).program).score, 1);
});

test('поле в заданиях бесконечное: у края рисунка забора нет', () => {
  for (const task of TASKS) {
    for (const v of checkVariants(task)) assert(v.field.open, `${task.id}: ${v.label} — поле с забором`);
  }
});

test('открытое поле: Робот уходит за край, закраска там — лишние клетки', () => {
  const f = new Field(2, 1).makeOpen();
  const r = run('использовать Робот\nалг\nнач\n  нц 3 раз\n    вправо\n  кц\n  закрасить\n  вверх\n  влево\nкон', f);
  eq(r.field.robot, { x: 2, y: -1 });
  assert(r.field.isPainted(3, 0), 'закраска за краем потерялась');
  eq(compare(r.field, new Set()).extra, [[3, 0]]);
});

test('программа, которую останавливал только забор, на бесконечном поле — 0 баллов', () => {
  const task = TASKS.find((t) => t.id === 'h-pass');
  // Закрашивает верно, но цикл заканчивается только у края поля
  const untilFence = [
    'использовать Робот', 'алг', 'нач',
    '  нц пока справа свободно',
    '    если не снизу свободно то', '      закрасить', '    все',
    '    вправо',
    '  кц',
    'кон',
  ].join('\n');
  const res = checkTask(task, compile(untilFence).program);
  eq(res.score, 0);
  assert(res.results.every((r) => r.run.status === 'escape'), 'ожидался уход Робота по бесконечному полю');
});

test('бесконечный цикл определяется', () => {
  const r = runSilently(compile('использовать Робот\nалг\nнач\n  нц пока да\n  кц\nкон').program, new Field(3, 3), 5000);
  eq(r.status, 'timeout');
});

test('compare считает лишние и пропущенные', () => {
  const f = new Field(3, 1);
  f.setPainted(0, 0, true);
  f.setPainted(1, 0, true);
  const d = compare(f, new Set(['1,0', '2,0']));
  eq(d.extra, [[0, 0]]);
  eq(d.missing, [[2, 0]]);
});

// ---------- Отчёт ----------

const failed = results.filter((r) => !r.ok);
const root = document.getElementById('results');
root.innerHTML = `<h2>${failed.length ? `Ошибок: ${failed.length}` : 'Все тесты пройдены'} (${results.length} тестов)</h2>`
  + results.map((r) => `<div class="${r.ok ? 'ok' : 'fail'}">${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `<pre>${r.message}</pre>`}</div>`).join('');
window.testResults = { total: results.length, failed: failed.map((r) => `${r.name}: ${r.message}`) };
