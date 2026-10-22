// Login tokens (JWT).
// After sign up or log in, the browser gets a token and sends it with every request:
//   Authorization: Bearer <token>
// The token is signed with JWT_SECRET, so nobody can change the userId inside it.
const jwt = require('jsonwebtoken')

function makeToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' })
}

// Runs before the data routes. Stops the request if the token is missing or wrong.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return res.status(401).json({ message: 'Please log in.' })

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.userId = payload.userId // the routes only ever read and write this user's rows
    next()
  } catch {
    res.status(401).json({ message: 'Your session ended. Please log in again.' })
  }
}

module.exports = { makeToken, requireAuth }
