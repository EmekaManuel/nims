import { describe, it, expect } from 'vitest';
import { failureOf } from './relay';

describe('failureOf', () => {
  it('finds a failed inner receipt even when the outer transaction succeeded', () => {
    const res = {
      status: { SuccessValue: '' },
      receipts_outcome: [{ outcome: { status: { SuccessValue: '' } } }, { outcome: { status: { Failure: { ActionError: { kind: 'FunctionCallError' } } } } }],
    };
    expect(failureOf(res)).toContain('FunctionCallError');
  });
  it('is quiet when everything succeeded', () => {
    expect(failureOf({ status: { SuccessValue: '' }, receipts_outcome: [{ outcome: { status: { SuccessValue: '' } } }] })).toBeNull();
  });
});
