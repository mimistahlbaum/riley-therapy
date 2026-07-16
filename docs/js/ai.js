// Free-text AI chat for Riley, powered by Pollinations.AI — a free,
// no-signup, no-API-key text generation service that allows browser
// requests (https://text.pollinations.ai). The scripted check-in flow
// stays as the dependable backbone; this adds open conversation on top.
//
// Safety comes first:
//  - a deterministic crisis check runs BEFORE anything is sent online
//    (see looksLikeCrisis), so those messages get a fixed, safe answer;
//  - the system prompt locks Riley into short, child-safe replies;
//  - replies are structured JSON so the app stays in control of what
//    becomes tappable buttons, activities and zone colours;
//  - any network or parsing failure degrades to the scripted buttons.

import { ACTIVITIES, ZONES, feelingById } from './zones.js';

const ENDPOINT = 'https://text.pollinations.ai/openai';
const MODEL = 'openai';
const HISTORY_LIMIT = 12; // recent turns kept for context
const TIMEOUT_MS = 30000;

const TOOL_LIST = Object.values(ACTIVITIES)
  .map((a) => `${a.id} (${a.name.toLowerCase()}: ${a.blurb.toLowerCase()})`)
  .join(', ');

const FEELING_LIST = Object.values(ZONES)
  .flatMap((z) => z.feelings.map((f) => f.id))
  .join(', ');

const SYSTEM_PROMPT = `You are Riley, a small soft companion character in a feelings app for children aged about 5 to 11. You look like a little round white creature with a glowing heart on your chest. The heart glows in the colour of the child's zone.

How you talk:
- Warm, playful and gentle. Very simple words that a 7-year-old understands.
- 1 to 3 short sentences only. Never lecture.
- Always notice and validate the feeling first. No feeling is bad or wrong.
- You use the Zones of Regulation: blue (low and slow: sad, tired, sick, bored, lonely), green (calm, happy, focused, ready), yellow (engine running fast: worried, frustrated, silly, excited, nervous), red (very big feelings: angry, scared, overwhelmed).

How a conversation flows (follow these stages in order, one step per reply):
1. Welcome and feeling check-in: greet the child warmly and ask how they are feeling.
2. Zone identification: from what they tell you, help them name the feeling and gently work out which zone it sounds like. Ask a short follow-up question if you are not sure.
3. Zone confirmation: say which zone you think it is and ask if that feels right. Only set "zone" in your JSON once the child has told you a clear feeling or agreed with your guess. All zones are okay to be in.
4. Activity: invite them to try one matching tool by setting "activity" (the app will guide it step by step, so do not explain the steps yourself).
5. Body check: after an activity, ask how their body feels now.
6. Reflection: if they feel better, celebrate — they helped their own body, that is a superpower. If not, be kind: feelings need time, offer another tool, and remind them a trusted grown-up can help. Then they can always come back to say hello.
A child may jump in at any stage; meet them where they are instead of starting over.
The chat history may include earlier messages from the app's guided check-in and answer buttons the child tapped: treat them as part of this same conversation. Never restart the flow or repeat a stage that already happened. If the conversation has already begun, do not greet the child again or ask how they are feeling again — reply directly to what they just said, and never repeat an earlier reply word for word.

Safety rules (most important, never break these):
- You are a practice buddy, not a therapist or doctor. Never diagnose anything or give medical advice.
- If the child says they are hurt, unsafe, being hurt by someone, or want to hurt themselves or someone else: gently and clearly tell them to talk to a trusted grown-up right away (a parent, carer or teacher) and that they deserve help. Do not ask for details.
- Never ask for names, addresses, school names, photos or any personal information.
- Never talk about violence, scary stories, romance or grown-up topics. If asked, gently bring the chat back to feelings.
- Never say you are an AI, a language model or a computer. You are simply Riley.

Tools you may invite the child to try (use only these ids): ${TOOL_LIST}.

Reply ONLY with one JSON object and nothing else, in this exact shape:
{"reply": "what you say to the child",
 "suggestions": ["up to 3 very short answers the child could tap, 2-6 words each"],
 "activity": "a tool id from the list if you want to invite the child to try it, else null",
 "zone": "blue, green, yellow or red if you can tell the child's zone from what they said, else null",
 "feeling": "the closest feeling word if the child named or agreed to one (only these: ${FEELING_LIST}), else null"}`;

// Deterministic, client-side guard. These messages never go to the AI;
// the app answers them itself with a fixed supportive message.
const CRISIS_PATTERNS = [
  /suicid/i,
  /kill (myself|me|him|her|them|someone)/i,
  /hurt (myself|me)\b/i,
  /self[\s-]?harm/i,
  /cut (myself|my)/i,
  /want to die/i,
  /don'?t want to (live|be alive)/i,
  /abus/i,
  /\bhit(s|ting)? me\b/i,
  /touch(es|ed|ing)? me/i,
  /not safe at home/i,
];

export function looksLikeCrisis(text) {
  return CRISIS_PATTERNS.some((p) => p.test(text));
}

function parseReply(raw) {
  let s = String(raw || '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(s.slice(start, end + 1));
      if (obj && typeof obj.reply === 'string' && obj.reply.trim()) return obj;
    } catch { /* fall through to plain text */ }
  }
  // The model ignored the JSON instruction: treat the whole text as the
  // reply, as long as it doesn't look like broken JSON.
  if (s && !s.includes('{') && s.length < 500) return { reply: s };
  return null;
}

export class RileyAI {
  constructor() {
    this.history = [];
    this.failures = 0;
  }

  // Too many failures in a row: stop trying for this session so every
  // message isn't delayed by a doomed network call.
  get available() {
    return this.failures < 3 && typeof fetch !== 'undefined';
  }

  // Record a turn that happened outside free chat (Riley's scripted
  // messages, answer chips the child tapped) so the AI carries the same
  // conversation on instead of starting the check-in over from the top.
  note(role, text) {
    const content = String(text || '').trim();
    if (!content) return;
    const last = this.history[this.history.length - 1];
    if (last && last.role === role && last.content === content) return;
    this.history.push({ role, content });
    if (this.history.length > HISTORY_LIMIT) {
      this.history.splice(0, this.history.length - HISTORY_LIMIT);
    }
  }

  /**
   * Ask Riley for a reply to the child's message.
   * Resolves to {reply, suggestions, activity, zone} or null on failure.
   * Never throws.
   */
  async chat(text, currentZone = null) {
    if (!this.available) return null;
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...(currentZone
        ? [{ role: 'system', content: `The child's current zone in the app is ${currentZone}.` }]
        : []),
      ...this.history,
      { role: 'user', content: text },
    ];

    let raw;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: MODEL,
          messages,
          temperature: 0.7,
          referrer: 'riley-therapy',
        }),
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      raw = data?.choices?.[0]?.message?.content;
    } catch {
      this.failures += 1;
      return null;
    }

    const parsed = parseReply(raw);
    if (!parsed) {
      this.failures += 1;
      return null;
    }
    this.failures = 0;

    // Keep a short rolling history so Riley remembers the conversation.
    // The reply itself is noted when the app shows it, so every message —
    // scripted or AI — lands in the history exactly once, in order.
    this.note('user', text);

    // Only pass through values the app knows how to handle safely.
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions
          .filter((sug) => typeof sug === 'string' && sug.trim())
          .map((sug) => sug.trim().slice(0, 60))
          .slice(0, 3)
      : [];
    const activity = ACTIVITIES[parsed.activity] ? parsed.activity : null;
    const zone = ZONES[parsed.zone] ? parsed.zone : null;
    const feeling = feelingById(parsed.feeling) ? parsed.feeling : null;
    return { reply: parsed.reply.trim().slice(0, 400), suggestions, activity, zone, feeling };
  }
}
