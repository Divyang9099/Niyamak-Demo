import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { uploadClientLogo, removeClientLogo, clientLogoUrl } from '../api/bd.api';
import { useToast } from '../../../context/ToastContext';

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB, per BD_MODULE_PLAN.md §12

const AVATAR_COLORS = [
  'bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm',
  'bg-gradient-to-br from-blue-500 to-cyan-600 text-white shadow-sm',
  'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm',
  'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm',
  'bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-sm',
  'bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-sm',
];
const colorFor = (name = '') => AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];

const validate = (file, showToast) => {
  if (!/^image\//.test(file.type || '')) { showToast('Logo must be an image', 'error'); return false; }
  if (file.size > MAX_BYTES) { showToast('Logo must be 2 MB or smaller', 'error'); return false; }
  return true;
};

/**
 * Client logo — drag-drop upload with a live rounded preview, falling back to
 * an initials avatar when there's no logo or the image fails to load.
 */
export const ClientLogoUpload = ({ clientId, name, logoUrl, onChange, pendingFile, onFileSelected, size = 76 }) => {
  const { showToast } = useToast();
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!pendingFile) { setPendingPreviewUrl(null); return; }
    const url = URL.createObjectURL(pendingFile);
    setPendingPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  const handleFile = async (file) => {
    if (!file || !validate(file, showToast)) return;

    if (!clientId) {
      setImgError(false);
      onFileSelected?.(file);
      return;
    }

    setBusy(true);
    try {
      const res = await uploadClientLogo(clientId, file);
      setImgError(false);
      onChange?.(res.data.data.logo_url);
      showToast('Logo updated');
    } catch (err) {
      showToast(err?.response?.data?.message || 'Logo upload failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (e) => {
    e.stopPropagation();
    if (!clientId) { onFileSelected?.(null); return; }
    setBusy(true);
    try {
      await removeClientLogo(clientId);
      onChange?.(null);
      showToast('Logo removed');
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to remove logo', 'error');
    } finally {
      setBusy(false);
    }
  };

  const showSavedImage = clientId && logoUrl && !imgError;
  const showPendingImage = !clientId && pendingPreviewUrl;
  const disabled = busy;

  return (
    <div className="flex items-center gap-4.5 p-4 rounded-2xl bg-slate-50/60 dark:bg-slate-800/30 border border-slate-200/70 dark:border-slate-800">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload client logo"
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) inputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled) handleFile(e.dataTransfer.files?.[0]);
        }}
        className={clsx(
          'relative shrink-0 rounded-2xl border-2 border-dashed flex items-center justify-center overflow-hidden transition-all duration-200 shadow-soft',
          disabled ? 'cursor-not-allowed border-slate-200 bg-slate-100' : 'cursor-pointer border-slate-300 hover:border-primary bg-surface hover:shadow-card group',
          dragOver && 'border-primary bg-primary/10'
        )}
        style={{ width: size, height: size }}
      >
        {showSavedImage ? (
          // Matches how the logo renders on the cards/table — the preview must
          // show the same framing the user will actually get.
          <img src={clientLogoUrl(clientId)} alt="" className="w-full h-full object-contain p-1.5" onError={() => setImgError(true)} />
        ) : showPendingImage ? (
          <img src={pendingPreviewUrl} alt="" className="w-full h-full object-contain p-1.5" />
        ) : (
          <div className={clsx('w-full h-full flex flex-col items-center justify-center font-black select-none', colorFor(name))}>
            <span style={{ fontSize: size * 0.36 }}>
              {(name || '?').trim().charAt(0).toUpperCase() || '?'}
            </span>
          </div>
        )}
        
        {/* Hover overlay hint */}
        {!disabled && !showSavedImage && !showPendingImage && (
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white">
            <span className="material-symbols-outlined text-xl">upload</span>
          </div>
        )}

        {busy && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          disabled={disabled}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      <div className="text-xs text-slate-500 space-y-1">
        <p className="font-bold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-base text-slate-400">image</span>
          Company Logo
        </p>
        <p className="text-slate-400">PNG, JPG, SVG or WEBP · Max 2 MB</p>
        {!clientId && pendingFile && (
          <p className="text-primary font-bold flex items-center gap-1">
            <span className="material-symbols-outlined text-xs">check_circle</span>
            Selected · Will upload upon client creation
          </p>
        )}
        {(showSavedImage || (!clientId && pendingFile)) && (
          <button 
            type="button" 
            onClick={handleRemove} 
            disabled={busy} 
            className="text-red-600 font-bold hover:underline flex items-center gap-0.5 pt-0.5"
          >
            <span className="material-symbols-outlined text-xs">delete</span> Remove Logo
          </button>
        )}
      </div>
    </div>
  );
};

export default ClientLogoUpload;
