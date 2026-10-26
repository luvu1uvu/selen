"""Сборка прототипов «Редизайна»: python3 design/redesign/src/build.py

Для каждого направления (directions.py) собирает самостоятельные HTML-файлы board.html, card.html, space.html в
design/redesign/<направление>/ — всё внутри файла (стили, скрипт, значки lucide, шрифт), открываются двойным щелчком
без сервера. Ещё — design/redesign/index.html (сравнение направлений) и design/redesign/contrast.md (контраст пар).
"""

import base64
import html
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
sys.dont_write_bytecode = True
sys.path.insert(0, HERE)

from contrast import PAIRS, check, levels  # noqa: E402
from directions import DIRECTIONS  # noqa: E402

PAGES = [
    ('board', 'board.html', 'Доска'),
    ('card', 'card.html', 'Окно карточки'),
    ('space', 'space.html', 'Пространство'),
]

# Производные переменные вида: что у направлений устроено по-разному (кроме цветов и формы из directions.py)
DERIVED = {
    'graphite': {
        'common': {
            'btn-outline-bg': 'var(--card)', 'field-bg': 'var(--card)', 'card-border-color': 'transparent',
            'dialog-bg': 'var(--popover)', 'popover-border': '0px', 'r-logo': '10px', 'r-rail': '10px',
            'r-row': '8px', 'r-menu-item': '8px', 'r-chip': '8px', 'r-tabs': '0', 'r-tab': '8px',
            'logo-bg': 'var(--primary)', 'logo-fg': 'var(--primary-foreground)',
            'rail-hover': 'var(--accent)', 'rail-hover-foreground': 'var(--foreground)',
            'space-title-weight': '600', 'tabs-bg': 'transparent', 'tabs-pad': '0', 'tabs-gap': '2px',
            'tab-h': '32px', 'tab-active-fg': 'var(--foreground)', 'tab-active-bg': 'var(--card)',
            'tab-active-shadow': 'var(--shadow-card)', 'head-divider': 'transparent',
        },
        'light': {'shadow-control': '0 1px 2px rgba(22, 22, 40, 0.06)', 'shadow-round': '0 3px 8px rgba(86, 80, 230, 0.35)'},
        'dark': {'shadow-control': 'none', 'shadow-round': 'none'},
    },
    'lines': {
        'common': {
            'btn-outline-bg': 'var(--background)', 'field-bg': 'var(--background)',
            'card-border-color': 'var(--border)', 'dialog-bg': 'var(--popover)', 'popover-border': '1px',
            'r-logo': '8px', 'r-rail': '8px', 'r-row': '6px', 'r-menu-item': '4px', 'r-chip': '6px',
            'r-tabs': '8px', 'r-tab': '6px', 'logo-bg': 'var(--primary)', 'logo-fg': 'var(--primary-foreground)',
            'rail-hover': 'var(--accent)', 'rail-hover-foreground': 'var(--foreground)',
            'space-title-weight': '600', 'tabs-bg': 'var(--muted)', 'tabs-pad': '3px', 'tabs-gap': '0',
            'tab-h': '30px', 'tab-active-fg': 'var(--foreground)', 'tab-active-bg': 'var(--background)',
            'head-divider': 'var(--divider)',
        },
        'light': {
            'shadow-control': '0 1px 2px rgba(0, 0, 0, 0.05)', 'shadow-round': '0 4px 10px rgba(0, 0, 0, 0.15)',
            'tab-active-shadow': '0 1px 2px rgba(0, 0, 0, 0.1)',
        },
        'dark': {'shadow-control': 'none', 'shadow-round': 'none', 'tab-active-shadow': '0 0 0 1px var(--border)'},
    },
    'luna': {
        'common': {
            'btn-outline-bg': 'var(--background)', 'field-bg': 'var(--background)',
            'card-border-color': 'var(--border)', 'dialog-bg': 'var(--popover)', 'popover-border': '1px',
            'r-logo': '10px', 'r-rail': '10px', 'r-row': '8px', 'r-menu-item': '6px', 'r-chip': '999px',
            'r-tabs': '0', 'r-tab': '999px', 'logo-bg': '#e9e7ff', 'logo-fg': '#1f1b4d',
            'rail-hover': 'rgba(255, 255, 255, 0.1)', 'rail-hover-foreground': '#ffffff',
            'space-title-weight': '650', 'tabs-bg': 'transparent', 'tabs-pad': '0', 'tabs-gap': '4px',
            'tab-h': '32px', 'tab-active-fg': 'var(--primary)', 'tab-active-bg': 'var(--selected)',
            'tab-active-shadow': 'none', 'head-divider': 'var(--divider)',
        },
        'light': {'shadow-control': '0 1px 2px rgba(31, 27, 77, 0.06)', 'shadow-round': '0 4px 12px rgba(76, 68, 223, 0.35)'},
        'dark': {'shadow-control': 'none', 'shadow-round': 'none'},
    },
}


def read(name):
    with open(os.path.join(HERE, name), encoding='utf-8') as f:
        return f.read()


def css_vars(values, prefix=''):
    return '\n'.join(f'  --{prefix}{k}: {v};' for k, v in values.items())


def font_face(name):
    if name != 'luna':
        return ''
    faces = []
    for subset, unicode_range in [
        ('cyrillic', 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116'),
        ('latin', 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, '
                  'U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'),
    ]:
        with open(os.path.join(HERE, 'fonts', f'onest-{subset}-wght-normal.woff2'), 'rb') as f:
            data = base64.b64encode(f.read()).decode()
        faces.append(
            '@font-face {\n  font-family: "Onest";\n  font-style: normal;\n  font-display: block;\n'
            f'  font-weight: 100 900;\n  src: url(data:font/woff2;base64,{data}) format("woff2");\n'
            f'  unicode-range: {unicode_range};\n}}'
        )
    return '/* Onest — Copyright 2021 The Onest Project Authors, SIL Open Font License 1.1 (src/fonts/OFL-Onest.txt) */\n' + '\n'.join(faces)


def direction_css(name, d):
    derived = DERIVED[name]
    shadows_light = {f'shadow-{k}': v for k, v in d['shadow-light'].items()}
    shadows_dark = {f'shadow-{k}': v for k, v in d['shadow-dark'].items()}
    root = {**d['light'], **d['shape'], **derived['common'], **shadows_light, **derived['light']}
    dark = {**d['dark'], **shadows_dark, **derived['dark']}
    return f':root {{\n{css_vars(root)}\n}}\n:root.dark {{\n{css_vars(dark)}\n}}'


def page_html(name, d, page, title):
    icons = json.loads(read('icons.json'))
    links = ''.join(
        f'<a href="{file}"{" aria-current=page" if key == page else ""}>{label}</a>' for key, file, label in PAGES
    )
    return f'''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Selen · {d["title"]} · {title}</title>
<!-- Прототип «Редизайна», направление «{d["title"]}». Собран design/redesign/src/build.py — не править руками.
     Значки: {icons["license"]}. Демо-данные — BoardsDemoSeeder. -->
<style>
{font_face(name)}
{direction_css(name, d)}
{read("base.css")}
</style>
</head>
<body data-page="{page}" data-direction="{name}">
<div id="root"></div>
<nav class="proto-bar" aria-label="Прототип"><span>{d["title"]}</span>{links}<a href="../index.html">Все направления</a></nav>
<script>window.SELEN_ICONS = {json.dumps(icons["icons"], ensure_ascii=False, separators=(",", ":"))}</script>
<script>
{read("app.js")}
</script>
</body>
</html>
'''


def fmt(value):
    return f'{value:.2f}'.replace('.', ',')


def contrast_md():
    lines = [
        '# Контраст токенов по направлениям',
        '',
        'Собрано `design/redesign/src/build.py` из `directions.py` (формула WCAG 2). Норма: текст — 4,5:1; значки, рамка',
        'фокуса, границы полей и заливки состояний — 3:1. В каждой ячейке — светлая / тёмная тема.',
        '',
        '| Пара | Норма | ' + ' | '.join(d['title'] for d in DIRECTIONS.values()) + ' |',
        '|---|---|' + '---|' * len(DIRECTIONS),
    ]
    results = {name: (check(d['light']), check(d['dark'])) for name, d in DIRECTIONS.items()}
    for i, (label, _fg, _bg, need) in enumerate(PAIRS):
        cells = []
        for name in DIRECTIONS:
            light, dark = results[name]
            mark = '' if light[i][5] and dark[i][5] else ' ✗'
            cells.append(f'{fmt(light[i][3])} / {fmt(dark[i][3])}{mark}')
        lines.append(f'| {label} | {fmt(need)} | ' + ' | '.join(cells) + ' |')
    lines += ['', 'Ступени поверхностей (справочно, нормы нет — уровни различаются тоном, решение PM 21.10, п. 2):', '',
              '| Ступень | ' + ' | '.join(d['title'] for d in DIRECTIONS.values()) + ' |',
              '|---|' + '---|' * len(DIRECTIONS)]
    for i, (label, _a, _b) in enumerate([(x[0], x[1], x[2]) for x in levels(DIRECTIONS['graphite']['light'])]):
        cells = []
        for d in DIRECTIONS.values():
            cells.append(f'{fmt(levels(d["light"])[i][3])} / {fmt(levels(d["dark"])[i][3])}')
        lines.append(f'| {label} | ' + ' | '.join(cells) + ' |')
    failures = sum(1 for light, dark in results.values() for row in light + dark if not row[5])
    lines += ['', f'Пар ниже нормы: {failures}.', '']
    return '\n'.join(lines)


def index_html():
    esc = html.escape
    cards = []
    for name, d in DIRECTIONS.items():
        light, dark = check(d['light']), check(d['dark'])
        worst = min(light + dark, key=lambda r: r[3] / r[4])
        swatches = ''.join(
            f'<li><span class="sw" style="background:{hex_}"></span><b>{esc(label)}</b> <code>{hex_}</code>'
            f'<small>{esc(role)}</small></li>'
            for label, hex_, role in d['named']
        )
        links = ''.join(f'<a class="go" href="{name}/{file}">{label}</a>' for _k, file, label in PAGES)
        cards.append(f'''
      <article class="dir">
        <header><h2>{esc(d["title"])}</h2><p class="tag">{esc(d["tagline"])}</p></header>
        <div class="links">{links}</div>
        <p>{esc(d["idea"])}</p>
        <p><b>Запоминается:</b> {esc(d["memorable"])}</p>
        <ul class="swatches">{swatches}</ul>
        <dl>
          <dt>Шрифт</dt><dd>{esc(d["type"]["family"])}. {esc(d["type"]["note"])}<br>{esc(d["type"]["sizes"])}; {esc(d["type"]["key"])}.</dd>
          <dt>Плотность</dt><dd>{esc(d["density"])}</dd>
          <dt>Скругления</dt><dd>{esc(d["radii"])}</dd>
          <dt>Поверхности</dt><dd>{esc(d["surfaces"])}</dd>
          <dt>Контраст</dt><dd>все {len(light) + len(dark)} пар в норме; самая низкая — «{esc(worst[0])}», {fmt(worst[3])}:1 при норме {fmt(worst[4])}</dd>
        </dl>
      </article>''')
    return f'''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Направления облика Selen</title>
<style>
:root {{ --bg: #f6f6f9; --fg: #1d1d26; --muted: #5d5d6b; --card: #ffffff; --line: #e1e1e8; --accent: #5650e6; color-scheme: light; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg: #131317; --fg: #ececf2; --muted: #a2a2ae; --card: #1c1c21; --line: #2e2e36; --accent: #9894fa; color-scheme: dark; }} }}
* {{ box-sizing: border-box; }}
body {{ margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }}
main {{ max-width: 1200px; margin: 0 auto; padding: 40px 24px 64px; }}
h1 {{ margin: 0 0 8px; font-size: 28px; line-height: 1.2; text-wrap: balance; }}
.lead {{ margin: 0 0 32px; color: var(--muted); max-width: 70ch; }}
.grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 20px; }}
.dir {{ background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 20px; display: grid; gap: 12px; align-content: start; }}
.dir h2 {{ margin: 0; font-size: 22px; }}
.tag {{ margin: 2px 0 0; color: var(--muted); }}
.dir p {{ margin: 0; }}
.links {{ display: flex; flex-wrap: wrap; gap: 8px; }}
.go {{ padding: 6px 12px; border-radius: 8px; background: var(--accent); color: var(--bg); text-decoration: none; font-weight: 600; font-size: 14px; }}
.go:focus-visible {{ outline: 2px solid var(--accent); outline-offset: 2px; }}
.swatches {{ list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }}
.swatches li {{ display: flex; align-items: center; gap: 8px; font-size: 14px; }}
.sw {{ width: 22px; height: 22px; border-radius: 6px; border: 1px solid var(--line); flex: none; }}
.swatches small {{ color: var(--muted); margin-left: auto; }}
code {{ font-size: 13px; color: var(--muted); }}
dl {{ margin: 0; display: grid; grid-template-columns: 7.5rem minmax(0, 1fr); gap: 6px 12px; font-size: 14px; }}
dt {{ color: var(--muted); }}
dd {{ margin: 0; }}
.note {{ margin-top: 32px; color: var(--muted); font-size: 14px; max-width: 80ch; }}
</style>
</head>
<body>
<main>
  <h1>Направления облика Selen</h1>
  <p class="lead">Шаг 1 «Редизайна» (LATER-72, LATER-89). Раскладка и поведение — как в приложении и в Kaiten, меняется
  только облик. У каждого направления — доска, окно карточки и страница пространства; тема переключается в меню
  пользователя справа вверху («Светлая / Тёмная / Как в системе»). Данные — демо-данные dev.</p>
  <div class="grid">{"".join(cards)}
  </div>
  <p class="note">Прототипы — самостоятельные HTML-файлы: открываются двойным щелчком, без сервера и интернета. Щелчок
  по карточке открывает её окно, шевроны сворачивают дорожки и доски, подсказки — по наведению и с клавиатуры.
  Контраст всех пар — design/redesign/contrast.md.</p>
</main>
</body>
</html>
'''


def main():
    for name, d in DIRECTIONS.items():
        folder = os.path.join(OUT, name)
        os.makedirs(folder, exist_ok=True)
        for page, file, title in PAGES:
            with open(os.path.join(folder, file), 'w', encoding='utf-8') as f:
                f.write(page_html(name, d, page, title))
    with open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(index_html())
    with open(os.path.join(OUT, 'contrast.md'), 'w', encoding='utf-8') as f:
        f.write(contrast_md())
    print('ok:', ', '.join(DIRECTIONS))


if __name__ == '__main__':
    main()
