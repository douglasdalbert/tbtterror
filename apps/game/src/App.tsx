import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { io, type Socket } from "socket.io-client";
import {
  catalogSchema,
  matchSnapshotSchema,
  parseApiResponse,
  enterPreparationPlayer,
  leavePreparationPlayer,
  changePreparationAttribute,
  playerSectorDepth,
  type PreparationState,
  type AttributeName,
  type Catalog,
  type MatchSnapshot,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@terror/contracts";
import { Board, type LayoutSummary } from "./Board.js";
import { PlayerSector } from "./PlayerSector.js";
import { TouchButton } from "./TouchButton.js";
import { PreparationTips } from "./PreparationTips.js";

const isProduction = import.meta.env.APP_NODE_ENV === "production";

export function App() {
  const [catalog, setCatalog] = useState<Catalog>();
  const [snapshot, setSnapshot] = useState<MatchSnapshot>();
  const [connection, setConnection] = useState<"connected" | "connecting" | "error">("connecting");
  const [error, setError] = useState("");
  const [activationError, setActivationError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [scale, setScale] = useState(1);
  const [layout, setLayout] = useState<LayoutSummary>();
  const [selectionState, setSelectionState] = useState<PreparationState>({
    players: {}, errors: {},
  });
  const selections = selectionState.players;
  const [hintIndex, setHintIndex] = useState(0);
  const audioContext = useRef<AudioContext | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
      autoConnect: false,
    });
    socket.on("connect", () => setConnection("connected"));
    socket.on("disconnect", () => setConnection("connecting"));
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

  function changeScale(delta: number) {
    setScale((current) => Math.min(2, Math.max(0.5, Math.round((current + delta) * 20) / 20)));
  }

  function changeAttribute(slot: number, attribute: AttributeName, delta: 1 | -1) {
    setSelectionState((current) => changePreparationAttribute(current, slot, attribute, delta));
  }

  const previewPlayers = useMemo(() => Object.entries(selections).map(([slot, player]) => ({
    slot: Number(slot), ...player,
  })), [selections]);

  return (
    <main className="game" style={{ "--sector-depth": `${playerSectorDepth(scale)}px` } as CSSProperties}>
      <Board scale={scale} players={previewPlayers} onLayout={setLayout} />
      <section className="player-sectors" aria-label="Seleção dos jogadores">
        {Array.from({ length: 8 }, (_, slot) => (
          <PlayerSector
            key={slot}
            slot={slot}
            attributes={selections[slot]?.attributes}
            name={selections[slot]?.name}
            error={selectionState.errors[slot] || ""}
            canEnter={catalog !== undefined}
            scale={scale}
            onEnter={(name) => setSelectionState((current) => enterPreparationPlayer(current, slot, name))}
            onLeave={() => setSelectionState((current) => leavePreparationPlayer(current, slot))}
            onClearError={() => setSelectionState((current) => ({
              ...current, errors: { ...current.errors, [slot]: "" },
            }))}
            onAttribute={(attribute, delta) => changeAttribute(slot, attribute, delta)}
            onScale={changeScale}
          />
        ))}
      </section>
      <div className="preparation-center">
        <PreparationTips hintIndex={hintIndex} />
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
          {snapshot && catalog && (
            <p>Preparação · {Object.keys(selections).length}/8 jogadores</p>
          )}
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
