/* Прототип Selen (шаг 1 «Редизайна», LATER-72): демо-данные из BoardsDemoSeeder, раскладка — как в приложении.
   Страница задаёт data-page (board | card | space); тема — меню пользователя или ?theme=light|dark. */
;(function () {
  'use strict'

  const ICONS = window.SELEN_ICONS
  const params = new URLSearchParams(location.search)
  const page = document.body.dataset.page
  const THEME_KEY = 'selen.proto.theme'

  // ---------- Тема: «Светлая / Тёмная / Как в системе», по умолчанию — светлая (решение PM 21.10, п. 8) ----------
  function readTheme() {
    const fromUrl = params.get('theme')
    if (fromUrl === 'light' || fromUrl === 'dark' || fromUrl === 'system') return fromUrl
    try {
      return localStorage.getItem(THEME_KEY) || 'light'
    } catch {
      return 'light'
    }
  }
  function applyTheme(pref) {
    const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  }
  let theme = readTheme()
  applyTheme(theme)
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => theme === 'system' && applyTheme(theme))
  if (params.has('shot')) document.body.classList.add('shot')

  // ---------- Помощники ----------
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  function icon(name, cls = '') {
    const nodes = ICONS[name] || []
    const inner = nodes
      .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`)
      .join('')
    return `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`
  }
  function luminance(hex) {
    const v = hex.replace('#', '')
    const ch = (o) => {
      const c = parseInt(v.slice(o, o + 2), 16) / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4)
  }
  // Цвет текста на цвете пользователя — белый или чёрный, что контрастнее (как readableTextOn в palette.ts)
  function readableTextOn(hex) {
    const l = luminance(hex)
    return (1.05 / (l + 0.05) >= (l + 0.05) / 0.05) ? '#ffffff' : '#000000'
  }
  const tip = (text) => `data-tip="${esc(text)}" aria-label="${esc(text)}"`

  // ---------- Демо-данные (BoardsDemoSeeder, палитра типов и меток — CompanyTemplate) ----------
  const ME = { name: 'Демо Администратор', email: 'admin@selen.test', color: '#4b5563' }
  const PEOPLE = {
    anna: { name: 'Анна Смирнова', color: '#9333ea' },
    boris: { name: 'Борис Петров', color: '#2563eb' },
    vera: { name: 'Вера Иванова', color: '#db2777' },
    grigory: { name: 'Григорий Орлов', color: '#0e7490' },
    zhanna: { name: 'Жанна Лебедева', color: '#b45309' },
    demo: { name: 'Демо Участник', color: '#15803d' },
  }
  const TYPES = {
    task: { name: 'Задача', color: '#3b82f6' },
    bug: { name: 'Баг', color: '#ef4444' },
    story: { name: 'История', color: '#22c55e' },
    epic: { name: 'Эпик', color: '#a855f7' },
  }
  const LABELS = {
    sec: { name: 'Безопасность', color: '#ef4444' },
    debt: { name: 'Техдолг', color: '#64748b' },
    client: { name: 'Клиент', color: '#f59e0b' },
    front: { name: 'Фронтенд', color: '#3b82f6' },
    back: { name: 'Бэкенд', color: '#22c55e' },
    mobile: { name: 'Мобильное', color: '#a855f7' },
  }
  const CATEGORY = { queue: 'Очередь', in_progress: 'В работе', done: 'Готово' }
  const DUE_TEXT = {
    pending: (d) => `Срок: ${d}`,
    overdue: (d) => `Просрочено: срок ${d}`,
    met: (d) => `Выполнено в срок (${d})`,
    missed: (d) => `Выполнено после срока (${d})`,
  }

  const c = (key, title, type, col, lane, extra = {}) => ({ key, title, type, col, lane, labels: [], ...extra })
  const PRODUCT = {
    id: 'product',
    name: 'Продукт',
    columns: [
      { id: 'backlog', name: 'Backlog', cat: 'queue' },
      { id: 'todo', name: 'To Do', cat: 'queue' },
      { id: 'progress', name: 'In Progress', cat: 'in_progress' },
      { id: 'review', name: 'Code Review', cat: 'in_progress' },
      { id: 'rft', name: 'Ready for Testing', cat: 'in_progress' },
      { id: 'testing', name: 'Testing', cat: 'in_progress' },
      { id: 'rfm', name: 'Ready for Merge', cat: 'in_progress' },
      { id: 'done', name: 'Done', cat: 'done' },
    ],
    lanes: [
      { id: 'main', name: 'Основная' },
      { id: 'urgent', name: 'Срочные' },
    ],
    cards: [
      c('DEV-284', 'Поиск по комментариям', 'task', 'backlog', 'main', { labels: ['back'], resp: 'boris', comments: 2 }),
      c('DEV-286', 'Шаблоны писем клиентам', 'story', 'backlog', 'main', { labels: ['client'], resp: 'vera', check: [0, 4] }),
      c('DEV-291', 'Онбординг новых пользователей', 'epic', 'backlog', 'main', {
        labels: ['front', 'mobile'], resp: 'anna', check: [2, 6], comments: 5,
      }),
      c('DEV-280', 'Логирование ошибок оплаты', 'task', 'backlog', 'urgent', {
        labels: ['sec', 'back'], resp: 'grigory', urgent: true, due: ['28 окт., 14:00', 'pending'], check: [3, 5],
      }),
      c('DEV-262', 'Фильтр задач по исполнителю', 'task', 'todo', 'main', {
        labels: ['front'], resp: 'zhanna', comments: 1, files: 1,
      }),
      c('DEV-265', 'Кеширование справочников', 'task', 'todo', 'main', {
        labels: ['debt'], resp: 'boris', due: ['30 окт.', 'pending'],
      }),
      c('DEV-270', 'Пагинация в списке клиентов', 'story', 'todo', 'main', { resp: 'grigory' }),
      c('DEV-228', 'Ошибка при сохранении профиля', 'bug', 'todo', 'urgent', {
        labels: ['back'], resp: 'zhanna', urgent: true, due: ['24 окт.', 'overdue'], comments: 3,
      }),
      c('DEV-233', 'Миграция на новую версию PHP', 'task', 'todo', 'urgent', {
        labels: ['sec', 'client'], resp: 'demo', urgent: true, due: ['29 окт.', 'pending'],
      }),
      c('DEV-173', 'Ошибка округления в счёте', 'bug', 'progress', 'main', {
        labels: ['client'], resp: 'boris', blocked: true, comments: 4, files: 1, check: [3, 5],
      }),
      c('DEV-240', 'Документация API v1', 'task', 'progress', 'main', {
        labels: ['back'], resp: 'demo', check: [6, 6], comments: 3,
      }),
      c('DEV-246', 'Тёмная тема интерфейса', 'epic', 'progress', 'main', {
        labels: ['front'], resp: 'anna', check: [1, 5], due: ['31 окт.', 'pending'],
      }),
      c('DEV-212', 'Двухфакторная аутентификация', 'story', 'progress', 'urgent', {
        labels: ['sec'], resp: 'grigory', urgent: true, comments: 1,
      }),
      c('DEV-207', 'Неверная сортировка по дате', 'bug', 'review', 'main', { resp: 'zhanna', comments: 2 }),
      c('DEV-211', 'Экспорт отчёта в CSV', 'task', 'review', 'main', { labels: ['mobile'], resp: 'boris', check: [2, 2] }),
      c('DEV-249', 'Обновить зависимости backend', 'task', 'review', 'urgent', {
        labels: ['debt', 'sec'], resp: 'anna', urgent: true, due: ['25 окт.', 'overdue'],
      }),
      c('DEV-198', 'Подсказки при вводе email', 'task', 'rft', 'main', { resp: 'demo' }),
      c('DEV-190', 'Ускорить загрузку доски', 'task', 'testing', 'main', { labels: ['front'], resp: 'anna', check: [4, 4] }),
      c('DEV-187', 'Кнопка «Повторить» после ошибки', 'task', 'rfm', 'main', { resp: 'zhanna' }),
      c('DEV-150', 'Уведомления о дедлайнах', 'story', 'done', 'main', { resp: 'grigory', due: ['22 окт.', 'met'] }),
      c('DEV-152', 'Автосохранение черновика', 'task', 'done', 'main', { resp: 'boris', check: [3, 3] }),
      c('DEV-160', 'Ограничение частоты запросов API', 'task', 'done', 'urgent', {
        labels: ['sec'], resp: 'anna', due: ['20 окт.', 'missed'],
      }),
    ],
  }
  const DUTY = {
    id: 'duty',
    name: 'Дежурства',
    columns: [
      { id: 'now', name: 'Сейчас', cat: 'in_progress' },
      { id: 'done', name: 'Готово', cat: 'done' },
    ],
    lanes: [{ id: 'main', name: 'Основная' }],
    cards: [
      c('DEV-331', 'Перенести CI на новые раннеры', 'task', 'now', 'main', { resp: 'anna', comments: 1 }),
      c('DEV-328', 'Мониторинг диска на сервере БД', 'story', 'done', 'main', { resp: 'anna' }),
      c('DEV-329', 'Ротация логов nginx', 'task', 'done', 'main', { resp: 'grigory' }),
      c('DEV-330', 'Настроить алерты по 5xx', 'story', 'done', 'main', { resp: 'anna', due: ['23 окт.', 'met'] }),
    ],
  }
  const INFRA = {
    id: 'infra',
    name: 'Инфраструктура',
    description: 'Серверы, CI и резервные копии.',
    columns: [
      { id: 'todo', name: 'To Do', cat: 'queue' },
      { id: 'progress', name: 'In Progress', cat: 'in_progress' },
      { id: 'review', name: 'Review', cat: 'in_progress' },
      { id: 'done', name: 'Done', cat: 'done' },
    ],
    lanes: [{ id: 'main', name: 'Основная' }],
    cards: [
      c('DEV-301', 'Обновить сертификат TLS', 'task', 'todo', 'main', { resp: 'grigory', due: ['2 нояб.', 'pending'] }),
      c('DEV-305', 'Резервная копия на внешний сервер', 'story', 'todo', 'main', {
        labels: ['sec'], resp: 'anna', check: [1, 3],
      }),
      c('DEV-303', 'Обновить PostgreSQL до минорной версии', 'task', 'progress', 'main', { resp: 'grigory', comments: 2 }),
      c('DEV-307', 'Проверить восстановление из бэкапа', 'task', 'review', 'main', {
        resp: 'anna', urgent: true, due: ['27 окт.', 'pending'],
      }),
      c('DEV-299', 'Настроить алерты по 5xx', 'story', 'done', 'main', { resp: 'grigory', due: ['21 окт.', 'met'] }),
    ],
  }
  const WIDE = { id: 'wide', name: 'Широкая доска', columns: [], lanes: [], cards: [], collapsed: true }
  const ALL_CARDS = [...PRODUCT.cards, ...DUTY.cards, ...INFRA.cards]
  const BOARD_OF = new Map()
  for (const b of [PRODUCT, DUTY, INFRA]) for (const card of b.cards) BOARD_OF.set(card.key, b)

  // Подробности для окна DEV-173 (остальные карточки — короче)
  const DETAILS = {
    'DEV-173': {
      customer: 'anna',
      created: '5 дней назад',
      moved: 'вчера',
      block: { reason: 'Ждём ответа юристов: как округлять НДС в счетах для юрлиц.', by: 'Борис Петров', at: '25 окт., 16:40' },
      participants: ['grigory', 'zhanna'],
      due: ['28 окт., 18:00', 'pending'],
      urgent: true,
      estimate: '8',
      description: [
        'В счёте сумма с НДС отличается от суммы по строкам на 1 копейку, если в счёте больше 10 позиций.',
        'Нужно округлять каждую строку, а итог считать по округлённым строкам — так требует бухгалтерия.',
      ],
      list: ['Пример — счёт № 2026-1147 от 22 октября', 'Затронуты PDF и выгрузка в 1С'],
      mention: 'Борис Петров',
      checklist: {
        title: 'Проверка',
        items: [
          ['Воспроизвести на тестовом счёте', true],
          ['Написать тесты на округление', true],
          ['Проверить выгрузку в 1С', true],
          ['Согласовать с бухгалтерией', false],
          ['Проверить на стенде', false],
        ],
      },
      file: { name: 'скриншот-173.png', size: '248 КБ' },
      comments: [
        ['boris', '2 часа назад', 'Юристы обещали ответить до среды. Пока делаю тесты на оба варианта.'],
        ['zhanna', 'вчера', 'Посмотри, пожалуйста, ещё выгрузку — там своё округление. @Борис Петров'],
      ],
    },
  }

  // ---------- Отрисовка: общие части ----------
  const initials = (name) => name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  function avatar(person, size = '', label) {
    const fg = readableTextOn(person.color)
    const aria = label ? `role="img" ${tip(label)}` : 'aria-hidden="true"'
    return `<span class="avatar ${size}" style="background:${person.color};color:${fg}" ${aria}>${initials(person.name)}</span>`
  }
  function labelBadge(id, compact) {
    const l = LABELS[id]
    return `<span class="label ${compact ? 'compact' : ''}" style="background:${l.color};color:${readableTextOn(l.color)}">${esc(l.name)}</span>`
  }
  function dueBadge([date, state]) {
    return `<span class="due ${state}" ${tip(DUE_TEXT[state](date))} role="img">${icon('calendar-clock', 's3')}<span aria-hidden="true">${esc(date)}</span></span>`
  }

  function tile(card) {
    const type = TYPES[card.type]
    const resp = card.resp && PEOPLE[card.resp]
    const classes = ['tile', card.urgent ? 'urgent' : '', card.blocked ? 'blocked' : '', card.key === params.get('focus') ? 'is-focus' : '']
    const foot = []
    if (card.urgent) foot.push(`<span class="flag">${icon('flame', 's3')}Срочно</span>`)
    if (card.due) foot.push(dueBadge(card.due))
    if (card.check) {
      const [d, t] = card.check
      foot.push(`<span class="counter ${d === t ? 'done' : ''}" ${tip(`Чек-листы: выполнено ${d} из ${t}`)}>${icon('list-checks', 's3')}${d}/${t}</span>`)
    }
    if (card.comments) foot.push(`<span class="counter" ${tip(`Комментариев: ${card.comments}`)}>${icon('message-square', 's3')}${card.comments}</span>`)
    if (card.files) foot.push(`<span class="counter" ${tip(`Файлов: ${card.files}`)}>${icon('paperclip', 's3')}${card.files}</span>`)
    if (resp) foot.push(avatar(resp, 'xs', `Ответственный: ${resp.name}`))
    return `
      <div class="${classes.join(' ')}" style="--type:${type.color}" role="button" tabindex="0" data-card="${card.key}"
           aria-label="Открыть ${card.key}: ${esc(card.title)}">
        <div class="meta">
          <span class="left"><span class="k">${card.key}</span>${card.blocked ? `<span class="flag">${icon('ban', 's3')}Заблокирована</span>` : ''}</span>
          <span class="truncate">${type.name}</span>
        </div>
        ${card.labels.length ? `<div class="labels">${card.labels.map((l) => labelBadge(l, true)).join('')}</div>` : ''}
        <div class="title">${esc(card.title)}</div>
        ${foot.length ? `<div class="foot">${foot.join('')}</div>` : ''}
      </div>`
  }

  function colHead(board, col) {
    const n = board.cards.filter((x) => x.col === col.id).length
    return `
      <div class="col-head">
        <span class="name truncate">${esc(col.name)}</span>
        <span class="tools">
          <span class="cat ${col.cat}" tabindex="0" ${tip(CATEGORY[col.cat])}><i></i></span>
          <span class="n">${n}</span>
          <button class="icon-btn" ${tip(`Добавить карточку в начало «${col.name}»`)}>${icon('plus')}</button>
          <button class="icon-btn" ${tip(`Действия с колонкой «${col.name}»`)}>${icon('ellipsis')}</button>
        </span>
      </div>`
  }

  function lanes(board) {
    const showHeads = board.lanes.length > 1
    return board.lanes
      .map((lane) => {
        const count = board.cards.filter((x) => x.lane === lane.id).length
        const head = showHeads
          ? `<div class="lane-row" data-lane-toggle>
               <span class="left"><span class="lname">${esc(lane.name)}</span>
                 <button class="icon-btn" ${tip(`Действия с дорожкой «${lane.name}»`)}>${icon('ellipsis')}</button></span>
               <span class="right"><span class="n">${count}</span>
                 <button class="icon-btn" data-lane-chevron aria-expanded="true" ${tip(`Свернуть дорожку «${lane.name}»`)}>${icon('chevron-up')}</button></span>
             </div>`
          : ''
        const cells = board.columns
          .map((col) => {
            const cards = board.cards.filter((x) => x.col === col.id && x.lane === lane.id)
            return `<div class="cell ${cards.length ? '' : 'empty'}">${cards.map(tile).join('')}
              <button class="btn ghost sm add" aria-label="Добавить карточку в «${esc(col.name)}»">${icon('plus')}Карточка</button></div>`
          })
          .join('')
        return `<section class="lane" aria-label="${esc(lane.name)}">${head}<div class="cells">${cells}</div></section>`
      })
      .join('')
  }

  function boardBlock(board, { inSpace = false, heading = 'h2' } = {}) {
    const count = board.cards.length
    const countText = `${count} ${plural(count, 'карточка', 'карточки', 'карточек')}`
    const names = inSpace
      ? `<span class="handle" ${tip(`Перетащить доску «${board.name}». С клавиатуры — меню «⋯» → «Переставить»`)} tabindex="0">${icon('grip-vertical')}</span>`
      : `<a class="crumb" href="space.html">Разработка</a><span class="crumb" aria-hidden="true">/</span>`
    const collapsed = board.collapsed
    const info = board.description
      ? `<button class="icon-btn" ${tip(`Описание доски «${board.name}»`)}>${icon('info')}</button>`
      : ''
    const tools = inSpace
      ? `<button class="icon-btn" ${tip(`Действия с доской «${board.name}»`)}>${icon('ellipsis')}</button>
         <button class="icon-btn" data-board-toggle aria-expanded="${!collapsed}" ${tip(`${collapsed ? 'Развернуть' : 'Свернуть'} доску «${board.name}»`)}>${icon(collapsed ? 'chevron-down' : 'chevron-up')}</button>`
      : `<button class="icon-btn" ${tip(`Действия с доской «${board.name}»`)}>${icon('ellipsis')}</button>`
    return `
      <section class="board-block ${collapsed ? 'collapsed' : ''}" aria-label="${esc(board.name)}">
        <header class="board-head">
          <div class="names">${names}<${heading} class="truncate">${esc(board.name)}</${heading}>${info}
            ${collapsed ? `<span class="count">· ${countText}</span>` : ''}</div>
          ${tools}
        </header>
        ${collapsed ? '' : `
        <div class="board-scroll">
          <div class="board-inner">
            <div class="col-heads">${board.columns.map((col) => colHead(board, col)).join('')}</div>
            ${lanes(board)}
          </div>
        </div>
        <div class="edge-shade" hidden></div>`}
      </section>`
  }

  function plural(n, one, few, many) {
    const m10 = n % 10
    const m100 = n % 100
    if (m10 === 1 && m100 !== 11) return one
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
    return many
  }

  // ---------- Каркас: полоса разделов, дерево, шапка ----------
  function treeRow({ depth, chevron, open, emoji, iconName, name, href, current, everyone }) {
    const pad = 4 + depth * 16
    const chev = chevron
      ? `<button class="chev ${open ? 'open' : ''}" aria-expanded="${open}" ${tip(`${open ? 'Свернуть' : 'Развернуть'} «${name}»`)}>${icon('chevron-right', 's35')}</button>`
      : '<span class="chev"></span>'
    const mark = emoji ? `<span class="emoji" aria-hidden="true">${emoji}</span>` : `<span class="node-icon">${icon(iconName)}</span>`
    const ev = everyone ? `<span class="everyone" ${tip('Доступно всем сотрудникам')} role="img">${icon('users-round', 's35')}</span>` : ''
    return `<li><a class="tree-row" href="${href}" style="padding-left:${pad}px" ${current ? 'aria-current="page"' : ''}>${chev}${mark}${ev}<span class="truncate">${esc(name)}</span></a></li>`
  }

  function shell(content) {
    const boardRows = [
      ['Дежурства', 'space.html'],
      ['Широкая доска', 'space.html'],
      ['Продукт', 'board.html'],
      ['Инфраструктура', 'space.html'],
    ]
    const onBoard = page === 'board' || page === 'card'
    const tree = [
      treeRow({ depth: 0, chevron: true, open: false, emoji: '🏢', name: 'Компания', href: '#', everyone: true }),
      treeRow({ depth: 0, chevron: true, open: true, emoji: '💡', name: 'Продуктовые команды', href: '#' }),
      treeRow({ depth: 1, chevron: true, open: true, emoji: '💻', name: 'Разработка', href: 'space.html', current: page === 'space' }),
      ...boardRows.map(([name, href]) =>
        treeRow({ depth: 2, chevron: false, iconName: 'square-kanban', name, href, current: onBoard && name === 'Продукт' }),
      ),
    ].join('')
    return `
      <div class="app">
        <aside class="rail">
          <a class="logo" href="space.html" ${tip('На главную')}>S</a>
          <nav class="rail-nav" aria-label="Разделы" style="display:grid;gap:4px">
            <button class="rail-btn" aria-pressed="true" ${tip('Дерево')}>${icon('network', 's5')}</button>
            <button class="rail-btn" aria-pressed="false" ${tip('Администрирование')}>${icon('shield-check', 's5')}</button>
          </nav>
        </aside>
        <aside class="tree">
          <div class="tree-head"><h2>Дерево</h2>
            <button class="icon-btn md" ${tip('Свернуть панель')}>${icon('panel-left-close')}</button></div>
          <div class="tree-search">
            <label class="field">${icon('search')}<input type="search" placeholder="Найти…" aria-label="Найти в дереве"></label>
            <button class="icon-btn md" ${tip('Добавить')}>${icon('plus')}</button>
          </div>
          <nav aria-label="Дерево"><ul>${tree}</ul></nav>
        </aside>
        <div class="main-col">
          <header class="topbar">
            <button class="user-btn" id="user-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Меню пользователя">
              ${avatar(ME, 'sm')}<span>${ME.name}</span></button>
          </header>
          <main class="main">${content}</main>
        </div>
      </div>`
  }

  // ---------- Страницы ----------
  function boardPage() {
    return `<div class="canvas" data-canvas>${boardBlock(PRODUCT, { heading: 'h1' })}</div>`
  }

  function spacePage() {
    return `
      <div class="space-panel">
        <div class="title">
          <h1>Разработка</h1>
          <span class="badge key-badge">DEV</span>
          <button class="icon-btn" ${tip('О пространстве')}>${icon('info')}</button>
        </div>
        <div class="tabs" role="tablist">
          <button class="tab" role="tab" aria-selected="true">Доски</button>
          <button class="tab" role="tab" aria-selected="false">Участники</button>
          <button class="tab" role="tab" aria-selected="false">Метки</button>
        </div>
        <div class="group">
          <button class="btn outline">${icon('archive')}Архив досок</button>
          <button class="btn primary">${icon('plus')}Создать доску</button>
        </div>
        <button class="btn outline end">${icon('pencil')}Изменить</button>
      </div>
      <div class="canvas" data-canvas>
        <div class="rows">
          <div class="row">${boardBlock(DUTY, { inSpace: true })}${boardBlock(WIDE, { inSpace: true })}</div>
          <div class="row">${boardBlock(INFRA, { inSpace: true })}</div>
          <div class="row">${boardBlock(PRODUCT, { inSpace: true })}</div>
        </div>
      </div>`
  }

  function cardWindow(key) {
    const card = ALL_CARDS.find((x) => x.key === key)
    const board = BOARD_OF.get(key)
    const col = board.columns.find((x) => x.id === card.col)
    const lane = board.lanes.find((x) => x.id === card.lane)
    const type = TYPES[card.type]
    const d = DETAILS[key] || { customer: 'anna', created: '2 недели назад', moved: '3 дня назад', participants: [] }
    const resp = card.resp && PEOPLE[card.resp]
    const cust = PEOPLE[d.customer]
    const due = d.due || card.due
    const urgent = d.urgent ?? card.urgent
    const sections = []
    const section = (title, body, { count, closed } = {}) =>
      `<section class="section ${closed ? 'closed' : ''}">
         <button class="s-head" aria-expanded="${!closed}">${icon('chevron-down', 's35')}${title}${count != null ? `<span class="n">${count}</span>` : ''}</button>
         <div class="s-body">${body}</div></section>`

    const paramRows = [
      ['Расположение', `<span>${esc(board.name)} / ${esc(col.name)} (${esc(lane.name)})</span>
        <span class="badge">${CATEGORY[col.cat]}</span>
        <button class="icon-btn md" ${tip('Переместить…')}>${icon('search')}</button>`],
      ['Тип', `<button class="btn ghost sm" style="margin-left:-12px"><span class="type-chip"><i style="background:${type.color};color:${readableTextOn(type.color)}">${type.name[0]}</i>${type.name}</span></button>`],
      ['Ответственный', resp ? `<button class="btn ghost sm" style="margin-left:-12px">${avatar(resp, 'xs')}${esc(resp.name)}</button>` : '<button class="btn ghost sm muted-text" style="margin-left:-12px">Назначить</button>'],
      ['Участники', `${(d.participants || []).map((p) => `<span class="chip">${avatar(PEOPLE[p], 'xs')}${esc(PEOPLE[p].name)}<button class="icon-btn x" ${tip(`Убрать «${PEOPLE[p].name}»`)}>${icon('x', 's35')}</button></span>`).join('')}
        <button class="btn ghost sm muted-text">Добавить участников</button>`],
    ]
    if (due) paramRows.push(['Срок', `<button class="btn ghost sm" style="margin-left:-12px">${icon('calendar-clock')}${esc(due[0])}</button>${due[1] !== 'pending' ? dueBadge(due) : ''}`])
    paramRows.push(['Срочно', `<span class="checkbox ${urgent ? 'on' : ''}" role="checkbox" aria-checked="${!!urgent}" tabindex="0" aria-label="Срочно">${urgent ? icon('check') : ''}</span>`])
    if (card.labels.length) paramRows.push(['Метки', `${card.labels.map((l) => labelBadge(l)).join('')}<button class="icon-btn md" ${tip('Изменить метки')}>${icon('pencil')}</button>`])
    if (d.estimate) paramRows.push(['План, ч', `<span class="tnum">${d.estimate}</span>`])
    sections.push(section('Основные параметры', `<dl class="params">${paramRows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`))

    const desc = d.description
      ? `<div class="rich">${d.description.map((p) => `<p>${esc(p)}</p>`).join('')}<ul>${d.list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
         <p>Проверку на стенде делает <span class="mention">@${esc(d.mention)}</span>.</p></div>`
      : '<p class="muted" style="margin:0">Описания пока нет</p>'
    sections.push(section('Описание', desc))

    if (d.checklist) {
      const done = d.checklist.items.filter((x) => x[1]).length
      const total = d.checklist.items.length
      sections.push(section('Чек-листы', `
        <div class="checklist">
          <div class="top"><b>${esc(d.checklist.title)}</b><span class="muted tnum" style="font-size:12px">${done}/${total}</span></div>
          <div class="progress" aria-hidden="true"><i style="width:${(done / total) * 100}%"></i></div>
          <ul>${d.checklist.items.map(([t, ok]) => `<li class="${ok ? 'done' : ''}"><span class="checkbox ${ok ? 'on' : ''}" role="checkbox" aria-checked="${ok}" tabindex="0">${ok ? icon('check') : ''}</span><span>${esc(t)}</span></li>`).join('')}</ul>
          <button class="btn ghost sm" style="justify-self:start;margin-left:-10px">${icon('plus')}Добавить чек-лист</button>
        </div>`, { count: 1 }))
    }
    if (d.file) {
      sections.push(section('Файлы', `
        <div class="files"><div class="file">
          <div class="thumb" role="img" aria-label="Превью «${esc(d.file.name)}»"><div class="bar"></div><div class="area"></div></div>
          <div class="fname"><a href="#" class="truncate">${esc(d.file.name)}</a>
            <button class="icon-btn" ${tip(`Скопировать ссылку на «${d.file.name}»`)}>${icon('link-2')}</button>
            <button class="icon-btn" ${tip(`Скачать «${d.file.name}»`)}>${icon('download')}</button>
            <button class="icon-btn" ${tip(`Удалить «${d.file.name}»`)}>${icon('trash-2')}</button></div>
          <span class="muted" style="font-size:12px">${d.file.size}</span>
        </div></div>`, { count: 1 }))
    }
    sections.push(section('Сведения', '', { closed: true }))

    const comments = (d.comments || [])
      .map(([who, when, text]) => {
        const p = PEOPLE[who]
        const body = esc(text).replace('@Борис Петров', '<span class="mention">@Борис Петров</span>')
        return `<div class="comment">${avatar(p)}<div><div class="who"><b>${esc(p.name)}</b><span>${when}</span></div><div>${body}</div></div></div>`
      })
      .join('')

    return `
      <div class="overlay" data-close></div>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="${card.key}: ${esc(card.title)}" tabindex="-1">
        <button class="icon-btn md close fg" data-close aria-label="Закрыть">${icon('x')}</button>
        <div class="body">
          <header class="cw-head">
            <h2>${esc(card.title)}</h2>
            <div class="line">
              <button class="k" ${tip('Скопировать ссылку на карточку')}>${card.key}</button>
              <span class="muted" aria-hidden="true">·</span><span class="muted">Заказчик</span>
              <button class="btn ghost sm" style="height:28px;padding:0 6px;margin-left:-4px"><span class="person">${avatar(cust, 'xs')}${esc(cust.name)}</span></button>
            </div>
            <div class="times"><span>${icon('calendar-plus', 's35')}Создана ${d.created}</span><span aria-hidden="true">·</span><span>${icon('move-right', 's35')}Перемещена ${d.moved}</span></div>
          </header>
          <div class="cw-actions">
            <button class="round primary" ${tip('Добавить в карточку')}>${icon('plus')}</button>
            <button class="round plain" ${tip(`Действия с карточкой «${card.title}»`)}>${icon('ellipsis')}</button>
          </div>
          ${card.blocked && d.block ? `
          <div class="block-plaque">
            <span class="t">${icon('ban')}Заблокирована</span>
            <span>${esc(d.block.reason)}</span>
            <div class="m"><span>${esc(d.block.by)}, ${esc(d.block.at)}</span><button class="btn outline sm">Снять блокировку</button></div>
          </div>` : ''}
          ${sections.join('')}
          <div style="display:grid;gap:16px;padding-top:8px">
            <div class="tabs" role="tablist" style="justify-self:start">
              <button class="tab" role="tab" aria-selected="true">${icon('message-square')}Комментарии</button>
              <button class="tab" role="tab" aria-selected="false">${icon('history')}История</button>
            </div>
            <div class="composer"><div class="ph">Напишите комментарий, @ — упомянуть коллегу</div>
              <div class="bar"><button class="btn primary sm">Отправить</button></div></div>
            <div class="comments">${comments || '<p class="muted" style="margin:0">Комментариев пока нет</p>'}</div>
          </div>
        </div>
      </div>`
  }

  // ---------- Сборка страницы ----------
  const root = document.getElementById('root')
  root.innerHTML = shell(page === 'space' ? spacePage() : boardPage())
  const layer = document.createElement('div')
  document.body.appendChild(layer)

  // Затенение края у доски, которую можно листать вбок (правила вида, раздел 10)
  function updateShades() {
    for (const block of document.querySelectorAll('.board-block')) {
      const scroll = block.querySelector('.board-scroll')
      const shade = block.querySelector('.edge-shade')
      if (!scroll || !shade) continue
      shade.hidden = scroll.scrollLeft + scroll.clientWidth >= scroll.scrollWidth - 1
    }
  }
  for (const s of document.querySelectorAll('.board-scroll')) s.addEventListener('scroll', updateShades)
  addEventListener('resize', updateShades)
  updateShades()

  // ---------- Окно карточки ----------
  let opener = null
  function openCard(key, from) {
    opener = from || null
    layer.innerHTML = cardWindow(key)
    layer.querySelector('.dialog').focus()
  }
  function closeCard() {
    if (!layer.innerHTML) return
    layer.innerHTML = ''
    hideTip()
    if (opener) opener.focus()
  }
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-card]')
    if (t && !e.target.closest('button')) openCard(t.dataset.card, t)
  })
  root.addEventListener('keydown', (e) => {
    const t = e.target.closest('[data-card]')
    if (t && e.key === 'Enter') {
      e.preventDefault()
      openCard(t.dataset.card, t)
    }
  })
  layer.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeCard()
    const head = e.target.closest('.s-head')
    if (head) {
      const s = head.parentElement
      s.classList.toggle('closed')
      head.setAttribute('aria-expanded', String(!s.classList.contains('closed')))
    }
    const tab = e.target.closest('.tab')
    if (tab) for (const x of tab.parentElement.children) x.setAttribute('aria-selected', String(x === tab))
  })
  if (page === 'card') openCard(params.get('card') || 'DEV-173', document.querySelector('[data-card="DEV-173"]'))

  // ---------- Сворачивание дорожек и досок ----------
  root.addEventListener('click', (e) => {
    const laneBtn = e.target.closest('[data-lane-chevron]')
    const laneRow = e.target.closest('[data-lane-toggle]')
    if (laneBtn || (laneRow && laneRow.parentElement.classList.contains('collapsed') && !e.target.closest('button'))) {
      const lane = (laneBtn || laneRow).closest('.lane')
      const collapsed = lane.classList.toggle('collapsed')
      const btn = lane.querySelector('[data-lane-chevron]')
      const name = lane.getAttribute('aria-label')
      btn.innerHTML = icon(collapsed ? 'chevron-down' : 'chevron-up')
      btn.setAttribute('aria-expanded', String(!collapsed))
      btn.dataset.tip = `${collapsed ? 'Развернуть' : 'Свернуть'} дорожку «${name}»`
      btn.setAttribute('aria-label', btn.dataset.tip)
    }
    const boardBtn = e.target.closest('[data-board-toggle]')
    if (boardBtn) {
      const block = boardBtn.closest('.board-block')
      if (block.querySelector('.board-scroll') || !block.classList.contains('collapsed')) {
        const collapsed = block.classList.toggle('collapsed')
        boardBtn.innerHTML = icon(collapsed ? 'chevron-down' : 'chevron-up')
        boardBtn.setAttribute('aria-expanded', String(!collapsed))
        updateShades()
      }
    }
    const tab = e.target.closest('.space-panel .tab')
    if (tab) for (const x of tab.parentElement.children) x.setAttribute('aria-selected', String(x === tab))
  })

  // ---------- Меню пользователя с выбором темы (решение PM 21.10, п. 7) ----------
  let menu = null
  const userBtn = document.getElementById('user-btn')
  function closeMenu(returnFocus = true) {
    if (!menu) return
    menu.remove()
    menu = null
    userBtn.setAttribute('aria-expanded', 'false')
    if (returnFocus) userBtn.focus()
  }
  function openMenu() {
    menu = document.createElement('div')
    menu.className = 'menu'
    menu.setAttribute('role', 'menu')
    const item = (value, label, ic) =>
      `<button class="menu-item" role="menuitemradio" aria-checked="${theme === value}" data-theme-value="${value}">${icon(ic)}${label}<span class="check">${icon('check')}</span></button>`
    menu.innerHTML = `
      <div class="head"><div>${ME.name}</div><div class="em">${ME.email}</div></div>
      <div class="sep"></div>
      <div class="group-label">Тема</div>
      ${item('light', 'Светлая', 'sun')}${item('dark', 'Тёмная', 'moon')}${item('system', 'Как в системе', 'monitor')}
      <div class="sep"></div>
      <button class="menu-item" role="menuitem">${icon('user')}Профиль</button>
      <button class="menu-item" role="menuitem">${icon('log-out')}Выйти</button>`
    document.body.appendChild(menu)
    const r = userBtn.getBoundingClientRect()
    menu.style.top = `${r.bottom + 4}px`
    menu.style.right = `${innerWidth - r.right}px`
    userBtn.setAttribute('aria-expanded', 'true')
    menu.querySelector('[aria-checked="true"]').focus()
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-theme-value]')
      if (!b) return closeMenu()
      // Меню после выбора темы не закрывается — видно, что выбрано (резюме ux-reviewer, раздел 5)
      theme = b.dataset.themeValue
      try {
        localStorage.setItem(THEME_KEY, theme)
      } catch {
        /* в приватном окне — только на эту страницу */
      }
      applyTheme(theme)
      for (const x of menu.querySelectorAll('[data-theme-value]')) x.setAttribute('aria-checked', String(x === b))
    })
  }
  userBtn.addEventListener('click', () => (menu ? closeMenu() : openMenu()))
  document.addEventListener('mousedown', (e) => {
    if (menu && !menu.contains(e.target) && !userBtn.contains(e.target)) closeMenu(false)
  })
  if (params.get('menu') === 'open') openMenu()

  document.addEventListener('keydown', (e) => {
    // Фокус не уходит из открытого окна карточки на доску под ним
    const dialog = layer.querySelector('.dialog')
    if (e.key === 'Tab' && dialog && !menu) {
      const items = [...dialog.querySelectorAll('button, a[href], [tabindex="0"]')]
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    if (e.key !== 'Escape') return
    if (tipEl) return hideTip()
    if (menu) return closeMenu()
    closeCard()
  })

  // ---------- Подсказки (Tooltip): по наведению и по фокусу ----------
  let tipEl = null
  function showTip(target) {
    hideTip()
    tipEl = document.createElement('div')
    tipEl.className = 'tooltip'
    tipEl.setAttribute('role', 'tooltip')
    tipEl.textContent = target.dataset.tip
    document.body.appendChild(tipEl)
    const r = target.getBoundingClientRect()
    const w = tipEl.offsetWidth
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8)
    const below = r.bottom + 6 + tipEl.offsetHeight < innerHeight
    tipEl.style.left = `${left}px`
    tipEl.style.top = `${below ? r.bottom + 6 : r.top - 6 - tipEl.offsetHeight}px`
  }
  function hideTip() {
    if (tipEl) tipEl.remove()
    tipEl = null
  }
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest('[data-tip]')
    if (t) showTip(t)
    else hideTip()
  })
  document.addEventListener('focusin', (e) => {
    const t = e.target.closest('[data-tip]')
    if (t && t.matches(':focus-visible')) showTip(t)
    else hideTip()
  })

})()
