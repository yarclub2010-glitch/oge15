// Редактор программы: подсветка, номера строк, поля со значениями (как в Кумире),
// автоматические отступы и дописывание «кц», «все», «кон».

import { KEYWORDS } from '../kumir/lexer.js';

const ROBOT_WORDS = new Set(['вверх', 'вниз', 'влево', 'вправо', 'закрасить', 'температура', 'радиация']);
const ROBOT_FIRST = new Set(['сверху', 'снизу', 'слева', 'справа', 'клетка']);
const ROBOT_SECOND = new Set(['свободно', 'стена', 'закрашена', 'чистая']);

const OPENERS = { нц: 'кц', если: 'все', выбор: 'все', нач: 'кон' };
const CLOSE_WORDS = new Set(['кц', 'кц_при', 'все', 'всё', 'кон']);
const DEDENT_WORDS = new Set(['кц', 'кц_при', 'все', 'всё', 'кон', 'иначе']);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Слова строки без строк в кавычках и комментария
function lineWords(text) {
  const code = text.replace(/"[^"]*"?|'[^']*'?/g, ' ').split('|')[0];
  return code.match(/[A-Za-zА-Яа-яЁё_@][\wА-Яа-яЁё@]*/g) || [];
}

export function highlightLine(text) {
  let html = '';
  const re = /("[^"]*"?|'[^']*'?)|(\|.*$)|([A-Za-zА-Яа-яЁё_@][\wА-Яа-яЁё@]*)|(\d+(?:\.\d+)?)|(\s+)|(.)/g;
  const parts = [];
  let m;
  while ((m = re.exec(text))) {
    if (m[1]) parts.push({ c: 'str', t: m[1] });
    else if (m[2]) parts.push({ c: 'cm', t: m[2] });
    else if (m[3]) parts.push({ c: 'w', t: m[3] });
    else if (m[4]) parts.push({ c: 'num', t: m[4] });
    else if (m[5]) parts.push({ c: 'sp', t: m[5] });
    else parts.push({ c: 'op', t: m[6] });
  }
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.c === 'w') {
      if (KEYWORDS.has(p.t) || p.t === 'всё') {
        html += `<span class="t-kw">${esc(p.t)}</span>`;
        continue;
      }
      if (ROBOT_WORDS.has(p.t)) {
        html += `<span class="t-rb">${esc(p.t)}</span>`;
        continue;
      }
      if (ROBOT_FIRST.has(p.t) && parts[i + 1]?.c === 'sp' && ROBOT_SECOND.has(parts[i + 2]?.t)) {
        html += `<span class="t-rb">${esc(p.t + parts[i + 1].t + parts[i + 2].t)}</span>`;
        i += 2;
        continue;
      }
      html += esc(p.t);
    } else if (p.c === 'str') html += `<span class="t-str">${esc(p.t)}</span>`;
    else if (p.c === 'cm') html += `<span class="t-cm">${esc(p.t)}</span>`;
    else if (p.c === 'num') html += `<span class="t-num">${esc(p.t)}</span>`;
    else html += esc(p.t);
  }
  return html;
}

// Уровни отступа для всех строк программы
export function computeIndents(lines) {
  let level = 0;
  return lines.map((text) => {
    const words = lineWords(text);
    const first = words[0];
    if (first === 'алг' || first === 'использовать') {
      level = 0;
      return 0;
    }
    const own = Math.max(0, level - (DEDENT_WORDS.has(first) ? 1 : 0));
    const opens = words.filter((w) => OPENERS[w]).length;
    const closes = words.filter((w) => CLOSE_WORDS.has(w)).length;
    level = Math.max(0, level + opens - closes);
    return own;
  });
}

export function formatCode(text) {
  const lines = text.split('\n');
  const indents = computeIndents(lines);
  return lines.map((l, i) => (l.trim() ? '  '.repeat(indents[i]) + l.trim() : '')).join('\n');
}

export class CodeEditor {
  constructor(root, { onChange = () => {}, onRunShortcut = () => {} } = {}) {
    this.root = root;
    this.onChange = onChange;
    root.classList.add('editor');
    root.innerHTML = `
      <div class="editor-scroll">
        <div class="editor-body">
          <div class="editor-band" hidden></div>
          <div class="editor-gutter" aria-hidden="true"></div>
          <div class="editor-code">
            <div class="editor-stack">
              <pre class="editor-hl" aria-hidden="true"></pre>
              <textarea class="editor-input" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" aria-label="Текст программы"></textarea>
            </div>
          </div>
          <div class="editor-margin" aria-label="Поля: значения и сообщения"></div>
        </div>
      </div>`;
    this.scroll = root.querySelector('.editor-scroll');
    this.band = root.querySelector('.editor-band');
    this.gutter = root.querySelector('.editor-gutter');
    this.hl = root.querySelector('.editor-hl');
    this.input = root.querySelector('.editor-input');
    this.margin = root.querySelector('.editor-margin');
    this.errors = new Map();
    this.notes = new Map();
    this.current = null;

    this.input.addEventListener('input', () => {
      this.render();
      this.ensureCaretVisible();
      this.onChange(this.value);
    });
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    this.input.addEventListener('scroll', () => {
      // Текстовое поле не должно прокручиваться само: прокручивается весь редактор
      this.input.scrollTop = 0;
    });
    this.render();
  }

  get value() {
    return this.input.value;
  }

  set value(text) {
    this.input.value = text;
    this.render();
  }

  get lineHeight() {
    return parseFloat(getComputedStyle(this.input).lineHeight) || 22;
  }

  setReadOnly(on) {
    this.input.readOnly = on;
    this.root.classList.toggle('is-readonly', on);
  }

  // errors: [{ line, message, kind }]
  setErrors(errors) {
    this.errors = new Map();
    for (const e of errors) if (!this.errors.has(e.line)) this.errors.set(e.line, e);
    this.render();
  }

  setNotes(notes) {
    this.notes = notes;
    this.renderMargin();
  }

  setCurrentLine(line) {
    this.current = line;
    if (!line) {
      this.band.hidden = true;
      return;
    }
    this.band.hidden = false;
    this.band.style.transform = `translateY(${(line - 1) * this.lineHeight}px)`;
    this.scrollToLine(line);
  }

  scrollToLine(line) {
    const lh = this.lineHeight;
    const top = (line - 1) * lh;
    const view = this.scroll;
    if (top < view.scrollTop + 4) view.scrollTop = Math.max(0, top - lh * 2);
    else if (top + lh > view.scrollTop + view.clientHeight - 4) view.scrollTop = top - view.clientHeight + lh * 3;
  }

  focusLine(line) {
    const lines = this.value.split('\n');
    let pos = 0;
    for (let i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
    const end = pos + (lines[line - 1] || '').length;
    this.input.focus();
    this.input.setSelectionRange(end, end);
    this.scrollToLine(line);
  }

  render() {
    const lines = this.value.split('\n');
    this.hl.innerHTML = lines.map((l, i) => {
      const inner = highlightLine(l) || ' ';
      return this.errors.has(i + 1) ? `<span class="t-errline">${inner}</span>` : inner;
    }).join('\n') + '\n';
    this.gutter.innerHTML = lines.map((_, i) => {
      const cls = this.errors.has(i + 1) ? ' class="has-error"' : '';
      return `<div${cls}>${i + 1}</div>`;
    }).join('');
    this.input.rows = lines.length + 1;
    this.renderMargin(lines.length);
  }

  renderMargin(count = this.value.split('\n').length) {
    let html = '';
    for (let i = 1; i <= count; i++) {
      const err = this.errors.get(i);
      if (err) {
        html += `<div class="m-err" title="${esc(err.message)}">${esc(err.message)}</div>`;
      } else if (this.notes.has(i)) {
        const t = this.notes.get(i);
        html += `<div title="${esc(t)}">${esc(t)}</div>`;
      } else {
        html += '<div></div>';
      }
    }
    this.margin.innerHTML = html;
  }

  ensureCaretVisible() {
    const before = this.value.slice(0, this.input.selectionStart);
    const line = before.split('\n').length;
    this.scrollToLine(line);
  }

  // Вставка с сохранением истории отмены (Ctrl+Z)
  insertText(text) {
    this.input.focus();
    const ok = document.execCommand && document.execCommand('insertText', false, text);
    if (!ok) {
      this.input.setRangeText(text, this.input.selectionStart, this.input.selectionEnd, 'end');
      this.input.dispatchEvent(new Event('input'));
    }
  }

  replaceAll(text) {
    this.input.focus();
    this.input.select();
    this.insertText(text);
  }

  currentLineInfo() {
    const pos = this.input.selectionStart;
    const text = this.value;
    const start = text.lastIndexOf('\n', pos - 1) + 1;
    let end = text.indexOf('\n', pos);
    if (end < 0) end = text.length;
    const lineIndex = text.slice(0, start).split('\n').length - 1;
    return { pos, start, end, lineIndex, line: text.slice(start, end) };
  }

  // Вставка готовой конструкции с отступом текущей строки. «▮» — место курсора.
  insertSnippet(snippet) {
    if (this.input.readOnly) return;
    const { pos, start, line } = this.currentLineInfo();
    const indentStr = line.match(/^\s*/)[0];
    const lineIsEmpty = line.trim() === '';
    let text = snippet.split('\n').map((l, i) => (i === 0 ? l : indentStr + l)).join('\n');
    if (!lineIsEmpty && pos !== start) {
      text = '\n' + indentStr + text;
    }
    const caret = text.indexOf('▮');
    text = text.replace('▮', '');
    const insertPos = this.input.selectionStart;
    this.insertText(text);
    if (caret >= 0) {
      const p = insertPos + caret;
      this.input.setSelectionRange(p, p);
    }
    this.ensureCaretVisible();
  }

  onKey(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) this.unindentLine();
      else this.insertText('  ');
      return;
    }
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      this.smartEnter();
    }
  }

  unindentLine() {
    const { start, line } = this.currentLineInfo();
    const n = Math.min(2, line.match(/^ */)[0].length);
    if (!n) return;
    const pos = this.input.selectionStart;
    this.input.setSelectionRange(start, start + n);
    this.insertText('');
    this.input.setSelectionRange(pos - n, pos - n);
  }

  smartEnter() {
    const text = this.value;
    const { pos, start, end, lineIndex, line } = this.currentLineInfo();
    const lines = text.split('\n');
    const indents = computeIndents(lines.slice(0, lineIndex + 1).concat(['x']));
    const words = lineWords(line);
    const first = words[0];

    // Если строка начинается со слова-закрывашки, выравниваем её по открывающей конструкции
    let ownIndent = line.match(/^\s*/)[0];
    if (first && DEDENT_WORDS.has(first) && pos === end) {
      const want = '  '.repeat(indents[lineIndex]);
      if (want !== ownIndent) {
        this.input.setSelectionRange(start, start + ownIndent.length);
        this.insertText(want);
        ownIndent = want;
      }
    }

    const caret = this.input.selectionStart;
    const nextIndent = '  '.repeat(indents[lineIndex + 1]);
    const opener = words.find((w) => OPENERS[w]);
    const opens = words.filter((w) => OPENERS[w]).length;
    const closes = words.filter((w) => CLOSE_WORDS.has(w)).length;

    // Автоматически дописываем закрывающее слово, если конструкции ещё не закрыта
    if (opener && opens > closes && caret === start + ownIndent.length + line.trim().length && !this.hasCloser(lines, lineIndex, ownIndent)) {
      const closer = OPENERS[opener];
      this.insertText(`\n${nextIndent}\n${ownIndent}${closer}`);
      const p = caret + 1 + nextIndent.length;
      this.input.setSelectionRange(p, p);
      this.ensureCaretVisible();
      return;
    }
    this.insertText('\n' + nextIndent);
    this.ensureCaretVisible();
  }

  // Есть ли ниже строка с тем же отступом, закрывающая конструкцию
  hasCloser(lines, lineIndex, indentStr) {
    for (let i = lineIndex + 1; i < lines.length; i++) {
      const l = lines[i];
      if (!l.trim()) continue;
      const ind = l.match(/^\s*/)[0];
      if (ind.length > indentStr.length) continue;
      const first = lineWords(l)[0];
      return ind.length === indentStr.length && (CLOSE_WORDS.has(first) || first === 'иначе');
    }
    return false;
  }
}
