# Expense Tracker

A full-stack personal expense tracker — register, log in, record expenses, and
see where your money goes each month. Built as a portfolio project to show
end-to-end work with Node.js, Express, PostgreSQL and JWT authentication.

## Features

- Register / log in with JWT auth and bcrypt password hashing
- Create, read, update and delete expenses (amount, category, date, note)
- Seeded categories: Food, Transport, Rent, Utilities, Entertainment, Health, Shopping, Other
- Monthly summary: total spent this month and totals per category
- Filter expenses by category and month
- Dashboard with a plain CSS bar chart of spending by category
- Input validation and proper error responses (400 / 401 / 404 / 409)
- Users can only see and change their own expenses

## Tech stack

- **Backend:** Node.js 22, Express 4
- **Database:** PostgreSQL (`pg` driver)
- **Auth:** JSON Web Tokens (`jsonwebtoken`), password hashing (`bcryptjs`)
- **Frontend:** vanilla HTML / CSS / JavaScript (no build step, no frontend dependencies)
- **Tests:** Jest + Supertest against an in-memory PostgreSQL (`pg-mem`)

## How to run locally

```bash
git clone https://github.com/Iamking12/expense-tracker.git
cd expense-tracker
npm install
cp .env.example .env   # then set JWT_SECRET to a long random string
```

### Option A — with PostgreSQL (recommended for real use)

Start a database with Docker Compose:

```bash
docker compose up -d
```

Then point the app at it in `.env`:

```
DATABASE_URL=postgres://expense:expense@localhost:5432/expense_tracker
```

```bash
npm start
# open http://localhost:3000
```

### Option B — zero setup (demo mode)

If `DATABASE_URL` is not set, the app runs with an in-memory database so you
can try it immediately. Nothing is saved after the server stops.

```bash
npm start
# open http://localhost:3000
```

### Development

```bash
npm run dev   # restarts the server automatically on file changes
```

## Tests

The test suite uses `pg-mem`, an in-memory PostgreSQL, so it runs anywhere
with no database server:

```bash
npm test
```

## API

All `/api/expenses` and `/api/summary` routes require an
`Authorization: Bearer <token>` header from login/register.

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | `/api/health` | Health check |
| POST | `/api/auth/register` | Register — `{ name, email, password }` |
| POST | `/api/auth/login` | Log in — `{ email, password }` |
| GET | `/api/expenses?category=Food&month=2026-11` | List my expenses (newest first) |
| POST | `/api/expenses` | Create — `{ amount, category, date, note? }` |
| GET | `/api/expenses/:id` | Get one expense |
| PUT | `/api/expenses/:id` | Update (partial) |
| DELETE | `/api/expenses/:id` | Delete |
| GET | `/api/summary?month=2026-11` | Monthly total + totals per category |

Error responses are JSON: `{ "error": "message" }`.

## Project structure

```
expense-tracker/
├── server.js            # entry point — loads config, starts the server
├── src/
│   ├── app.js           # Express app factory (pool is injected, so tests can use pg-mem)
│   ├── db.js            # Postgres pool + schema setup + category seeding
│   ├── auth.js          # password hashing, JWT signing, auth middleware
│   ├── validate.js      # input validation and formatting helpers
│   └── routes/
│       ├── auth.js      # POST /api/auth/register, /api/auth/login
│       └── expenses.js  # expense CRUD + /api/summary
├── public/              # frontend — index.html, app.js, styles.css
├── tests/
│   └── api.test.js      # Jest + Supertest API tests
├── docker-compose.yml   # local PostgreSQL for development
└── .env.example         # environment variables (no real secrets)
```

## Note

This is a portfolio project by Bilal Sakhizada. It is a generic expense
tracker built from scratch — it contains no code from any commercial product.

## License

MIT — see [LICENSE](LICENSE).
