const fs = require("fs");
const { Client } = require("pg");

async function main() {
  const migrationPath = process.argv[2];
  if (!migrationPath) {
    console.error("Usage: node scripts/run-migration.js <sql-file>");
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  try {
    const sql = fs.readFileSync(migrationPath, "utf8");
    await client.query(sql);
    console.log("migration applied");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
