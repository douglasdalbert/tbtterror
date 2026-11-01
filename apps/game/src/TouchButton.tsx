import { useRef, type ButtonHTMLAttributes } from "react";

type TouchButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  onPress: () => void;
};

export function TouchButton({ onPress, disabled, children, ...props }: TouchButtonProps) {
  const activePointer = useRef<number | null>(null);
  const suppressClick = useRef(false);

  return (
    <button
      {...props}
      type="button"
      disabled={disabled}
      onPointerDown={(event) => {
        suppressClick.current = event.pointerType !== "mouse";
        if (disabled || event.button !== 0 || event.pointerType === "mouse"
          || activePointer.current !== null) return;
        activePointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={(event) => {
        if (activePointer.current !== event.pointerId) return;
        activePointer.current = null;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (!disabled && event.clientX >= bounds.left && event.clientX <= bounds.right
          && event.clientY >= bounds.top && event.clientY <= bounds.bottom) {
          onPress();
        }
      }}
      onPointerCancel={(event) => {
        if (activePointer.current === event.pointerId) activePointer.current = null;
      }}
      onLostPointerCapture={(event) => {
        if (activePointer.current === event.pointerId) activePointer.current = null;
      }}
      onClick={(event) => {
        // Touch is handled per pointer; retain keyboard and mouse activation without doubling taps.
        if (event.detail === 0 || !suppressClick.current) onPress();
      }}
    >
      {children}
    </button>
  );
}
