import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { catalogSchema, type Catalog } from "@terror/contracts";
import { Pool } from "pg";
import type { readConfig } from "./config.js";

export function createPool(config: ReturnType<typeof readConfig>) {
  return new Pool({
    host: config.POSTGRES_HOST,
    port: config.POSTGRES_PORT,
    database: config.POSTGRES_DB,
    user: config.POSTGRES_USER,
    password: config.POSTGRES_PASSWORD,
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 10000,
  });
}

export async function migrate(pool: Pool) {
  const directory = fileURLToPath(new URL("../migrations/", import.meta.url));
  const files = (await readdir(directory)).filter((file) => /^\d+_[\w-]+\.sql$/.test(file)).sort();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(84071001)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    for (const file of files) {
      const applied = await client.query("SELECT name FROM schema_migrations WHERE name = $1", [file]);
      if (applied.rowCount !== 0) continue;
      await client.query(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      console.info(JSON.stringify({ event: "migration_applied", migration: file }));
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function loadCatalog(pool: Pool): Promise<Catalog> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const settings = await client.query<{ revision: number; definition: unknown }>(
      "SELECT revision, definition FROM game_settings WHERE id = 'default'",
    );
    const characters = await client.query<{ definition: unknown }>(
      "SELECT definition FROM characters ORDER BY id",
    );
    const monsters = await client.query<{ definition: unknown }>(
      "SELECT definition FROM monsters ORDER BY id",
    );
    const catalog = catalogSchema.parse({
      revision: settings.rows[0]?.revision,
      settings: settings.rows[0]?.definition,
      characters: characters.rows.map((row) => row.definition),
      monsters: monsters.rows.map((row) => row.definition),
    });
    await client.query("COMMIT");
    return catalog;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
