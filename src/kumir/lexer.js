// Лексер школьного алгоритмического языка (Кумир).
// Превращает текст программы в список токенов.

export class KumirError extends Error {
  // kind: 'syntax' — ошибка в тексте программы, 'runtime' — ошибка при выполнении,
  // 'robot' — отказ Робота
  constructor(message, line, kind = 'syntax') {
    super(message);
    this.line = line;
    this.kind = kind;
  }
}

export const KEYWORDS = new Set([
  'алг', 'нач', 'кон', 'нц', 'кц', 'кц_при', 'раз', 'пока', 'для', 'от', 'до', 'шаг',
  'если', 'то', 'иначе', 'все', 'выбор', 'при', 'и', 'или', 'не', 'да', 'нет',
  'цел', 'вещ', 'лог', 'лит', 'сим', 'таб', 'целтаб', 'вещтаб', 'логтаб', 'литтаб', 'симтаб',
  'арг', 'рез', 'аргрез', 'знач', 'вывод', 'ввод', 'нс', 'утв', 'дано', 'надо',
  'использовать', 'выход', 'исп', 'кон_исп',
]);

// Варианты написания, которые Кумир считает одним и тем же словом
const KEYWORD_ALIASES = { 'всё': 'все' };

const WORD_START = /[A-Za-zА-Яа-яЁё_@]/;
const WORD_CHAR = /[A-Za-zА-Яа-яЁё_0-9@]/;
const DIGIT = /[0-9]/;

const OPERATORS = [':=', '<=', '>=', '<>', '**', '≠', '≤', '≥', '+', '-', '*', '/', '=', '<', '>', '(', ')', '[', ']', ',', ':'];
const OPERATOR_ALIASES = { '≠': '<>', '≤': '<=', '≥': '>=' };

// Токен: { type: 'kw' | 'word' | 'num' | 'str' | 'op' | 'nl' | 'eof', value, line, col }
export function tokenize(source) {
  const tokens = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');

  lines.forEach((text, index) => {
    const line = index + 1;
    let i = 0;
    const push = (type, value, col) => tokens.push({ type, value, line, col });

    while (i < text.length) {
      const ch = text[i];

      if (ch === ' ' || ch === '\t' || ch === ' ') {
        i++;
        continue;
      }
      // Комментарий — от | до конца строки
      if (ch === '|') break;

      if (ch === ';') {
        push('nl', ';', i);
        i++;
        continue;
      }

      if (WORD_START.test(ch)) {
        const start = i;
        while (i < text.length && WORD_CHAR.test(text[i])) i++;
        let word = text.slice(start, i);
        if (KEYWORD_ALIASES[word]) word = KEYWORD_ALIASES[word];
        push(KEYWORDS.has(word) ? 'kw' : 'word', word, start);
        continue;
      }

      if (DIGIT.test(ch)) {
        const start = i;
        while (i < text.length && DIGIT.test(text[i])) i++;
        let isReal = false;
        if (text[i] === '.' && DIGIT.test(text[i + 1] || '')) {
          isReal = true;
          i++;
          while (i < text.length && DIGIT.test(text[i])) i++;
        }
        if ((text[i] === 'e' || text[i] === 'E') && /[0-9+-]/.test(text[i + 1] || '')) {
          isReal = true;
          i++;
          if (text[i] === '+' || text[i] === '-') i++;
          while (i < text.length && DIGIT.test(text[i])) i++;
        }
        const raw = text.slice(start, i);
        if (i < text.length && WORD_START.test(text[i])) {
          throw new KumirError(`Имя не может начинаться с цифры: «${raw}${text[i]}…»`, line);
        }
        tokens.push({ type: 'num', value: Number(raw), isReal, line, col: start });
        continue;
      }

      if (ch === '"' || ch === "'") {
        const end = text.indexOf(ch, i + 1);
        if (end < 0) {
          throw new KumirError('Не закрыта кавычка: строка должна заканчиваться той же кавычкой, что и начинается', line);
        }
        push('str', text.slice(i + 1, end), i);
        i = end + 1;
        continue;
      }

      const op = OPERATORS.find((o) => text.startsWith(o, i));
      if (op) {
        push('op', OPERATOR_ALIASES[op] || op, i);
        i += op.length;
        continue;
      }

      throw new KumirError(`Недопустимый символ «${ch}»`, line);
    }
    push('nl', '\n', text.length);
  });

  tokens.push({ type: 'eof', value: '', line: lines.length, col: 0 });
  return tokens;
}
