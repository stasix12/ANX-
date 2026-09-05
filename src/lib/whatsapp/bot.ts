import Anthropic from '@anthropic-ai/sdk';
import { getBotSettings, type BotSettings } from './settings';
import { SYSTEM_PROMPT, buildContextBlock } from './systemPrompt';
import { checkAvailability, isSlotFree, todayIsraelISO } from './calendar';
import { upsertLead } from './leadSync';
import {
  loadHistory,
  updateConversation,
  type Conversation,
  type ConversationStatus,
} from './store';

/**
 * The bot's brain: one inbound WhatsApp message in, one reply out. Claude
 * (claude-opus-5) runs a tool loop against the real calendar and CRM, under
 * the business's system prompt. The model never invents prices or slots —
 * prices come from crm_settings, slots from check_availability, and anything
 * it can't answer reliably ends in handoff_to_human.
 */

const MODEL = 'claude-opus-5';

const anthropic = new Anthropic();

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'check_availability',
    description:
      'בודק ביומן האמיתי של העסק אילו שעות פנויות לקביעת תור. חובה לקרוא לזה לפני שמציעים שעה ללקוח — אסור להציע שעה שלא הוחזרה כפנויה.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        from_date: {
          type: 'string',
          description: 'תאריך התחלה בפורמט YYYY-MM-DD. השתמש בתאריך של היום עבור "הכי מוקדם".',
        },
        days: { type: 'number', description: 'כמה ימים קדימה לבדוק (1–14).' },
      },
      required: ['from_date', 'days'],
    },
    strict: true,
  },
  {
    name: 'book_appointment',
    description:
      'קובע תור ביומן ויוצר/מעדכן את הליד ב-CRM. לקרוא רק אחרי שהלקוח אישר שעה ספציפית שנבדקה עם check_availability. מחזיר הצלחה או שהשעה נתפסה בינתיים.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        service: { type: 'string', description: 'השירות שנקבע, למשל "ניקוי ספה פינתית".' },
        city: { type: 'string', description: 'עיר הלקוח.' },
        address: { type: 'string', description: 'כתובת מלאה אם נמסרה, אחרת מחרוזת ריקה.' },
        customer_name: { type: 'string', description: 'שם הלקוח כפי שנמסר בשיחה.' },
        date: { type: 'string', description: 'תאריך התור, YYYY-MM-DD.' },
        time: { type: 'string', description: 'שעת התור, HH:MM, מתוך השעות הפנויות.' },
        price: {
          type: ['number', 'null'],
          description: 'המחיר שסוכם בש"ח, או null אם עוד לא נסגר מחיר.',
        },
        notes: { type: 'string', description: 'הערות חשובות מהשיחה (כתמים, קומה, חניה...).' },
      },
      required: ['service', 'city', 'address', 'customer_name', 'date', 'time', 'price', 'notes'],
    },
    strict: true,
  },
  {
    name: 'update_lead',
    description:
      'מעדכן את הליד ב-CRM ואת סטטוס השיחה בלי לקבוע תור — אחרי שנשלחה הצעת מחיר, כשממתינים לתמונה, כשהלקוח לא רלוונטי וכו׳. לקרוא כשנודע פרט חדש ומשמעותי.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: {
          type: 'string',
          enum: [
            'new',
            'awaiting_photo',
            'quote_sent',
            'awaiting_reply',
            'interested',
            'not_relevant',
          ],
          description: 'סטטוס הליד החדש.',
        },
        customer_name: { type: 'string', description: 'שם הלקוח, או מחרוזת ריקה אם לא ידוע.' },
        city: { type: 'string', description: 'עיר, או מחרוזת ריקה אם לא ידועה.' },
        service: { type: 'string', description: 'השירות המבוקש, או מחרוזת ריקה.' },
        price: { type: ['number', 'null'], description: 'המחיר שהוצע בש"ח, או null.' },
        notes: { type: 'string', description: 'הערות חשובות מהשיחה.' },
        language: {
          type: 'string',
          description: 'שפת השיחה שזוהתה: "he", "ru" או קוד שפה אחר.',
        },
      },
      required: ['status', 'customer_name', 'city', 'service', 'price', 'notes', 'language'],
    },
    strict: true,
  },
  {
    name: 'handoff_to_human',
    description:
      'מעביר את השיחה לנציג אנושי ומשתיק את הבוט בשיחה הזו. לקרוא כשהלקוח מבקש אדם, בתלונה משמעותית, במחלוקת על תשלום, בבקשת הנחה חריגה, או כשאין מידע אמין לענות.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        reason: { type: 'string', description: 'סיבת ההעברה, בשביל הנציג שיקרא את השיחה.' },
      },
      required: ['reason'],
    },
    strict: true,
  },
];

interface ToolOutcome {
  result: string;
  /** Set when the tool decides the conversation's pipeline status. */
  status?: ConversationStatus;
}

async function runTool(
  name: string,
  input: Record<string, unknown>,
  conversation: Conversation,
  settings: BotSettings,
): Promise<ToolOutcome> {
  switch (name) {
    case 'check_availability': {
      const days = await checkAvailability(
        settings,
        String(input.from_date),
        Number(input.days) || 3,
      );
      return { result: JSON.stringify({ today: todayIsraelISO(), availability: days }) };
    }

    case 'book_appointment': {
      const date = String(input.date);
      const time = String(input.time);
      if (!(await isSlotFree(settings, date, time))) {
        return {
          result: JSON.stringify({
            ok: false,
            error: 'השעה הזו כבר לא פנויה. בדוק שוב זמינות והצע ללקוח שעה אחרת.',
          }),
        };
      }
      const endMinutes =
        Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + settings.slotMinutes;
      const jobTimeEnd = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
      await upsertLead(conversation, 'booked', {
        name: String(input.customer_name ?? ''),
        city: String(input.city ?? ''),
        address: String(input.address ?? ''),
        service: String(input.service ?? ''),
        // null = no price agreed yet — leave whatever the lead already has.
        price: input.price === null ? undefined : Number(input.price),
        notes: String(input.notes ?? ''),
        jobDate: date,
        jobTime: time,
        jobTimeEnd,
      });
      return { result: JSON.stringify({ ok: true, date, time }), status: 'booked' };
    }

    case 'update_lead': {
      const status = String(input.status) as ConversationStatus;
      await upsertLead(conversation, status, {
        name: String(input.customer_name ?? '') || undefined,
        city: String(input.city ?? '') || undefined,
        service: String(input.service ?? '') || undefined,
        price: input.price === null ? undefined : Number(input.price),
        notes: String(input.notes ?? '') || undefined,
      });
      const language = String(input.language ?? '');
      if (language && language !== conversation.language) {
        await updateConversation(conversation.id, { language });
        conversation.language = language;
      }
      return { result: JSON.stringify({ ok: true }), status };
    }

    case 'handoff_to_human': {
      await updateConversation(conversation.id, { humanTakeover: true });
      await upsertLead(conversation, 'needs_human', {
        notes: `דורש נציג: ${String(input.reason ?? '')}`,
      });
      return { result: JSON.stringify({ ok: true }), status: 'needs_human' };
    }

    default:
      return { result: JSON.stringify({ ok: false, error: `כלי לא מוכר: ${name}` }) };
  }
}

export interface InboundMessage {
  /** WhatsApp message id — excluded from history so it isn't sent twice. */
  wamid: string;
  text: string;
  image?: { base64: string; mimeType: string };
}

/**
 * Answers one customer message. Returns the reply text to send, or null
 * when the bot should stay silent (human takeover).
 */
export async function generateReply(
  conversation: Conversation,
  inbound: InboundMessage,
): Promise<string | null> {
  if (conversation.humanTakeover) return null;

  const settings = await getBotSettings();
  const history = await loadHistory(conversation.id, inbound.wamid);

  const currentContent: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (inbound.image) {
    currentContent.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: inbound.image.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data: inbound.image.base64,
      },
    });
  }
  currentContent.push({ type: 'text', text: inbound.text || '(הודעה ריקה)' });

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...(history as Anthropic.Beta.BetaMessageParam[]),
    { role: 'user', content: currentContent },
  ];

  const request = {
    model: MODEL,
    max_tokens: 16000,
    // Safety net: if claude-opus-5 declines a message (stop_reason
    // "refusal"), the API retries it server-side on claude-opus-4-8 within
    // the same call instead of leaving the customer unanswered.
    betas: ['server-side-fallback-2026-06-01' as const],
    fallbacks: [{ model: 'claude-opus-4-8' }],
    system: [
      {
        type: 'text' as const,
        text: SYSTEM_PROMPT,
        // The stable prefix — cached across every conversation and turn.
        cache_control: { type: 'ephemeral' as const },
      },
      {
        type: 'text' as const,
        text: buildContextBlock(
          settings,
          { waId: conversation.waId, profileName: conversation.profileName },
          new Date(),
        ),
      },
    ],
    tools: TOOLS,
  };

  // Manual tool loop — bounded so a confused model can't spin forever.
  for (let round = 0; round < 8; round++) {
    const response = await anthropic.beta.messages.create({ ...request, messages });

    if (response.stop_reason === 'refusal') {
      await updateConversation(conversation.id, { humanTakeover: true, status: 'needs_human' });
      return 'אני מעדיף שנציג יענה לך על זה כמו שצריך. מעביר את השיחה לטיפול אנושי 🙏';
    }

    if (response.stop_reason !== 'tool_use') {
      const text = response.content
        .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();
      return text || null;
    }

    // Echo the assistant turn back verbatim (thinking blocks included), then
    // answer every tool_use in ONE user message.
    messages.push({ role: 'assistant', content: response.content });
    const toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      let outcome: ToolOutcome;
      try {
        outcome = await runTool(
          block.name,
          block.input as Record<string, unknown>,
          conversation,
          settings,
        );
      } catch (error) {
        outcome = {
          result: JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : 'tool failed',
          }),
        };
      }
      if (outcome.status) {
        await updateConversation(conversation.id, { status: outcome.status });
        conversation.status = outcome.status;
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: outcome.result,
      });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  // Loop budget exhausted — bail out to a human rather than guess.
  await updateConversation(conversation.id, { humanTakeover: true, status: 'needs_human' });
  return 'אני מעביר את זה לנציג שיחזור אליך עם תשובה מסודרת 🙏';
}
