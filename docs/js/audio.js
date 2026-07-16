// One shared AudioContext for Riley's voice. Browsers block audio until
// the first user gesture; once this context is resumed inside a tap it
// stays running for the whole session, so a line that took a while to
// synthesise can't be silently swallowed by the autoplay policy after
// the gesture expires.

let ctx = null;

export function getAudioContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

// Call from inside a user gesture. Safe to call repeatedly.
export async function resumeAudio() {
  const c = getAudioContext();
  if (!c) return null;
  if (c.state === 'suspended') {
    try { await c.resume(); } catch { /* still locked; a later gesture will retry */ }
  }
  return c;
}

export function audioUnlocked() {
  return !!ctx && ctx.state === 'running';
}
