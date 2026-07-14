import { useCallback, useEffect, useRef, useState } from "react";

export type ToastType = "success" | "error";

export interface ToastState {
  msg: string;
  type: ToastType;
}

const SUCCESS_MS = 3000;
const ERROR_MS = 15000;

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const remainingRef = useRef(SUCCESS_MS);
  const startedAtRef = useRef(0);
  const typeRef = useRef<ToastType>("success");
  const pausedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const dismissToast = useCallback(() => {
    clearTimer();
    pausedRef.current = false;
    setToast(null);
  }, [clearTimer]);

  const scheduleDismiss = useCallback(
    (delayMs: number) => {
      clearTimer();
      remainingRef.current = delayMs;
      startedAtRef.current = Date.now();
      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null;
        pausedRef.current = false;
        setToast(null);
      }, delayMs);
    },
    [clearTimer],
  );

  const showToast = useCallback(
    (msg: string, type: ToastType) => {
      typeRef.current = type;
      pausedRef.current = false;
      setToast({ msg, type });
      scheduleDismiss(type === "error" ? ERROR_MS : SUCCESS_MS);
    },
    [scheduleDismiss],
  );

  const pauseToastTimer = useCallback(() => {
    if (!toast || pausedRef.current || timeoutRef.current === null) return;
    pausedRef.current = true;
    const elapsed = Date.now() - startedAtRef.current;
    remainingRef.current = Math.max(1000, remainingRef.current - elapsed);
    clearTimer();
  }, [clearTimer, toast]);

  const resumeToastTimer = useCallback(() => {
    if (!toast || !pausedRef.current) return;
    pausedRef.current = false;
    scheduleDismiss(remainingRef.current);
  }, [scheduleDismiss, toast]);

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return { toast, showToast, dismissToast, pauseToastTimer, resumeToastTimer };
}
