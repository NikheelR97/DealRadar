/**
 * Shared, retailer-agnostic extraction helpers (Law 8 — no magic, every selector
 * documented at its call site). The strategy is **structured-data-first**: Shopify
 * (Koodoo), Magento (Wootware), the iStore CMS, and Takealot's SSR shell all emit a
 * schema.org `Product` JSON-LD block and/or OpenGraph price meta tags. Those are far
 * more stable than CSS class names, so each retailer reads them first and only falls
 * back to a documented CSS selector. Prices are ZAR throughout (HANDOVER §4).
 */
import type { CheerioAPI } from 'cheerio';

/** Normalised structured-data view of a product page. `null` fields = not found. */
export interface StructuredProduct {
  price: number | null;
  /** true = available, false = sold out, null = page stated no availability. */
  inStock: boolean | null;
  name: string | null;
  imageUrl: string | null;
  currency: string | null;
}

/**
 * Parse a price string to a number, or null. Guard-clause chain (HANDOVER Law 1).
 *
 * Assumes **ZAR formatting** (HANDOVER §4 — every retailer is South African):
 * `.` is the decimal point; spaces and commas are thousands separators. So
 * "R 12 999.00", "R12,999.99", and "12999" all parse. Input that is ambiguous or
 * malformed (e.g. dot used as a thousands separator → "1.299.00") yields `null`
 * rather than a wrong guess, so a bad value never silently enters price history.
 * European decimal-comma formatting is intentionally NOT supported.
 */
export function parsePrice(raw: string | null | undefined): number | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // Drop currency symbols/letters and thousands separators (spaces, commas).
  const cleaned = trimmed.replace(/[^\d.]/g, '');
  if (cleaned.length === 0) return null;
  if ((cleaned.match(/\./g)?.length ?? 0) > 1) return null; // >1 dot ⇒ malformed
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

/** schema.org availability → in-stock boolean (null when the value is absent). */
export function availabilityToInStock(availability: string | null | undefined): boolean | null {
  if (typeof availability !== 'string' || availability.length === 0) return null;
  const tail = availability.toLowerCase();
  if (tail.includes('outofstock') || tail.includes('soldout') || tail.includes('discontinued')) {
    return false;
  }
  return true;
}

/** First non-empty `content` attribute among the given meta selectors. */
export function readMetaContent($: CheerioAPI, selectors: readonly string[]): string | null {
  for (const selector of selectors) {
    const content = $(selector).first().attr('content');
    if (typeof content === 'string' && content.trim().length > 0) return content.trim();
  }
  return null;
}

/** Pull a price `offers` node out of one parsed JSON-LD value (object or @graph). */
function findProductNode(value: unknown): Record<string, unknown> | null {
  const candidates = Array.isArray(value) ? value : [value];
  for (const candidate of candidates) {
    if (candidate === null || typeof candidate !== 'object') continue;
    const node = candidate as Record<string, unknown>;
    const graph = node['@graph'];
    if (Array.isArray(graph)) {
      const fromGraph = findProductNode(graph);
      if (fromGraph) return fromGraph;
    }
    if (isProductType(node['@type'])) return node;
  }
  return null;
}

function isProductType(type: unknown): boolean {
  if (typeof type === 'string') return type.toLowerCase() === 'product';
  if (Array.isArray(type)) return type.some((t) => typeof t === 'string' && t.toLowerCase() === 'product');
  return false;
}

/** Read price/availability/name/image from the first `offers` entry of a Product node. */
function offerFields(node: Record<string, unknown>): StructuredProduct {
  const rawOffers = node['offers'];
  const offer = (Array.isArray(rawOffers) ? rawOffers[0] : rawOffers) as
    | Record<string, unknown>
    | undefined;
  const priceRaw = offer?.['price'] ?? offer?.['lowPrice'];
  const image = node['image'];
  return {
    price: parsePrice(priceRaw === undefined || priceRaw === null ? null : String(priceRaw)),
    inStock: availabilityToInStock(offer ? String(offer['availability'] ?? '') : ''),
    name: typeof node['name'] === 'string' ? node['name'] : null,
    imageUrl: typeof image === 'string' ? image : Array.isArray(image) ? String(image[0]) : null,
    currency: offer && typeof offer['priceCurrency'] === 'string' ? offer['priceCurrency'] : null,
  };
}

/**
 * Read the first schema.org `Product` JSON-LD block on the page. Returns null when
 * no parseable Product node exists; malformed JSON in one block is skipped, not fatal.
 */
export function readJsonLdProduct($: CheerioAPI): StructuredProduct | null {
  const blocks = $('script[type="application/ld+json"]').toArray();
  if (blocks.length === 0) return null;
  for (const block of blocks) {
    const text = $(block).contents().text().trim();
    if (text.length === 0) continue;
    const node = parseProductBlock(text);
    if (node) return offerFields(node);
  }
  return null;
}

function parseProductBlock(text: string): Record<string, unknown> | null {
  try {
    return findProductNode(JSON.parse(text));
  } catch {
    return null;
  }
}
