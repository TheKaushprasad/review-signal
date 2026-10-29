import { config } from '../config.js';
import * as mock from './mock.js';
import * as jev from './jev.js';

const adapters = { mock, jev };

export function activeEngine() {
  return adapters[config.classifier] ? config.classifier : 'mock';
}

// Classify an array of { id, text, ... } reviews, returning the same objects
// enriched with { sentiment, likeliness, category, nps }.
export async function classifyReviews(reviews) {
  const adapter = adapters[activeEngine()];
  return adapter.classify(reviews);
}
