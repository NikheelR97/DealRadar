import { afterEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const queryOne = vi.fn();
vi.mock('../db/pool.js', () => ({
  query: (...a: unknown[]) => query(...a),
  queryOne: (...a: unknown[]) => queryOne(...a),
}));

const svc = await import('./items.service.js');

afterEach(() => vi.clearAllMocks());

const itemRow = {
  product_id: '7',
  url: 'https://koodoo.co.za/p',
  retailer_domain: 'koodoo.co.za',
  name: 'Widget',
  image_url: null,
  currency: 'ZAR',
  latest_price: '199.99',
  in_stock: true,
  last_checked_at: new Date('2026-05-01T00:00:00Z'),
};

describe('getPublicItems', () => {
  it('maps rows and never includes user identity', async () => {
    query.mockResolvedValueOnce([itemRow]);
    const [item] = await svc.getPublicItems(1, 20);
    expect(item).toEqual({
      productId: 7,
      url: 'https://koodoo.co.za/p',
      retailerDomain: 'koodoo.co.za',
      name: 'Widget',
      imageUrl: null,
      currency: 'ZAR',
      latestPrice: 199.99,
      inStock: true,
      lastCheckedAt: '2026-05-01T00:00:00.000Z',
    });
    expect(Object.keys(item)).not.toContain('user_id');
  });

  it('handles null price / null last_checked / clamps limit', async () => {
    query.mockResolvedValueOnce([{ ...itemRow, latest_price: null, in_stock: null, last_checked_at: null }]);
    const [item] = await svc.getPublicItems(0, 9999);
    expect(item.latestPrice).toBeNull();
    expect(item.inStock).toBe(false);
    expect(item.lastCheckedAt).toBeNull();
  });
});

describe('getPublicItemHistory', () => {
  it('maps history rows', async () => {
    query.mockResolvedValueOnce([
      { price: '10.00', in_stock: true, scrape_source: 'cheerio', checked_at: new Date('2026-05-02T00:00:00Z') },
    ]);
    const [rec] = await svc.getPublicItemHistory(7, 100);
    expect(rec).toEqual({ price: 10, inStock: true, scrapeSource: 'cheerio', checkedAt: '2026-05-02T00:00:00.000Z' });
  });
});

describe('getMyItems', () => {
  it('maps tracked rows including visibility and addedAt', async () => {
    query.mockResolvedValueOnce([
      { ...itemRow, tracked_item_id: '3', visibility: 'private', added_at: new Date('2026-05-03T00:00:00Z') },
    ]);
    const [item] = await svc.getMyItems(1, 1, 20);
    expect(item.trackedItemId).toBe(3);
    expect(item.visibility).toBe('private');
    expect(item.addedAt).toBe('2026-05-03T00:00:00.000Z');
  });
});

describe('addTrackedItem', () => {
  const validated = { url: 'https://koodoo.co.za/p', retailerDomain: 'koodoo.co.za' };

  it('throws conflict when the per-user cap is reached', async () => {
    queryOne.mockResolvedValueOnce({ n: '100' });
    await expect(svc.addTrackedItem(1, validated, 'private')).rejects.toMatchObject({ code: 'conflict' });
  });

  it('creates product + tracker when not yet tracked', async () => {
    queryOne.mockResolvedValueOnce({ n: '0' }); // count
    queryOne.mockResolvedValueOnce({ id: '7' }); // product upsert
    query.mockResolvedValueOnce([{ id: '55' }]); // tracker insert
    expect(await svc.addTrackedItem(1, validated, 'public')).toEqual({ trackedItemId: 55, created: true });
  });

  it('reuses the existing tracker on conflict (dedup)', async () => {
    queryOne.mockResolvedValueOnce({ n: '2' }); // count
    queryOne.mockResolvedValueOnce({ id: '7' }); // product upsert
    query.mockResolvedValueOnce([]); // insert -> conflict, no row
    queryOne.mockResolvedValueOnce({ id: '55' }); // existing select
    expect(await svc.addTrackedItem(1, validated, 'private')).toEqual({ trackedItemId: 55, created: false });
  });
});

describe('setVisibility', () => {
  it('succeeds when the row is owned', async () => {
    query.mockResolvedValueOnce([{ id: '3' }]);
    await expect(svc.setVisibility(1, 3, 'public')).resolves.toBeUndefined();
  });

  it('throws not_found when not owned', async () => {
    query.mockResolvedValueOnce([]);
    await expect(svc.setVisibility(1, 3, 'public')).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('deleteTrackedItem', () => {
  it('deactivates the product when the last tracker is removed', async () => {
    query.mockResolvedValueOnce([{ product_id: '7' }]); // delete returns row
    queryOne.mockResolvedValueOnce({ n: '0' }); // remaining trackers
    query.mockResolvedValueOnce([]); // update is_active
    await svc.deleteTrackedItem(1, 3);
    expect(query).toHaveBeenLastCalledWith('UPDATE products SET is_active = FALSE WHERE id = $1', [7]);
  });

  it('keeps the product active when other trackers remain', async () => {
    query.mockResolvedValueOnce([{ product_id: '7' }]);
    queryOne.mockResolvedValueOnce({ n: '2' });
    await svc.deleteTrackedItem(1, 3);
    expect(query).toHaveBeenCalledTimes(1); // no UPDATE issued
  });

  it('throws not_found when the tracker is not owned', async () => {
    query.mockResolvedValueOnce([]);
    await expect(svc.deleteTrackedItem(1, 3)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('getMyItemHistory', () => {
  it('returns history for an owned tracker', async () => {
    query.mockResolvedValueOnce([{ product_id: '7' }]); // ownership
    query.mockResolvedValueOnce([
      { price: null, in_stock: false, scrape_source: 'puppeteer', checked_at: new Date('2026-05-04T00:00:00Z') },
    ]);
    const [rec] = await svc.getMyItemHistory(1, 3, 50);
    expect(rec).toEqual({ price: null, inStock: false, scrapeSource: 'puppeteer', checkedAt: '2026-05-04T00:00:00.000Z' });
  });

  it('throws not_found when the tracker is not owned', async () => {
    query.mockResolvedValueOnce([]);
    await expect(svc.getMyItemHistory(1, 3, 50)).rejects.toMatchObject({ code: 'not_found' });
  });
});
