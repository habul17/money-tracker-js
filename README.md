# Money Tracker

A mobile-first personal debt tracker. The frontend is plain **HTML, CSS and JavaScript**
(no framework, no build step), and the backend is **Node.js, Express and MySQL** with
sign up and log in. It answers one question every time you open it:

> How much more money do I need to be free of debt?

## What it does

- Record three kinds of entries: **income**, **expense** and **payment** (money paid to a debt)
- Add your debts and put them in the order you want to pay them (top = pay next)
- See how much money you still need, your total debt, your cash and your progress
- Edit or delete any entry, and every number updates
- Debts that reach zero move to **Cleared**. Debts can be **archived** (taken out of all totals)
- **Sign up and log in**, and everything is saved in **MySQL** under your account, so it is there on any device
- **JSON export and import** for backup
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
The app stores just two lists: `debts` and `transactions` (two MySQL tables). Cash, debt balances and progress
are calculated from the transactions every time the screen is drawn (`js/ledger.js`).
So the numbers can never go out of sync: fix one entry and every total is right again.
Even a hand-corrected debt balance is saved as a new `adjustment` entry instead of
overwriting history.

## The backend

| Method | Route              | What it does                                      | Login needed |
| ------ | ------------------ | ------------------------------------------------- | ------------ |
| POST   | `/api/auth/signup` | Create an account, returns a login token          | No           |
| POST   | `/api/auth/login`  | Check email and password, returns a login token   | No           |
| GET    | `/api/data`        | All your debts and entries                        | Yes          |
| PUT    | `/api/data`        | Save all your debts and entries                   | Yes          |

- **Passwords** are stored only as **bcrypt** hashes, never as the password itself.
- **Login tokens** are **JWTs** signed with a secret. The browser sends one with every request
  (`Authorization: Bearer ...`), and `requireAuth` in `auth.js` checks it before the data routes run.
- **Every query uses `?` placeholders**, so user input can never change the SQL (no SQL injection).
- **The server checks everything again** (`validate.js`): amounts must be whole paise, dates must be real,
  and every payment must point to a debt that exists. The browser checks too, but anyone can send a
  request without our page.
- **A save is all or nothing.** `PUT /api/data` replaces your rows inside a **database transaction**.
  If anything fails, it rolls back and your old data is still there.
- **Tables:** `users`, `debts` and `transactions`. Each row belongs to one user, so you can only ever
  read and write your own data. Money columns are `BIGINT` paise.

## How to run

1. Install MySQL and create the database and tables:
   ```bash
   sudo mysql < schema.sql
   ```
2. Create a MySQL user for the app (choose your own password):
   ```bash
   sudo mysql -e "CREATE USER 'money'@'localhost' IDENTIFIED BY 'your_password'; GRANT ALL ON money_tracker.* TO 'money'@'localhost';"
   ```
3. Copy `.env.example` to `.env`, then put in your MySQL password and a long random `JWT_SECRET`.
4. Install packages and start the server:
   ```bash
   npm install
   npm start
   ```
5. Open http://localhost:3000, create an account and start.

Data from the old browser-only version? Export it there, then use **Restore from a file** after you log in.

## Files

```
server.js                    Express app: sign up, log in, load and save data
auth.js                      makes and checks login tokens (JWT)
validate.js                  checks every debt and entry before it goes into MySQL
db.js                        MySQL connection pool
schema.sql                   the database and its 3 tables

public/index.html            the page: login screen, 4 screens, the bottom bar and 2 dialogs (forms)
public/css/style.css         all styles, colours as CSS variables, dark mode
public/js/money.js           paise: parse what the user typed, format ₹ with Indian grouping
public/js/ledger.js          the maths: cash, debt balances, totals, progress
public/js/storage.js         talks to the server (login, load, save), export, and checking a backup file
public/js/render.js          turns the state into HTML for each screen
public/js/app.js             the state, login, every action (add, edit, delete, move...) and the event listeners
public/manifest.webmanifest  lets you add it to a phone's home screen
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
