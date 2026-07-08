import { useCallback, useEffect, useRef, useState } from "react";

export type ToastType = "success" | "error";

export interface ToastState {
  msg: string;
  type: ToastType;
}

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string, type: ToastType) => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }
    setToast({ msg, type });
    timeoutRef.current = window.setTimeout(() => {
      setToast(null);
      timeoutRef.current = null;
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { toast, showToast };
}
