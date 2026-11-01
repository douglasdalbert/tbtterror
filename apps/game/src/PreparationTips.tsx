import { WalkieIcon } from "./Icons.js";

const tips = [
  "Todos vocês possuem walkie-talkie e podem conversar entre si.",
  "Caso você esteja no estado “dormindo”, poderá ser acordado por outro jogador.",
];

export function PreparationTips({ hintIndex }: { hintIndex: number }) {
  return (
    <div className="preparation-tips">
      {(["top", "right", "bottom", "left"] as const).map((side) => (
        <p key={side} className={`preparation-tip preparation-tip--${side}`}>
          {hintIndex === 0 && <WalkieIcon />}
          {tips[hintIndex]}
        </p>
      ))}
    </div>
  );
}
