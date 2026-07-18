#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import {
  determineIngestionStatus,
  exitCodeForStatuses,
  isValidStatusTransition,
} from '../src/lib/ingestion/csv-ingest';

const cases: Array<{ name: string; run: () => void }> = [
  {
    name: '空rowsはpartialになる',
    run: () => assert.equal(determineIngestionStatus(0, 0), 'partial'),
  },
  {
    name: 'エラーなしはsuccessになる',
    run: () => assert.equal(determineIngestionStatus(3, 0), 'success'),
  },
  {
    name: '一部エラーはpartialになる',
    run: () => assert.equal(determineIngestionStatus(3, 1), 'partial'),
  },
  {
    name: '全行エラーはfailedになる',
    run: () => assert.equal(determineIngestionStatus(3, 3), 'failed'),
  },
  {
    name: '全件successなら終了コード0になる',
    run: () => assert.equal(exitCodeForStatuses(['success', 'success']), 0),
  },
  {
    name: 'partialが1件でもあれば終了コード1になる',
    run: () => assert.equal(exitCodeForStatuses(['success', 'partial']), 1),
  },
  {
    name: 'failedが1件でもあれば終了コード1になる',
    run: () => assert.equal(exitCodeForStatuses(['failed']), 1),
  },
  {
    name: 'runningから終了状態への遷移は妥当',
    run: () => assert.equal(isValidStatusTransition('running', 'success'), true),
  },
  {
    name: '終了状態からの再遷移は不正',
    run: () => assert.equal(isValidStatusTransition('success', 'failed'), false),
  },
];

for (const testCase of cases) {
  testCase.run();
  console.log(`ok - ${testCase.name}`);
}

console.log(`${cases.length}件のassertが成功しました`);
