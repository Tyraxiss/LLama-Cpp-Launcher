import { useCallback, useState } from "react";

export type ToastType = "success" | "error";

export interface ToastState {
  msg: string;
  type: ToastType;
}

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((msg: string, type: ToastType) => {
    setToast({ msg, type });
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  return { toast, showToast };
}
