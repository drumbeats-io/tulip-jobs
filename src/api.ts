import Fastify from 'fastify';
import { balanceChecks } from './queues.js';
import { ensureScheduler } from './scheduler.js';
import { requestWithdrawal } from './withdrawals.js';
import { recordDeposit } from './deposits.js';

const app = Fastify({ logger: true });

app.post<{ Body: { accountId: string; asset: 'BTC' | 'EUR'; amount: string; destination: string } }>(
  '/withdrawals', async (req, reply) => {
    const id = await requestWithdrawal(req.body.accountId, req.body.asset, req.body.amount, req.body.destination);
    return reply.code(202).send({ id, status: 'pending' });
  });

app.post<{ Body: { accountId: string; asset: 'BTC' | 'EUR'; amount: string; ref: string } }>(
  '/deposits', async (req, reply) => {
    const id = await recordDeposit(req.body.accountId, req.body.asset, req.body.amount, req.body.ref);
    return reply.code(202).send({ id, status: 'pending' });
  });

app.post<{ Body: { event: string; monitor: { slug: string }; incident?: { event: string } } }>(
  '/hooks/drumbeats', async (req, reply) => {
    if (req.headers['x-hook-secret'] !== process.env.HOOK_SECRET) return reply.code(401).send();
    const { event, monitor, incident } = req.body;
    if (event !== 'DOWN') return { ok: true, ignored: true };
    if (monitor.slug === 'balance-check' && incident?.event === 'MISSED') {
      await ensureScheduler(balanceChecks);                                    // recreate if Redis lost it
      return { ok: true, action: 'scheduler-upserted' };
    }
    if (monitor.slug === 'outbox-relay') {
      await fetch('http://relay:3001/kick', { method: 'POST', signal: AbortSignal.timeout(2000) }).catch(() => {});
      return { ok: true, action: 'relay-kicked' };
    }
    return { ok: true };
  });

await ensureScheduler(balanceChecks);
await app.listen({ port: 3000, host: '0.0.0.0' });
