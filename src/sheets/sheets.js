import { google } from 'googleapis';
import { config, sheetsEnabled } from '../config.js';

// Google Sheets read + write-back using a service account.
// The target spreadsheet must be shared (Editor) with the service account's
// email so that classification columns and user corrections can be written.

let _sheets = null;
function client() {
  if (!sheetsEnabled) throw new Error('Google Sheets is not configured (set GOOGLE_APPLICATION_CREDENTIALS).');
  if (_sheets) return _sheets;
  const scopes = ['https://www.googleapis.com/auth/spreadsheets'];
  const auth = config.google.credentialsJson
    ? new google.auth.GoogleAuth({ credentials: JSON.parse(config.google.credentialsJson), scopes })
    : new google.auth.GoogleAuth({ keyFile: config.google.credentialsPath, scopes });
  _sheets = google.sheets({ version: 'v4', auth });
  return _sheets;
}

// 0-based column index -> A1 column letters (0->A, 25->Z, 26->AA).
export function colLetter(n) {
  let s = '';
  n = n + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function resolveSheetName(spreadsheetId, sheetName) {
  if (sheetName) return sheetName;
  const meta = await client().spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  return meta.data.sheets?.[0]?.properties?.title || 'Sheet1';
}

// Read the full sheet. Returns header row + data rows with their 1-based row
// numbers so we can target write-backs precisely.
export async function readSheet(spreadsheetId, sheetName) {
  const name = await resolveSheetName(spreadsheetId, sheetName);
  const res = await client().spreadsheets.values.get({
    spreadsheetId,
    range: name,
    // FORMATTED_VALUE so dates arrive as display strings (e.g. 2026-10-18),
    // not Google's internal serial numbers.
    valueRenderOption: 'FORMATTED_VALUE',
  });
  const values = res.data.values || [];
  if (!values.length) throw new Error(`Sheet "${name}" is empty.`);
  const headers = values[0].map(h => String(h ?? '').trim());
  const rows = values.slice(1).map((v, i) => ({
    rowNumber: i + 2,       // +1 for header, +1 for 1-based
    values: v,
    record: Object.fromEntries(headers.map((h, j) => [h, v[j] ?? ''])),
  })).filter(r => r.values.some(c => String(c).trim() !== ''));
  return { sheetName: name, headers, rows };
}

const CLASS_HEADERS = ['Sentiment', 'Category', 'Likeliness (1-5)', 'NPS Impact (1-5)'];

function classRow(r) {
  return [r.sentiment, r.category, r.likeliness, r.nps];
}

// Write the four classification columns for every review, starting at
// `startColIndex`. Assumes data rows are contiguous from row 2.
export async function writeAllClassification(spreadsheetId, sheetName, startColIndex, reviews) {
  const sorted = [...reviews].sort((a, b) => a.rowNumber - b.rowNumber);
  const values = [CLASS_HEADERS, ...sorted.map(classRow)];
  const startL = colLetter(startColIndex);
  const endL = colLetter(startColIndex + CLASS_HEADERS.length - 1);
  const endRow = values.length; // header at row 1
  await client().spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!${startL}1:${endL}${endRow}`,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
  return { cells: values.length * CLASS_HEADERS.length };
}

// Write-back a single corrected review's four cells.
export async function writeOneClassification(spreadsheetId, sheetName, startColIndex, review) {
  const startL = colLetter(startColIndex);
  const endL = colLetter(startColIndex + CLASS_HEADERS.length - 1);
  await client().spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!${startL}${review.rowNumber}:${endL}${review.rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [classRow(review)] },
  });
  return { range: `${startL}${review.rowNumber}` };
}

export { CLASS_HEADERS };
