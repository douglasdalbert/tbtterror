import { useEffect, useMemo, useRef, useState } from "react";
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
import { PlayerSector } from "./PlayerSector.js";

const noCharacters: Catalog["characters"] = [];

export function App() {
  const [catalog, setCatalog] = useState<Catalog>();
  const [snapshot, setSnapshot] = useState<MatchSnapshot>();
  const [connection, setConnection] = useState("Conectando…");
  const [error, setError] = useState("");
  const [activationError, setActivationError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [scale, setScale] = useState(1);
  const [layout, setLayout] = useState<LayoutSummary>();
  const [selections, setSelections] = useState<Record<number, string>>({});
  const [hintIndex, setHintIndex] = useState(0);
  const audioContext = useRef<AudioContext | null>(null);

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
    if (audioContext.current && audioContext.current.state !== "closed") {
      void audioContext.current.close();
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
      audioContext.current ??= new window.AudioContext();
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

  const characters = catalog?.characters ?? noCharacters;
  const previewPlayers = useMemo(() => Object.entries(selections).flatMap(([slot, characterId]) => {
    const character = characters.find(({ id }) => id === characterId);
    return character ? [{ slot: Number(slot), name: character.name, attributes: character.attributes }] : [];
  }), [characters, selections]);

  return (
    <main className="game">
      <Board scale={scale} players={previewPlayers} onLayout={setLayout} />
      <section className="player-sectors" aria-label="Seleção dos jogadores">
        {Array.from({ length: 8 }, (_, slot) => {
          const character = characters.find(({ id }) => id === selections[slot]);
          return (
            <PlayerSector
              key={slot}
              slot={slot}
              character={character}
              characters={characters}
              scale={scale}
              hintIndex={hintIndex}
              onEnter={() => {
                const firstCharacter = characters[0];
                if (firstCharacter) setSelections((current) => ({ ...current, [slot]: firstCharacter.id }));
              }}
              onLeave={() => setSelections((current) => {
                const updated = { ...current };
                delete updated[slot];
                return updated;
              })}
              onSelect={(id) => setSelections((current) => ({ ...current, [slot]: id }))}
              onScale={changeScale}
            />
          );
        })}
      </section>
      <section className="status" aria-live="polite">
        <h1>Terror</h1>
        <p>{connection}</p>
        {error && <p role="alert" className="error">{error}</p>}
        {snapshot && catalog && (
          <p>Preparação · conteúdo v{snapshot.catalogRevision} · {Object.keys(selections).length}/8 jogadores</p>
        )}
        <p className="note">Arraste seu token. A calibração de qualquer setor ajusta todos.</p>
        {layout && <p className="note">Prévia · {layout.terrains} terrenos · token {Math.round(layout.tokenDiameter)} px</p>}
        {layout?.terrains === 0 && <p role="alert" className="error">Não cabe um terreno completo nesta escala.</p>}
        {activationError && <p role="alert" className="error">{activationError}</p>}
        <button type="button" className="immersive-button" onClick={() => void activateImmersiveMode()}>
          {fullscreen && audioReady ? "Áudio e tela cheia ativados"
            : fullscreen ? "Tela cheia ativada · áudio pendente"
              : audioReady ? "Áudio ativado · tela cheia pendente"
                : "Ativar tela cheia e áudio"}
        </button>
      </section>
    </main>
  );
}
