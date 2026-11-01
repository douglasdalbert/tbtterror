import { useRef } from "react";
import { TouchButton } from "./TouchButton.js";

export function LetterWheel({ value, label, rotation = 0, onRotate }: {
  value: string;
  label: string;
  rotation?: number;
  onRotate: (delta: 1 | -1) => void;
}) {
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  return (
    <div className="letter-wheel">
      <TouchButton aria-label={`Próxima ${label}`} onPress={() => onRotate(1)}>▴</TouchButton>
      <div className="letter-wheel-value" role="spinbutton" tabIndex={0}
        aria-label={label} aria-valuemin={1} aria-valuemax={26}
        aria-valuenow={value.charCodeAt(0) - 64} aria-valuetext={value}
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          onRotate(event.key === "ArrowUp" ? 1 : -1);
        }}
        onWheel={(event) => {
          if (event.deltaY !== 0) onRotate(event.deltaY < 0 ? 1 : -1);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || pointer.current) return;
          pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.focus();
        }}
        onPointerUp={(event) => {
          const start = pointer.current;
          if (!start || start.id !== event.pointerId) return;
          pointer.current = null;
          const angle = rotation * Math.PI / 180;
          const distance = -(event.clientX - start.x) * Math.sin(angle)
            + (event.clientY - start.y) * Math.cos(angle);
          if (Math.abs(distance) >= 18) onRotate(distance < 0 ? 1 : -1);
        }}
        onPointerCancel={(event) => {
          if (pointer.current?.id === event.pointerId) pointer.current = null;
        }}
        onLostPointerCapture={(event) => {
          if (pointer.current?.id === event.pointerId) pointer.current = null;
        }}>
        {value}
      </div>
      <TouchButton aria-label={`Anterior ${label}`} onPress={() => onRotate(-1)}>▾</TouchButton>
    </div>
  );
}
