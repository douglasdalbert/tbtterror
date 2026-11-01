import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

try {
  await writeFile(new URL("../.env", import.meta.url), [
    `POSTGRES_PASSWORD=${randomBytes(32).toString("hex")}`,
    "GAME_PORT=8080",
    "NODE_ENV=development",
    "ADMIN_BIND_ADDRESS=127.0.0.1",
    "ADMIN_PORT=8081",
    "",
  ].join("\n"), { flag: "wx", mode: 0o600 });
  console.info(".env criado com segredos aleatórios. Nenhum valor foi exibido.");
} catch (error) {
  if (error instanceof Error && "code" in error && error.code === "EEXIST") {
    console.error(".env já existe; preservado sem alterações.");
  } else {
    console.error("Não foi possível criar .env.", error);
  }
  process.exitCode = 1;
}
