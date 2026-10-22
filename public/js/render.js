// Drawing the screens. Each render function turns the current state into HTML.
// We redraw everything after every change. The data is small, so this is fast,
// and the screen can never show an old number.

const $ = (selector) => document.querySelector(selector)

// User text (debt names, notes) must never be read as HTML.
// Without this, a note like <img src=x onerror=alert(1)> would run code.
function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const ICONS = {
  in: '<path d="M17 7 7 17"/><path d="M17 17H7V7"/>',
  out: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  start: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  fix: '<path d="M12 20h9"/><path d="M16.4 3.6a1 1 0 0 1 3 3L7.4 18.6a2 2 0 0 1-.9.5l-2.9.8a.5.5 0 0 1-.6-.6l.8-2.9a2 2 0 0 1 .5-.9z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  next: '<path d="m9 18 6-6-6-6"/>',
}

function icon(name) {
  return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + '</svg>'
}

// How each kind of entry looks in a list.
const KIND_INFO = {
  opening: { label: 'Opening balance', icon: 'start', tone: 'muted', sign: '+' },
  income: { label: 'Income', icon: 'in', tone: 'green', sign: '+' },
  expense: { label: 'Expense', icon: 'out', tone: 'red', sign: '−' },
  payment: { label: 'Payment', icon: 'wallet', tone: '', sign: '' },
  adjustment: { label: 'Balance fix', icon: 'fix', tone: 'amber', sign: '' },
}

function render() {
  const summary = getSummary(state)
  renderHome(summary)
  renderDebts(summary)
  renderLog()
  renderSettings()
}

function progressBar(percentDone) {
  const width = Math.min(100, Math.max(0, percentDone))
  return `<div class="progress"><div style="width: ${width}%"></div></div>`
}

function debtName(debtId) {
  const debt = state.debts.find((d) => d.id === debtId)
  return debt ? debt.name : 'Debt'
}

// One row in the Home "Recent" list or the Log.
function entryRow(tx) {
  const info = KIND_INFO[tx.kind]
  let title = tx.note || info.label
  let subtitle = tx.note ? info.label : ''
  if (tx.kind === 'payment') {
    title = debtName(tx.debtId)
    subtitle = tx.note || info.label
  }
  if (tx.kind === 'adjustment') {
    title = debtName(tx.debtId) + ' balance fixed'
    subtitle = tx.note || info.label
  }

  let amount = info.sign + formatPaise(tx.amount)
  if (tx.kind === 'adjustment') {
    amount = (tx.amount > 0 ? '+' : '−') + formatPaise(Math.abs(tx.amount))
  }

  return `
    <button type="button" class="entry" data-action="edit-entry" data-id="${escapeHtml(tx.id)}">
      <span class="entry-icon ${info.tone}">${icon(info.icon)}</span>
      <span class="entry-text">
        <span class="entry-title">${escapeHtml(title)}</span>
        ${subtitle ? `<span class="entry-sub">${escapeHtml(subtitle)}</span>` : ''}
      </span>
      <span class="entry-amount ${info.tone}">${amount}</span>
    </button>`
}

// ---- Home ----

function renderHome(summary) {
  const isFirstVisit = state.transactions.length === 0 && state.debts.length === 0
  $('#welcome-form').hidden = !isFirstVisit
  $('#home-content').hidden = isFirstVisit
  if (isFirstVisit) return

  const isClear = summary.shortfall <= 0
  const recent = sortNewestFirst(state.transactions).slice(0, 5)

  $('#home-content').innerHTML = `
    <div class="headline">
      <p class="muted">${isClear ? "You're clear" : 'You still need'}</p>
      <p class="big-number ${isClear ? 'green' : ''}">${formatPaise(Math.abs(summary.shortfall))}</p>
      ${summary.shortfall < 0 ? '<p class="muted small">spare, after everything you owe</p>' : ''}
    </div>

    <div class="card">
      <div class="row"><span class="muted">Total debt</span><b>${formatPaise(summary.totalDebt)}</b></div>
      <hr>
      <div class="row"><span class="muted">You have</span><b class="${summary.cash < 0 ? 'red' : ''}">${formatPaise(summary.cash)}</b></div>
      ${summary.cash < 0 ? '<p class="red small">You have spent more than you had. This is borrowed money.</p>' : ''}
    </div>

    ${summary.totalOriginal > 0 ? `
      <div class="card stack-sm">
        <div class="row">
          <b>${Math.floor(summary.percentPaid)}% paid off</b>
          <span class="muted small">${formatPaise(summary.totalPaid)} of ${formatPaise(summary.totalOriginal)}</span>
        </div>
        ${progressBar(summary.percentPaid)}
        <p class="muted small">The one number here that only moves forward.</p>
      </div>` : ''}

    ${payNextCard(summary)}

    ${recent.length > 0 ? `
      <div>
        <div class="row">
          <h2 class="label">Recent</h2>
          <button type="button" class="btn btn-ghost btn-small" data-action="go" data-screen="log">See all</button>
        </div>
        <div class="entries">${recent.map(entryRow).join('')}</div>
      </div>` : ''}
  `
}

function payNextCard(summary) {
  const next = summary.payNext
  if (next === null) {
    if (state.debts.length === 0) return ''
    return '<div class="card card-success"><b>Every debt is cleared. There is nothing left to pay.</b></div>'
  }
  return `
    <button type="button" class="card card-button" data-action="go" data-screen="debts">
      <span class="grow stack-sm">
        <span class="label">Pay next</span>
        <span class="debt-name big">${escapeHtml(next.debt.name)}</span>
        ${progressBar(next.percentPaid)}
        <span class="muted small">${formatPaise(next.remaining)} left of ${formatPaise(next.debt.originalAmount)}</span>
      </span>
      <span class="muted">${icon('next')}</span>
    </button>`
}

// ---- Debts ----

function renderDebts(summary) {
  const { active, cleared, archived } = summary
  let html = ''

  if (active.length + cleared.length + archived.length === 0) {
    html = `
      <div class="card card-empty stack-sm">
        <b>No debts yet.</b>
        <p class="muted small">Add each one you owe. Then use the arrows to put them in the order you want to clear them.</p>
        <button type="button" class="btn btn-primary btn-wide" data-action="add-debt">Add your first debt</button>
      </div>`
  }

  if (active.length > 0) {
    html += '<ul class="debt-list">' + active.map((view, index) => activeDebtRow(view, index, active.length)).join('') + '</ul>'
  }

  if (cleared.length > 0) {
    html += `
      <div class="stack-sm">
        <h2 class="label">Cleared</h2>
        <ul class="debt-list">
          ${cleared.map((view) => `
            <li>
              <button type="button" class="debt-row" data-action="edit-debt" data-id="${escapeHtml(view.debt.id)}">
                <span class="badge-check">${icon('check')}</span>
                <span class="grow debt-name done">${escapeHtml(view.debt.name)}</span>
                <span class="muted small">${formatPaise(view.debt.originalAmount)} paid</span>
              </button>
            </li>`).join('')}
        </ul>
      </div>`
  }

  if (archived.length > 0) {
    html += `
      <div class="stack-sm">
        <h2 class="label">Archived</h2>
        <ul class="debt-list">
          ${archived.map((view) => `
            <li>
              <button type="button" class="debt-row archived" data-action="edit-debt" data-id="${escapeHtml(view.debt.id)}">
                <span class="grow debt-name">${escapeHtml(view.debt.name)}</span>
                <span class="tag">not counted</span>
              </button>
            </li>`).join('')}
        </ul>
      </div>`
  }

  $('#debt-lists').innerHTML = html
}

function activeDebtRow(view, index, count) {
  const id = escapeHtml(view.debt.id)
  return `
    <li class="debt-card">
      <button type="button" class="debt-row" data-action="edit-debt" data-id="${id}">
        <span class="position">${index + 1}</span>
        <span class="grow stack-xs">
          <span class="debt-name">${escapeHtml(view.debt.name)}</span>
          ${progressBar(view.percentPaid)}
          <span class="muted small">${formatPaise(view.remaining)} left of ${formatPaise(view.debt.originalAmount)}</span>
        </span>
      </button>
      <span class="move">
        <button type="button" class="btn btn-ghost btn-icon-sm" data-action="move-up" data-id="${id}"
          aria-label="Move ${escapeHtml(view.debt.name)} up" ${index === 0 ? 'disabled' : ''}>${icon('up')}</button>
        <button type="button" class="btn btn-ghost btn-icon-sm" data-action="move-down" data-id="${id}"
          aria-label="Move ${escapeHtml(view.debt.name)} down" ${index === count - 1 ? 'disabled' : ''}>${icon('down')}</button>
      </span>
    </li>`
}

// ---- Log ----

// Which kinds each filter button shows.
const FILTERS = {
  all: KINDS,
  in: ['income', 'opening'],
  out: ['expense'],
  paid: ['payment', 'adjustment'],
}

function formatDateHeading(iso) {
  if (iso === todayIso()) return 'Today'
  const date = new Date(iso + 'T00:00:00')
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function renderLog() {
  const kinds = FILTERS[logFilter]
  const entries = sortNewestFirst(state.transactions).filter((tx) => kinds.includes(tx.kind))

  if (entries.length === 0) {
    $('#log-list').innerHTML = '<div class="card card-empty"><p class="muted small">Nothing recorded here yet.</p></div>'
    return
  }

  // Group the entries by date: "2026-10-16" -> [tx, tx, ...]
  // A Map keeps the order we add keys in, and the entries are already sorted,
  // so the groups come out newest first.
  const groups = new Map()
  for (const tx of entries) {
    if (!groups.has(tx.date)) groups.set(tx.date, [])
    groups.get(tx.date).push(tx)
  }

  $('#log-list').innerHTML = [...groups]
    .map(([date, list]) => `
      <div>
        <h2 class="label">${escapeHtml(formatDateHeading(date))}</h2>
        <div class="entries">${list.map(entryRow).join('')}</div>
      </div>`)
    .join('')
}

// ---- Settings ----

function renderSettings() {
  $('#account-email').textContent = loggedInEmail()
  $('#backup-count').textContent = `${state.transactions.length} entries across ${state.debts.length} debts.`
}
