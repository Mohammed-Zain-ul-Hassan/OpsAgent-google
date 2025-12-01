"use client";
import React, { createContext, useContext, useState, useCallback } from "react";
import { X, CheckCircle, AlertTriangle, Info, AlertCircle } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: ToastType = "info") => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts((prev) => [...prev, { id, message, type }]);

        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 3000);
    }, []);

    const removeToast = (id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={`
              pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border backdrop-blur-md transition-all animate-in slide-in-from-right-full fade-in duration-300
              ${toast.type === "success" ? "bg-green-900/80 border-green-700 text-green-100" : ""}
              ${toast.type === "error" ? "bg-red-900/80 border-red-700 text-red-100" : ""}
              ${toast.type === "warning" ? "bg-yellow-900/80 border-yellow-700 text-yellow-100" : ""}
              ${toast.type === "info" ? "bg-blue-900/80 border-blue-700 text-blue-100" : ""}
            `}
                    >
                        {toast.type === "success" && <CheckCircle size={18} />}
                        {toast.type === "error" && <AlertCircle size={18} />}
                        {toast.type === "warning" && <AlertTriangle size={18} />}
                        {toast.type === "info" && <Info size={18} />}

                        <span className="text-sm font-medium">{toast.message}</span>

                        <button
                            onClick={() => removeToast(toast.id)}
                            className="ml-2 opacity-70 hover:opacity-100"
                        >
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error("useToast must be used within a ToastProvider");
    }
    return context;
}
