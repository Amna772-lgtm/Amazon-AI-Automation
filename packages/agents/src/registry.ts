import type { AgentDefinition } from './contract';

export class AgentRegistryError extends Error {}

/**
 * Central registry the orchestrator uses to look up agents and their hand-off chain.
 * Agents 2 and 3 register themselves here; new agents (pricing, competitor analysis,
 * supplier comparison, ...) only need a definition and a queue.
 */
export class AgentRegistry {
  private readonly agents = new Map<string, AgentDefinition<any, any, any>>();

  register(agent: AgentDefinition<any, any, any>): this {
    if (this.agents.has(agent.key)) throw new AgentRegistryError(`Agent "${agent.key}" already registered`);
    if (agent.consumes && !this.agents.has(agent.consumes)) {
      throw new AgentRegistryError(`Agent "${agent.key}" consumes unknown agent "${agent.consumes}"`);
    }
    this.agents.set(agent.key, agent);
    return this;
  }

  get(key: string): AgentDefinition<any, any, any> {
    const a = this.agents.get(key);
    if (!a) throw new AgentRegistryError(`Unknown agent "${key}"`);
    return a;
  }

  list(): AgentDefinition<any, any, any>[] {
    return [...this.agents.values()];
  }

  /** Agents that consume the approved output of `key`. */
  downstreamOf(key: string): AgentDefinition<any, any, any>[] {
    return this.list().filter((a) => a.consumes === key);
  }

  /** Validates settings against the agent's schema, filling defaults. */
  resolveSettings<S>(key: string, overrides: unknown): S {
    const agent = this.get(key);
    const merged = { ...(agent.defaultSettings as object), ...((overrides as object) ?? {}) };
    return agent.settingsSchema.parse(merged) as S;
  }
}

/** Keys of the built-in agents (implemented in Phases 3–4). */
export const AGENT_KEYS = {
  SELLER_CONTACTS: 'seller-contacts',
  EMAIL_OUTREACH: 'email-outreach',
} as const;
