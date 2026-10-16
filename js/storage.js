// Saving and loading. Everything lives in localStorage on this device.
// There is no server and no account.

const STORAGE_KEY = 'money-tracker:v1'

function emptyState() {
  return { version: 1, debts: [], transactions: [] }
}

function loadState() {
  let saved
  try {
    saved = localStorage.getItem(STORAGE_KEY)
  } catch {
    return emptyState() // storage is blocked (some private modes)
  }
  if (saved === null) return emptyState() // first visit

  try {
    return parseBackup(saved)
  } catch {
    // The saved data is broken. Keep a copy before starting fresh,
    // because our next save would overwrite it.
    try {
      localStorage.setItem(STORAGE_KEY + ':unreadable', saved)
    } catch {
      // nothing more we can do
    }
    return emptyState()
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage is full or blocked. The app still works until the page closes,
    // and Export still works.
  }
}

// ---- Backup file (JSON export and import) ----

function downloadBackup(state) {
  const file = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = 'money-tracker-' + todayIso() + '.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Never trust a file we did not just write. Check every field, and throw an
// Error with a message we can show the user if anything is wrong.
function parseBackup(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error("That file isn't valid JSON.")
  }
  if (!isObject(data) || data.version !== 1 || !Array.isArray(data.debts) || !Array.isArray(data.transactions)) {
    throw new Error("That file doesn't look like a Money Tracker backup.")
  }

  const debts = data.debts.map(checkDebt)
  const transactions = data.transactions.map(checkTransaction)

  // A payment for a debt that does not exist would make every total wrong,
  // so we refuse the whole file instead of importing half of it.
  const debtIds = new Set(debts.map((debt) => debt.id))
  for (const tx of transactions) {
    if (tx.debtId !== undefined && !debtIds.has(tx.debtId)) {
      throw new Error('That backup has a payment for a debt that is missing.')
    }
  }

  return { version: 1, debts, transactions }
}

const KINDS = ['opening', 'income', 'expense', 'payment', 'adjustment']

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Returns a clean copy with only the fields we know about.
function checkDebt(item) {
  if (!isObject(item) || typeof item.id !== 'string' || typeof item.name !== 'string' || !Number.isInteger(item.originalAmount)) {
    throw new Error('A debt in that file is broken.')
  }
  const debt = { id: item.id, name: item.name, originalAmount: item.originalAmount }
  if (typeof item.archivedAt === 'string') debt.archivedAt = item.archivedAt
  return debt
}

function checkTransaction(item) {
  if (
    !isObject(item) ||
    typeof item.id !== 'string' ||
    !KINDS.includes(item.kind) ||
    !Number.isInteger(item.amount) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(item.date)
  ) {
    throw new Error('An entry in that file is broken.')
  }
  const tx = {
    id: item.id,
    kind: item.kind,
    amount: item.amount,
    date: item.date,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
  }
  if (typeof item.note === 'string' && item.note !== '') tx.note = item.note
  if (item.kind === 'payment' || item.kind === 'adjustment') {
    if (typeof item.debtId !== 'string') throw new Error('A payment in that file has no debt.')
    tx.debtId = item.debtId
  }
  return tx
}
