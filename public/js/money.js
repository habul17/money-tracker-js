// All money in this app is stored as whole paise (integers), never as decimals.
// ₹100.50 is stored as 10050.
//
// Why: computers can't store most decimals exactly. In JavaScript,
// 0.1 + 0.2 is 0.30000000000000004. In a money app those tiny errors add up
// in every total. Whole numbers are always exact.

const rupeeFormat = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const rupeeAndPaiseFormat = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

// Paise -> text for the screen, with Indian grouping.
// 100000 -> "₹1,000"    10050 -> "₹100.50"    10000000 -> "₹1,00,000"
function formatPaise(paise) {
  if (paise % 100 === 0) {
    return rupeeFormat.format(paise / 100)
  }
  return rupeeAndPaiseFormat.format(paise / 100)
}

// What the user typed -> paise, or null if it is not a valid amount.
// "1,234.5" -> 123450
// We split the text at the dot instead of using parseFloat(),
// so no decimal maths happens at all.
function parsePaise(text) {
  const cleaned = text.replace(/[₹,\s]/g, '') // drop ₹, commas and spaces
  const match = /^(\d{0,13})(?:\.(\d{0,2}))?$/.exec(cleaned)
  if (match === null) return null

  const rupeeText = match[1]
  const paiseText = match[2] || ''
  if (rupeeText === '' && paiseText === '') return null // empty, or just "."

  const rupees = Number(rupeeText || '0')
  const paise = Number(paiseText.padEnd(2, '0')) // ".5" means 50 paise, not 5
  return rupees * 100 + paise
}

// Paise -> text to put back into an input when editing.
// 123456 -> "1234.56"    100000 -> "1000"
function paiseToInput(paise) {
  const rupees = Math.floor(paise / 100)
  const rest = paise % 100
  if (rest === 0) return String(rupees)
  return rupees + '.' + String(rest).padStart(2, '0')
}
