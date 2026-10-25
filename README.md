A toy crypto exchange (Tulip Exchange) on Node, Postgres, Redis and BullMQ 6, with every queue and the outbox relay reporting to Drumbeats heartbeat monitors.

**This repository accompanies the Drumbeats article [Monitoring BullMQ workers on a toy crypto exchange](https://drumbeats.io/blog/monitor-bullmq-workers-heartbeat). Read it there first; this README only covers running the code.**

## The three processes

- `api` (Fastify): writes each transaction and its outbox row in one Postgres transaction, upserts the minutely `balance-check` Job Scheduler at boot, and hosts the Drumbeats webhook route (`/hooks/drumbeats`).
- `relay`: moves outbox rows into BullMQ and sends a Drumbeats heartbeat every 30 s.
- `worker`: consumes four queues (`deposits`, `withdrawals`, `emails`, `balance-checks`), with `attachDrumbeats` on each so every job sends start, success and failure pings with the job's `run_id`.

The custodian, the bank and the chain watcher are stubs that sleep for two or three seconds; `wallet_balances` is the fake hot wallet. Mailpit stands in for an SMTP provider.

## Run it

You need Docker and a free Drumbeats project with the monitors described in the article.

```
cp .env.example .env          # DRUMBEATS_PROJECT_ID, HOOK_SECRET
docker compose up -d postgres redis mailpit
docker compose exec -T postgres psql -U exchange -d exchange < schema.sql
docker compose exec -T postgres psql -U exchange -d exchange < seed.sql
docker compose build api && docker compose up -d api relay worker
curl -X POST localhost:3000/deposits    -H 'content-type: application/json' -d '{"accountId":"11111111-1111-1111-1111-111111111111","asset":"EUR","amount":"250.00","ref":"SEPA-0001"}'
curl -X POST localhost:3000/withdrawals -H 'content-type: application/json' -d '{"accountId":"11111111-1111-1111-1111-111111111111","asset":"BTC","amount":"0.1","destination":"bc1q…"}'
open http://localhost:8025    # Mailpit
```

## The four drills

1. Worker stopped: `docker compose stop worker`
2. Redis flushed with the worker still running: `docker compose exec redis redis-cli FLUSHALL`, then `docker compose restart api` to recreate the scheduler
3. Relay stopped: `docker compose stop relay`
4. SMTP down during a deposit: `docker compose stop mailpit`

Timings and the Drumbeats ping history from the run on 2026-10-24 are in [`docs/run-2026-10-24.md`](docs/run-2026-10-24.md).

## Versions

BullMQ 6.4.2, Node 22, Postgres 16, Redis 7 (`--maxmemory-policy noeviction --appendonly yes`). BullMQ 6 does not depend on `ioredis`; it is installed separately (`ioredis@5`) and passed in as a client.

## Licence

MIT, see [LICENSE](LICENSE).
