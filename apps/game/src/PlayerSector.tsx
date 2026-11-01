import { useEffect, useId, useState } from "react";
import { availableAttributePoints, rotatePlayerName, type Attributes, type AttributeName, type MatchSnapshot } from "@terror/contracts";
import { TouchButton } from "./TouchButton.js";
import { AttributeIcon, TabIcon } from "./Icons.js";
import { LetterWheel } from "./LetterWheel.js";
import { SectorDialog } from "./SectorDialog.js";
import { CalibrationToken } from "./TokenVisual.js";

const attributeLabels: { attribute: AttributeName; label: string }[] = [
  { attribute: "strength", label: "Força" },
  { attribute: "dexterity", label: "Destreza" },
  { attribute: "wisdom", label: "Inteligência" },
];

const tabs = [
  { tab: "game", label: "Jogo" },
  { tab: "token", label: "Token" },
  { tab: "character", label: "Personagem" },
] as const;
type Tab = typeof tabs[number]["tab"];
type Dialog = "join" | "leave" | AttributeName | null;

export function PlayerSector({ slot, name, attributes, error, canEnter, scale, phase, ready, resumeReady, moving, controllable, busy, onEnter, onLeave, onClearError, onAttribute, onScale, onReady, onPause, onResume }: {
  slot: number;
  name: string | undefined;
  attributes: Attributes | undefined;
  error: string;
  canEnter: boolean;
  scale: number;
  phase: MatchSnapshot["phase"];
  ready: boolean;
  resumeReady: boolean;
  moving: boolean;
  controllable: boolean;
  busy: boolean;
  onEnter: (name: string) => void;
  onLeave: () => void;
  onClearError: () => void;
  onAttribute: (attribute: AttributeName, delta: 1 | -1) => void;
  onScale: (delta: -0.05 | 0.05) => void;
  onReady: (value: boolean) => void;
  onPause: () => void;
  onResume: (value: boolean) => void;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("game");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [draftName, setDraftName] = useState("AAA");
  const panelId = useId();
  const locked = phase !== "lobby" && phase !== "countdown";
  const shownTab = moving || locked ? "game" : activeTab;
  useEffect(() => {
    if (moving || locked) {
      setActiveTab("game");
      setDialog(null);
    }
  }, [moving, locked]);
  useEffect(() => {
    if (attributes && dialog === "join") {
      setDialog(null);
      document.getElementById(`${panelId}-game`)?.focus();
    }
  }, [attributes, dialog, panelId]);
  const side = slot === 3 || slot === 7;
  const position = slot === 3 ? "right" : slot === 7 ? "left"
    : slot < 3 ? `top-${slot}` : `bottom-${slot - 4}`;
  const className = [
    "sector",
    `sector--${position}`,
    side ? "sector--side" : slot < 3 ? "sector--top" : "sector--bottom",
    error ? "sector--error" : "",
  ].filter(Boolean).join(" ");
  const availablePoints = attributes ? availableAttributePoints(attributes) : 3;
  const identity = name ?? `Setor ${slot + 1}`;
  const rotation = slot === 3 ? 270 : slot === 7 ? 90 : slot < 3 ? 180 : 0;
  const visibleDialog = moving || (dialog === "join" && attributes) ? null : dialog;
  const closeDialog = () => {
    setDialog(null);
    onClearError();
  };

  return (
    <article className={className} aria-label={identity}>
      <div className="sector-card">
        <div className="sector-layout" inert={visibleDialog !== null || moving || !controllable}>
          {attributes ? (
            <>
              <nav className="sector-identity" aria-label={`Jogador ${identity}`}>
                <strong className="player-name">{name}</strong>
                <TouchButton className="leave-button" aria-label={`Sair ${identity}`}
                  disabled={busy}
                  onPress={() => setDialog("leave")}><TabIcon tab="leave" /></TouchButton>
              </nav>
              <div id={`${panelId}-content`} className="player-setup" role="tabpanel"
                aria-labelledby={`${panelId}-${shownTab}`}>
                {shownTab === "game" && (
                  <div className="game-controls">
                    {(phase === "lobby" || phase === "countdown") && (
                      <TouchButton role="checkbox" aria-checked={ready} className="ready-button"
                        disabled={busy} onPress={() => onReady(!ready)}>
                        <span aria-hidden="true">{ready ? "☑" : "☐"}</span> Estou pronto
                      </TouchButton>
                    )}
                    {(phase === "running" || phase === "chapter") && (
                      <TouchButton className="ready-button" disabled={busy} onPress={onPause}>Pausar</TouchButton>
                    )}
                    {phase === "paused" && (
                      <TouchButton role="checkbox" aria-checked={resumeReady} className="ready-button"
                        disabled={busy} onPress={() => onResume(!resumeReady)}>
                        <span aria-hidden="true">{resumeReady ? "☑" : "☐"}</span> Pronto para retomar
                      </TouchButton>
                    )}
                  </div>
                )}
                {shownTab === "token" && (
                  <div className="calibration-controls">
                    <TouchButton aria-label={`Diminuir escala compartilhada de ${identity}`}
                      disabled={busy || scale <= 0.5} onPress={() => onScale(-0.05)}>−</TouchButton>
                    <CalibrationToken scale={scale} name={identity} attributes={attributes} />
                    <TouchButton aria-label={`Aumentar escala compartilhada de ${identity}`}
                      disabled={busy || scale >= 2} onPress={() => onScale(0.05)}>+</TouchButton>
                  </div>
                )}
                {shownTab === "character" && (
                  <div className="attribute-columns">
                    <output className="available-points" aria-live="polite"
                      aria-label={`Pontos disponíveis de ${identity}`}>+{availablePoints}</output>
                    {attributeLabels.map(({ attribute, label }) => (
                      <div key={attribute} className="attribute-control">
                        <TouchButton className="attribute-info" aria-label={`Sobre ${label}`}
                          onPress={() => setDialog(attribute)}><AttributeIcon attribute={attribute} /></TouchButton>
                        <output className={attributes[attribute] > 1 ? "attribute-value--allocated" : ""}
                          aria-label={`${label} de ${identity}`}>{attributes[attribute]}</output>
                        <div className="attribute-adjustments">
                          <TouchButton aria-label={`Diminuir ${label} de ${identity}`}
                            disabled={busy || attributes[attribute] <= 1} onPress={() => onAttribute(attribute, -1)}>−</TouchButton>
                          <TouchButton aria-label={`Aumentar ${label} de ${identity}`}
                            disabled={busy || attributes[attribute] >= 3 || availablePoints === 0}
                            onPress={() => onAttribute(attribute, 1)}>+</TouchButton>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="sector-tabs" role="tablist" aria-orientation="vertical"
                aria-label={`Configuração de ${identity}`}>
                {tabs.map(({ tab, label }) => (
                  <TouchButton key={tab} id={`${panelId}-${tab}`} role="tab"
                    aria-label={!locked && label === "Personagem" && availablePoints > 0
                      ? `Personagem, ${availablePoints} pontos disponíveis` : label}
                    alert={!locked && tab === "character" && availablePoints > 0}
                    disabled={locked && tab !== "game"}
                    aria-selected={shownTab === tab} aria-controls={`${panelId}-content`}
                    tabIndex={shownTab === tab ? 0 : -1}
                    onKeyDown={(event) => {
                      if (locked) return;
                      if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
                      event.preventDefault();
                      const index = tabs.findIndex((item) => item.tab === tab);
                      const nextTab = event.key === "Home" ? "game" : event.key === "End" ? "character"
                        : tabs[(index + (event.key === "ArrowDown" ? 1 : 2)) % tabs.length]?.tab;
                      if (!nextTab) return;
                      setActiveTab(nextTab);
                      event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(
                        `button[id="${panelId}-${nextTab}"]`,
                      )?.focus();
                    }}
                    onPress={() => setActiveTab(tab)}><TabIcon tab={tab} /></TouchButton>
                ))}
              </div>
            </>
          ) : (
            <div className="join-area">
              <TouchButton className="join-button" disabled={!canEnter} onPress={() => {
                setDraftName("AAA");
                setActiveTab("game");
                onClearError();
                setDialog("join");
              }}>{canEnter ? "Entrar" : "Carregando…"}</TouchButton>
            </div>
          )}
        </div>
        {visibleDialog === "join" && (
          <SectorDialog title="Nome do jogador" onClose={closeDialog}>
            <div className="name-selection">
              <div className="name-wheels">
                {Array.from(draftName, (letter, index) => (
                  <LetterWheel key={index} value={letter} label={`Letra ${index + 1}`}
                    rotation={rotation} onRotate={(delta) => {
                      setDraftName((current) => rotatePlayerName(current, index, delta));
                      onClearError();
                    }} />
                ))}
              </div>
              <TouchButton className="confirm-join" disabled={busy || !canEnter} onPress={() => onEnter(draftName)}>
                Entrar
              </TouchButton>
            </div>
          </SectorDialog>
        )}
        {visibleDialog === "leave" && (
          <SectorDialog title="Quer sair?" onClose={closeDialog}>
            <div className="exit-confirmation">
              <TouchButton onPress={closeDialog}>Cancelar</TouchButton>
              <TouchButton disabled={busy} onPress={() => {
                setDialog(null);
                setActiveTab("game");
                onLeave();
              }}>Sair</TouchButton>
            </div>
          </SectorDialog>
        )}
        {visibleDialog && visibleDialog !== "join" && visibleDialog !== "leave" && (
          <SectorDialog title={attributeLabels.find(({ attribute }) => attribute === visibleDialog)?.label ?? ""}
            onClose={closeDialog}>
            <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
          </SectorDialog>
        )}
        {error && <p className="sector-error" role="alert">{error}</p>}
        {moving && (
          <div className="movement-overlay" role="status">
            <svg className="walking-icon" viewBox="0 0 40 48" aria-hidden="true">
              <circle cx="20" cy="7" r="5" />
              <path d="M20 15v15" />
              <path className="walking-arms" d="m20 17-10 9m10-9 10 9" />
              <path className="walking-legs" d="m20 30-9 14m9-14 9 14" />
            </svg>
            <p>Não é possível executar ação enquanto em movimento.</p>
          </div>
        )}
      </div>
    </article>
  );
}
