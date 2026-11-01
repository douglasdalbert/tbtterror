import { useEffect, useId, useState } from "react";
import { availableAttributePoints, rotatePlayerName, type Attributes, type AttributeName } from "@terror/contracts";
import { TouchButton } from "./TouchButton.js";
import { AttributeIcon, TabIcon } from "./Icons.js";
import { LetterWheel } from "./LetterWheel.js";
import { SectorDialog } from "./SectorDialog.js";

function CalibrationToken({ scale, attributes }: {
  scale: number;
  attributes: Attributes;
}) {
  const groups = [
    { letter: "F", value: attributes.strength, start: -145, x: 19, y: 19 },
    { letter: "D", value: attributes.dexterity, start: -25, x: 45, y: 19 },
    { letter: "I", value: attributes.wisdom, start: 95, x: 32, y: 47 },
  ];
  return (
    <svg
      className="calibration-token"
      style={{ width: `${64 * scale}px`, height: `${64 * scale}px` }}
      viewBox="0 0 64 64"
      role="img"
      aria-label={`Token de ${Math.round(64 * scale)} pixels CSS; força ${attributes.strength}, destreza ${attributes.dexterity}, inteligência ${attributes.wisdom}`}
    >
      <circle cx="32" cy="32" r="31" fill="#192d3d" stroke="#91a9bc" strokeWidth="1.5" />
      <circle cx="32" cy="32" r="15" fill="#1678cf" />
      {groups.map(({ letter, value, start, x, y }) => (
        <g key={letter} fill="none" strokeLinecap="round" strokeWidth="5">
          {[0, 1, 2].map((segment) => {
            const beginning = (start + segment * 20) * Math.PI / 180;
            const ending = (start + segment * 20 + 13) * Math.PI / 180;
            const x1 = 32 + 25 * Math.cos(beginning);
            const y1 = 32 + 25 * Math.sin(beginning);
            const x2 = 32 + 25 * Math.cos(ending);
            const y2 = 32 + 25 * Math.sin(ending);
            return (
              <path
                key={segment}
                d={`M ${x1} ${y1} A 25 25 0 0 1 ${x2} ${y2}`}
                stroke={segment < value ? "#75d9f4" : "#596777"}
              />
            );
          })}
          <text x={x} y={y}
            fill="#e6edf3" stroke="none" fontSize="7" fontWeight="700" textAnchor="middle">
            {letter}
          </text>
        </g>
      ))}
    </svg>
  );
}

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

export function PlayerSector({ slot, name, attributes, error, canEnter, scale, onEnter, onLeave, onClearError, onAttribute, onScale }: {
  slot: number;
  name: string | undefined;
  attributes: Attributes | undefined;
  error: string;
  canEnter: boolean;
  scale: number;
  onEnter: (name: string) => void;
  onLeave: () => void;
  onClearError: () => void;
  onAttribute: (attribute: AttributeName, delta: 1 | -1) => void;
  onScale: (delta: number) => void;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("game");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [draftName, setDraftName] = useState("AAA");
  const panelId = useId();
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
  const visibleDialog = dialog === "join" && attributes ? null : dialog;
  const closeDialog = () => {
    setDialog(null);
    onClearError();
  };

  return (
    <article className={className} aria-label={identity}>
      <div className="sector-card">
        <div className="sector-layout" inert={visibleDialog !== null}>
          {attributes ? (
            <>
              <nav className="sector-identity" aria-label={`Jogador ${identity}`}>
                <strong className="player-name">{name}</strong>
                <TouchButton className="leave-button" aria-label={`Sair ${identity}`}
                  onPress={() => setDialog("leave")}><TabIcon tab="leave" /></TouchButton>
              </nav>
              <div id={`${panelId}-content`} className="player-setup" role="tabpanel"
                aria-labelledby={`${panelId}-${activeTab}`}>
                {activeTab === "token" && (
                  <div className="calibration-controls">
                    <TouchButton aria-label={`Diminuir escala compartilhada de ${identity}`}
                      disabled={scale <= 0.5} onPress={() => onScale(-0.05)}>−</TouchButton>
                    <CalibrationToken scale={scale} attributes={attributes} />
                    <TouchButton aria-label={`Aumentar escala compartilhada de ${identity}`}
                      disabled={scale >= 2} onPress={() => onScale(0.05)}>+</TouchButton>
                  </div>
                )}
                {activeTab === "character" && (
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
                            disabled={attributes[attribute] <= 1} onPress={() => onAttribute(attribute, -1)}>−</TouchButton>
                          <TouchButton aria-label={`Aumentar ${label} de ${identity}`}
                            disabled={attributes[attribute] >= 3 || availablePoints === 0}
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
                    aria-label={label === "Personagem" && availablePoints > 0
                      ? `Personagem, ${availablePoints} pontos disponíveis` : label}
                    alert={tab === "character" && availablePoints > 0}
                    aria-selected={activeTab === tab} aria-controls={`${panelId}-content`}
                    tabIndex={activeTab === tab ? 0 : -1}
                    onKeyDown={(event) => {
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
              <TouchButton className="confirm-join" disabled={!canEnter} onPress={() => onEnter(draftName)}>
                Entrar
              </TouchButton>
            </div>
          </SectorDialog>
        )}
        {visibleDialog === "leave" && (
          <SectorDialog title="Quer sair?" onClose={closeDialog}>
            <div className="exit-confirmation">
              <TouchButton onPress={closeDialog}>Cancelar</TouchButton>
              <TouchButton onPress={() => {
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
      </div>
    </article>
  );
}
