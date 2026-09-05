import type { AgentContext, AgentTurn, Incoming } from './engine';
import { agentGreeting, runAgentTurn } from './engine';

/**
 * AI provider adapter. The mock provider is the deterministic engine; a real
 * LLM provider (see `anthropic.ts`, server-only) keeps the engine's decisions
 * — prices, slots, booking, hand-off — and only rephrases the wording.
 */
export interface AIProvider {
  readonly name: string;
  greeting(ctx: AgentContext): Promise<AgentTurn>;
  reply(ctx: AgentContext, incoming: Incoming): Promise<AgentTurn>;
}

export class MockAIProvider implements AIProvider {
  readonly name = 'mock';
  async greeting(ctx: AgentContext): Promise<AgentTurn> {
    return agentGreeting(ctx);
  }
  async reply(ctx: AgentContext, incoming: Incoming): Promise<AgentTurn> {
    return runAgentTurn(ctx, incoming);
  }
}

export const mockAIProvider = new MockAIProvider();
