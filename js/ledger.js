// The maths of the app.
//
// We store only two lists: debts and transactions (the log).
// Cash, debt balances, totals and progress are NOT stored. They are worked out
// from the log every time we draw the screen. So they can never go out of sync:
// fix one entry in the log and every number is right again.
//
// A transaction has a kind:
//   opening    - the money you had at the start (first entry)
//   income     - money in               -> cash up
//   expense    - money spent            -> cash down
//   payment    - money paid to a debt   -> cash down AND that debt down
//   adjustment - a hand fix to a debt   -> debt up or down, cash unchanged

// cash = opening + income - expenses - payments
function getCash(transactions) {
  let cash = 0
  for (const tx of transactions) {
    if (tx.kind === 'opening' || tx.kind === 'income') cash += tx.amount
    if (tx.kind === 'expense' || tx.kind === 'payment') cash -= tx.amount
    // an adjustment only fixes a debt, it never touches cash
  }
  return cash
}

// What is still owed on one debt.
// Never below zero: paying too much just clears the debt.
function getRemaining(debt, transactions) {
  let remaining = debt.originalAmount
  for (const tx of transactions) {
    if (tx.debtId !== debt.id) continue
    if (tx.kind === 'payment') remaining -= tx.amount
    if (tx.kind === 'adjustment') remaining += tx.amount // + for a fee, - for a fix down
  }
  return Math.max(0, remaining)
}

function percent(part, whole) {
  if (whole === 0) return 0
  return (part / whole) * 100
}

function sum(list, getValue) {
  let total = 0
  for (const item of list) total += getValue(item)
  return total
}

// Everything the screens need, worked out from the stored state.
function getSummary(state) {
  const views = state.debts.map((debt) => {
    const remaining = getRemaining(debt, state.transactions)
    const paid = debt.originalAmount - remaining
    return { debt, remaining, paid, percentPaid: percent(paid, debt.originalAmount) }
  })

  // Archived debts are taken out of every total. Cleared ones still count
  // toward progress, because watching progress grow is the point.
  const archived = views.filter((view) => view.debt.archivedAt)
  const live = views.filter((view) => !view.debt.archivedAt)
  const active = live.filter((view) => view.remaining > 0)
  const cleared = live.filter((view) => view.remaining === 0)

  const cash = getCash(state.transactions)
  const totalDebt = sum(active, (view) => view.remaining)
  const totalOriginal = sum(live, (view) => view.debt.originalAmount)
  const totalPaid = sum(live, (view) => view.paid)

  return {
    cash,
    totalDebt,
    // The main number: how much more money you need. Negative means you have spare.
    shortfall: totalDebt - cash,
    totalOriginal,
    totalPaid,
    percentPaid: percent(totalPaid, totalOriginal),
    active, // in your priority order (the order of state.debts)
    cleared,
    archived,
    payNext: active[0] || null,
  }
}

// Newest first. If two entries have the same date, the one created later comes first.
function sortNewestFirst(transactions) {
  return [...transactions].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date)
    return b.createdAt.localeCompare(a.createdAt)
  })
}

// A debt with payments in the log can be archived but never deleted.
// Deleting it would also delete those payments and change your cash history.
function hasHistory(debtId, transactions) {
  return transactions.some((tx) => tx.debtId === debtId)
}

// Today as "2026-10-16" in local time (the format a date input uses).
function todayIso() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return now.getFullYear() + '-' + month + '-' + day
}
