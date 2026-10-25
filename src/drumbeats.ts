import type { Worker, Job } from 'bullmq';

const slugOf = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

export function attachDrumbeats(worker: Worker, opts: { projectId: string; baseUrl?: string }) {
  const base = opts.baseUrl ?? 'https://api.drumbeats.io';
  const names = new Map<string, string>();                       // jobId -> job.name (for 'stalled')
  const chains = new Map<string, Promise<unknown>>();            // jobId -> last ping, so start lands before finish
  const send = (slug: string, event: string, runId: string, body: { duration_ms?: number; payload?: unknown } = {}) => {
    const url = `${base}/v1/s-ping/${opts.projectId}/${slug}/${event}?run_id=${encodeURIComponent(runId)}`;
    const payload = body.payload === undefined ? undefined : JSON.stringify(body.payload);   // Drumbeats stores payload as a string
    return fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ duration_ms: body.duration_ms, payload }), signal: AbortSignal.timeout(3000),
    }).catch(() => {});                                            // never throws into the worker
  };
  // Sub-50 ms jobs finish before their start ping is on the wire; queue each job's pings behind the previous one.
  const ping = (slug: string, event: string, runId: string, body?: { duration_ms?: number; payload?: unknown }) => {
    const next = (chains.get(runId) ?? Promise.resolve()).then(() => send(slug, event, runId, body));
    chains.set(runId, next);
    if (event !== 'start') void next.finally(() => { if (chains.get(runId) === next) chains.delete(runId); });
  };
  const elapsed = (job: Job) => (job.processedOn ? Date.now() - job.processedOn : undefined);

  worker.on('active', (job) => { names.set(String(job.id), job.name); ping(slugOf(job.name), 'start', String(job.id)); });
  worker.on('completed', (job) => { names.delete(String(job.id));
    ping(slugOf(job.name), 'success', String(job.id), { duration_ms: elapsed(job), payload: { name: job.name, keys: Object.keys(job.data ?? {}) } }); });
  worker.on('failed', (job, err) => { if (!job) return; names.delete(String(job.id));
    ping(slugOf(job.name), 'failure', String(job.id), { duration_ms: elapsed(job), payload: { reason: err.message, attempt: job.attemptsMade } }); });
  worker.on('stalled', (jobId) => { const name = names.get(jobId); if (!name) return;
    ping(slugOf(name), 'log', jobId, { payload: 'stalled: lock lost, requeued by BullMQ' }); });
}

// Heartbeat for a loop that is not a BullMQ worker (the outbox relay). Throttled to one ping per 30 s.
export function heartbeat(projectId: string, slug: string, everyMs = 30_000) {
  let last = 0;
  return () => {
    const now = Date.now(); if (now - last < everyMs) return; last = now;
    void fetch(`https://api.drumbeats.io/v1/s-ping/${projectId}/${slug}/success`, { signal: AbortSignal.timeout(3000) }).catch(() => {});
  };
}
