// Frontend for the Expense Tracker. Talks to the /api endpoints with a JWT
// stored in localStorage after login/register.
const CATEGORIES = ['Food', 'Transport', 'Rent', 'Utilities', 'Entertainment', 'Health', 'Shopping', 'Other'];

const $ = (id) => document.getElementById(id);

let token = localStorage.getItem('et_token') || null;
let userName = localStorage.getItem('et_user') || '';
let editingId = null;
let isRegister = false;

function showError(message) {
  const el = $('error');
  el.textContent = message;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 5000);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function setLoggedIn(loggedIn) {
  $('auth-section').classList.toggle('hidden', loggedIn);
  $('dashboard').classList.toggle('hidden', !loggedIn);
  $('user-area').classList.toggle('hidden', !loggedIn);
  if (loggedIn) $('user-name').textContent = userName;
}

// ---- Auth ----

$('auth-switch').addEventListener('click', () => {
  isRegister = !isRegister;
  $('auth-title').textContent = isRegister ? 'Register' : 'Log in';
  $('auth-submit').textContent = isRegister ? 'Register' : 'Log in';
  $('name-label').classList.toggle('hidden', !isRegister);
  $('auth-switch').textContent = isRegister
    ? 'Already have an account? Log in'
    : 'Need an account? Register';
});

$('auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = $('email').value.trim();
  const password = $('password').value;
  try {
    const path = isRegister ? '/api/auth/register' : '/api/auth/login';
    const body = isRegister
      ? { name: $('name').value.trim(), email, password }
      : { email, password };
    const data = await api(path, { method: 'POST', body: JSON.stringify(body) });
    token = data.token;
    userName = data.user.name;
    localStorage.setItem('et_token', token);
    localStorage.setItem('et_user', userName);
    setLoggedIn(true);
    await refreshAll();
  } catch (err) {
    showError(err.message);
  }
});

$('logout-btn').addEventListener('click', () => {
  token = null;
  userName = '';
  localStorage.removeItem('et_token');
  localStorage.removeItem('et_user');
  setLoggedIn(false);
});

// ---- Dashboard ----

function currentMonth() {
  return $('month-filter').value || new Date().toISOString().slice(0, 7);
}

async function refreshAll() {
  await Promise.all([loadSummary(), loadExpenses()]);
}

async function loadSummary() {
  const month = currentMonth();
  const data = await api(`/api/summary?month=${month}`);
  $('summary-month').textContent = `— ${data.month}`;
  $('summary-total').textContent = data.total.toFixed(2);
  const max = Math.max(...data.byCategory.map((c) => c.total), 0);
  $('category-bars').innerHTML = data.byCategory.length === 0
    ? '<p class="muted">No spending recorded this month yet.</p>'
    : data.byCategory.map((item) => `
        <div class="bar-row">
          <span class="bar-label">${item.category}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${max ? (item.total / max) * 100 : 0}%"></div></div>
          <span class="bar-value">${item.total.toFixed(2)} (${item.count})</span>
        </div>`).join('');
}

async function loadExpenses() {
  const month = currentMonth();
  const category = $('category-filter').value;
  const query = new URLSearchParams({ month });
  if (category) query.set('category', category);
  const data = await api(`/api/expenses?${query}`);
  $('empty-state').classList.toggle('hidden', data.expenses.length > 0);
  $('expense-list').innerHTML = data.expenses.map((expense) => `
    <li class="expense-item">
      <span class="expense-date">${expense.date}</span>
      <span class="expense-category">${expense.category}</span>
      <span class="expense-note">${escapeHtml(expense.note)}</span>
      <span class="expense-amount">${expense.amount.toFixed(2)}</span>
      <button class="btn btn-small" data-edit="${expense.id}">Edit</button>
      <button class="btn btn-small btn-danger" data-delete="${expense.id}">Delete</button>
    </li>`).join('');
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

$('expense-list').addEventListener('click', async (event) => {
  const editId = event.target.dataset.edit;
  const deleteId = event.target.dataset.delete;
  try {
    if (editId) {
      const data = await api(`/api/expenses/${editId}`);
      editingId = Number(editId);
      $('amount').value = data.expense.amount;
      $('category').value = data.expense.category;
      $('date').value = data.expense.date;
      $('note').value = data.expense.note;
      $('form-title').textContent = 'Edit expense';
      $('expense-submit').textContent = 'Save changes';
      $('expense-cancel').classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (deleteId) {
      if (!confirm('Delete this expense?')) return;
      await api(`/api/expenses/${deleteId}`, { method: 'DELETE' });
      await refreshAll();
    }
  } catch (err) {
    showError(err.message);
  }
});

$('expense-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = {
    amount: Number($('amount').value),
    category: $('category').value,
    date: $('date').value,
    note: $('note').value.trim(),
  };
  try {
    if (editingId) {
      await api(`/api/expenses/${editingId}`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      await api('/api/expenses', { method: 'POST', body: JSON.stringify(body) });
    }
    resetExpenseForm();
    await refreshAll();
  } catch (err) {
    showError(err.message);
  }
});

$('expense-cancel').addEventListener('click', resetExpenseForm);

function resetExpenseForm() {
  editingId = null;
  $('expense-form').reset();
  $('date').value = new Date().toISOString().slice(0, 10);
  $('form-title').textContent = 'Add expense';
  $('expense-submit').textContent = 'Add expense';
  $('expense-cancel').classList.add('hidden');
}

$('month-filter').addEventListener('change', () => refreshAll().catch(showError));
$('category-filter').addEventListener('change', () => loadExpenses().catch(showError));

// ---- Init ----

$('category').innerHTML = CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('');
$('category-filter').innerHTML =
  '<option value="">All categories</option>' +
  CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('');
$('month-filter').value = new Date().toISOString().slice(0, 7);
$('date').value = new Date().toISOString().slice(0, 10);

if (token) {
  setLoggedIn(true);
  refreshAll().catch(() => setLoggedIn(false)); // stale token -> back to login
} else {
  setLoggedIn(false);
}
