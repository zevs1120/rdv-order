import fs from 'node:fs/promises';
import pg from 'pg';

// Scoped, repeat-safe production adjustment; never rerun the initial catalog import.
const changes = [
  { code: 46, name: 'Beef Roll', nextName: 'Beef Slice', price: 450, nextPrice: 450, active: true },
  { code: 59, name: 'Beef Skewer', price: 80, nextPrice: 90, active: true },
  { code: 67, name: 'Steamed Fish', price: 1200, nextPrice: 1600, active: true },
  { code: 68, name: 'Hong Shao Yu', price: 1200, nextPrice: 1600, active: true },
  { code: 71, name: 'Suan Cai Yu', price: 1200, nextPrice: 1600, active: true },
  { code: 116, name: 'Crab', price: 150, nextPrice: 150, active: false }
];
const apply = process.argv.includes('--apply');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '5s'");
  if (apply) await client.query('LOCK TABLE menu_items IN SHARE ROW EXCLUSIVE MODE');
  const before = (await client.query('SELECT * FROM menu_items ORDER BY id')).rows;
  for (const change of changes) {
    const matches = before.filter(row => row.code === change.code);
    if (matches.length !== 1) throw Error(`Code ${change.code}: missing or ambiguous`);
    const row = matches[0];
    if (![change.name, change.nextName || change.name].includes(row.name) ||
        ![change.price, change.nextPrice].includes(row.price) || row.is_temporary ||
        row.option_groups.length || (change.active && !row.is_active)) throw Error(`Code ${change.code}: unexpected current state`);
  }
  if (apply) {
    const out = new URL('../../artifacts/menu-september-2026/', import.meta.url);
    await fs.mkdir(out, { recursive: true });
    await fs.writeFile(new URL(`final-adjustments-before-${Date.now()}.json`, out), JSON.stringify(before.filter(row => changes.some(c => c.code === row.code)), null, 2), { flag: 'wx' });
    for (const change of changes) await client.query(
      'UPDATE menu_items SET name=$2, price=$3, is_active=$4 WHERE code=$1',
      [change.code, change.nextName || change.name, change.nextPrice, change.active]);
    const after = (await client.query('SELECT * FROM menu_items ORDER BY id')).rows;
    const expected = before.map(row => {
      const change = changes.find(c => c.code === row.code);
      return change ? { ...row, name: change.nextName || change.name, price: change.nextPrice, is_active: change.active } : row;
    });
    if (JSON.stringify(after) !== JSON.stringify(expected)) throw Error('Unexpected catalog change; rolling back');
  }
  await client.query('COMMIT');
  const result = (await client.query('SELECT code,name,price,is_active FROM menu_items WHERE code=ANY($1::int[]) ORDER BY code', [changes.map(c => c.code)])).rows;
  console.log(JSON.stringify({ applied: apply, items: result }, null, 2));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally { await client.end(); }
