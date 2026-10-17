import fs from "fs";
import path from "path";
import type { Pool } from "pg";

export async function applyMigrations(pool: Pool, dir: string) {
  const client = await pool.connect();
  try {
    // Serialize deploys so multiple API instances cannot apply the same DDL together.
    await client.query("SELECT pg_advisory_lock(hashtext('taskflow-schema-migrations'))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    const files = fs
      .readdirSync(dir)
      .filter((file) => file.endsWith(".sql"))
      .sort();
    for (const file of files) {
      const applied = await client.query("SELECT 1 FROM schema_migrations WHERE filename=$1", [file]);
      if ((applied.rowCount ?? 0) > 0) continue;
      const sql = fs.readFileSync(path.join(dir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(filename) VALUES($1)", [file]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext('taskflow-schema-migrations'))");
    } finally {
      client.release();
    }
  }
}
