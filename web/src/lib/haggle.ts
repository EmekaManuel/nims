import type { ActionResponse, VoiceReply } from '../api';
import { sayReply, type Tone } from './speech';

/**
 * After the player wins a haggle, ask for the merchant's reaction and say it. Returns the line to show under the result,
 * or null if there isn't one (feature off, slow, or rejected), in which case the plain result simply stands.
 */
export async function merchantReaction(
  h: NonNullable<ActionResponse['haggled']>,
  ask: () => Promise<VoiceReply>,
  say: (text: string, audio: string | null, who: string, tone: Tone) => unknown = sayReply,
): Promise<string | null> {
  const reply = await ask().catch(() => null);
  if (!reply?.text) return null;
  say(reply.text, reply.audio, h.name, h.personality);
  return `${h.name}: \u201c${reply.text}\u201d`;
}
