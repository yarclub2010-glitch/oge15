// Проверка решения по критериям задания 15 ОГЭ.

import { Interpreter } from '../kumir/interpreter.js';
import { KumirError } from '../kumir/lexer.js';
import { checkVariants } from './tasks.js';

export const STEP_LIMIT = 200000;

// Выполняет программу на копии поля без анимации
export function runSilently(program, startField, limit = STEP_LIMIT) {
  const field = startField.clone();
  const output = [];
  const interp = new Interpreter(program, {
    robot: field,
    onOutput: (t) => output.push(t),
    onInput: () => null,
  });
  const gen = interp.run();
  let steps = 0;
  try {
    while (!gen.next().done) {
      steps++;
      if (field.escaped()) return { status: 'escape', field, steps };
      if (steps > limit) return { status: 'timeout', field, steps };
    }
  } catch (err) {
    if (err instanceof KumirError) {
      return { status: err.kind === 'robot' ? 'crash' : 'error', error: err, field, steps };
    }
    throw err;
  }
  return { status: 'ok', field, steps, output };
}

// Сравнение закрашенных клеток с тем, что нужно было закрасить
export function compare(field, target, startField) {
  const extra = [];
  const missing = [];
  for (let y = 0; y < field.h; y++) {
    for (let x = 0; x < field.w; x++) {
      const k = `${x},${y}`;
      const was = startField ? startField.isPainted(x, y) : false;
      const now = field.isPainted(x, y);
      if (target.has(k) && !now) missing.push([x, y]);
      if (!target.has(k) && now && !was) extra.push([x, y]);
    }
  }
  // Бесконечное поле: закраска за нарисованной частью — тоже лишние клетки
  for (const k of field.outPaint) {
    if (!target.has(k)) extra.push(k.split(',').map(Number));
  }
  return { extra, missing };
}

export function describeRun(run, diff) {
  if (run.status === 'crash') return `Робот разбился (строка ${run.error.line}): ${run.error.message}`;
  if (run.status === 'error') return `Ошибка (строка ${run.error.line}): ${run.error.message}`;
  if (run.status === 'escape') return 'Программа не завершается: Робот ушёл от стен и идёт по бесконечному полю';
  if (run.status === 'timeout') return 'Программа не завершилась: похоже, цикл никогда не заканчивается';
  const parts = [];
  if (diff.missing.length) parts.push(`не закрашено клеток: ${diff.missing.length}`);
  if (diff.extra.length) parts.push(`лишних закрашенных: ${diff.extra.length}`);
  return parts.length ? parts.join(', ') : 'Всё верно';
}

// Полная проверка: результаты по вариантам и итоговый балл 0–2
export function checkTask(task, program) {
  const results = checkVariants(task).map((variant) => {
    const run = runSilently(program, variant.field);
    const diff = run.status === 'ok' ? compare(run.field, variant.target, variant.field) : null;
    const ok = run.status === 'ok' && diff.extra.length === 0 && diff.missing.length === 0;
    return { variant, run, diff, ok, text: describeRun(run, diff) };
  });

  const failedRun = results.find((r) => r.run.status !== 'ok');
  const maxExtra = Math.max(0, ...results.filter((r) => r.diff).map((r) => r.diff.extra.length));
  const maxMissing = Math.max(0, ...results.filter((r) => r.diff).map((r) => r.diff.missing.length));

  // Не закрашено ни одной нужной клетки ни на одном поле — задача не решалась вовсе
  const nothingDone = !failedRun && results.every((r) => r.diff.missing.length === r.variant.target.size);

  let score;
  let verdict;
  if (nothingDone) {
    score = 0;
    verdict = 'Программа не закрасила ни одной нужной клетки — это 0 баллов.';
  } else if (failedRun) {
    score = 0;
    verdict = {
      crash: 'Робот разбился хотя бы на одном варианте — по критериям это 0 баллов.',
      escape: 'Хотя бы на одном варианте Робот уходит по бесконечному полю, и выполнение не завершается — по критериям это 0 баллов.',
      timeout: 'Программа не завершилась хотя бы на одном варианте — по критериям это 0 баллов.',
      error: 'Во время выполнения произошла ошибка — по критериям это 0 баллов.',
    }[failedRun.run.status];
  } else if (results.every((r) => r.ok)) {
    score = 2;
    verdict = 'Алгоритм правильно работает на всех проверенных вариантах.';
  } else if (maxExtra <= 10 && maxMissing <= 10) {
    score = 1;
    verdict = `Робот не разбивается, но закраска неточная: в худшем варианте лишних клеток — ${maxExtra}, незакрашенных — ${maxMissing}. Если ошибок каждого вида не больше 10 на любом поле — это 1 балл.`;
  } else {
    score = 0;
    verdict = `Слишком много ошибок в закраске: в худшем варианте лишних клеток — ${maxExtra}, незакрашенных — ${maxMissing}. Если ошибок больше 10 — это 0 баллов.`;
  }
  return { results, score, verdict };
}
