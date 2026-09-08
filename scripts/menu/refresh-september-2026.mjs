import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { refreshCatalog } from './catalog-september-2026.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const out = path.join(root, 'artifacts/menu-september-2026');
const apply = process.argv.includes('--apply');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await fs.mkdir(out, { recursive: true });
let isolated;
try {
  const before = (await client.query('SELECT * FROM menu_items WHERE is_active AND NOT is_temporary ORDER BY menu_group,sort_order,name,id')).rows;
  const migration = (await fs.readFile(path.join(root, 'db/migrations/024_menu_choices_and_codes.sql'), 'utf8')).replace(/^BEGIN;\s*|^COMMIT;\s*/gm, '');
  let db = client;
  if (!apply) {
    isolated = new PGlite(); db = isolated;
    const schema = (await fs.readFile(path.join(root, 'db/schema.sql'), 'utf8')).split('-- Apply before the menu refresh.')[0].replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', '');
    await db.exec(schema);
    await db.exec('ALTER TABLE menu_items ADD COLUMN code integer UNIQUE');
    for (const item of before) {
      await db.query(`INSERT INTO menu_items(id,name,price,category,description,menu_group,item_type,is_active,is_temporary,allergens,available_shifts,sort_order)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [item.id,item.name,item.price,item.category,item.description,item.menu_group,item.item_type,item.is_active,item.is_temporary,item.allergens,item.available_shifts,item.sort_order]);
      if (item.code != null) await db.query('UPDATE menu_items SET code=$2 WHERE id=$1', [item.id,item.code]);
    }
  }
  await db.query('BEGIN');
  try {
    if (apply) {
      await db.query('LOCK TABLE menu_items, order_items IN SHARE ROW EXCLUSIVE MODE');
      const locked = (await db.query('SELECT * FROM menu_items WHERE is_active AND NOT is_temporary ORDER BY menu_group,sort_order,name,id')).rows;
      if (JSON.stringify(locked) !== JSON.stringify(before)) throw new Error('Menu changed while preparing the refresh; retry with a new snapshot.');
      await fs.writeFile(path.join(out, `before-${Date.now()}.json`), JSON.stringify(before, null, 2), { flag: 'wx' });
    }
    // pg query can execute multiple statements without parameters; PGlite uses exec.
    if (isolated) await isolated.exec(migration); else await db.query(migration);
    const changes = await refreshCatalog(db);
    const items = (await db.query('SELECT * FROM menu_items WHERE is_active AND NOT is_temporary ORDER BY code')).rows;
    if (apply) {
      const registry = JSON.parse(await fs.readFile(path.join(root, 'db/menu-code-registry.json'), 'utf8'));
      const assigned = items.map(({ code, name, menu_group, is_complimentary }) => ({ code, name, menu_group, is_complimentary }));
      if (JSON.stringify(registry) !== JSON.stringify(assigned)) throw new Error('Menu changed since the exported code registry. Regenerate and review the code table before applying.');
    }
    if (new Set(items.map(i => i.code)).size !== items.length || items.some(i => !i.code)) throw new Error('Missing or duplicate menu codes');
    for (const old of before) if (!items.some(i => i.id === old.id)) throw new Error(`Existing dish removed: ${old.name}`);
    await db.query('COMMIT');
    await fs.writeFile(path.join(out, apply ? 'applied.json' : 'preview.json'), JSON.stringify({ applied: apply, createdAt: new Date().toISOString(), beforeCount: before.length, items, changes }, null, 2));
    console.log(JSON.stringify({ applied: apply, beforeCount: before.length, afterCount: items.length, changeCount: changes.length, output: path.join(out, apply ? 'applied.json' : 'preview.json') }));
  } catch (error) { await db.query('ROLLBACK'); throw error; }
} finally {
  await isolated?.close(); await client.end();
}
