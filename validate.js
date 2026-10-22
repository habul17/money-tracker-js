// Checks the debts and entries the browser sends before they go into MySQL.
// The browser checks them too, but anyone can send a request without our page,
// so the server has to check again.

const KINDS = ['opening', 'income', 'expense', 'payment', 'adjustment']
const MAX_PAISE = 1e15 // 13 digits of rupees, the same limit the browser uses

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isId(value) {
  return typeof value === 'string' && value.length >= 1 && value.length <= 36
}

function isPaise(value) {
  return Number.isSafeInteger(value) && Math.abs(value) < MAX_PAISE
}

function isTime(value) {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime())
}

// "2026-10-16" and a real day ("2026-02-30" is not)
function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

// Returns { debts, transactions } with only the fields we know, or throws an Error with a message.
function checkData(data) {
  if (!isObject(data) || !Array.isArray(data.debts) || !Array.isArray(data.transactions)) {
    throw new Error('Expected debts and transactions.')
  }

  const debtIds = new Set()
  const debts = data.debts.map((item) => {
    if (!isObject(item) || !isId(item.id) || typeof item.name !== 'string' || item.name.trim() === '' ||
        item.name.length > 60 || !isPaise(item.originalAmount) || item.originalAmount <= 0) {
      throw new Error('A debt is broken.')
    }
    if (debtIds.has(item.id)) throw new Error('Two debts have the same id.')
    debtIds.add(item.id)

    const debt = { id: item.id, name: item.name, originalAmount: item.originalAmount }
    if (item.archivedAt !== undefined) {
      if (!isTime(item.archivedAt)) throw new Error('A debt has a broken archive time.')
      debt.archivedAt = item.archivedAt
    }
    return debt
  })

  const txIds = new Set()
  const transactions = data.transactions.map((item) => {
    if (!isObject(item) || !isId(item.id) || !KINDS.includes(item.kind) || !isPaise(item.amount) ||
        !isDate(item.date) || !isTime(item.createdAt)) {
      throw new Error('An entry is broken.')
    }
    if (item.kind !== 'adjustment' && item.amount < 0) throw new Error('Only a balance fix can be negative.')
    if (txIds.has(item.id)) throw new Error('Two entries have the same id.')
    txIds.add(item.id)

    const tx = { id: item.id, kind: item.kind, amount: item.amount, date: item.date, createdAt: item.createdAt }
    if (item.note !== undefined) {
      if (typeof item.note !== 'string' || item.note.length > 80) throw new Error('An entry has a broken note.')
      if (item.note !== '') tx.note = item.note
    }
    // A payment for a debt that does not exist would make every total wrong
    if (item.kind === 'payment' || item.kind === 'adjustment') {
      if (!debtIds.has(item.debtId)) throw new Error('A payment points to a debt that is missing.')
      tx.debtId = item.debtId
    }
    return tx
  })

  return { debts, transactions }
}

// "2026-10-16T10:00:00.000Z" (JavaScript) -> "2026-10-16 10:00:00.000" (MySQL DATETIME, in UTC)
function toMysqlTime(iso) {
  return new Date(iso).toISOString().slice(0, 23).replace('T', ' ')
}

// "2026-10-16 10:00:00.000" (MySQL, in UTC) -> "2026-10-16T10:00:00.000Z"
function toIsoTime(mysqlTime) {
  return mysqlTime.replace(' ', 'T') + 'Z'
}

module.exports = { checkData, toMysqlTime, toIsoTime }
