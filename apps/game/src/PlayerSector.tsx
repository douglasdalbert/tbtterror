import { useId, useState } from "react";
import { availableAttributePoints, type Attributes, type AttributeName } from "@terror/contracts";
import { TouchButton } from "./TouchButton.js";

function TabIcon({ tab }: { tab: "token" | "character" }) {
  return (
    <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
      {tab === "token" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4" />
          <path d="M7 6l2 1m6-1l2 1m-6 11h2" />
        </>
      ) : (
        <path d="M9 20v-4a7 7 0 1 1 10-6l2 4h-3v4h-4v2M8 8h5m-3-2v4" />
      )}
    </svg>
  );
}

function CalibrationToken({ scale, attributes }: {
  scale: number;
  attributes: Attributes;
}) {
  const groups = [
    { letter: "F", value: attributes.strength, start: -145, x: 19, y: 19 },
    { letter: "D", value: attributes.dexterity, start: -25, x: 45, y: 19 },
    { letter: "I", value: attributes.intelligence, start: 95, x: 32, y: 47 },
  ];
  return (
    <svg
      className="calibration-token"
      style={{ width: `${64 * scale}px`, height: `${64 * scale}px` }}
      viewBox="0 0 64 64"
      role="img"
      aria-label={`Token de ${Math.round(64 * scale)} pixels CSS; força ${attributes.strength}, destreza ${attributes.dexterity}, inteligência ${attributes.intelligence}`}
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
  { attribute: "intelligence", label: "Inteligência" },
];

export function PlayerSector({ slot, attributes, canEnter, scale, onEnter, onLeave, onAttribute, onScale }: {
  slot: number;
  attributes: Attributes | undefined;
  canEnter: boolean;
  scale: number;
  onEnter: () => void;
  onLeave: () => void;
  onAttribute: (attribute: AttributeName, delta: 1 | -1) => void;
  onScale: (delta: number) => void;
}) {
  const [activeTab, setActiveTab] = useState<"token" | "character">("token");
  const panelId = useId();
  const side = slot === 3 || slot === 7;
  const position = slot === 3 ? "right" : slot === 7 ? "left"
    : slot < 3 ? `top-${slot}` : `bottom-${slot - 4}`;
  const className = [
    "sector",
    `sector--${position}`,
    side ? "sector--side" : slot < 3 ? "sector--top" : "sector--bottom",
  ].filter(Boolean).join(" ");
  const availablePoints = attributes ? availableAttributePoints(attributes) : 3;

  return (
    <article className={className} aria-label={`Setor ${slot + 1}`}>
      <div className="sector-card">
        <div className="sector-heading">
          <strong>Setor {slot + 1}</strong>
          {attributes && (
            <>
              <div className="sector-tabs" role="tablist" aria-label={`Configuração do setor ${slot + 1}`}>
                {(["token", "character"] as const).map((tab) => (
                  <TouchButton key={tab} id={`${panelId}-${tab}`} role="tab"
                    aria-label={tab === "token" ? "Token" : "Personagem"}
                    aria-selected={activeTab === tab} aria-controls={`${panelId}-content`}
                    tabIndex={activeTab === tab ? 0 : -1}
                    onKeyDown={(event) => {
                      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                      event.preventDefault();
                      const nextTab = event.key === "Home" ? "token" : event.key === "End" ? "character"
                        : activeTab === "token" ? "character" : "token";
                      setActiveTab(nextTab);
                      const target = event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(
                        `button[id="${panelId}-${nextTab}"]`,
                      );
                      target?.focus();
                    }}
                    onPress={() => setActiveTab(tab)}>
                    <TabIcon tab={tab} />
                  </TouchButton>
                ))}
              </div>
              <TouchButton className="leave-button" onPress={() => {
                setActiveTab("token");
                onLeave();
              }}>Sair</TouchButton>
            </>
          )}
        </div>
        {attributes ? (
          <div id={`${panelId}-content`} className="player-setup" role="tabpanel"
            aria-labelledby={`${panelId}-${activeTab}`}>
            {activeTab === "token" ? (
              <div className="calibration-controls">
                <TouchButton aria-label={`Diminuir escala compartilhada no setor ${slot + 1}`}
                  disabled={scale <= 0.5} onPress={() => onScale(-0.05)}>−</TouchButton>
                <CalibrationToken scale={scale} attributes={attributes} />
                <TouchButton aria-label={`Aumentar escala compartilhada no setor ${slot + 1}`}
                  disabled={scale >= 2} onPress={() => onScale(0.05)}>+</TouchButton>
                <span className="scale-label">{scale.toFixed(2)}×</span>
              </div>
            ) : (
              <div className="character-definition">
                <p className="available-points" aria-live="polite">Pontos disponíveis: {availablePoints}</p>
                <div className="attribute-columns">
                  {attributeLabels.map(({ attribute, label }) => (
                    <div key={attribute} className="attribute-control">
                      <span>{label}</span>
                      <div>
                        <TouchButton aria-label={`Diminuir ${label} no setor ${slot + 1}`}
                          disabled={attributes[attribute] <= 1} onPress={() => onAttribute(attribute, -1)}>
                          −
                        </TouchButton>
                        <output aria-label={`${label} no setor ${slot + 1}`}>{attributes[attribute]}</output>
                        <TouchButton aria-label={`Aumentar ${label} no setor ${slot + 1}`}
                          disabled={attributes[attribute] >= 3 || availablePoints === 0}
                          onPress={() => onAttribute(attribute, 1)}>
                          +
                        </TouchButton>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="join-area">
            <TouchButton className="join-button" disabled={!canEnter} onPress={onEnter}>
              {canEnter ? "Entrar" : "Carregando…"}
            </TouchButton>
          </div>
        )}
      </div>
    </article>
  );
}
