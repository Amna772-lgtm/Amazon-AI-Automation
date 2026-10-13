/**
 * Offline Amazon product URL parsing: marketplace detection, ASIN extraction and
 * canonicalisation. Makes no network requests — short links (amzn.to / a.co) cannot
 * be resolved offline and are reported as such instead of being guessed.
 */

export interface Marketplace {
  /** ISO-like marketplace code, e.g. US, GB, DE */
  code: string;
  /** Registrable Amazon domain without "www.", e.g. amazon.co.uk */
  domain: string;
  name: string;
  currency: string;
  /** Keepa "domain" id, null where Keepa does not cover the marketplace. */
  keepaDomainId: number | null;
}

export const MARKETPLACES: Marketplace[] = [
  { code: 'US', domain: 'amazon.com', name: 'United States', currency: 'USD', keepaDomainId: 1 },
  { code: 'GB', domain: 'amazon.co.uk', name: 'United Kingdom', currency: 'GBP', keepaDomainId: 2 },
  { code: 'DE', domain: 'amazon.de', name: 'Germany', currency: 'EUR', keepaDomainId: 3 },
  { code: 'FR', domain: 'amazon.fr', name: 'France', currency: 'EUR', keepaDomainId: 4 },
  { code: 'JP', domain: 'amazon.co.jp', name: 'Japan', currency: 'JPY', keepaDomainId: 5 },
  { code: 'CA', domain: 'amazon.ca', name: 'Canada', currency: 'CAD', keepaDomainId: 6 },
  { code: 'IT', domain: 'amazon.it', name: 'Italy', currency: 'EUR', keepaDomainId: 8 },
  { code: 'ES', domain: 'amazon.es', name: 'Spain', currency: 'EUR', keepaDomainId: 9 },
  { code: 'IN', domain: 'amazon.in', name: 'India', currency: 'INR', keepaDomainId: 10 },
  { code: 'MX', domain: 'amazon.com.mx', name: 'Mexico', currency: 'MXN', keepaDomainId: 11 },
  { code: 'BR', domain: 'amazon.com.br', name: 'Brazil', currency: 'BRL', keepaDomainId: 12 },
  { code: 'AU', domain: 'amazon.com.au', name: 'Australia', currency: 'AUD', keepaDomainId: null },
  { code: 'NL', domain: 'amazon.nl', name: 'Netherlands', currency: 'EUR', keepaDomainId: null },
  { code: 'SE', domain: 'amazon.se', name: 'Sweden', currency: 'SEK', keepaDomainId: null },
  { code: 'PL', domain: 'amazon.pl', name: 'Poland', currency: 'PLN', keepaDomainId: null },
  { code: 'BE', domain: 'amazon.com.be', name: 'Belgium', currency: 'EUR', keepaDomainId: null },
  { code: 'TR', domain: 'amazon.com.tr', name: 'Turkey', currency: 'TRY', keepaDomainId: null },
  { code: 'AE', domain: 'amazon.ae', name: 'United Arab Emirates', currency: 'AED', keepaDomainId: null },
  { code: 'SA', domain: 'amazon.sa', name: 'Saudi Arabia', currency: 'SAR', keepaDomainId: null },
  { code: 'EG', domain: 'amazon.eg', name: 'Egypt', currency: 'EGP', keepaDomainId: null },
  { code: 'SG', domain: 'amazon.sg', name: 'Singapore', currency: 'SGD', keepaDomainId: null },
];

const BY_DOMAIN = new Map(MARKETPLACES.map((m) => [m.domain, m]));
const SHORT_LINK_HOSTS = new Set(['amzn.to', 'amzn.eu', 'amzn.asia', 'a.co']);

export const ASIN_RE = /^[A-Z0-9]{10}$/;

// Path shapes that carry an ASIN. Order matters: most specific first.
const ASIN_PATH_PATTERNS: RegExp[] = [
  /\/dp\/(?:product\/)?([A-Z0-9]{10})(?:[/?#]|$)/i,
  /\/gp\/product\/(?:glance\/)?([A-Z0-9]{10})(?:[/?#]|$)/i,
  /\/gp\/aw\/d\/([A-Z0-9]{10})(?:[/?#]|$)/i,
  /\/gp\/offer-listing\/([A-Z0-9]{10})(?:[/?#]|$)/i,
  /\/exec\/obidos\/(?:tg\/detail\/-\/|ASIN\/)([A-Z0-9]{10})(?:[/?#]|$)/i,
  /\/o\/ASIN\/([A-Z0-9]{10})(?:[/?#]|$)/i,
  /\/product-reviews\/([A-Z0-9]{10})(?:[/?#]|$)/i,
];

export type AmazonUrlParseResult =
  | {
      ok: true;
      asin: string;
      marketplace: Marketplace;
      canonicalUrl: string;
      originalUrl: string;
    }
  | {
      ok: false;
      reason: AmazonUrlError;
      message: string;
      originalUrl: string;
    };

export type AmazonUrlError =
  | 'EMPTY'
  | 'NOT_A_URL'
  | 'NOT_AMAZON'
  | 'UNSUPPORTED_MARKETPLACE'
  | 'SHORT_LINK'
  | 'NO_ASIN';

const fail = (reason: AmazonUrlError, message: string, originalUrl: string): AmazonUrlParseResult => ({
  ok: false,
  reason,
  message,
  originalUrl,
});

/** Returns the marketplace for a hostname (with or without www./smile./m.), or null. */
export function marketplaceForHost(hostname: string): Marketplace | null {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  for (const prefix of ['www.', 'smile.', 'm.', '']) {
    if (prefix && !host.startsWith(prefix)) continue;
    const found = BY_DOMAIN.get(host.slice(prefix.length));
    if (found) return found;
  }
  return null;
}

/** True when a raw cell value looks like it references Amazon at all. */
export function looksLikeAmazonReference(value: string): boolean {
  return /(^|[\s/.@])(amazon\.[a-z.]{2,10}|amzn\.(to|eu|asia)|a\.co)(\/|$|\s|\?)/i.test(value);
}

export function parseAmazonUrl(input: string | null | undefined): AmazonUrlParseResult {
  const originalUrl = (input ?? '').trim();
  if (!originalUrl) return fail('EMPTY', 'Empty value', originalUrl);

  let candidate = originalUrl;
  if (!/^https?:\/\//i.test(candidate)) {
    // Accept "www.amazon.com/dp/..." and "amazon.de/..." without a scheme.
    if (/^(www\.)?[a-z0-9.-]+\.[a-z]{2,}\//i.test(candidate)) candidate = `https://${candidate}`;
    else return fail('NOT_A_URL', 'Value is not a URL', originalUrl);
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return fail('NOT_A_URL', 'Value is not a valid URL', originalUrl);
  }

  const host = url.hostname.toLowerCase();
  if (SHORT_LINK_HOSTS.has(host) || SHORT_LINK_HOSTS.has(host.replace(/^www\./, ''))) {
    return fail('SHORT_LINK', 'Short links must be expanded to the full product URL before import', originalUrl);
  }

  const marketplace = marketplaceForHost(host);
  if (!marketplace) {
    return /(^|\.)amazon\.[a-z.]+$/.test(host)
      ? fail('UNSUPPORTED_MARKETPLACE', `Unsupported Amazon marketplace: ${host}`, originalUrl)
      : fail('NOT_AMAZON', `Not an Amazon URL: ${host}`, originalUrl);
  }

  const asin = extractAsin(url);
  if (!asin) return fail('NO_ASIN', 'No product ASIN found in URL', originalUrl);

  return {
    ok: true,
    asin,
    marketplace,
    canonicalUrl: `https://www.${marketplace.domain}/dp/${asin}`,
    originalUrl,
  };
}

function extractAsin(url: URL): string | null {
  const path = decodeURIComponent(url.pathname);
  for (const re of ASIN_PATH_PATTERNS) {
    const m = path.match(re);
    if (m) return m[1].toUpperCase();
  }
  const q = url.searchParams.get('asin') ?? url.searchParams.get('ASIN');
  if (q && ASIN_RE.test(q.toUpperCase())) return q.toUpperCase();
  return null;
}

/** Stable key used for de-duplication: same ASIN on the same marketplace. */
export function productKey(marketplaceCode: string, asin: string): string {
  return `${marketplaceCode}:${asin.toUpperCase()}`;
}
