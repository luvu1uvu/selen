"""Контраст пар токенов по формуле WCAG 2 для каждого направления и темы."""


def _channel(value):
    value /= 255
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def luminance(hex_color):
    hex_color = hex_color.lstrip('#')
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * _channel(r) + 0.7152 * _channel(g) + 0.0722 * _channel(b)


def ratio(a, b):
    la, lb = luminance(a), luminance(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


# (подпись, токен текста или знака, токен фона, норма). Норма 4,5 — текст, 3 — значки, рамки, заливки состояний.
PAIRS = [
    ('Основной текст на фоне окна', 'foreground', 'background', 4.5),
    ('Основной текст на холсте', 'foreground', 'canvas', 4.5),
    ('Основной текст на карточке', 'foreground', 'card', 4.5),
    ('Основной текст на выбранной строке', 'foreground', 'selected', 4.5),
    ('Вторичный текст на фоне окна', 'muted-foreground', 'background', 4.5),
    ('Вторичный текст на холсте', 'muted-foreground', 'canvas', 4.5),
    ('Вторичный текст на доске', 'muted-foreground', 'board', 4.5),
    ('Вторичный текст на полосе дорожки', 'muted-foreground', 'lane', 4.5),
    ('Вторичный текст на карточке', 'muted-foreground', 'card', 4.5),
    ('Вторичный текст на панели дерева', 'muted-foreground', 'sidebar', 4.5),
    ('Вторичный текст на подложке (muted)', 'muted-foreground', 'muted', 4.5),
    ('Вторичный текст при наведении (accent)', 'muted-foreground', 'accent', 4.5),
    ('Вторичный текст на заблокированной карточке', 'muted-foreground', 'danger-surface', 4.5),
    ('Акцент текстом (ссылки, упоминания) на фоне окна', 'primary', 'background', 4.5),
    ('Акцент текстом на карточке', 'primary', 'card', 4.5),
    ('Акцент текстом на выбранной строке', 'primary', 'selected', 4.5),
    ('Текст главной кнопки', 'primary-foreground', 'primary', 4.5),
    ('Текст вторичной кнопки', 'secondary-foreground', 'secondary', 4.5),
    ('Подсказка (инверсия)', 'background', 'foreground', 4.5),
    ('Ошибка, удаление (destructive) на фоне окна', 'destructive', 'background', 4.5),
    ('Текст кнопки «Удалить»', 'destructive-foreground', 'destructive', 4.5),
    ('«Срочно», «Заблокирована» на карточке', 'danger', 'card', 4.5),
    ('«Заблокирована» на заблокированной карточке', 'danger', 'danger-surface', 4.5),
    ('Срок «просрочено» (бейдж)', 'danger-foreground', 'danger-muted', 4.5),
    ('Срок «в срок» (бейдж)', 'success-foreground', 'success-muted', 4.5),
    ('Предупреждение (бейдж)', 'warning-foreground', 'warning-muted', 4.5),
    ('Выполненный чек-лист на карточке', 'success', 'card', 4.5),
    ('Значок раздела на полосе', 'rail-foreground', 'rail', 3),
    ('Активный раздел полосы', 'rail-active-foreground', 'rail-active', 3),
    ('Рамка фокуса на фоне окна', 'ring', 'background', 3),
    ('Рамка фокуса на холсте', 'ring', 'canvas', 3),
    ('Рамка фокуса на доске', 'ring', 'board', 3),
    ('Рамка фокуса на панели дерева', 'ring', 'sidebar', 3),
    ('Граница поля ввода', 'input', 'background', 3),
    ('Полоска выбранной строки дерева', 'primary', 'sidebar', 3),
    ('Точка «Очередь» на доске', 'category-queue', 'board', 3),
    ('Точка «В работе» на доске', 'category-progress', 'board', 3),
    ('Точка «Готово» на доске', 'category-done', 'board', 3),
    ('Полоса прогресса на дорожке полосы', 'success', 'muted', 3),
    ('Рамка заблокированной карточки', 'danger-outline', 'board', 3),
]

# Ступени поверхностей: справочно, нормы нет (уровни различаются тоном — решение PM 21.10, п. 2)
LEVELS = [
    ('Холст → доска', 'canvas', 'board'),
    ('Доска → карточка', 'board', 'card'),
    ('Доска → полоса дорожки', 'board', 'lane'),
    ('Панель дерева → выбранная строка', 'sidebar', 'selected'),
]


def check(tokens):
    rows = []
    for label, fg, bg, need in PAIRS:
        value = ratio(tokens[fg], tokens[bg])
        rows.append((label, fg, bg, value, need, value >= need))
    return rows


def levels(tokens):
    return [(label, a, b, ratio(tokens[a], tokens[b])) for label, a, b in LEVELS]
