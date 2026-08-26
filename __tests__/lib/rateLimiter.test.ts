import { describe, it, expect, vi, beforeEach } from 'vitest';

// checkRateLimit is now MongoDB-backed and async: it upserts a per-identifier counter via
// findOneAndUpdate ($inc count, $setOnInsert resetTime) filtered to the unexpired window, and
// compares count against maxRequests. Window expiry is handled by a Mongo TTL index on resetTime,
// so it is not unit-testable here — these tests cover the allow/block math, the query shape, and
// the fail-open behaviour. We mock the DB connection so findOneAndUpdate is fully controllable.
const { findOneAndUpdate } = vi.hoisted(() => ({ findOneAndUpdate: vi.fn() }));

vi.mock('@/lib/mongodb', () => ({
  connectToDB: vi.fn().mockResolvedValue({
    models: { RateLimit: { findOneAndUpdate } },
    model: vi.fn(() => ({ findOneAndUpdate })),
  }),
}));

import { checkRateLimit } from '@/lib/rateLimiter';

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows the first request and reports the remaining quota', async () => {
    const resetTime = new Date(Date.now() + 60000);
    findOneAndUpdate.mockResolvedValue({ count: 1, resetTime });

    const result = await checkRateLimit('ip-127.0.0.1', 60000, 5);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4); // 5 - 1
    expect(result.resetTime).toBe(resetTime.getTime());
  });

  it('reports zero remaining on the request that reaches the limit', async () => {
    const resetTime = new Date(Date.now() + 60000);
    findOneAndUpdate.mockResolvedValue({ count: 3, resetTime });

    const result = await checkRateLimit('ip-test-2', 60000, 3);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0); // 3 - 3
  });

  it('blocks the request once the count exceeds the limit', async () => {
    const resetTime = new Date(Date.now() + 60000);
    findOneAndUpdate.mockResolvedValue({ count: 3, resetTime });

    const result = await checkRateLimit('ip-test-3', 60000, 2);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('scopes the counter to the identifier and only counts an unexpired window', async () => {
    findOneAndUpdate.mockResolvedValue({ count: 1, resetTime: new Date(Date.now() + 60000) });

    await checkRateLimit('user-a', 60000, 1);

    const [filter, update, options] = findOneAndUpdate.mock.calls[0];
    expect(filter.identifier).toBe('user-a');
    expect(filter.resetTime).toEqual({ $gt: expect.any(Date) }); // ignore already-expired windows
    expect(update.$inc).toEqual({ count: 1 });
    expect(update.$setOnInsert).toHaveProperty('resetTime');
    expect(options).toMatchObject({ upsert: true, new: true });
  });

  it('fails open when the datastore errors (never lock users out on infra failure)', async () => {
    findOneAndUpdate.mockRejectedValue(new Error('db down'));

    const result = await checkRateLimit('user-b', 60000, 1);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });
});
