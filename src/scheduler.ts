import type { Queue } from 'bullmq';

export async function ensureScheduler(balanceChecks: Queue) {
  await balanceChecks.upsertJobScheduler(
    'balance-check-minutely',
    { pattern: '* * * * *', tz: 'UTC' },
    { name: 'balance-check', data: {}, opts: { removeOnComplete: 60, removeOnFail: 100 } },
  );
}
