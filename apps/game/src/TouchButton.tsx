import { useCallback, useEffect, useRef, type ButtonHTMLAttributes } from "react";

type TouchButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  alert?: boolean;
} & ({ onPress: () => void; onHoldChange?: never } | {
  onPress?: never;
  onHoldChange: (holding: boolean) => void;
});

export function TouchButton({ onPress, onHoldChange, disabled, children, alert = false, className,
  onKeyDown, onKeyUp, onBlur, ...props }: TouchButtonProps) {
  const activePointer = useRef<number | null>(null);
  const mousePressed = useRef(false);
  const holding = useRef(false);
  const holdCallback = useRef(onHoldChange);
  holdCallback.current = onHoldChange;
  const endHold = useCallback(() => {
    if (!holding.current) return;
    holding.current = false;
    activePointer.current = null;
    holdCallback.current?.(false);
  }, []);
  const startHold = () => {
    if (disabled || holding.current) return;
    holding.current = true;
    holdCallback.current?.(true);
  };
  useEffect(() => {
    window.addEventListener("blur", endHold);
    const hide = () => { if (document.hidden) endHold(); };
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("blur", endHold);
      document.removeEventListener("visibilitychange", hide);
      endHold();
    };
  }, [endHold]);
  useEffect(() => { if (disabled) endHold(); }, [disabled, endHold]);

  return (
    <button
      {...props}
      className={["touch-button", className].filter(Boolean).join(" ")}
      type="button"
      disabled={disabled}
      onPointerDown={(event) => {
        if (onHoldChange) {
          if (disabled || event.button !== 0 || activePointer.current !== null || holding.current) return;
          activePointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          startHold();
          return;
        }
        mousePressed.current = event.pointerType === "mouse" && event.button === 0;
        if (disabled || event.button !== 0 || event.pointerType === "mouse"
          || activePointer.current !== null) return;
        activePointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={(event) => {
        if (activePointer.current !== event.pointerId) return;
        if (onHoldChange) { endHold(); return; }
        activePointer.current = null;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (!disabled && event.clientX >= bounds.left && event.clientX <= bounds.right
          && event.clientY >= bounds.top && event.clientY <= bounds.bottom) {
          onPress?.();
        }
      }}
      onPointerCancel={(event) => {
        if (activePointer.current === event.pointerId) endHold();
        if (activePointer.current === event.pointerId) activePointer.current = null;
        mousePressed.current = false;
      }}
      onPointerLeave={(event) => {
        if (onHoldChange && activePointer.current === event.pointerId) endHold();
        if (event.pointerType === "mouse") mousePressed.current = false;
      }}
      onLostPointerCapture={(event) => {
        if (activePointer.current === event.pointerId) endHold();
        if (activePointer.current === event.pointerId) activePointer.current = null;
      }}
      onClick={(event) => {
        if (onHoldChange) { event.preventDefault(); return; }
        // Ignore touch clicks retargeted from a gesture that started on another control.
        const activate = event.detail === 0 || mousePressed.current;
        mousePressed.current = false;
        if (activate) onPress?.();
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (!onHoldChange || ![" ", "Enter"].includes(event.key)) return;
        event.preventDefault();
        if (!event.repeat) startHold();
      }}
      onKeyUp={(event) => {
        onKeyUp?.(event);
        if (!onHoldChange || ![" ", "Enter"].includes(event.key)) return;
        event.preventDefault();
        endHold();
      }}
      onBlur={(event) => {
        onBlur?.(event);
        if (activePointer.current === null) endHold();
      }}
    >
      {children}
      {alert && <span className="button-alert" aria-hidden="true" />}
    </button>
  );
}
