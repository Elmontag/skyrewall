import { query } from '@/lib/db';
import { isValidDid } from '@/lib/session';

export type BlockEventAction = 'block' | 'mute';
export type BlockEventSource = 'manual' | 'subscription' | 'reblock' | 'interaction' | 'imported';

const VALID_ACTIONS: BlockEventAction[] = ['block', 'mute'];
const VALID_SOURCES: BlockEventSource[] = ['manual', 'subscription', 'reblock', 'interaction', 'imported'];

function assertBlockEventInput(
  userId: string,
  dids: string[],
  action: BlockEventAction,
  source: BlockEventSource
) {
  if (!userId) throw new Error('Missing userId for block event logging');
  if (!VALID_ACTIONS.includes(action)) throw new Error('Invalid block event action');
  if (!VALID_SOURCES.includes(source)) throw new Error('Invalid block event source');
  if (!dids.every(isValidDid)) throw new Error('Invalid DID in block event logging');
}

export async function logBlockEvents(
  userId: string | null | undefined,
  dids: string[],
  action: BlockEventAction,
  source: BlockEventSource
): Promise<void> {
  if (!userId || dids.length === 0) return;

  assertBlockEventInput(userId, dids, action, source);

  const values: string[] = [];
  const params: unknown[] = [];

  dids.forEach((did, i) => {
    const base = i * 4;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
    params.push(userId, did, action, source);
  });

  await query(
    `INSERT INTO block_events (user_id, target_did, action, source)
     VALUES ${values.join(', ')}
     ON CONFLICT DO NOTHING`,
    params
  );
}

