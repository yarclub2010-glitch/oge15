// Тренажёр задания 15 ОГЭ: связывает редактор, поле Робота, выполнение и проверку.

import { compile, Interpreter } from './kumir/interpreter.js';
import { reportScore } from './platform.js';
import { KumirError } from './kumir/lexer.js';
import { Field, MAX_W, MAX_H } from './robot/field.js';
import { FieldView } from './robot/view.js';
import { CodeEditor, formatCode } from './ui/editor.js';
import { TASKS, LEVELS, COMMON_RULES, taskById, sampleVariant, randomVariant } from './tasks/tasks.js';
import { checkTask, compare } from './tasks/checker.js';

// Текст из программы ученика или файла — в разметку только так
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const DEFAULT_CODE = 'использовать Робот\nалг\nнач\n  \nкон\n';
const SPEEDS = [450, 180, 70, 18, 0]; // задержка между шагами, мс; 0 — максимально быстро
const RUN_LIMIT = 2000000;

// ---------- Хранилище (может быть недоступно, например в приватном режиме) ----------

const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem('robot15:' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('robot15:' + key, JSON.stringify(value));
    } catch {
      // нет доступа к хранилищу — просто не сохраняем
    }
  },
};

// ---------- Состояние ----------

const state = {
  mode: 'tasks',
  task: TASKS[0],
  variant: null, // { field, target, label }
  start: null, // стартовая обстановка
  modified: false, // стартовая обстановка изменена вручную
  showTarget: false,
  resultView: null, // { field, extra, missing, text, ok } — показан результат выполнения
  run: null,
  check: null,
  // Версия 2: старые результаты считались без длинных стен и могли быть завышены
  scores: store.get('scores2', {}),
};

// ---------- Сообщения ----------

const logEl = $('#log');
function log(kind, text, line) {
  const last = logEl.lastElementChild;
  if (kind === 'out' && last && last.classList.contains('l-out')) {
    last.textContent += text;
  } else {
    const div = document.createElement('div');
    div.className = 'l-' + kind;
    if (line) {
      const btn = document.createElement('button');
      btn.className = 'line-link';
      btn.textContent = `Строка ${line}`;
      btn.addEventListener('click', () => editor.focusLine(line));
      div.append(btn, ': ' + text);
    } else {
      div.textContent = text;
    }
    logEl.append(div);
    while (logEl.children.length > 200) logEl.firstElementChild.remove();
  }
  logEl.scrollTop = logEl.scrollHeight;
}

// ---------- Редактор ----------

let lintTimer = null;
const editor = new CodeEditor($('#editor'), {
  onChange(text) {
    store.set(codeKey(), text);
    clearTimeout(lintTimer);
    lintTimer = setTimeout(lint, 350);
    if (!state.run) editor.setNotes(new Map());
  },
});

function codeKey() {
  return state.mode === 'tasks' ? 'code:' + state.task.id : 'code:sandbox';
}

function lint() {
  if (state.run) return;
  const { errors } = compile(editor.value);
  editor.setErrors(errors);
}

function loadCode() {
  editor.value = store.get(codeKey(), DEFAULT_CODE);
  editor.setNotes(new Map());
  editor.setCurrentLine(null);
  lint();
}

// ---------- Поле ----------

const view = new FieldView($('#field'), {
  onBeforeEdit() {
    if (state.run) return false;
    if (state.resultView) showStart();
    return true;
  },
  onEdit() {
    if (state.mode === 'tasks') {
      state.modified = true;
    } else {
      store.set('sandbox:field', state.start.toJSON());
    }
    updateOverlay();
    updateFieldStatus();
  },
});

function showStart() {
  state.resultView = null;
  view.setField(state.start);
  updateOverlay();
  updateFieldStatus();
  updateSense();
}

function updateOverlay() {
  const rv = state.resultView;
  const target = state.mode === 'tasks' && state.showTarget && !state.modified ? state.variant.target : null;
  view.setOverlay({
    target,
    extra: rv?.extra || [],
    missing: rv?.missing || [],
  });
}

function updateFieldStatus() {
  const el = $('#field-status');
  const rv = state.resultView;
  if (rv && rv.text) {
    el.innerHTML = rv.html || '';
    return;
  }
  if (state.mode === 'sandbox') {
    el.innerHTML = `Своя обстановка <b>${state.start.w}×${state.start.h}</b>. Выберите инструмент над полем, чтобы её изменить.`;
    return;
  }
  if (state.modified) {
    el.innerHTML = 'Обстановка <b>изменена вами</b> — цель на ней не показывается. «Сбросить поле» вернёт вариант задания.';
    return;
  }
  el.innerHTML = `<b>${state.variant.label}</b>. ${state.showTarget ? 'Пунктиром отмечены клетки, которые нужно закрасить.' : 'Нажмите «Показать цель», чтобы увидеть, что закрасить.'}`;
}

function updateSense() {
  const f = view.field;
  if (!f) return;
  const s = (dir, name) => `${name}: <b>${f.wall(f.robot.x, f.robot.y, dir) ? 'стена' : 'свободно'}</b>`;
  $('#pult-sense').innerHTML = [s('up', 'сверху'), s('down', 'снизу'), s('left', 'слева'), s('right', 'справа')].join(' · ');
}

function setTool(tool) {
  view.setTool(tool);
  $$('.seg [data-tool]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.tool === tool)));
}

// ---------- Задания ----------

function scoreBadge(id) {
  const s = state.scores[id];
  return s === undefined ? '' : s === 2 ? ' ✓' : ` (${s} из 2)`;
}

function fillTaskSelect() {
  const sel = $('#task-select');
  const fromTask = $('#sandbox-from-task');
  sel.innerHTML = '';
  fromTask.innerHTML = '';
  for (const [level, name] of Object.entries(LEVELS)) {
    const group = document.createElement('optgroup');
    group.label = name;
    const group2 = group.cloneNode();
    TASKS.filter((t) => t.level === Number(level)).forEach((t) => {
      const n = TASKS.indexOf(t) + 1;
      group.append(new Option(`${n}. ${t.title}${scoreBadge(t.id)}`, t.id));
      group2.append(new Option(`${n}. ${t.title}`, t.id));
    });
    sel.append(group);
    fromTask.append(group2);
  }
  sel.value = state.task.id;
}

function renderTask() {
  const t = state.task;
  $('#task-title').textContent = t.title;
  const level = $('#task-level');
  level.textContent = LEVELS[t.level];
  level.className = `chip lvl-${t.level}`;
  const status = $('#task-status');
  const s = state.scores[t.id];
  status.hidden = s === undefined;
  if (s !== undefined) {
    status.textContent = s === 2 ? 'Решено: 2 из 2' : `Лучший результат: ${s} из 2`;
    status.className = `chip chip-score s${s}`;
  }
  $('#task-text').innerHTML = t.text.split('\n\n').map((p) => `<p>${p}</p>`).join('');
  $('#task-source').textContent = t.source || '';
  $('#rules').innerHTML = COMMON_RULES.map((r) => `<li>${r}</li>`).join('');
  $('#hint').textContent = t.hint || '';
  $('#hint').hidden = true;
  $('#btn-hint').setAttribute('aria-expanded', 'false');
  $('#solution').hidden = true;
  $('#btn-solution').setAttribute('aria-expanded', 'false');
  $('#solution-code').textContent = t.solution;
  $('#check-result').hidden = true;
  state.check = null;
}

function selectTask(id, { updateHash = true } = {}) {
  stopRun(true);
  state.task = taskById(id) || TASKS[0];
  store.set('task', state.task.id);
  $('#task-select').value = state.task.id;
  renderTask();
  const v = sampleVariant(state.task);
  setVariant({ ...v, label: 'Вариант как на рисунке' });
  loadCode();
  if (updateHash) history.replaceState(null, '', '#' + state.task.id);
}

function setVariant(variant) {
  state.variant = variant;
  state.start = variant.field.clone();
  state.modified = false;
  showStart();
}

// ---------- Режимы ----------

function setMode(mode, { updateHash = true } = {}) {
  stopRun(true);
  state.mode = mode;
  store.set('mode', mode);
  $$('.modes [data-mode]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  $('#panel-tasks').hidden = mode !== 'tasks';
  $('#panel-sandbox').hidden = mode !== 'sandbox';
  if (mode === 'tasks') {
    selectTask(state.task.id, { updateHash });
  } else {
    const saved = store.get('sandbox:field');
    let field;
    try {
      field = saved ? Field.fromJSON(saved) : null;
    } catch {
      field = null;
    }
    state.start = field || new Field(7, 7);
    state.modified = false;
    $('#field-w').value = state.start.w;
    $('#field-h').value = state.start.h;
    showStart();
    loadCode();
    if (updateHash) history.replaceState(null, '', '#sandbox');
  }
}

// ---------- Выполнение ----------

function setRunningUI(running, paused = false) {
  $('#btn-stop').disabled = !running;
  $('#btn-run').innerHTML = running && !paused
    ? '<span aria-hidden="true">⏸</span> Пауза'
    : `<span aria-hidden="true">▶</span> ${running ? 'Продолжить' : 'Выполнить'}`;
  $('#btn-run').title = running && !paused ? 'Пауза (F9)' : 'Выполнить (F9)';
  editor.setReadOnly(running);
  view.setEditable(!running);
  $('#btn-check').disabled = running;
}

function startRun(stepMode) {
  // Отложенная проверка текста не должна стереть ошибку, найденную при выполнении
  clearTimeout(lintTimer);
  const source = editor.value;
  const { program, errors, warnings } = compile(source);
  editor.setErrors(errors);
  if (errors.length) {
    for (const e of errors.slice(0, 5)) log('err', e.message, e.line);
    editor.focusLine(errors[0].line);
    return false;
  }
  for (const w of warnings) log('warn', w.message);

  const field = state.start.clone();
  field.broken = null;
  state.resultView = { field };
  view.setField(field);
  updateOverlay();
  $('#field-status').innerHTML = '<b>Выполнение…</b>';

  const notes = new Map();
  editor.setNotes(notes);
  const interp = new Interpreter(program, {
    robot: field,
    onOutput: (text) => log('out', text),
    onInput: (name) => window.prompt(`Введите значение величины «${name}»:`),
    onNote: (line, text) => notes.set(line, text),
  });
  state.run = { gen: interp.run(), field, notes, steps: 0, paused: stepMode, timer: null, raf: null };
  log('info', stepMode ? 'Выполнение по шагам: нажимайте «Шаг» (F8).' : 'Программа запущена.');
  setRunningUI(true, stepMode);
  return true;
}

// Один шаг. Возвращает false, если выполнение закончилось.
function advance() {
  const run = state.run;
  let r;
  try {
    r = run.gen.next();
  } catch (err) {
    finishWithError(err);
    return false;
  }
  if (r.done) {
    finishRun();
    return false;
  }
  run.steps++;
  run.line = r.value;
  if (run.field.escaped()) {
    log('err', 'Робот ушёл от стен и идёт по бесконечному полю: выполнение алгоритма никогда не завершится. По критериям ОГЭ это 0 баллов.', run.line);
    stopRun(true);
    state.resultView.html = '<span class="bad">Робот ушёл по бесконечному полю — программа не завершится.</span> «Сбросить поле» вернёт стартовую обстановку.';
    updateFieldStatus();
    return false;
  }
  if (run.steps > RUN_LIMIT) {
    log('err', `Программа сделала больше ${RUN_LIMIT.toLocaleString('ru')} шагов и остановлена. Возможно, цикл никогда не заканчивается.`, run.line);
    stopRun(true);
    return false;
  }
  return true;
}

function paintStep() {
  const run = state.run;
  if (!run) return;
  editor.setCurrentLine(run.line);
  editor.setNotes(run.notes);
  view.render();
  updateSense();
}

function schedule() {
  const run = state.run;
  if (!run || run.paused) return;
  const delay = SPEEDS[Number($('#speed').value)];
  if (delay > 0) {
    run.timer = setTimeout(() => {
      if (!state.run || state.run.paused) return;
      if (advance()) {
        paintStep();
        schedule();
      }
    }, delay);
  } else {
    run.raf = requestAnimationFrame(() => {
      if (!state.run || state.run.paused) return;
      const until = performance.now() + 14;
      let alive = true;
      while (alive && performance.now() < until) {
        for (let i = 0; i < 500 && alive; i++) alive = advance();
      }
      if (alive) {
        paintStep();
        schedule();
      }
    });
  }
}

function onRunButton() {
  if (state.run) {
    state.run.paused = !state.run.paused;
    setRunningUI(true, state.run.paused);
    if (!state.run.paused) schedule();
    else clearTimers();
    return;
  }
  if (startRun(false)) schedule();
}

function onStepButton() {
  if (!state.run) {
    if (!startRun(true)) return;
  } else if (!state.run.paused) {
    state.run.paused = true;
    clearTimers();
    setRunningUI(true, true);
  }
  if (advance()) paintStep();
}

function clearTimers() {
  if (!state.run) return;
  clearTimeout(state.run.timer);
  cancelAnimationFrame(state.run.raf);
}

function stopRun(silent = false) {
  if (!state.run) return;
  clearTimers();
  const { field } = state.run;
  state.run = null;
  setRunningUI(false);
  editor.setCurrentLine(null);
  view.render();
  updateSense();
  if (!silent) log('info', 'Выполнение остановлено.');
  state.resultView = { field, text: 'stopped', html: 'Выполнение остановлено. «Сбросить поле» вернёт стартовую обстановку.' };
  updateFieldStatus();
}

function finishRun() {
  const { field, notes, steps } = state.run;
  clearTimers();
  state.run = null;
  setRunningUI(false);
  editor.setCurrentLine(null);
  editor.setNotes(notes);
  view.render();
  updateSense();
  log('ok', `Программа выполнена (шагов: ${steps}).`);

  const rv = { field, text: 'done', extra: [], missing: [] };
  if (state.mode === 'tasks' && !state.modified) {
    const diff = compare(field, state.variant.target, state.start);
    rv.extra = diff.extra;
    rv.missing = diff.missing;
    if (!diff.extra.length && !diff.missing.length) {
      rv.html = '<span class="ok">На этом варианте всё закрашено верно.</span> Теперь нажмите «Проверить решение» — программа должна работать на любых стенах.';
      log('ok', 'На этом варианте всё верно. Проверьте решение на всех вариантах.');
    } else {
      const parts = [];
      if (diff.missing.length) parts.push(`не закрашено: ${diff.missing.length}`);
      if (diff.extra.length) parts.push(`лишних: ${diff.extra.length}`);
      rv.html = `<span class="bad">Есть ошибки: ${parts.join(', ')}.</span> Красный пунктир — пропущенные клетки, крестик — лишние.`;
      log('warn', `На этом варианте есть ошибки: ${parts.join(', ')}.`);
    }
  } else {
    rv.html = 'Программа выполнена. «Сбросить поле» вернёт стартовую обстановку.';
  }
  state.resultView = rv;
  updateOverlay();
  updateFieldStatus();
}

function finishWithError(err) {
  const run = state.run;
  clearTimers();
  state.run = null;
  setRunningUI(false);
  view.render();
  updateSense();
  if (!(err instanceof KumirError)) {
    log('err', 'Внутренняя ошибка тренажёра: ' + err.message);
    console.error(err);
    return;
  }
  editor.setNotes(run.notes);
  editor.setErrors([err]);
  editor.setCurrentLine(err.line);
  log('err', err.kind === 'robot' ? `ОТКАЗ. ${err.message}` : err.message, err.line);
  state.resultView = {
    field: run.field,
    text: 'error',
    html: err.kind === 'robot'
      ? `<span class="bad">${escHtml(err.message)}</span> Красный угол ромбика показывает, куда пытался шагнуть Робот.`
      : `<span class="bad">Ошибка в строке ${err.line}.</span> ${escHtml(err.message)}`,
  };
  updateFieldStatus();
}

// ---------- Пульт ----------

function pult(cmd) {
  if (state.run) return;
  if (!state.resultView || state.resultView.text === 'error') {
    const field = (state.resultView?.field || state.start).clone();
    if (state.resultView?.text === 'error') field.broken = null;
    state.resultView = { field, text: 'pult', html: 'Управление с пульта. «Сбросить поле» вернёт стартовую обстановку.' };
    view.setField(field);
    updateOverlay();
    updateFieldStatus();
  }
  const f = view.field;
  f.broken = null;
  try {
    if (cmd === 'paint') f.paint();
    else f.move(cmd);
    log('info', `Пульт: ${{ up: 'вверх', down: 'вниз', left: 'влево', right: 'вправо', paint: 'закрасить' }[cmd]}`);
  } catch (err) {
    log('err', `ОТКАЗ. ${err.message}`);
  }
  view.render();
  updateSense();
}

// ---------- Проверка ----------

function runCheck() {
  if (state.run) return;
  clearTimeout(lintTimer);
  const { program, errors } = compile(editor.value);
  editor.setErrors(errors);
  if (errors.length) {
    log('err', 'Сначала исправьте ошибки в программе.');
    for (const e of errors.slice(0, 3)) log('err', e.message, e.line);
    editor.focusLine(errors[0].line);
    return;
  }
  const btn = $('#btn-check');
  btn.disabled = true;
  btn.textContent = 'Проверяю…';
  setTimeout(() => {
    let res;
    try {
      res = checkTask(state.task, program);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Проверить решение';
    }
    state.check = res;
    reportScore(15, state.task.id, res.score, 2);
    const prev = state.scores[state.task.id];
    if (prev === undefined || res.score > prev) {
      state.scores[state.task.id] = res.score;
      store.set('scores2', state.scores);
      fillTaskSelect();
    }
    renderTaskStatus();
    renderCheck(res);
    log(res.score === 2 ? 'ok' : res.score === 1 ? 'warn' : 'err', `Проверка: ${res.score} из 2 баллов. ${res.verdict}`);
    const firstBad = res.results.findIndex((r) => !r.ok);
    showCheckResult(firstBad >= 0 ? firstBad : 0);
  }, 20);
}

function renderTaskStatus() {
  const s = state.scores[state.task.id];
  const status = $('#task-status');
  status.hidden = s === undefined;
  if (s !== undefined) {
    status.textContent = s === 2 ? 'Решено: 2 из 2' : `Лучший результат: ${s} из 2`;
    status.className = `chip chip-score s${s}`;
  }
}

function renderCheck(res) {
  const box = $('#check-result');
  box.hidden = false;
  const okCount = res.results.filter((r) => r.ok).length;
  const words = ['баллов', 'балл', 'балла'];
  box.innerHTML = `
    <div class="score s${res.score}">
      <div class="score-num">${res.score}<small>/2</small></div>
      <div>
        <strong>${res.score} ${words[res.score]} из 2</strong>
        <p>${res.verdict}</p>
        <p class="score-note">За задание 15 на ОГЭ ставят от 0 до 2 баллов.</p>
      </div>
    </div>
    <div class="small muted">Верно на ${okCount} из ${res.results.length} вариантов. Нажмите на вариант, чтобы посмотреть результат на поле.</div>
    <ul class="variants">${res.results.map((r, i) => `
      <li><button data-variant="${i}" class="${r.ok ? 'ok' : 'bad'}">
        <span class="v-icon">${r.ok ? '✓' : '✗'}</span>
        <span>${escHtml(r.variant.label)}</span>
        <span class="v-text">${escHtml(r.text)}</span>
      </button></li>`).join('')}
    </ul>`;
  box.querySelectorAll('[data-variant]').forEach((b) => {
    b.addEventListener('click', () => showCheckResult(Number(b.dataset.variant)));
  });
}

function showCheckResult(i) {
  const r = state.check?.results[i];
  if (!r) return;
  stopRun(true);
  $$('#check-result [data-variant]').forEach((b) => b.classList.toggle('is-active', Number(b.dataset.variant) === i));
  state.variant = { field: r.variant.field, target: r.variant.target, label: r.variant.label };
  state.start = r.variant.field.clone();
  state.modified = false;
  const label = escHtml(r.variant.label);
  const status = r.ok ? `<span class="ok">✓ ${label}: всё верно.</span>` : `<span class="bad">✗ ${label}: ${escHtml(r.text)}.</span>`;
  state.resultView = {
    field: r.run.field,
    text: 'check',
    extra: r.diff?.extra || [],
    missing: r.diff?.missing || [],
    html: `${status} Показан результат вашей программы. «Сбросить поле» — стартовая обстановка этого варианта.`,
  };
  view.setField(r.run.field);
  updateOverlay();
  updateFieldStatus();
  updateSense();
  editor.setNotes(new Map());
  if (r.run.error) {
    editor.setErrors([r.run.error]);
  } else {
    lint();
  }
}

// ---------- Файлы ----------

function download(name, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Кумир сохраняет файлы в UTF-8, старые версии — в Windows-1251
async function readText(file) {
  const buf = await file.arrayBuffer();
  const utf = new TextDecoder('utf-8').decode(buf);
  if (!utf.includes('�')) return utf.replace(/^﻿/, '');
  return new TextDecoder('windows-1251').decode(buf);
}

let fileMode = null;
function openFile(mode) {
  fileMode = mode;
  const input = $('#file-input');
  input.accept = mode === 'fil' ? '.fil,.json' : '.kum,.txt';
  input.value = '';
  input.click();
}

$('#file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await readText(file);
  if (fileMode === 'fil') {
    try {
      const field = file.name.endsWith('.json') ? Field.fromJSON(JSON.parse(text)) : Field.fromFil(text);
      state.start = field;
      store.set('sandbox:field', field.toJSON());
      $('#field-w').value = field.w;
      $('#field-h').value = field.h;
      showStart();
      log('ok', `Обстановка «${file.name}» загружена (${field.w}×${field.h}).`);
    } catch (err) {
      log('err', `Не удалось открыть обстановку: ${err.message}`);
    }
  } else {
    if (editor.value.trim() && editor.value !== DEFAULT_CODE && !window.confirm('Заменить текущую программу содержимым файла?')) return;
    editor.replaceAll(text.replace(/\r\n?/g, '\n'));
    log('ok', `Программа «${file.name}» открыта.`);
  }
});

// ---------- Обработчики ----------

function bind() {
  $$('.modes [data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('#task-select').addEventListener('change', (e) => selectTask(e.target.value));
  $('#btn-prev').addEventListener('click', () => {
    const i = TASKS.indexOf(state.task);
    selectTask(TASKS[(i - 1 + TASKS.length) % TASKS.length].id);
  });
  $('#btn-next').addEventListener('click', () => {
    const i = TASKS.indexOf(state.task);
    selectTask(TASKS[(i + 1) % TASKS.length].id);
  });

  $('#btn-check').addEventListener('click', runCheck);
  $('#btn-target').addEventListener('click', () => {
    state.showTarget = !state.showTarget;
    $('#btn-target').setAttribute('aria-pressed', String(state.showTarget));
    $('#btn-target').textContent = state.showTarget ? 'Скрыть цель' : 'Показать цель';
    updateOverlay();
    updateFieldStatus();
  });
  $('#btn-variant').addEventListener('click', () => {
    stopRun(true);
    setVariant({ ...randomVariant(state.task), label: 'Случайный вариант' });
  });
  $('#btn-hint').addEventListener('click', () => {
    const el = $('#hint');
    el.hidden = !el.hidden;
    $('#btn-hint').setAttribute('aria-expanded', String(!el.hidden));
  });
  $('#btn-solution').addEventListener('click', () => {
    const el = $('#solution');
    if (el.hidden && !window.confirm('Показать готовое решение? Лучше сначала попробовать самостоятельно или открыть подсказку.')) return;
    el.hidden = !el.hidden;
    $('#btn-solution').setAttribute('aria-expanded', String(!el.hidden));
  });
  $('#btn-use-solution').addEventListener('click', () => {
    if (!window.confirm('Заменить вашу программу решением?')) return;
    editor.replaceAll(state.task.solution + '\n');
  });

  $('#btn-run').addEventListener('click', onRunButton);
  $('#btn-step').addEventListener('click', onStepButton);
  $('#btn-stop').addEventListener('click', () => stopRun());
  $('#speed').value = store.get('speed', 2);
  $('#speed').addEventListener('input', (e) => {
    store.set('speed', Number(e.target.value));
    if (state.run && !state.run.paused) {
      clearTimers();
      schedule();
    }
  });

  const menuBtn = $('#btn-file-menu');
  const menu = $('#file-menu');
  const closeMenu = () => {
    menu.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
  };
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    menuBtn.setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', closeMenu);
  $('#btn-open-code').addEventListener('click', () => openFile('kum'));
  $('#btn-save-code').addEventListener('click', () => {
    const name = state.mode === 'tasks' ? `robot-${state.task.id}.kum` : 'robot.kum';
    download(name, editor.value);
  });
  $('#btn-format').addEventListener('click', () => {
    if (state.run) return;
    editor.replaceAll(formatCode(editor.value));
  });
  $('#btn-new-code').addEventListener('click', () => {
    if (state.run) return;
    if (editor.value.trim() && !window.confirm('Начать новую программу? Текущая будет стёрта.')) return;
    editor.replaceAll(DEFAULT_CODE);
    editor.focusLine(4);
  });

  // Кнопки-шаблоны над программой можно убрать, чтобы писать код самому
  const setPalette = (on) => {
    $('.palette').hidden = !on;
    $('#btn-palette').textContent = on ? 'Скрыть шаблоны команд' : 'Показать шаблоны команд';
    store.set('templates', on);
  };
  // По умолчанию шаблоны выключены: на экзамене программу пишут сами.
  // Ключ новый: старый 'palette' сохранялся включённым у всех, кто уже заходил
  setPalette(store.get('templates', false));
  $('#btn-palette').addEventListener('click', () => setPalette($('.palette').hidden));

  $$('.palette [data-snippet]').forEach((b) => {
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => editor.insertSnippet(b.dataset.snippet));
  });

  $('#btn-clear-log').addEventListener('click', () => { logEl.innerHTML = ''; });

  $$('.seg [data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $('#btn-reset-field').addEventListener('click', () => {
    stopRun(true);
    if (state.mode === 'tasks' && state.modified) {
      state.start = state.variant.field.clone();
      state.modified = false;
    }
    showStart();
  });

  $$('[data-pult]').forEach((b) => b.addEventListener('click', () => pult(b.dataset.pult)));
  $('#field').addEventListener('keydown', (e) => {
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', ' ': 'paint' };
    if (map[e.key]) {
      e.preventDefault();
      pult(map[e.key]);
    }
  });

  // Песочница
  $('#btn-resize').addEventListener('click', () => {
    const w = Math.min(MAX_W, Math.max(1, Number($('#field-w').value) || 7));
    const h = Math.min(MAX_H, Math.max(1, Number($('#field-h').value) || 7));
    $('#field-w').value = w;
    $('#field-h').value = h;
    stopRun(true);
    state.start = state.start.resized(w, h);
    store.set('sandbox:field', state.start.toJSON());
    showStart();
  });
  $('#btn-clear-walls').addEventListener('click', () => {
    stopRun(true);
    state.start.clearWalls();
    store.set('sandbox:field', state.start.toJSON());
    showStart();
  });
  $('#btn-clear-paint').addEventListener('click', () => {
    stopRun(true);
    state.start.clearPaint();
    store.set('sandbox:field', state.start.toJSON());
    showStart();
  });
  $('#btn-open-fil').addEventListener('click', () => openFile('fil'));
  $('#btn-save-fil').addEventListener('click', () => download('robot.fil', state.start.toFil()));
  $('#btn-sandbox-from-task').addEventListener('click', () => {
    const t = taskById($('#sandbox-from-task').value);
    if (!t) return;
    stopRun(true);
    state.start = sampleVariant(t).field.clone();
    store.set('sandbox:field', state.start.toJSON());
    $('#field-w').value = state.start.w;
    $('#field-h').value = state.start.h;
    showStart();
  });

  // Справка
  const help = $('#help');
  $('#btn-help').addEventListener('click', () => help.showModal());
  $('#btn-help-close').addEventListener('click', () => help.close());
  help.addEventListener('click', (e) => { if (e.target === help) help.close(); });

  // Клавиши как в Кумире
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F9' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      onRunButton();
    } else if (e.key === 'F8') {
      e.preventDefault();
      onStepButton();
    } else if (e.key === 'Escape' && state.run) {
      e.preventDefault();
      stopRun();
    } else if (e.key === 'F1') {
      e.preventDefault();
      help.showModal();
    }
  });

  window.addEventListener('hashchange', applyHash);
}

function safeHash() {
  try {
    return decodeURIComponent(location.hash.slice(1));
  } catch {
    return ''; // испорченная ссылка — открываем тренажёр как обычно
  }
}

function applyHash() {
  const h = safeHash();
  if (h === 'sandbox') {
    if (state.mode !== 'sandbox') setMode('sandbox', { updateHash: false });
  } else if (taskById(h)) {
    if (state.mode !== 'tasks') {
      state.task = taskById(h);
      setMode('tasks', { updateHash: false });
    } else if (state.task.id !== h) {
      selectTask(h, { updateHash: false });
    }
  }
}

// ---------- Запуск ----------

function init() {
  state.task = taskById(store.get('task')) || TASKS[0];
  fillTaskSelect();
  bind();
  setTool('none');
  const h = safeHash();
  if (h === 'sandbox') setMode('sandbox', { updateHash: false });
  else if (taskById(h)) {
    state.task = taskById(h);
    setMode('tasks', { updateHash: false });
  } else {
    setMode(store.get('mode', 'tasks') === 'sandbox' ? 'sandbox' : 'tasks');
  }
  log('info', 'Напишите программу и нажмите «Выполнить» (F9). «Проверить решение» запустит её на 30 вариантах поля.');
}

init();
