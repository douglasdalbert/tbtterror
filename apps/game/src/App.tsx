import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { io, type Socket } from "socket.io-client";
import {
  catalogSchema,
  matchSnapshotSchema,
  parseApiResponse,
  commandResultSchema,
  playerSectorDepth,
  type MatchCommand,
  type Catalog,
  type MatchSnapshot,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@terror/contracts";
import { Board, type LayoutSummary, type BoardInteraction } from "./Board.js";
import { PlayerSector } from "./PlayerSector.js";
import { TouchButton } from "./TouchButton.js";
import { PreparationTips } from "./PreparationTips.js";
import { getClientId } from "./clientIdentity.js";

const isProduction = import.meta.env.APP_NODE_ENV === "production";

export function App() {
  const [catalog, setCatalog] = useState<Catalog>();
  const [snapshot, setSnapshot] = useState<MatchSnapshot>();
  const [connection, setConnection] = useState<"connected" | "connecting" | "error">("connecting");
  const [error, setError] = useState("");
  const [activationError, setActivationError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [layout, setLayout] = useState<LayoutSummary>();
  const [sectorErrors, setSectorErrors] = useState<Record<number, string>>({});
  const [pressedSlots, setPressedSlots] = useState<Record<number, boolean>>({});
  const [busySlots, setBusySlots] = useState<Record<number, boolean>>({});
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const catalogMatchId = useRef("");
  const scale = snapshot?.arena.scale ?? 1;
  const configuring = !snapshot || snapshot.phase === "lobby" || snapshot.phase === "countdown";
  const [hintIndex, setHintIndex] = useState(0);
  const audioContext = useRef<AudioContext | null>(null);

  useEffect(() => {
    let clientId: string;
    try {
      clientId = getClientId();
    } catch (failure: unknown) {
      setConnection("error");
      setError(`Falha ao inicializar a identidade desta aba: ${failure instanceof Error ? failure.message : "armazenamento ou geração aleatória indisponível."}`);
      return;
    }
    const controller = new AbortController();
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
      autoConnect: false,
      auth: { clientId },
    });
    socketRef.current = socket;
    socket.on("connect", () => setConnection("connected"));
    socket.on("disconnect", () => {
      setConnection("connecting");
      setPressedSlots({});
    });
    socket.on("connect_error", (failure) => {
      setConnection("error");
      setError(`Falha na conexão: ${failure.message}`);
    });
    socket.on("match:snapshot", (value) => {
      const parsed = matchSnapshotSchema.safeParse(value);
      if (!parsed.success) {
        setError("Estado da partida incompatível com esta versão do jogo.");
        return;
      }
      setSnapshot(parsed.data);
      if (catalogMatchId.current === parsed.data.id) return;
      catalogMatchId.current = parsed.data.id;
      void fetch("/api/catalog", { signal: controller.signal })
        .then((response) => parseApiResponse(response, catalogSchema))
        .then((data) => {
          setCatalog(data);
          setError("");
        })
        .catch((failure: unknown) => {
          if (controller.signal.aborted) return;
          catalogMatchId.current = "";
          setError(failure instanceof Error ? failure.message : "Falha ao carregar conteúdo.");
        });
    });
    socket.connect();
    return () => {
      controller.abort();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    const updateFullscreen = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setHintIndex((current) => (current + 1) % 2), 8000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => () => {
    const context = audioContext.current;
    if (context) {
      context.onstatechange = null;
      if (context.state !== "closed") void context.close();
    }
  }, []);

  async function activateImmersiveMode() {
    const failures: string[] = [];
    if (!document.fullscreenElement) {
      if (!document.documentElement.requestFullscreen) {
        failures.push("Tela cheia não é suportada neste navegador.");
      } else {
        try {
          await document.documentElement.requestFullscreen();
        } catch (failure) {
          failures.push(`Tela cheia: ${failure instanceof Error ? failure.message : "não foi autorizada."}`);
        }
      }
    }

    try {
      if (!audioContext.current || audioContext.current.state === "closed") {
        const context = new window.AudioContext();
        context.onstatechange = () => setAudioReady(context.state === "running");
        audioContext.current = context;
      }
      await audioContext.current.resume();
      if (audioContext.current.state !== "running") {
        setAudioReady(false);
        failures.push("O navegador não autorizou o áudio.");
      } else {
        setAudioReady(true);
      }
    } catch (failure) {
      setAudioReady(false);
      failures.push(`Áudio: ${failure instanceof Error ? failure.message : "não foi autorizado."}`);
    }
    setActivationError(failures.join(" "));
  }

  const sendCommand = useCallback((command: MatchCommand) => {
    const slot = "slot" in command ? command.slot : undefined;
    const report = (message: string) => {
      if (slot !== undefined) setSectorErrors((current) => ({ ...current, [slot]: message }));
      else setError(message);
    };
    const socket = socketRef.current;
    if (!socket?.connected) {
      report("Sem conexão com o servidor. Aguarde a reconexão.");
      return;
    }
    const action = !["press", "move", "release", "viewport"].includes(command.type);
    const busyAction = ["join", "leave", "ready", "pause", "resume"].includes(command.type);
    if (busyAction && slot !== undefined) setBusySlots((current) => ({ ...current, [slot]: true }));
    void socket.timeout(3000).emitWithAck("match:command", command)
      .then((reply) => {
        const result = commandResultSchema.parse(reply);
        if (!result.ok) {
          report(result.error);
          if (command.type === "press") setPressedSlots((current) => ({ ...current, [command.slot]: false }));
        } else if (action && slot !== undefined) setSectorErrors((current) => ({ ...current, [slot]: "" }));
      })
      .catch((failure: unknown) => report(failure instanceof Error ? `Falha na ação: ${failure.message}` : "Falha na ação."))
      .finally(() => {
        if (busyAction && slot !== undefined) setBusySlots((current) => ({ ...current, [slot]: false }));
      });
  }, []);
  const interaction = useMemo<BoardInteraction>(() => ({
    onCommand: sendCommand,
    onPressed: (slot, pressed) => setPressedSlots((current) => ({ ...current, [slot]: pressed })),
  }), [sendCommand]);
  useEffect(() => {
    if (!snapshot || !configuring || connection !== "connected") return;
    const update = () => sendCommand({ type: "viewport", width: Math.max(320, innerWidth), height: Math.max(320, innerHeight) });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [snapshot?.id, configuring, connection, sendCommand]);
  const previewPlayers = snapshot?.players ?? [];
  const boardSnapshot = useMemo(() => snapshot && connection !== "connected"
    ? { ...snapshot, phase: "paused" as const } : snapshot, [snapshot, connection]);

  return (
    <main className="game" style={{ "--sector-depth": `${playerSectorDepth(scale)}px` } as CSSProperties}>
      <Board scale={scale} players={previewPlayers} snapshot={boardSnapshot} interaction={interaction} onLayout={setLayout} />
      <section className="player-sectors" aria-label="Seleção dos jogadores">
        {Array.from({ length: 8 }, (_, slot) => {
          const player = snapshot?.players.find((p) => p.slot === slot);
          if (!player && !configuring) return null;
          return (
          <PlayerSector
            key={slot}
            slot={slot}
            attributes={player?.attributes}
            name={player?.name}
            color={player?.color}
            reservedColors={snapshot?.players.filter((entry) => entry.slot !== slot).map((entry) => entry.color) ?? []}
            error={sectorErrors[slot] || ""}
            canEnter={catalog !== undefined && connection === "connected" && configuring}
            phase={snapshot?.phase ?? "lobby"}
            ready={player?.ready ?? false}
            resumeReady={player?.resumeReady ?? false}
            moving={!!pressedSlots[slot] || (player?.pressed ?? false)}
            controllable={!player || (snapshot?.controlSlots.includes(slot) ?? false)}
            busy={!!busySlots[slot] || connection !== "connected"}
            scale={scale}
            onEnter={(name, color) => sendCommand({ type: "join", slot, name, color })}
            onLeave={() => sendCommand({ type: "leave", slot })}
            onClearError={() => setSectorErrors((current) => ({ ...current, [slot]: "" }))}
            onAttribute={(attribute, delta) => sendCommand({ type: "attribute", slot, attribute, delta })}
            onScale={(delta) => sendCommand({ type: "scale", slot, delta })}
            onReady={(value) => sendCommand({ type: "ready", slot, value })}
            onPause={() => sendCommand({ type: "pause", slot })}
            onResume={(value) => sendCommand({ type: "resume", slot, value })}
          />
        ); })}
      </section>
      <div className="preparation-center">
        {configuring && <PreparationTips hintIndex={hintIndex} />}
        <section className="status" aria-live="polite">
          <div className="status-heading">
            <h1>Terror</h1>
            <span
              className={`connection-indicator connection-indicator--${error ? "error" : connection}`}
              role="status"
              aria-label={error || connection === "error" ? "Erro na conexão ou no conteúdo"
                : connection === "connected" ? "Conectado" : "Conectando"}
            />
          </div>
          {error && <p role="alert" className="error">{error}</p>}
          {snapshot?.error && <p role="alert" className="error">{snapshot.error}</p>}
          {snapshot && catalog && (
            <p>{configuring ? "Preparação" : snapshot.phase === "paused" ? "Pausado" : "Partida"} · {snapshot.players.length}/8 jogadores</p>
          )}
          {snapshot?.phase === "countdown" && <output className="countdown" aria-label="Contagem para início">{Math.ceil(snapshot.remainingMs / 1000)}</output>}
          {snapshot?.phase === "paused" && snapshot.resumeRemainingMs > 0 &&
            <output className="countdown" aria-label="Contagem para retomada">{Math.ceil(snapshot.resumeRemainingMs / 1000)}</output>}
          {(snapshot?.phase === "chapter" || (snapshot?.phase === "paused" && snapshot.remainingMs > 0)) &&
            <p className="chapter-title" style={{ opacity: Math.min(1, snapshot.remainingMs / 1000) }}>{snapshot.chapter}</p>}
          {!isProduction && layout && <p className="note preview-summary">Prévia · {layout.terrains} terrenos · token {Math.round(layout.tokenDiameter)} px</p>}
          {layout?.terrains === 0 && <p role="alert" className="error">Não cabe um terreno completo nesta escala.</p>}
        </section>
      </div>
      {(!fullscreen || !audioReady) && (
        <div className="immersive-overlay">
          <TouchButton className="immersive-button" onPress={() => void activateImmersiveMode()}>
            {fullscreen ? "Ativar áudio"
              : audioReady ? "Ativar tela cheia" : "Ativar tela cheia e áudio"}
          </TouchButton>
          {activationError && <p role="alert" className="error">{activationError}</p>}
        </div>
      )}
    </main>
  );
}
