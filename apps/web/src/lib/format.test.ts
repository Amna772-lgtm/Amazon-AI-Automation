import { describe, expect, it } from 'vitest';
import { buildUrl } from './api';
import { formatBytes, humanizeAction, percent, relativeTime } from './format';

describe('format helpers', () => {
  it('formats byte sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(20 * 1024 * 1024)).toBe('20 MB');
    expect(formatBytes(-1)).toBe('—');
  });

  it('computes clamped percentages', () => {
    expect(percent(0, 0)).toBe(0);
    expect(percent(5, 10)).toBe(50);
    expect(percent(12, 10)).toBe(100);
  });

  it('renders relative times', () => {
    const now = Date.parse('2026-01-01T12:00:00Z');
    expect(relativeTime('2026-01-01T11:59:50Z', now)).toBe('just now');
    expect(relativeTime('2026-01-01T11:30:00Z', now)).toBe('30 min ago');
    expect(relativeTime('2026-01-01T06:00:00Z', now)).toBe('6 h ago');
    expect(relativeTime(null, now)).toBe('—');
  });

  it('humanizes audit actions', () => {
    expect(humanizeAction('member.role_changed')).toBe('Member role changed');
  });
});

describe('buildUrl', () => {
  it('drops empty query values', () => {
    expect(buildUrl('/files/1/rows', { page: 2, q: '', status: undefined, sort: 'asin' })).toBe('/api/files/1/rows?page=2&sort=asin');
    expect(buildUrl('/projects')).toBe('/api/projects');
  });
});
