import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { matchSnapshotSchema } from "../packages/contracts/dist/index.js";

const environment = parseEnv(await readFile(new URL("../.env", import.meta.url), "utf8"));
const url = process.env.GAME_URL ?? `http://127.0.0.1:${environment.GAME_PORT ?? 8080}`;
const marker = `verification_${randomBytes(8).toString("hex")}`;
const compose = (...args) => execFileSync("docker", ["compose", ...args], { encoding: "utf8" }).trim();
const sql = (query) => compose("exec", "-T", "postgres", "psql", "-U", "terror", "-d", "terror",
  "-v", "ON_ERROR_STOP=1", "-Atc", query);

async function snapshot() {
  const response = await fetch(`${url}/api/match`, { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);
  return matchSnapshotSchema.parse(await response.json());
}

async function waitHealthy() {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (response.ok) return;
      console.info(`Aguardando servidor: HTTP ${response.status}.`);
    } catch (error) {
      console.info(`Aguardando servidor: ${error instanceof Error ? error.message : "falha de conexão"}.`);
    }
    await delay(1000);
  }
  throw new Error("O servidor não recuperou a saúde em 60 segundos.");
}

const before = await snapshot();
assert.equal(before.phase, "lobby", "Não executar verificações destrutivas durante uma partida.");
const serverContainer = compose("ps", "-q", "server");
console.info("Verificando o ciclo de vida: recriar PostgreSQL, parar admin e reiniciar servidor.");

sql(`INSERT INTO game_settings (id, revision, definition)
  SELECT '${marker}', revision, definition FROM game_settings WHERE id = 'default'`);
try {
  compose("up", "-d", "--no-deps", "--force-recreate", "--wait", "postgres");
  assert.equal(sql(`SELECT id FROM game_settings WHERE id = '${marker}'`), marker);
  await waitHealthy();
  assert.equal((await snapshot()).id, before.id);
  compose("--profile", "admin", "stop", "admin");
  assert.equal(compose("ps", "-q", "server"), serverContainer);
  await waitHealthy();
  assert.equal((await snapshot()).id, before.id);
  compose("restart", "server");
  await waitHealthy();
  assert.notEqual((await snapshot()).id, before.id);
  assert.equal(sql("SELECT count(*) FROM schema_migrations"), "1");
} finally {
  sql(`DELETE FROM game_settings WHERE id = '${marker}'`);
}
console.info("Verificado: volume persistente, admin independente e partida nova após reiniciar servidor.");
