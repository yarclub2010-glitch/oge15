"""Сборка тренажёра в один файл robot15.html.

Такой файл открывается двойным щелчком без сервера и без интернета:
все стили и модули JavaScript встраиваются прямо в страницу.

Запуск: python build.py
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ENTRY = ROOT / 'src' / 'main.js'
OUT = ROOT / 'robot15.html'

IMPORT_RE = re.compile(r"^import\s*\{([^}]*)\}\s*from\s*'([^']+)';\s*$", re.M)
EXPORT_LIST_RE = re.compile(r"^export\s*\{([^}]*)\};?\s*$", re.M)
EXPORT_DECL_RE = re.compile(r"^export\s+(?:async\s+)?(function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)", re.M)


def names(text):
    return [n.strip() for n in text.split(',') if n.strip()]


def module_id(path):
    return path.relative_to(ROOT).as_posix()


def collect(path, order, seen):
    """Модули в порядке зависимостей: сначала те, от которых зависят другие."""
    if path in seen:
        return
    seen.add(path)
    source = path.read_text(encoding='utf-8')
    for _, dep in IMPORT_RE.findall(source):
        collect((path.parent / dep).resolve(), order, seen)
    order.append(path)


def transform(path):
    source = path.read_text(encoding='utf-8')
    exports = []

    def replace_import(m):
        dep = module_id((path.parent / m.group(2)).resolve())
        return f"const {{ {', '.join(names(m.group(1)))} }} = __modules['{dep}'];"

    source = IMPORT_RE.sub(replace_import, source)

    def replace_export_list(m):
        exports.extend(names(m.group(1)))
        return ''

    source = EXPORT_LIST_RE.sub(replace_export_list, source)

    def replace_export_decl(m):
        exports.append(m.group(2))
        return m.group(0)[len('export '):]

    source = EXPORT_DECL_RE.sub(replace_export_decl, source)

    if re.search(r'^\s*(import|export)\b', source, re.M):
        raise SystemExit(f'{module_id(path)}: не удалось обработать import/export')

    unique = list(dict.fromkeys(exports))
    return (
        f"// ----- {module_id(path)} -----\n"
        f"__modules['{module_id(path)}'] = (() => {{\n{source}\n"
        f"return {{ {', '.join(unique)} }};\n}})();\n"
    )


def build():
    order = []
    collect(ENTRY.resolve(), order, set())
    bundle = "'use strict';\nconst __modules = {};\n" + ''.join(transform(p) for p in order)
    # Строка </script> внутри кода закрыла бы тег раньше времени
    bundle = bundle.replace('</script', '<\\/script')

    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    css = (ROOT / 'src' / 'style.css').read_text(encoding='utf-8')

    link = '<link rel="stylesheet" href="src/style.css">'
    script = '<script type="module" src="src/main.js"></script>'
    if link not in html or script not in html:
        raise SystemExit('index.html: не найдены теги стилей или скрипта')
    html = html.replace(link, f'<style>\n{css}\n</style>')
    html = html.replace(script, f'<script>\n{bundle}</script>')
    OUT.write_text(html, encoding='utf-8', newline='\n')
    size = OUT.stat().st_size // 1024
    print(f'Готово: {OUT.name} ({size} КБ, модулей: {len(order)})')


if __name__ == '__main__':
    build()
