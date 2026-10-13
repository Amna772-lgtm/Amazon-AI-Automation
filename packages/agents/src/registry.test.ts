import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { actual, estimated, unavailable, type AgentDefinition } from './contract';
import { AgentRegistry } from './registry';

const makeAgent = (key: string, consumes?: string): AgentDefinition<{ n: number }, { ok: boolean }, { limit: number }> => ({
  key,
  name: key,
  version: '0.0.1',
  description: 'test agent',
  queue: `q-${key}`,
  consumes,
  inputSchema: z.object({ n: z.number() }),
  outputSchema: z.object({ ok: z.boolean() }),
  settingsSchema: z.object({ limit: z.number().int().min(1) }),
  defaultSettings: { limit: 10 },
  async run() {
    return { status: 'completed', output: { ok: true } };
  },
});

describe('AgentRegistry', () => {
  it('registers agents and resolves the hand-off chain', () => {
    const r = new AgentRegistry().register(makeAgent('a')).register(makeAgent('b', 'a'));
    expect(r.downstreamOf('a').map((x) => x.key)).toEqual(['b']);
    expect(() => r.register(makeAgent('a'))).toThrow(/already/);
    expect(() => r.register(makeAgent('c', 'missing'))).toThrow(/unknown/);
    expect(() => r.get('zzz')).toThrow(/Unknown/);
  });

  it('merges and validates settings', () => {
    const r = new AgentRegistry().register(makeAgent('a'));
    expect(r.resolveSettings('a', {})).toEqual({ limit: 10 });
    expect(r.resolveSettings('a', { limit: 3 })).toEqual({ limit: 3 });
    expect(() => r.resolveSettings('a', { limit: 0 })).toThrow();
  });
});

describe('sourced values', () => {
  it('distinguishes actual, estimated and unavailable data', () => {
    expect(actual(5, 'keepa')).toMatchObject({ value: 5, kind: 'ACTUAL', source: 'keepa' });
    expect(estimated(400, 'keepa', 1.7)).toMatchObject({ kind: 'ESTIMATED', confidence: 1 });
    expect(unavailable('keepa')).toMatchObject({ value: null, kind: 'UNAVAILABLE' });
  });
});
