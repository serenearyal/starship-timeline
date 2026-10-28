import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LL2Dashboard, LL2Launch, SnapiArticle } from '../scripts/lib/sources.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');

export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
}

export const dashboardFixture = () => fixture('ll2-dashboard.json') as LL2Dashboard;
export const launchesFixture = () => (fixture('ll2-launches-detailed.json') as { results: LL2Launch[] }).results;
export const newsFixture = () => (fixture('snapi-articles.json') as { results: SnapiArticle[] }).results;
