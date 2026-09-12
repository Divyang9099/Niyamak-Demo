import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const showToast = useCallback((message, type = 'success') => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 5000);
    }, []);

    const removeToast = (id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed bottom-4 right-4 z-[9999] space-y-2">
                {toasts.map(toast => (
                    <div 
                        key={toast.id}
                        onClick={() => removeToast(toast.id)}
                        className={`px-5 py-3 rounded-xl font-semibold text-sm shadow-pop flex items-center justify-between gap-4 cursor-pointer transform transition-all animate-in slide-in-from-right duration-300 border ${
                            toast.type === 'error'   ? 'bg-red-50 text-red-700 border-red-200' :
                            toast.type === 'warning' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                       'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                    >
                        <span>{toast.message}</span>
                        <span className="material-symbols-outlined text-sm">close</span>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

const FALLBACK = { showToast: () => {} };

export const useToast = () => {
    const context = useContext(ToastContext);
    return context ?? FALLBACK;
};
