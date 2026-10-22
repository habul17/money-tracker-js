// Saving and loading. The data lives in MySQL on the server, under your account.
// The browser keeps only the login token (in localStorage) and sends it with every request.

const TOKEN_KEY = 'money-tracker:token'
const EMAIL_KEY = 'money-tracker:email'

function emptyState() {
  return { version: 1, debts: [], transactions: [] }
}

// ---- Login token ----

function getSaved(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null // storage is blocked (some private modes)
  }
}

function setSaved(key, value) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // storage is blocked: you stay logged in until the page closes
  }
}

let token = getSaved(TOKEN_KEY)

function isLoggedIn() {
  return token !== null
}

function loggedInEmail() {
  return getSaved(EMAIL_KEY) || ''
}

// ---- Talking to the server ----

// Sends a request with the token. Throws an Error (with .status) if it fails.
async function api(path, method = 'GET', body) {
  let response
  try {
    response = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new Error("Can't reach the server. Check your connection.")
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.message || 'Something went wrong.')
    error.status = response.status // 401 means the login token is missing or old
    throw error
  }
  return data
}

// mode is 'signup' or 'login'
async function logIn(mode, email, password) {
  const data = await api('/api/auth/' + mode, 'POST', { email, password })
  token = data.token
  setSaved(TOKEN_KEY, data.token)
  setSaved(EMAIL_KEY, data.email)
}

function logOut() {
  token = null
  setSaved(TOKEN_KEY, null)
  setSaved(EMAIL_KEY, null)
}

function loadState() {
  return api('/api/data') // { version, debts, transactions }
}

// Saves run one after another, so an older save can never land after a newer one.
// Each save sends everything, so one good save fixes any save that failed before it.
let saveQueue = Promise.resolve()

function saveState(state) {
  const copy = JSON.parse(JSON.stringify(state)) // the state as it is right now
  const save = saveQueue.then(() => api('/api/data', 'PUT', copy))
  saveQueue = save.catch(() => {}) // a failed save must not block the next one
  return save
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
