// The backend: sign up, log in, and save or load each user's debts and entries in MySQL.
require('dotenv').config({ quiet: true }) // load .env first, db.js and auth.js need it

const path = require('path')
const express = require('express')
const bcrypt = require('bcryptjs')
const pool = require('./db')
const { makeToken, requireAuth } = require('./auth')
const { checkData, toMysqlTime, toIsoTime } = require('./validate')

if (!process.env.JWT_SECRET) {
  console.error('Set JWT_SECRET in .env before starting the server.')
  process.exit(1)
}

const app = express()

app.use(express.json({ limit: '1mb' })) // read JSON request bodies into req.body
app.use(express.static(path.join(__dirname, 'public'))) // serve the frontend files

// ---- Accounts ----

function checkLogin(body) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) return { error: 'Enter a valid email.' }
  if (password.length < 8 || password.length > 72) return { error: 'Password must be 8 to 72 characters.' }
  return { email, password }
}

app.post('/api/auth/signup', async (req, res) => {
  const { email, password, error } = checkLogin(req.body || {})
  if (error) return res.status(400).json({ message: error })

  // Never store the password itself, only a bcrypt hash of it
  const passwordHash = await bcrypt.hash(password, 10)

  try {
    const [result] = await pool.query('INSERT INTO users (email, password_hash) VALUES (?, ?)', [email, passwordHash])
    res.status(201).json({ token: makeToken(result.insertId), email })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'That email already has an account.' })
    throw err
  }
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password, error } = checkLogin(req.body || {})
  if (error) return res.status(400).json({ message: error })

  const [rows] = await pool.query('SELECT id, password_hash FROM users WHERE email = ?', [email])
  const user = rows[0]

  // Same message for a wrong email and a wrong password, so nobody can find out which emails have accounts
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ message: 'Wrong email or password.' })
  }

  res.json({ token: makeToken(user.id), email })
})

// ---- Data (needs a logged-in user) ----

// Everything for this user, in the same shape as a backup file
app.get('/api/data', requireAuth, async (req, res) => {
  const [debtRows] = await pool.query(
    'SELECT id, name, original_amount, archived_at FROM debts WHERE user_id = ? ORDER BY position',
    [req.userId]
  )
  const [txRows] = await pool.query(
    'SELECT id, kind, amount, tx_date, created_at, note, debt_id FROM transactions WHERE user_id = ? ORDER BY tx_date, created_at',
    [req.userId]
  )

  const debts = debtRows.map((row) => {
    const debt = { id: row.id, name: row.name, originalAmount: Number(row.original_amount) }
    if (row.archived_at) debt.archivedAt = toIsoTime(row.archived_at)
    return debt
  })

  const transactions = txRows.map((row) => {
    const tx = { id: row.id, kind: row.kind, amount: Number(row.amount), date: row.tx_date, createdAt: toIsoTime(row.created_at) }
    if (row.note) tx.note = row.note
    if (row.debt_id) tx.debtId = row.debt_id
    return tx
  })

  res.json({ version: 1, debts, transactions })
})

// Replace this user's debts and entries with the ones sent.
// It runs inside a database transaction: either every row is saved, or none are.
app.put('/api/data', requireAuth, async (req, res) => {
  let data
  try {
    data = checkData(req.body) // never trust the browser, check every field again here
  } catch (err) {
    return res.status(400).json({ message: err.message })
  }

  const debtRows = data.debts.map((debt, position) => [
    req.userId, debt.id, debt.name, debt.originalAmount, position,
    debt.archivedAt ? toMysqlTime(debt.archivedAt) : null,
  ])
  const txRows = data.transactions.map((tx) => [
    req.userId, tx.id, tx.kind, tx.amount, tx.date, toMysqlTime(tx.createdAt), tx.note || null, tx.debtId || null,
  ])

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    // Delete entries first: they point to debts (foreign key)
    await conn.query('DELETE FROM transactions WHERE user_id = ?', [req.userId])
    await conn.query('DELETE FROM debts WHERE user_id = ?', [req.userId])

    // VALUES ? with a list of rows inserts them all in one query
    if (debtRows.length > 0) {
      await conn.query('INSERT INTO debts (user_id, id, name, original_amount, position, archived_at) VALUES ?', [debtRows])
    }
    if (txRows.length > 0) {
      await conn.query('INSERT INTO transactions (user_id, id, kind, amount, tx_date, created_at, note, debt_id) VALUES ?', [txRows])
    }

    await conn.commit()
  } catch (err) {
    await conn.rollback() // undo the deletes too, so the old data is still there
    throw err
  } finally {
    conn.release() // give the connection back to the pool
  }

  res.json({ message: 'Saved.' })
})

// Any error in the routes above (for example, the database is down) comes here
app.use((err, req, res, next) => {
  console.error(err)
  res.status(err.status || 500).json({ message: 'Something went wrong.' })
})

const PORT = process.env.PORT || 3000

app.listen(PORT, (err) => {
  if (err) {
    console.error('Could not start server:', err.message) // for example, the port is already in use
    process.exit(1)
  }
  console.log(`Server running on http://localhost:${PORT}`)
})
