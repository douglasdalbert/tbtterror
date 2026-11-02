import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
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
  app.get("/api/catalog", (_request, response) => response.json(match.publicCatalog()));
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
  const owners = new Map<string, string>();
  const broadcast = () => {
    for (const socket of io.sockets.sockets.values()) socket.emit("match:snapshot", match.snapshot(owners.get(socket.id)));
  };
  const timer = setInterval(() => {
    if (match.tick()) broadcast();
  }, 100);
  timer.unref();
  io.on("connection", (socket) => {
    const identity = z.uuid().safeParse(socket.handshake.auth?.clientId ?? randomUUID());
    if (!identity.success) {
      console.warn(JSON.stringify({ event: "invalid_client_identity" }));
      socket.disconnect(true);
      return;
    }
    const owner = identity.data;
    owners.set(socket.id, owner);
    match.connect(owner);
    console.info(JSON.stringify({ event: "client_connected", id: socket.id }));
    broadcast();
    socket.on("match:request", () => socket.emit("match:snapshot", match.snapshot(owner)));
    socket.on("match:command", (command, reply) => {
      if (typeof reply !== "function") {
        console.warn(JSON.stringify({ event: "command_without_ack", id: socket.id }));
        return;
      }
      const result = match.command(owner, command);
      if (!result.ok) console.warn(JSON.stringify({ event: "command_rejected", error: result.error }));
      reply(result);
      broadcast();
    });
    socket.on("disconnect", (reason) => {
      owners.delete(socket.id);
      if (![...owners.values()].includes(owner)) match.disconnect(owner);
      broadcast();
      console.info(JSON.stringify({ event: "client_disconnected", id: socket.id, reason }));
    });
  });
  return {
    httpServer,
    io,
    close: () => new Promise<void>((resolve) => {
      clearInterval(timer);
      io.close(() => resolve());
    }),
  };
}
