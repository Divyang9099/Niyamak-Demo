import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';

/**
 * DialogContext — promise-based replacements for window.confirm / window.prompt
 * rendered with the app's styled Modal so dialogs match the rest of the UI.
 *
 *   const { confirmDialog, promptDialog } = useDialog();
 *   const ok   = await confirmDialog({ title, message, confirmLabel, danger });
 *   const text = await promptDialog({ title, label, initial, placeholder });  // null = cancelled
 */
const DialogContext = createContext(null);

export const DialogProvider = ({ children }) => {
  const [dialog, setDialog] = useState(null); // { type, title, message, ... }
  const [promptValue, setPromptValue] = useState('');
  const resolveRef = useRef(null);

  const close = useCallback((result) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setDialog(null);
  }, []);

  const confirmDialog = useCallback((opts = {}) => new Promise((resolve) => {
    resolveRef.current = resolve;
    setDialog({ type: 'confirm', ...opts });
  }), []);

  const promptDialog = useCallback((opts = {}) => new Promise((resolve) => {
    resolveRef.current = resolve;
    setPromptValue(opts.initial || '');
    setDialog({ type: 'prompt', ...opts });
  }), []);

  const submitPrompt = () => {
    const v = promptValue.trim();
    if (!v) return; // require a value; Cancel/X to dismiss
    close(v);
  };

  return (
    <DialogContext.Provider value={{ confirmDialog, promptDialog }}>
      {children}

      {/* Confirm dialog */}
      <Modal
        isOpen={dialog?.type === 'confirm'}
        onClose={() => close(false)}
        title={dialog?.title || 'Are you sure?'}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => close(false)}>
              {dialog?.cancelLabel || 'Cancel'}
            </Button>
            <Button
              variant={dialog?.danger ? 'danger' : 'primary'}
              icon={dialog?.danger ? 'delete' : 'check'}
              onClick={() => close(true)}
            >
              {dialog?.confirmLabel || 'Confirm'}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
          {dialog?.message || 'This action cannot be undone.'}
        </p>
      </Modal>

      {/* Prompt dialog */}
      <Modal
        isOpen={dialog?.type === 'prompt'}
        onClose={() => close(null)}
        title={dialog?.title || 'Enter a value'}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => close(null)}>Cancel</Button>
            <Button icon="check" onClick={submitPrompt} disabled={!promptValue.trim()}>
              {dialog?.confirmLabel || 'Save'}
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          {dialog?.label && (
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">
              {dialog.label}
            </label>
          )}
          <input
            type="text"
            autoFocus
            value={promptValue}
            onChange={(e) => setPromptValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitPrompt(); }}
            placeholder={dialog?.placeholder || ''}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
      </Modal>
    </DialogContext.Provider>
  );
};

export const useDialog = () => {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within DialogProvider');
  return ctx;
};
