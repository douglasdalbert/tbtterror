import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  catalogSchema,
  matchSnapshotSchema,
  parseApiResponse,
  type Catalog,
  type MatchSnapshot,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@terror/contracts";
import { Board, type LayoutSummary } from "./Board.js";

export function App() {
  const [catalog, setCatalog] = useState<Catalog>();
  const [snapshot, setSnapshot] = useState<MatchSnapshot>();
  const [connection, setConnection] = useState("Conectando…");
  const [error, setError] = useState("");
  const [scale, setScale] = useState(1);
  const [layout, setLayout] = useState<LayoutSummary>();

  useEffect(() => {
    const controller = new AbortController();
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
      autoConnect: false,
    });
    socket.on("connect", () => setConnection("Conectado"));
    socket.on("disconnect", () => setConnection("Desconectado — tentando reconectar…"));
    socket.on("connect_error", (failure) => {
      setConnection("Servidor indisponível — tentando reconectar…");
      setError(`Falha na conexão: ${failure.message}`);
    });
    socket.on("match:snapshot", (value) => {
      const parsed = matchSnapshotSchema.safeParse(value);
      if (!parsed.success) {
        setError("Estado da partida incompatível com esta versão do jogo.");
        return;
      }
      setSnapshot(parsed.data);
      void fetch("/api/catalog", { signal: controller.signal })
        .then((response) => parseApiResponse(response, catalogSchema))
        .then((data) => {
          setCatalog(data);
          setError("");
        })
        .catch((failure: unknown) => {
          if (controller.signal.aborted) return;
          setError(failure instanceof Error ? failure.message : "Falha ao carregar conteúdo.");
        });
    });
    socket.connect();
    return () => {
      controller.abort();
      socket.disconnect();
    };
  }, []);

  return (
    <main className="game">
      <Board scale={scale} onLayout={setLayout} />
      <section className="status" aria-live="polite">
        <h1>Terror</h1>
        <p>{connection}</p>
        {error && <p role="alert" className="error">{error}</p>}
        {snapshot && catalog && (
          <p>Preparação · conteúdo v{snapshot.catalogRevision} · {catalog.settings.maxPlayers} setores</p>
        )}
        <p className="note">Base técnica conectada. Entrada dos jogadores e movimento serão a próxima etapa.</p>
        <p className="note">Prévia de encaixe geométrico; células tipadas e objetivos ainda não foram gerados.</p>
      </section>
      <section className="calibration" aria-label="Prévia de calibração">
        <label htmlFor="scale">Escala proporcional · {scale.toFixed(2)}×</label>
        <input id="scale" type="range" min="0.5" max="2" step="0.05" value={scale}
          onChange={(event) => setScale(Number(event.target.value))} />
        {layout && (
          <p aria-live="polite">
            Token {Math.round(layout.tokenDiameter)} px · célula {Math.round(layout.cellWidth)} px entre lados
            · {layout.terrains} terrenos / {layout.cells} células
          </p>
        )}
        {layout?.terrains === 0 && <p role="alert">Não cabe um terreno completo. Reduza a escala.</p>}
        <p className="note">Indicadores ficam dentro do token. Bordas reservadas provisoriamente para os jogadores.</p>
      </section>
    </main>
  );
}
