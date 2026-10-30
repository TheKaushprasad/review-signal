import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, csvToRecords, recordsToCSV, guessTextColumn } from '../src/lib/csv.js';
import {
  normalizeSentiment, normalizeCategory, clampScore, confidenceToLikeliness,
  SENTIMENTS, CATEGORIES, NPS_SCORE,
} from '../src/classifiers/schema.js';
import { classify as mockClassify } from '../src/classifiers/mock.js';

test('csv: parses quoted fields with commas and embedded newlines', () => {
  assert.deepEqual(parseCSV('a,b\n"x,y","line\n2"'), [['a', 'b'], ['x,y', 'line\n2']]);
});

test('csv: records roundtrip survives commas and quotes', () => {
  const { headers, records } = csvToRecords('author,review\n"ann","great, loved it"\nbob,ok');
  assert.deepEqual(headers, ['author', 'review']);
  assert.equal(records.length, 2);
  assert.equal(records[0].review, 'great, loved it');
  const again = csvToRecords(recordsToCSV(headers, records)).records;
  assert.equal(again[0].review, 'great, loved it');
  assert.equal(again[1].author, 'bob');
});

test('csv: guessTextColumn prefers review-like headers', () => {
  assert.equal(guessTextColumn(['id', 'comment', 'date']), 'comment');
  assert.equal(guessTextColumn(['title', 'feedback']), 'feedback');
  assert.equal(guessTextColumn(['foo', 'bar']), 'foo');
});

test('csv: guessTextColumn picks "Review" over lookalike "Reviewer"', () => {
  const headers = ['Reviewer', 'Rating (1-5)', 'Review'];
  const records = [{ 'Reviewer': 'Aditya K.', 'Rating (1-5)': '1', 'Review': 'The app crashes every time I open a quiz.' }];
  assert.equal(guessTextColumn(headers, records), 'Review');
});

test('csv: guessTextColumn falls back to the longest-text column by content', () => {
  const headers = ['who', 'stars', 'notes'];
  const records = [{ who: 'Al', stars: '5', notes: 'A long detailed note about the product experience here.' }];
  assert.equal(guessTextColumn(headers, records), 'notes');
});

test('schema: sentiment + category normalize to known values', () => {
  assert.equal(normalizeSentiment('POSITIVE'), 'positive');
  assert.equal(normalizeSentiment('whatever'), 'neutral');
  assert.equal(normalizeCategory('Payment'), 'Payment');
  assert.equal(normalizeCategory('nonsense'), 'Other');
});

test('schema: clampScore + confidenceToLikeliness stay in 1..5', () => {
  assert.equal(clampScore(9), 5);
  assert.equal(clampScore(-3), 1);
  assert.equal(confidenceToLikeliness(1), 5);
  assert.equal(confidenceToLikeliness(0.2), 1);
  assert.equal(confidenceToLikeliness(NaN), 3);
});

test('schema: NPS_SCORE covers levels 1..5', () => {
  assert.deepEqual(Object.values(NPS_SCORE).sort(), [1, 2, 3, 4, 5]);
});

test('mock classifier: every field is valid and in range', async () => {
  const out = await mockClassify([
    { id: '1', text: 'App crashes when I pay and got double charged' },
    { id: '2', text: 'The driver was so kind and helpful, loved it' },
    { id: '3', text: '' },
  ]);
  for (const r of out) {
    assert.ok(SENTIMENTS.includes(r.sentiment), `sentiment ${r.sentiment}`);
    assert.ok(CATEGORIES.includes(r.category), `category ${r.category}`);
    assert.ok(r.likeliness >= 1 && r.likeliness <= 5);
    assert.ok(r.nps >= 1 && r.nps <= 5);
    assert.ok(['yes', 'no'].includes(r.suggestion), `suggestion ${r.suggestion}`);
  }
  assert.equal(out[0].sentiment, 'negative');
  assert.equal(out[1].sentiment, 'positive');
});
