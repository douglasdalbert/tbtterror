import type { Catalog } from "@terror/contracts";

const tips = [
  "Todos vocês possuem walkie-talkie e podem conversar entre si.",
  "Caso você esteja no estado “dormindo”, poderá ser acordado por outro jogador.",
];

function WalkieTalkieIcon() {
  return (
    <svg className="walkie-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 3h6v4H9zM8 7h8a2 2 0 0 1 2 2v11H6V9a2 2 0 0 1 2-2Z" />
      <path d="M9 11h6M9 14h2m4 0h.01" />
    </svg>
  );
}

function CalibrationToken({ scale, attributes }: {
  scale: number;
  attributes: Catalog["characters"][number]["attributes"];
}) {
  const groups = [
    { letter: "F", value: attributes.strength, start: -145, x: 19, y: 19 },
    { letter: "V", value: attributes.speed, start: -25, x: 45, y: 19 },
    { letter: "I", value: attributes.intelligence, start: 95, x: 32, y: 47 },
  ];
  return (
    <svg
      className="calibration-token"
      style={{ width: `${64 * scale}px`, height: `${64 * scale}px` }}
      viewBox="0 0 64 64"
      role="img"
      aria-label={`Token de ${Math.round(64 * scale)} pixels CSS; força ${attributes.strength}, velocidade ${attributes.speed}, inteligência ${attributes.intelligence}`}
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

export function PlayerSector({ slot, character, characters, scale, hintIndex, onEnter, onLeave, onSelect, onScale }: {
  slot: number;
  character: Catalog["characters"][number] | undefined;
  characters: Catalog["characters"];
  scale: number;
  hintIndex: number;
  onEnter: () => void;
  onLeave: () => void;
  onSelect: (id: string) => void;
  onScale: (delta: number) => void;
}) {
  const side = slot === 3 || slot === 7;
  const position = slot === 3 ? "right" : slot === 7 ? "left"
    : slot < 3 ? `top-${slot}` : `bottom-${slot - 4}`;
  const className = [
    "sector",
    `sector--${position}`,
    side ? "sector--side" : slot < 3 ? "sector--top" : "sector--bottom",
  ].filter(Boolean).join(" ");
  const tip = tips[hintIndex] ?? tips[0]!;

  return (
    <article className={className} aria-label={`Setor ${slot + 1}`}>
      <div className="sector-card">
        <div className="sector-heading">
          <strong>Setor {slot + 1}</strong>
          {character && <button type="button" className="leave-button" onClick={onLeave}>Sair</button>}
        </div>
        {character ? (
          <div className="player-setup">
            <label className="character-picker">
              Personagem
              <select value={character.id} onChange={(event) => onSelect(event.target.value)}>
                {characters.map((option) => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
              </select>
            </label>
            <div className="calibration-controls">
              <button type="button" aria-label={`Diminuir escala compartilhada no setor ${slot + 1}`}
                disabled={scale <= 0.5} onClick={() => onScale(-0.05)}>−</button>
              <CalibrationToken scale={scale} attributes={character.attributes} />
              <button type="button" aria-label={`Aumentar escala compartilhada no setor ${slot + 1}`}
                disabled={scale >= 2} onClick={() => onScale(0.05)}>+</button>
              <span className="scale-label">{scale.toFixed(2)}×</span>
            </div>
          </div>
        ) : (
          <div className="join-area">
            <button type="button" className="join-button" disabled={characters.length === 0} onClick={onEnter}>
              {characters.length === 0 ? "Carregando…" : "Entrar e escolher personagem"}
            </button>
          </div>
        )}
        <p className="sector-tip">
          {hintIndex === 0 && <WalkieTalkieIcon />}
          {tip}
        </p>
      </div>
    </article>
  );
}
