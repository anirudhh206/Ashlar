import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, CircleAlert, X } from 'lucide-react';

interface ToastItem {
  id: number;
  kind: 'success' | 'error';
  message: string;
}

interface ToastContextValue {
  push: (kind: ToastItem['kind'], message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastItem['kind'], message: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  function dismiss(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 w-[320px]">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, transition: { duration: 0.2 } }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-start gap-2.5 rounded-xl bg-(--color-ink) text-white px-4 py-3 shadow-xl"
            >
              {t.kind === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-(--color-accent-glow) shrink-0 mt-0.5" />
              ) : (
                <CircleAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              )}
              <p className="text-[12.5px] leading-snug m-0 flex-1">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="text-white/50 hover:text-white shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
