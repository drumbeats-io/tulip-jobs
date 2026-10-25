import { pool } from './db.js';

export async function requestWithdrawal(accountId: string, asset: 'BTC' | 'EUR', amount: string, destination: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      `UPDATE balances SET available = available - $3, reserved = reserved + $3
       WHERE account_id = $1 AND asset = $2 AND available >= $3`, [accountId, asset, amount]);
    if (!rowCount) throw new Error('insufficient balance');
    const { rows: [tx] } = await client.query(
      `INSERT INTO transactions (account_id, kind, asset, amount) VALUES ($1,'withdrawal',$2,$3) RETURNING id`,
      [accountId, asset, amount]);
    const topic = asset === 'EUR' ? 'withdrawal-fiat' : 'withdrawal-crypto';
    await client.query('INSERT INTO outbox (topic, payload) VALUES ($1,$2)',
      [topic, { withdrawalId: tx.id, accountId, asset, amount, destination }]);
    await client.query('COMMIT');
    return tx.id as string;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
