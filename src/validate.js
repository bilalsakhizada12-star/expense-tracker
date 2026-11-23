// Small validation and formatting helpers shared by the routes.

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Strict YYYY-MM-DD check (rejects impossible dates like 2026-02-30).
function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidMonth(value) {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

// Turns "2026-11" into the [start, end) date range covering that month.
function monthRange(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  const start = `${year}-${String(monthNumber).padStart(2, '0')}-01`;
  const endYear = monthNumber === 12 ? year + 1 : year;
  const endMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
  return [start, end];
}

// Today's date as YYYY-MM-DD (UTC), for the "no future dates" rule.
function todayString() {
  return new Date().toISOString().slice(0, 10);
}

// Normalises a DATE column value to YYYY-MM-DD. node-postgres and pg-mem
// return dates as Date objects; use UTC getters because both parse a DATE
// as midnight UTC.
function formatDate(value) {
  if (value instanceof Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

// Normalises a NUMERIC column value (string from pg, number from pg-mem)
// to a JS number rounded to 2 decimal places.
function toMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

module.exports = {
  isValidEmail,
  isValidDateString,
  isValidMonth,
  monthRange,
  todayString,
  formatDate,
  toMoney,
};
