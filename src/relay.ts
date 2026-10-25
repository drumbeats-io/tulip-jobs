import { setTimeout as sleep } from 'node:timers/promises';
import { pool } from './db.js';
import { queueFor } from './queues.js';
import { heartbeat } from './drumbeats.js';

async function relayOnce(): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, topic, payload FROM outbox WHERE published_at IS NULL
       ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED`);
    for (const r of rows) {
      await queueFor(r.topic).add(r.topic, r.payload, {
        jobId: r.id, attempts: 5, backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 3600, count: 1000 }, removeOnFail: { age: 86400 },
      });
    }
    if (rows.length) await client.query(
      'UPDATE outbox SET published_at = now() WHERE id = ANY($1::uuid[])', [rows.map(r => r.id)]);
    await client.query('COMMIT');
    return rows.length;
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

export async function runRelay(onTick: () => void) {
  for (;;) { try { await relayOnce(); onTick(); } catch (e) { console.error('relay', e); } await sleep(1000); }
}

console.log("relay up"); runRelay(heartbeat(process.env.DRUMBEATS_PROJECT_ID!, "outbox-relay"));
