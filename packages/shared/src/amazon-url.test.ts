import { describe, expect, it } from 'vitest';
import { looksLikeAmazonReference, marketplaceForHost, parseAmazonUrl, productKey } from './amazon-url';

describe('parseAmazonUrl', () => {
  it.each([
    ['https://www.amazon.com/Some-Product-Name/dp/B08N5WRWNW/ref=sr_1_1?keywords=x', 'US', 'B08N5WRWNW'],
    ['https://amazon.co.uk/dp/b07xjpy6zq', 'GB', 'B07XJPY6ZQ'],
    ['https://www.amazon.de/gp/product/B0C1234567?th=1', 'DE', 'B0C1234567'],
    ['https://www.amazon.in/gp/aw/d/B09ABCDEFG', 'IN', 'B09ABCDEFG'],
    ['http://smile.amazon.com/dp/B000000001', 'US', 'B000000001'],
    ['www.amazon.ae/dp/B0AAAAAAAA', 'AE', 'B0AAAAAAAA'],
    ['https://www.amazon.com/product-reviews/B0BBBBBBBB/', 'US', 'B0BBBBBBBB'],
    ['https://www.amazon.co.jp/exec/obidos/ASIN/4062938421', 'JP', '4062938421'],
    ['https://www.amazon.com.au/s?k=x&asin=B0CCCCCCCC', 'AU', 'B0CCCCCCCC'],
  ])('parses %s', (input, code, asin) => {
    const r = parseAmazonUrl(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.marketplace.code).toBe(code);
    expect(r.asin).toBe(asin);
    expect(r.canonicalUrl).toBe(`https://www.${r.marketplace.domain}/dp/${asin}`);
  });

  it.each([
    ['', 'EMPTY'],
    ['   ', 'EMPTY'],
    ['not a url', 'NOT_A_URL'],
    ['https://www.ebay.com/itm/123', 'NOT_AMAZON'],
    ['https://fakeamazon.com/dp/B08N5WRWNW', 'NOT_AMAZON'],
    ['https://www.amazon.xyz/dp/B08N5WRWNW', 'UNSUPPORTED_MARKETPLACE'],
    ['https://amzn.to/3abcDEF', 'SHORT_LINK'],
    ['https://www.amazon.com/s?k=headphones', 'NO_ASIN'],
    ['https://www.amazon.com/dp/B08N5', 'NO_ASIN'],
  ])('rejects %j with %s', (input, reason) => {
    const r = parseAmazonUrl(input);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe(reason);
  });

  it('treats query-string and trailing variations of the same product as the same key', () => {
    const a = parseAmazonUrl('https://www.amazon.com/dp/B08N5WRWNW?psc=1');
    const b = parseAmazonUrl('https://amazon.com/Name/dp/b08n5wrwnw/');
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(productKey(a.marketplace.code, a.asin)).toBe(productKey(b.marketplace.code, b.asin));
  });

  it('keeps the same ASIN on different marketplaces distinct', () => {
    const a = parseAmazonUrl('https://www.amazon.com/dp/B08N5WRWNW');
    const b = parseAmazonUrl('https://www.amazon.de/dp/B08N5WRWNW');
    if (!a.ok || !b.ok) throw new Error('expected ok');
    expect(productKey(a.marketplace.code, a.asin)).not.toBe(productKey(b.marketplace.code, b.asin));
  });
});

describe('helpers', () => {
  it('marketplaceForHost handles subdomains and unknown hosts', () => {
    expect(marketplaceForHost('www.amazon.co.uk')?.code).toBe('GB');
    expect(marketplaceForHost('m.amazon.de')?.code).toBe('DE');
    expect(marketplaceForHost('amazon.example.com')).toBeNull();
  });

  it('looksLikeAmazonReference detects Amazon mentions in free text', () => {
    expect(looksLikeAmazonReference('see https://www.amazon.com/dp/B08N5WRWNW')).toBe(true);
    expect(looksLikeAmazonReference('amzn.to/abc')).toBe(true);
    expect(looksLikeAmazonReference('Amazon Basics cable')).toBe(false);
    expect(looksLikeAmazonReference('https://example.com')).toBe(false);
  });
});
