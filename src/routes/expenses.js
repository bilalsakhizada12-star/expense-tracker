// Expense routes (all require auth — mounted behind requireAuth in app.js):
// list / create / read / update / delete, plus the monthly summary.
// Every query is scoped to req.userId, so users can only see their own data.
// A request for another user's expense returns 404, never 403, so it does
// not reveal whether that expense exists.
const express = require('express');
const {
  isValidDateString,
  isValidMonth,
  monthRange,
  todayString,
  formatDate,
  toMoney,
} = require('../validate');

function serializeExpense(row) {
  return {
    id: row.id,
    amount: toMoney(row.amount),
    category: row.category_name,
    date: formatDate(row.expense_date),
    note: row.note,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

async function findCategoryId(pool, categoryName) {
  const { rows } = await pool.query('SELECT id FROM categories WHERE name = $1', [categoryName]);
  return rows.length > 0 ? rows[0].id : null;
}

async function findOwnedExpense(pool, userId, expenseId) {
  const { rows } = await pool.query(
    `SELECT e.*, c.name AS category_name
       FROM expenses e
       JOIN categories c ON c.id = e.category_id
      WHERE e.id = $1 AND e.user_id = $2`,
    [expenseId, userId],
  );
  return rows[0] || null;
}

// Shared validation for create and update. Returns an error string, or null.
function validateExpenseInput({ amount, category, date, note }, { partial = false } = {}) {
  if (!partial || amount !== undefined) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return 'Amount must be a positive number';
    }
    if (amount > 1000000000) {
      return 'Amount is too large';
    }
  }
  if (!partial || category !== undefined) {
    if (typeof category !== 'string' || category.trim() === '') {
      return 'Category is required';
    }
  }
  if (!partial || date !== undefined) {
    if (!isValidDateString(date)) {
      return 'Date must be a valid date in YYYY-MM-DD format';
    }
    if (date > todayString()) {
      return 'Date cannot be in the future';
    }
  }
  if (note !== undefined && (typeof note !== 'string' || note.length > 500)) {
    return 'Note must be at most 500 characters';
  }
  return null;
}

module.exports = function expenseRoutes(pool) {
  const router = express.Router();

  // GET /api/expenses?category=Food&month=2026-11 — newest first.
  router.get('/', async (req, res, next) => {
    try {
      const { category, month } = req.query;

      if (month !== undefined && !isValidMonth(month)) {
        return res.status(400).json({ error: 'Month must be in YYYY-MM format' });
      }

      const params = [req.userId];
      let sql = `
        SELECT e.*, c.name AS category_name
          FROM expenses e
          JOIN categories c ON c.id = e.category_id
         WHERE e.user_id = $1`;
      if (category) {
        params.push(category);
        sql += ` AND c.name = $${params.length}`;
      }
      if (month) {
        const [start, end] = monthRange(month);
        params.push(start, end);
        sql += ` AND e.expense_date >= $${params.length - 1} AND e.expense_date < $${params.length}`;
      }
      sql += ' ORDER BY e.expense_date DESC, e.id DESC';

      const { rows } = await pool.query(sql, params);
      return res.json({ expenses: rows.map(serializeExpense) });
    } catch (err) {
      return next(err);
    }
  });

  // POST /api/expenses — { amount, category, date, note? } -> 201 expense.
  // Category is given by name (e.g. "Food") and must be one of the seeded ones.
  router.post('/', async (req, res, next) => {
    try {
      const error = validateExpenseInput(req.body || {});
      if (error) return res.status(400).json({ error });

      const { amount, category, date, note = '' } = req.body;
      const categoryId = await findCategoryId(pool, category);
      if (!categoryId) {
        return res.status(400).json({ error: `Unknown category: ${category}` });
      }

      const { rows } = await pool.query(
        `INSERT INTO expenses (user_id, category_id, amount, expense_date, note)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [req.userId, categoryId, amount, date, note],
      );
      const created = await findOwnedExpense(pool, req.userId, rows[0].id);
      return res.status(201).json({ expense: serializeExpense(created) });
    } catch (err) {
      return next(err);
    }
  });

  // GET /api/expenses/:id
  router.get('/:id', async (req, res, next) => {
    try {
      const expense = await findOwnedExpense(pool, req.userId, req.params.id);
      if (!expense) return res.status(404).json({ error: 'Expense not found' });
      return res.json({ expense: serializeExpense(expense) });
    } catch (err) {
      return next(err);
    }
  });

  // PUT /api/expenses/:id — partial update of amount, category, date, note.
  router.put('/:id', async (req, res, next) => {
    try {
      const body = req.body || {};
      if (Object.keys(body).length === 0) {
        return res.status(400).json({ error: 'Nothing to update' });
      }
      const error = validateExpenseInput(body, { partial: true });
      if (error) return res.status(400).json({ error });

      const existing = await findOwnedExpense(pool, req.userId, req.params.id);
      if (!existing) return res.status(404).json({ error: 'Expense not found' });

      let categoryId = existing.category_id;
      if (body.category !== undefined) {
        categoryId = await findCategoryId(pool, body.category);
        if (!categoryId) {
          return res.status(400).json({ error: `Unknown category: ${body.category}` });
        }
      }

      const { rows } = await pool.query(
        `UPDATE expenses
            SET category_id = $1, amount = $2, expense_date = $3, note = $4
          WHERE id = $5
          RETURNING *`,
        [
          categoryId,
          body.amount !== undefined ? body.amount : existing.amount,
          body.date !== undefined ? body.date : formatDate(existing.expense_date),
          body.note !== undefined ? body.note : existing.note,
          req.params.id,
        ],
      );
      const updated = await findOwnedExpense(pool, req.userId, rows[0].id);
      return res.json({ expense: serializeExpense(updated) });
    } catch (err) {
      return next(err);
    }
  });

  // DELETE /api/expenses/:id -> 204
  router.delete('/:id', async (req, res, next) => {
    try {
      const { rowCount } = await pool.query(
        'DELETE FROM expenses WHERE id = $1 AND user_id = $2',
        [req.params.id, req.userId],
      );
      if (rowCount === 0) return res.status(404).json({ error: 'Expense not found' });
      return res.status(204).send();
    } catch (err) {
      return next(err);
    }
  });

  return router;
};

// GET /api/summary?month=2026-11 — total spent in the month, broken down by
// category. Defaults to the current month when no month is given.
// Kept outside the router (mounted directly in app.js) so that the path
// /api/summary is not swallowed by the /:id route above.
module.exports.summary = function summaryHandler(pool) {
  return async (req, res, next) => {
    try {
      const month = req.query.month || new Date().toISOString().slice(0, 7);
      if (!isValidMonth(month)) {
        return res.status(400).json({ error: 'Month must be in YYYY-MM format' });
      }
      const [start, end] = monthRange(month);
      const { rows } = await pool.query(
        `SELECT c.name AS category,
                COUNT(*)::int AS count,
                COALESCE(SUM(e.amount), 0) AS total
           FROM expenses e
           JOIN categories c ON c.id = e.category_id
          WHERE e.user_id = $1
            AND e.expense_date >= $2
            AND e.expense_date < $3
          GROUP BY c.name
          ORDER BY total DESC`,
        [req.userId, start, end],
      );
      const byCategory = rows.map((row) => ({
        category: row.category,
        count: Number(row.count),
        total: toMoney(row.total),
      }));
      const total = toMoney(byCategory.reduce((sum, item) => sum + item.total, 0));
      return res.json({ month, total, byCategory });
    } catch (err) {
      return next(err);
    }
  };
};
