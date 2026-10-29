// Minimal, dependency-free CSV parser/serializer that handles quoted fields,
// escaped quotes (""), and newlines inside quotes. Good enough for review exports.

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  text = text.replace(/^﻿/, ''); // strip BOM

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Turn CSV text into { headers, records } where each record is a plain object.
export function csvToRecords(text) {
  const rows = parseCSV(text).filter(r => r.some(c => String(c).trim() !== ''));
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].map(h => String(h).trim());
  const records = rows.slice(1).map(r => {
    const o = {};
    headers.forEach((h, i) => { o[h] = r[i] ?? ''; });
    return o;
  });
  return { headers, records };
}

function escapeField(v) {
  v = v == null ? '' : String(v);
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function recordsToCSV(headers, records) {
  const lines = [headers.map(escapeField).join(',')];
  for (const rec of records) {
    lines.push(headers.map(h => escapeField(rec[h])).join(','));
  }
  return lines.join('\r\n');
}

// Pick the most likely free-text review column from a set of headers.
export function guessTextColumn(headers) {
  const prefer = ['review', 'comment', 'feedback', 'text', 'body', 'message', 'content', 'response'];
  const lower = headers.map(h => h.toLowerCase());
  for (const p of prefer) {
    const i = lower.findIndex(h => h.includes(p));
    if (i !== -1) return headers[i];
  }
  return headers[0];
}

export function guessColumn(headers, candidates) {
  const lower = headers.map(h => h.toLowerCase());
  for (const c of candidates) {
    const i = lower.findIndex(h => h.includes(c));
    if (i !== -1) return headers[i];
  }
  return null;
}
