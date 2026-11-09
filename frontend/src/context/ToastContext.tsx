import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

type Tone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  tone: Tone;
  message: string;
}

interface ToastContextValue {
  push: (message: string, tone?: Tone) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: Tone = "info") => {
      const id = nextId++;
      setItems((current) => [...current.slice(-3), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), 5200);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[min(92vw,380px)] flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 text-sm shadow-panel animate-slide-up ${
              item.tone === "success"
                ? "border-emerald-400/25 bg-emerald-950/90 text-emerald-100"
                : item.tone === "error"
                  ? "border-red-400/25 bg-red-950/90 text-red-100"
                  : "border-white/10 bg-navy-800/95 text-slate-100"
            }`}
          >
            {item.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
            ) : item.tone === "error" ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
            ) : (
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            )}
            <p className="flex-1 leading-relaxed">{item.message}</p>
            <button onClick={() => dismiss(item.id)} className="text-current/60 hover:text-current" aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
