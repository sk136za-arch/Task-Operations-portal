"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/spinner";

type LoadingOperation = { id: number; label: string };
type LoadingContextValue = {
  runWithLoading: <T>(label: string, action: () => Promise<T>) => Promise<T>;
};

const LoadingContext = createContext<LoadingContextValue | null>(null);

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [operations, setOperations] = useState<LoadingOperation[]>([]);
  const nextId = useRef(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const runWithLoading = useCallback(async <T,>(label: string, action: () => Promise<T>): Promise<T> => {
    const id = ++nextId.current;
    setOperations((current) => [...current, { id, label }]);
    try {
      return await action();
    } finally {
      setOperations((current) => current.filter((operation) => operation.id !== id));
    }
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (operations.length > 0 && !dialog.open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      dialog.focus();
    } else if (operations.length === 0 && dialog.open) {
      dialog.close();
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    }
  }, [operations.length]);

  const label = operations[0]?.label ?? "Working…";

  return (
    <LoadingContext.Provider value={{ runWithLoading }}>
      {children}
      <dialog
        ref={dialogRef}
        className="global-loading-dialog"
        aria-labelledby="global-loading-title"
        aria-busy={operations.length > 0}
        tabIndex={-1}
        onCancel={(event) => event.preventDefault()}
      >
        <div className="global-loading-icon"><Spinner aria-hidden="true" /></div>
        <p className="global-loading-eyebrow">Task Ops Portal</p>
        <p id="global-loading-title" className="global-loading-title" role="status" aria-live="polite">{label}</p>
        <p className="global-loading-help">Please wait while we finish this action.</p>
      </dialog>
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  const context = useContext(LoadingContext);
  if (!context) throw new Error("useLoading must be used inside LoadingProvider");
  return context;
}
