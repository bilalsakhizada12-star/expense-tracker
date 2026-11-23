// API tests. They run against an in-memory PostgreSQL (pg-mem), so no
// database server is needed: `npm test` works anywhere.
// Set the JWT secret before loading the app modules.
process.env.JWT_SECRET = 'test-secret-for-jest-only';
delete process.env.DATABASE_URL;

const request = require('supertest');
const { createPool, initDb } = require('../src/db');
const { createApp } = require('../src/app');

let app;
let pool;

async function register(email, password = 'password123', name = 'Test User') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name, email, password });
  return res;
}

async function login(email, password = 'password123') {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
}

beforeAll(async () => {
  pool = createPool();
  await initDb(pool);
  app = createApp(pool);
});

afterAll(async () => {
  await pool.end();
});

describe('health', () => {
  test('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('auth', () => {
  test('register creates a user and returns a token', async () => {
    const res = await register('alice@example.com');
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('alice@example.com');
    expect(res.body.user.password_hash).toBeUndefined();
  });

  test('register rejects a duplicate email', async () => {
    const res = await register('alice@example.com');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });

  test('register rejects a short password and a bad email', async () => {
    expect((await register('bob@example.com', 'short')).status).toBe(400);
    expect((await register('not-an-email', 'password123')).status).toBe(400);
  });

  test('login succeeds with correct credentials and fails with wrong ones', async () => {
    const ok = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'password123' });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();

    const bad = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'wrong-password' });
    expect(bad.status).toBe(401);

    const missing = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });
    expect(missing.status).toBe(401);
  });
});

describe('expenses', () => {
  let token;
  let otherToken;

  beforeAll(async () => {
    await register('owner@example.com');
    token = await login('owner@example.com');
    await register('other@example.com', 'password123', 'Other User');
    otherToken = await login('other@example.com');
  });

  test('unauthenticated requests are rejected', async () => {
    const res = await request(app).get('/api/expenses');
    expect(res.status).toBe(401);
  });

  test('create, read, update and delete an expense', async () => {
    const created = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 25.5, category: 'Food', date: '2026-11-10', note: 'Groceries' });
    expect(created.status).toBe(201);
    expect(created.body.expense.amount).toBe(25.5);
    expect(created.body.expense.category).toBe('Food');
    expect(created.body.expense.date).toBe('2026-11-10');
    const id = created.body.expense.id;

    const fetched = await request(app)
      .get(`/api/expenses/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.expense.note).toBe('Groceries');

    const updated = await request(app)
      .put(`/api/expenses/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 30, note: 'Groceries + bread' });
    expect(updated.status).toBe(200);
    expect(updated.body.expense.amount).toBe(30);
    expect(updated.body.expense.note).toBe('Groceries + bread');
    expect(updated.body.expense.category).toBe('Food'); // unchanged

    const deleted = await request(app)
      .delete(`/api/expenses/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleted.status).toBe(204);

    const gone = await request(app)
      .get(`/api/expenses/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(gone.status).toBe(404);
  });

  test('create rejects invalid input', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const cases = [
      [{ amount: -5, category: 'Food', date: '2026-11-10' }, 'negative amount'],
      [{ amount: 0, category: 'Food', date: '2026-11-10' }, 'zero amount'],
      [{ amount: 'ten', category: 'Food', date: '2026-11-10' }, 'non-numeric amount'],
      [{ amount: 10, category: 'Nope', date: '2026-11-10' }, 'unknown category'],
      [{ amount: 10, category: 'Food', date: '2026-02-30' }, 'impossible date'],
      [{ amount: 10, category: 'Food', date: '2999-01-01' }, 'future date'],
      [{ amount: 10, category: 'Food' }, 'missing date'],
    ];
    for (const [body, label] of cases) {
      const res = await request(app).post('/api/expenses').set(auth).send(body);
      expect(res.status).toBe(400); // case: ${label}
      expect(res.body.error).toBeTruthy();
    }
  });

  test('list filters by category and month', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    await request(app).post('/api/expenses').set(auth).send({ amount: 10, category: 'Transport', date: '2026-11-05' });
    await request(app).post('/api/expenses').set(auth).send({ amount: 20, category: 'Food', date: '2026-11-06' });
    await request(app).post('/api/expenses').set(auth).send({ amount: 99, category: 'Food', date: '2026-10-06' });

    const november = await request(app).get('/api/expenses?month=2026-11').set(auth);
    expect(november.status).toBe(200);
    expect(november.body.expenses).toHaveLength(2);

    const foodOnly = await request(app).get('/api/expenses?month=2026-11&category=Food').set(auth);
    expect(foodOnly.body.expenses).toHaveLength(1);
    expect(foodOnly.body.expenses[0].amount).toBe(20);

    const badMonth = await request(app).get('/api/expenses?month=2026-13').set(auth);
    expect(badMonth.status).toBe(400);
  });

  test('users cannot see, edit or delete each other’s expenses', async () => {
    const created = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 15, category: 'Health', date: '2026-11-07' });
    const id = created.body.expense.id;

    const otherAuth = { Authorization: `Bearer ${otherToken}` };
    expect((await request(app).get(`/api/expenses/${id}`).set(otherAuth)).status).toBe(404);
    expect((await request(app).put(`/api/expenses/${id}`).set(otherAuth).send({ amount: 1 })).status).toBe(404);
    expect((await request(app).delete(`/api/expenses/${id}`).set(otherAuth)).status).toBe(404);
  });

  test('summary totals the month per category', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    await request(app).post('/api/expenses').set(auth).send({ amount: 25, category: 'Food', date: '2026-11-12' });
    await request(app).post('/api/expenses').set(auth).send({ amount: 15, category: 'Food', date: '2026-11-13' });
    await request(app).post('/api/expenses').set(auth).send({ amount: 10, category: 'Transport', date: '2026-11-14' });
    await request(app).post('/api/expenses').set(auth).send({ amount: 500, category: 'Rent', date: '2026-10-01' });

    const res = await request(app).get('/api/summary?month=2026-11').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.month).toBe('2026-11');
    // November has the earlier filter-test rows (Transport 10, Food 20) plus
    // the rows above, plus the Health 15 from the ownership test.
    expect(res.body.total).toBe(10 + 20 + 15 + 25 + 15 + 10);
    const food = res.body.byCategory.find((c) => c.category === 'Food');
    expect(food.total).toBe(20 + 25 + 15);
    expect(food.count).toBe(3);
    // October's rent must not leak into November.
    expect(res.body.byCategory.find((c) => c.category === 'Rent')).toBeUndefined();
  });
});
