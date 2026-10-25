import { pool } from './db.js';

// Called by the (stubbed) bank webhook or chain watcher: record the deposit and the intent to confirm it.
export async function recordDeposit(accountId: string, asset: 'BTC' | 'EUR', amount: string, ref: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [tx] } = await client.query(
      `INSERT INTO transactions (account_id, kind, asset, amount, external_ref) VALUES ($1,'deposit',$2,$3,$4) RETURNING id`,
      [accountId, asset, amount, ref]);
    const topic = asset === 'EUR' ? 'deposit-fiat-confirm' : 'deposit-crypto-confirm';
    await client.query('INSERT INTO outbox (topic, payload) VALUES ($1,$2)',
      [topic, { depositId: tx.id, accountId, asset, amount, ref }]);
    await client.query('COMMIT');
    return tx.id as string;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
