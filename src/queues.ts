import { Queue, Worker, type Processor } from 'bullmq';
import { Redis } from 'ioredis';
// BullMQ 6 does not depend on ioredis; install it and pass a client. maxRetriesPerRequest: null is required for Workers.
export const connection = new Redis({ host: process.env.REDIS_HOST ?? 'localhost', port: 6379, maxRetriesPerRequest: null });

export const deposits      = new Queue('deposits',       { connection });
export const withdrawals   = new Queue('withdrawals',    { connection });
export const emails        = new Queue('emails',         { connection });
export const balanceChecks = new Queue('balance-checks', { connection });

const byTopic: Record<string, Queue> = {
  'deposit-crypto-confirm': deposits, 'deposit-fiat-confirm': deposits,
  'withdrawal-crypto': withdrawals,   'withdrawal-fiat': withdrawals,
  'email-transaction': emails,
};
export const queueFor = (topic: string) => {
  const q = byTopic[topic]; if (!q) throw new Error(`unknown topic ${topic}`); return q;
};

export function startWorker(queueName: string, processors: Record<string, Processor>, concurrency = 5) {
  const worker = new Worker(queueName, async (job) => {
    const run = processors[job.name];
    if (!run) throw new Error(`no processor for ${job.name}`);
    return run(job);
  }, { connection, concurrency });
  worker.on('error', (err) => console.error(`[${queueName}]`, err));
  const stop = async () => { await worker.close(); process.exit(0); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  return worker;
}
