import nodemailer from 'nodemailer';
import { startWorker } from './queues.js';
import { attachDrumbeats } from './drumbeats.js';
import { pool } from './db.js';

const projectId = process.env.DRUMBEATS_PROJECT_ID!;
const mail = nodemailer.createTransport(process.env.SMTP_URL);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The custodian and the bank are stubs: settling a transaction also moves the fake wallet balance.
async function settle(txId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [tx] } = await client.query(
      `SELECT account_id, kind, asset, amount FROM transactions WHERE id = $1 AND status = 'pending' FOR UPDATE`, [txId]);
    if (!tx) { await client.query('ROLLBACK'); return; }               // already settled (retry)
    if (tx.kind === 'deposit') {
      await client.query(`INSERT INTO balances (account_id, asset, available) VALUES ($1,$2,$3)
        ON CONFLICT (account_id, asset) DO UPDATE SET available = balances.available + EXCLUDED.available`, [tx.account_id, tx.asset, tx.amount]);
    } else {
      await client.query(`UPDATE balances SET reserved = reserved - $3 WHERE account_id = $1 AND asset = $2`, [tx.account_id, tx.asset, tx.amount]);
    }
    const sign = tx.kind === 'deposit' ? 1 : -1;
    await client.query(`UPDATE wallet_balances SET amount = amount + ($1::int * $2::numeric), observed_at = now() WHERE asset = $3`, [sign, tx.amount, tx.asset]);
    await client.query(`UPDATE transactions SET status = 'settled' WHERE id = $1`, [txId]);
    await client.query(`INSERT INTO outbox (topic, payload) VALUES ('email-transaction', $1)`, [{ txId }]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

const workers = [
  startWorker('withdrawals', {
    'withdrawal-crypto': async (job) => { await sleep(3000); await settle(job.data.withdrawalId); },   // stub broadcast
    'withdrawal-fiat':   async (job) => { await sleep(2000); await settle(job.data.withdrawalId); },   // stub SEPA
  }),
  startWorker('deposits', {
    'deposit-crypto-confirm': async (job) => { await settle(job.data.depositId); },
    'deposit-fiat-confirm':   async (job) => { await settle(job.data.depositId); },
  }),
  startWorker('emails', {
    'email-transaction': async (job) => {
      const { rows: [tx] } = await pool.query(
        `SELECT t.kind, t.asset, t.amount, a.email FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE t.id = $1`, [job.data.txId]);
      await mail.sendMail({ from: 'Tulip Exchange <no-reply@tulip.example>', to: tx.email,
        subject: `${tx.kind === 'deposit' ? 'Deposit received' : 'Withdrawal sent'}: ${tx.amount} ${tx.asset}`,
        text: `Your ${tx.kind} of ${tx.amount} ${tx.asset} is settled. Reference ${job.data.txId}.` });
    },
  }),
  startWorker('balance-checks', {
    'balance-check': async () => {
      const { rows: ledger } = await pool.query(`SELECT asset, SUM(available + reserved) AS total FROM balances GROUP BY asset`);
      const { rows: wallet } = await pool.query(
        process.env.WALLET_EMPTY ? `SELECT asset, amount FROM wallet_balances WHERE false` : `SELECT asset, amount FROM wallet_balances`);
      for (const w of wallet) {
        const l = ledger.find((x) => x.asset === w.asset);
        if (!l || Number(l.total) !== Number(w.amount)) throw new Error(`balance mismatch ${w.asset}: ledger ${l?.total ?? 0} wallet ${w.amount}`);
      }
      return { assets: wallet.length };
    },
  }, 1),
];
for (const w of workers) attachDrumbeats(w, { projectId });
console.log('worker up: withdrawals, deposits, emails, balance-checks');
