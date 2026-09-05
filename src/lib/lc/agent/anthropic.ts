import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { AgentContext, AgentTurn, Incoming } from './engine';
import { agentGreeting, runAgentTurn } from './engine';
import type { AIProvider } from './provider';

/**
 * Anthropic-backed provider (server only). The deterministic engine still
 * decides WHAT happens — which price, which slots, whether to book or hand
 * off — and Claude only rewrites HOW it is said, in the configured tone and
 * the customer's language. Numbers, times and links are copied verbatim.
 */
export class AnthropicAIProvider implements AIProvider {
  readonly name = 'anthropic';
  private client: Anthropic;
  constructor(apiKey?: string) {
    this.client = new Anthropic(apiKey ? { apiKey } : undefined);
  }

  async greeting(ctx: AgentContext): Promise<AgentTurn> {
    return agentGreeting(ctx);
  }

  async reply(ctx: AgentContext, incoming: Incoming): Promise<AgentTurn> {
    const base = runAgentTurn(ctx, incoming);
    if (base.replies.length === 0) return base;
    try {
      const response = await this.client.messages.create({
        model: 'claude-opus-5',
        max_tokens: 1024,
        output_config: { effort: 'low' },
        system: [
          `You rewrite messages for ${ctx.settings.agentName}, the automated sales assistant of ${ctx.settings.businessName}.`,
          `Tone: ${ctx.settings.tone === 'custom' ? ctx.settings.customTone : ctx.settings.tone}. Language: ${base.language}.`,
          'Rules: keep every number, price (₪), time, date and line break exactly as given. Do not add offers, discounts or facts. Do not remove questions. Stay under 60 words per message.',
          `Never say: ${ctx.settings.neverSay.join('; ') || '(none)'}.`,
          'Return only the rewritten message text.',
        ].join('\n'),
        messages: [{ role: 'user', content: `Customer wrote: "${incoming.text}"\n\nDraft reply to rewrite:\n${base.replies.join('\n\n')}` }],
      });
      if (response.stop_reason === 'refusal') return base;
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      return text ? { ...base, replies: [text] } : base;
    } catch {
      return base;
    }
  }
}
