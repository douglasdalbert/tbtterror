const tips = [
  "Todos vocês possuem walkie-talkie e podem conversar entre si.",
  "Caso você esteja no estado “dormindo”, poderá ser acordado por outro jogador.",
];

export function PreparationTips({ hintIndex }: { hintIndex: number }) {
  return (
    <div className="preparation-tips">
      {(["top", "right", "bottom", "left"] as const).map((side) => (
        <p key={side} className={`preparation-tip preparation-tip--${side}`}>
          {hintIndex === 0 && (
            <svg className="walkie-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 3h6v4H9zM8 7h8a2 2 0 0 1 2 2v11H6V9a2 2 0 0 1 2-2Z" />
              <path d="M9 11h6M9 14h2m4 0h.01" />
            </svg>
          )}
          {tips[hintIndex]}
        </p>
      ))}
    </div>
  );
}
