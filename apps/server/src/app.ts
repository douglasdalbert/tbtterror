import { createServer } from "node:http";
import express, { type ErrorRequestHandler } from "express";
import { Server } from "socket.io";
import {
  adminOverviewSchema, healthSchema,
  type ClientToServerEvents, type ServerToClientEvents,
} from "@terror/contracts";
import type { Pool } from "pg";
import { loadCatalog } from "./database.js";
import { Match } from "./match.js";

export function createApplication(pool: Pool, match: Match) {
  const app = express();
  app.disable("x-powered-by");
  app.use((_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });
  app.get("/api/health", async (_request, response) => {
    await pool.query("SELECT 1");
    response.json(healthSchema.parse({ status: "ok", database: "ready" }));
  });
  app.get("/api/catalog", (_request, response) => response.json(match.catalog()));
  app.get("/api/match", (_request, response) => response.json(match.snapshot()));
  app.get("/api/admin/overview", async (_request, response) => {
    const catalog = await loadCatalog(pool);
    response.json(adminOverviewSchema.parse({
      revision: catalog.revision,
      counts: { characters: catalog.characters.length, monsters: catalog.monsters.length },
    }));
  });
  app.use((_request, response) => {
    response.status(404).json({ error: "Recurso não encontrado." });
  });
  const onError: ErrorRequestHandler = (error: unknown, request, response, _next) => {
    console.error(JSON.stringify({
      event: "request_failed", path: request.path,
      message: error instanceof Error ? error.message : "Unknown error",
    }));
    response.status(503).json({ error: "Serviço indisponível. Verifique os logs do servidor." });
  };
  app.use(onError);
  const httpServer = createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    maxHttpBufferSize: 16 * 1024,
    serveClient: false,
  });
  io.on("connection", (socket) => {
    console.info(JSON.stringify({ event: "client_connected", id: socket.id }));
    socket.emit("match:snapshot", match.snapshot());
    socket.on("match:request", () => socket.emit("match:snapshot", match.snapshot()));
    socket.on("disconnect", (reason) => {
      console.info(JSON.stringify({ event: "client_disconnected", id: socket.id, reason }));
    });
  });
  return {
    httpServer,
    io,
    close: () => new Promise<void>((resolve) => io.close(() => resolve())),
  };
}
