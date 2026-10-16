# Money Tracker

A mobile-first personal debt tracker, built with plain **HTML, CSS and JavaScript**
(no framework, no build step). It answers one question every time you open it:

> How much more money do I need to be free of debt?

## What it does

- Record three kinds of entries: **income**, **expense** and **payment** (money paid to a debt)
- Add your debts and put them in the order you want to pay them (top = pay next)
- See how much money you still need, your total debt, your cash and your progress
- Edit or delete any entry, and every number updates
- Debts that reach zero move to **Cleared**. Debts can be **archived** (taken out of all totals)
- Everything is saved in the browser (`localStorage`), with **JSON export and import** for backup
- Works on a phone, has dark mode, and can be added to the home screen

## The money model

| Entry | Cash | Debt | What you still need |
| --- | --- | --- | --- |
| Income | up | no change | down |
| Expense | down | no change | up |
| Payment | down | down | no change |

```
cash       = opening money + income - expenses - payments
total debt = what is still owed on all active debts
you need   = total debt - cash
```

## Two important ideas

**1. All money is stored as whole paise, never decimals.**
₹100.50 is stored as `10050`. In JavaScript, `0.1 + 0.2` gives `0.30000000000000004`,
and in a money app those small errors add up. Whole numbers are always exact.
Typed amounts are turned into paise by splitting the text at the dot, so no decimal maths
happens at all (`js/money.js`).

**2. Only the log is stored. Every total is worked out from it.**
The app stores just two lists: `debts` and `transactions`. Cash, debt balances and progress
are calculated from the transactions every time the screen is drawn (`js/ledger.js`).
So the numbers can never go out of sync: fix one entry and every total is right again.
Even a hand-corrected debt balance is saved as a new `adjustment` entry instead of
overwriting history.

## How to run

Open `index.html` in a browser. That's it.

## Files

```
index.html            the page: 4 screens, the bottom bar and 2 dialogs (forms)
css/style.css         all styles, colours as CSS variables, dark mode
js/money.js           paise: parse what the user typed, format ₹ with Indian grouping
js/ledger.js          the maths: cash, debt balances, totals, progress
js/storage.js         save/load localStorage, export, and checking a backup file before import
js/render.js          turns the state into HTML for each screen
js/app.js             the state, every action (add, edit, delete, move...) and the event listeners
manifest.webmanifest  lets you add it to a phone's home screen
```

## A few details

- **Event delegation:** one click listener on the whole page. Each button has a
  `data-action` attribute (like `data-action="edit-debt"`) that says what it does.
- **Escaping:** debt names and notes are escaped before they go into HTML, so text like
  `<script>` shows as text and never runs.
- **Import is checked:** a backup file is validated field by field. If a payment points to a
  debt that doesn't exist, the whole file is refused.
- **A debt with payments can't be deleted**, only archived, because deleting it would change
  your cash history.
