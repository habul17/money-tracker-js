// The app: the state, every change you can make to it, and the event listeners.

// ---- State ----
// The only data we store. Cash, balances and totals are worked out from it
// by ledger.js every time we draw. It is loaded from the server after you log in.
let state = emptyState()

let logFilter = 'all'
let editingEntryId = null // null means we are adding a new entry
let editingDebtId = null // null means we are adding a new debt

// Every change ends here: redraw the screens, then save to the server.
function commit(message) {
  render()
  if (message) showToast(message)
  saveState(state).catch((error) => {
    if (error.status === 401) showAuth(error.message) // the login token ran out
    else showToast('Not saved: ' + error.message)
  })
}

function newId() {
  // randomUUID only works on https or localhost, so keep a simple fallback.
  if (crypto.randomUUID) return crypto.randomUUID()
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

function now() {
  return new Date().toISOString()
}

// ---- Small UI helpers ----

let toastTimer
function showToast(message) {
  const toast = $('#toast')
  toast.textContent = message
  toast.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500)
}

// Shows a problem inside the form (the toast would be hidden behind a dialog).
function showFormError(form, message) {
  form.querySelector('.form-error').textContent = message
}

function showScreen(name) {
  for (const section of document.querySelectorAll('.screen')) {
    section.hidden = section.id !== 'screen-' + name
  }
  for (const button of document.querySelectorAll('.nav button')) {
    if (button.dataset.screen === name) button.setAttribute('aria-current', 'page')
    else button.removeAttribute('aria-current')
  }
  window.scrollTo(0, 0)
}

// ---- Sign up and log in ----

let authMode = 'login' // or 'signup'
const authForm = $('#auth-form')

function showAuth(message) {
  state = emptyState()
  $('#auth').hidden = false
  $('#app').hidden = true
  showFormError(authForm, message || '')
}

function setAuthMode(mode) {
  authMode = mode
  const signingUp = mode === 'signup'
  $('#auth-title').textContent = signingUp ? 'Create your account' : 'Log in'
  $('#auth-submit').textContent = signingUp ? 'Sign up' : 'Log in'
  $('#auth-switch-text').textContent = signingUp ? 'Already have an account?' : 'New here?'
  $('#auth-switch').textContent = signingUp ? 'Log in' : 'Create an account'
  authForm.password.autocomplete = signingUp ? 'new-password' : 'current-password'
  showFormError(authForm, '')
}

async function submitAuth(event) {
  event.preventDefault()
  const email = authForm.email.value.trim()
  const password = authForm.password.value
  if (!email || password.length < 8) return showFormError(authForm, 'Enter your email and a password of at least 8 characters.')

  $('#auth-submit').disabled = true
  try {
    await logIn(authMode, email, password)
    authForm.reset()
    await start()
  } catch (error) {
    showFormError(authForm, error.message)
  } finally {
    $('#auth-submit').disabled = false
  }
}

function doLogOut() {
  logOut()
  setAuthMode('login')
  showAuth()
}

// Load your data from the server and show the app. Nothing can be changed
// before this works, so an empty screen can never overwrite your saved data.
async function start() {
  if (!isLoggedIn()) return showAuth()
  try {
    state = await loadState()
  } catch (error) {
    if (error.status === 401) logOut()
    return showAuth(error.message)
  }
  $('#auth').hidden = true
  $('#app').hidden = false
  showScreen('home')
  render()
}

// ---- First visit: how much money do you have? ----

function saveOpeningBalance(event) {
  event.preventDefault()
  const form = event.target
  const amount = parsePaise(form.amount.value)
  if (amount === null) {
    showFormError(form, 'Enter the amount you have right now.')
    return
  }
  state.transactions.push({
    id: newId(),
    kind: 'opening',
    amount,
    date: todayIso(),
    createdAt: now(),
    note: 'Starting money',
  })
  form.reset()
  showFormError(form, '')
  commit('Saved. Now add what you owe.')
  showScreen('debts')
}

// ---- Entries (income, expense, payment) ----

const KIND_HELP = {
  expense: 'Groceries, bills, anything spent. Your cash goes down, and what you still need goes up.',
  income: 'Money in. Your cash goes up, and what you still need goes down.',
  payment: 'Money paid to someone you owe. Cash and that debt both go down, so what you still need does not move.',
  opening: 'The money you had when you started.',
  adjustment: 'A hand fix to a debt balance.',
}

const entryDialog = $('#entry-dialog')
const entryForm = $('#entry-form')

// Opening and adjustment entries can be edited, but their kind can't change.
function isLockedKind(kind) {
  return kind === 'opening' || kind === 'adjustment'
}

function openEntryDialog(id) {
  const entry = state.transactions.find((tx) => tx.id === id)
  editingEntryId = entry ? entry.id : null

  entryForm.reset()
  showFormError(entryForm, '')
  entryForm.kind.value = entry && !isLockedKind(entry.kind) ? entry.kind : 'expense'
  entryForm.amount.value = entry ? paiseToInput(Math.abs(entry.amount)) : ''
  entryForm.date.value = entry ? entry.date : todayIso()
  entryForm.note.value = entry && entry.note ? entry.note : ''
  fillDebtChoices(entry)

  $('#entry-title').textContent = entry ? 'Edit entry' : 'Record something'
  $('#entry-submit').textContent = entry ? 'Save' : 'Record'
  $('#entry-delete').hidden = !entry
  $('#entry-kinds').hidden = Boolean(entry && isLockedKind(entry.kind))
  updateEntryForm()

  entryDialog.showModal()
  if (!entry) entryForm.amount.focus()
}

// The "Towards" list for payments: your active debts in priority order.
function fillDebtChoices(entry) {
  const summary = getSummary(state)
  const choices = summary.active.map((view, index) => ({
    id: view.debt.id,
    label: `${index + 1}. ${view.debt.name} (${formatPaise(view.remaining)} left)`,
  }))

  // When editing an old payment, its debt may be cleared now. Keep it in the list.
  if (entry && entry.kind === 'payment' && !choices.some((choice) => choice.id === entry.debtId)) {
    choices.push({ id: entry.debtId, label: debtName(entry.debtId) })
  }

  const select = entryForm.debtId
  select.innerHTML = choices
    .map((choice) => `<option value="${escapeHtml(choice.id)}">${escapeHtml(choice.label)}</option>`)
    .join('')
  if (entry && entry.debtId) select.value = entry.debtId
  else if (summary.payNext) select.value = summary.payNext.debt.id
}

// Called when the kind or amount changes: show the right help and fields.
function updateEntryForm() {
  const entry = state.transactions.find((tx) => tx.id === editingEntryId)
  const kind = entry && isLockedKind(entry.kind) ? entry.kind : entryForm.kind.value
  $('#entry-help').textContent = KIND_HELP[kind]

  const isPayment = kind === 'payment'
  const hasChoices = entryForm.debtId.options.length > 0
  $('#debt-field').hidden = !isPayment
  entryForm.debtId.hidden = !hasChoices
  $('#no-debts').hidden = hasChoices

  // Warn when paying more than is left. The debt just clears, it never goes negative.
  const warning = $('#overpay-warning')
  warning.hidden = true
  const debt = state.debts.find((d) => d.id === entryForm.debtId.value)
  const amount = parsePaise(entryForm.amount.value)
  if (isPayment && debt && amount !== null) {
    let left = getRemaining(debt, state.transactions)
    if (entry && entry.kind === 'payment' && entry.debtId === debt.id) left += entry.amount // ignore this entry's old amount
    if (amount > left) {
      warning.textContent = `That is more than the ${formatPaise(left)} left. The debt will just clear, it won't go negative.`
      warning.hidden = false
    }
  }
}

function saveEntry(event) {
  event.preventDefault()
  const entry = state.transactions.find((tx) => tx.id === editingEntryId)
  const kind = entry && isLockedKind(entry.kind) ? entry.kind : entryForm.kind.value
  const amount = parsePaise(entryForm.amount.value)
  const date = entryForm.date.value
  const note = entryForm.note.value.trim()
  const debtId = entryForm.debtId.value

  if (amount === null || amount <= 0) return showFormError(entryForm, 'Enter an amount greater than zero.')
  if (kind === 'payment' && !debtId) return showFormError(entryForm, 'Choose which debt this payment goes to.')
  if (!date) return showFormError(entryForm, 'Choose a date.')

  const tx = entry || { id: newId(), createdAt: now() }
  tx.kind = kind
  // An adjustment keeps its direction: + means a fee was added, - means the debt was fixed down.
  tx.amount = kind === 'adjustment' && tx.amount < 0 ? -amount : amount
  tx.date = date
  if (note) tx.note = note
  else delete tx.note
  if (kind === 'payment') tx.debtId = debtId
  else if (kind !== 'adjustment') delete tx.debtId

  if (!entry) state.transactions.push(tx)
  entryDialog.close()

  if (entry) commit('Entry updated.')
  else if (kind === 'payment') commit(`${formatPaise(amount)} off ${debtName(debtId)}.`)
  else commit('Recorded.')
}

function deleteEntry() {
  state.transactions = state.transactions.filter((tx) => tx.id !== editingEntryId)
  entryDialog.close()
  commit('Entry deleted.')
}

// ---- Debts ----

const debtDialog = $('#debt-dialog')
const debtForm = $('#debt-form')

function openDebtDialog(id) {
  const debt = state.debts.find((d) => d.id === id)
  editingDebtId = debt ? debt.id : null

  debtForm.reset()
  showFormError(debtForm, '')
  debtForm.debtName.value = debt ? debt.name : ''
  debtForm.original.value = debt ? paiseToInput(debt.originalAmount) : ''
  debtForm.remaining.value = debt ? paiseToInput(getRemaining(debt, state.transactions)) : ''

  const canDelete = debt && !hasHistory(debt.id, state.transactions)
  $('#debt-title').textContent = debt ? 'Edit debt' : 'Add a debt'
  $('#debt-help').textContent = debt
    ? 'Changing what is still owed adds a "balance fix" entry to your log, so every number stays traceable.'
    : 'What you owe, and to whom. You can change its place in the list afterwards.'
  $('#debt-submit').textContent = debt ? 'Save' : 'Add debt'
  $('#remaining-field').hidden = !debt
  $('#debt-delete').hidden = !canDelete
  $('#debt-archive').hidden = !debt || canDelete || Boolean(debt.archivedAt)
  $('#debt-restore').hidden = !debt || !debt.archivedAt

  debtDialog.showModal()
  if (!debt) debtForm.debtName.focus()
}

function saveDebt(event) {
  event.preventDefault()
  const name = debtForm.debtName.value.trim()
  const original = parsePaise(debtForm.original.value)
  if (!name) return showFormError(debtForm, 'Give the debt a name.')
  if (original === null || original <= 0) return showFormError(debtForm, 'Enter what you originally owed.')

  const debt = state.debts.find((d) => d.id === editingDebtId)
  if (!debt) {
    state.debts.push({ id: newId(), name, originalAmount: original })
    debtDialog.close()
    commit(`${name} added.`)
    return
  }

  const wanted = parsePaise(debtForm.remaining.value)
  if (debtForm.remaining.value.trim() !== '' && wanted === null) {
    return showFormError(debtForm, 'Enter what is still owed, or leave it as it is.')
  }
  const shownBefore = getRemaining(debt, state.transactions)
  debt.name = name
  debt.originalAmount = original

  // We never rewrite history. If you changed "still owed", we add a new
  // adjustment entry to the log for the difference.
  if (wanted !== null && wanted !== shownBefore) {
    const difference = wanted - getRemaining(debt, state.transactions)
    if (difference !== 0) {
      state.transactions.push({
        id: newId(),
        kind: 'adjustment',
        amount: difference,
        debtId: debt.id,
        date: todayIso(),
        createdAt: now(),
        note: 'Balance corrected by hand',
      })
    }
  }
  debtDialog.close()
  commit('Debt updated.')
}

// Moves a debt one place up (step -1) or down (step +1) in your priority list.
// Only active debts are in that list, so we swap with the next active debt.
function moveDebt(id, step) {
  const activeIds = getSummary(state).active.map((view) => view.debt.id)
  const from = activeIds.indexOf(id)
  const to = from + step
  if (from === -1 || to < 0 || to >= activeIds.length) return

  const a = state.debts.findIndex((d) => d.id === id)
  const b = state.debts.findIndex((d) => d.id === activeIds[to])
  const temp = state.debts[a] // swap the two debts
  state.debts[a] = state.debts[b]
  state.debts[b] = temp
  commit()
}

function archiveDebt() {
  const debt = state.debts.find((d) => d.id === editingDebtId)
  debt.archivedAt = now()
  debtDialog.close()
  commit('Debt archived. Its payments stay in your log.')
}

function restoreDebt() {
  const debt = state.debts.find((d) => d.id === editingDebtId)
  delete debt.archivedAt
  debtDialog.close()
  commit('Debt restored.')
}

function deleteDebt() {
  if (hasHistory(editingDebtId, state.transactions)) return // archive is the only way out
  state.debts = state.debts.filter((d) => d.id !== editingDebtId)
  debtDialog.close()
  commit('Debt deleted.')
}

// ---- Settings ----

async function importBackup(file) {
  try {
    const imported = parseBackup(await file.text())
    const hasData = state.debts.length > 0 || state.transactions.length > 0
    if (hasData && !confirm('Restoring replaces everything in the app. Continue?')) return
    state = imported
    commit('Backup restored.')
  } catch (error) {
    alert(error.message)
  }
}

function eraseEverything() {
  const question = `Erase ${state.transactions.length} entries and ${state.debts.length} debts? Export first if you might want them back.`
  if (!confirm(question)) return
  state = emptyState()
  commit('Everything erased.')
  showScreen('home')
}

// ---- Events ----
// One click listener for the whole page (event delegation).
// Each button says what it does in its data-action attribute.
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]')
  if (!button) return
  const id = button.dataset.id

  switch (button.dataset.action) {
    case 'go': showScreen(button.dataset.screen); break
    case 'add-entry': openEntryDialog(null); break
    case 'edit-entry': openEntryDialog(id); break
    case 'add-debt': openDebtDialog(null); break
    case 'edit-debt': openDebtDialog(id); break
    case 'move-up': moveDebt(id, -1); break
    case 'move-down': moveDebt(id, 1); break
    case 'export': downloadBackup(state); showToast('Backup saved. Keep it somewhere other than this phone.'); break
    case 'import': $('#import-file').click(); break
    case 'erase': eraseEverything(); break
    case 'switch-auth': setAuthMode(authMode === 'login' ? 'signup' : 'login'); break
    case 'logout': doLogOut(); break
    case 'close': button.closest('dialog').close(); break
  }
})

authForm.addEventListener('submit', submitAuth)
$('#welcome-form').addEventListener('submit', saveOpeningBalance)

entryForm.addEventListener('submit', saveEntry)
entryForm.addEventListener('input', updateEntryForm) // kind, amount or debt changed
$('#entry-delete').addEventListener('click', deleteEntry)

debtForm.addEventListener('submit', saveDebt)
$('#debt-archive').addEventListener('click', archiveDebt)
$('#debt-restore').addEventListener('click', restoreDebt)
$('#debt-delete').addEventListener('click', deleteDebt)

$('#log-filter').addEventListener('change', (event) => {
  logFilter = event.target.value
  renderLog()
})

$('#import-file').addEventListener('change', (event) => {
  const file = event.target.files[0]
  if (file) importBackup(file)
  event.target.value = '' // so choosing the same file again still works
})

// Clicking the dark area outside a dialog closes it.
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })
}

// ---- Start ----
start()
