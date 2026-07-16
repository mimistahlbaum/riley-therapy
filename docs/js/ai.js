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

import { ACTIVITIES, ZONES } from './zones.js';

const ENDPOINT = 'https://text.pollinations.ai/openai';
const MODEL = 'openai';
const HISTORY_LIMIT = 12; // recent turns kept for context
const TIMEOUT_MS = 30000;

const TOOL_LIST = Object.values(ACTIVITIES)
  .map((a) => `${a.id} (${a.name.toLowerCase()}: ${a.blurb.toLowerCase()})`)
  .join(', ');

const SYSTEM_PROMPT = `You are Riley, a small soft companion character in a feelings app for children aged about 5 to 11. You look like a little round white creature with a glowing heart on your chest.

How you talk:
- Warm, playful and gentle. Very simple words that a 7-year-old understands.
- 1 to 3 short sentences only. Never lecture.
- Always notice and validate the feeling first. No feeling is bad or wrong.
- You use the Zones of Regulation: blue (low and slow: sad, tired, sick, bored, lonely), green (calm, happy, focused, ready), yellow (engine running fast: worried, frustrated, silly, excited, nervous), red (very big feelings: angry, scared, overwhelmed).

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
 "zone": "blue, green, yellow or red if you can tell the child's zone from what they said, else null"}`;

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
    this.history.push({ role: 'user', content: text });
    this.history.push({ role: 'assistant', content: parsed.reply });
    if (this.history.length > HISTORY_LIMIT) {
      this.history.splice(0, this.history.length - HISTORY_LIMIT);
    }

    // Only pass through values the app knows how to handle safely.
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions
          .filter((sug) => typeof sug === 'string' && sug.trim())
          .map((sug) => sug.trim().slice(0, 60))
          .slice(0, 3)
      : [];
    const activity = ACTIVITIES[parsed.activity] ? parsed.activity : null;
    const zone = ZONES[parsed.zone] ? parsed.zone : null;
    return { reply: parsed.reply.trim().slice(0, 400), suggestions, activity, zone };
  }
}
