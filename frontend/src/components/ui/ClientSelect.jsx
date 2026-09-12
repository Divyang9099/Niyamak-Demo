import { useCallback, useEffect, useState } from 'react';
import axiosInstance from '../../api/axios';
import { ENDPOINTS } from '../../api/endpoints';
import ClientFormModal from './ClientFormModal';

const LBL = 'text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block';
const SEL = 'w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-900 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all';

/**
 * Client picker used in the Project + Pipeline forms.
 * - lists clients from the Client module
 * - "＋ New" opens the shared ClientFormModal; the created client is added to the
 *   list and auto-selected (no page reload, no manual refresh)
 * - emits BOTH client_id and client_name so the backend can store the FK and keep
 *   the denormalised name in sync, plus the full `client` record so callers can
 *   auto-fill the client's saved details (contact number, email, …).
 *
 * Props:
 *   value       — selected client_id
 *   clientName  — currently stored client_name (fallback so an existing link still
 *                 shows even if its client is inactive / not in the first page)
 *   onChange({ client_id, client_name, client })  — `client` is null when cleared
 *   label, required, error, disabled
 */
export const ClientSelect = ({
  value,
  clientName,
  onChange,
  label = 'Client',
  required = false,
  error,
  disabled = false,
}) => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosInstance.get(ENDPOINTS.CLIENTS.GET_ALL, { params: { limit: 200 } });
      setClients(Array.isArray(res.data.data) ? res.data.data : []);
    } catch {
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const handleSelect = (e) => {
    const id = e.target.value;
    if (!id) { onChange?.({ client_id: '', client_name: '', client: null }); return; }
    const found = clients.find(c => c.id === id);
    onChange?.({
      client_id:   id,
      client_name: found ? found.name : (clientName || ''),
      client:      found || null,
    });
  };

  const handleCreated = (client) => {
    if (!client) return;
    setClients(prev => {
      const without = prev.filter(c => c.id !== client.id);
      return [...without, client].sort((a, b) => a.name.localeCompare(b.name));
    });
    onChange?.({ client_id: client.id, client_name: client.name, client });
  };

  // If the stored client_id isn't in the loaded list (inactive/deleted client),
  // still show its saved name so the field isn't silently blank on edit.
  const missingCurrent = value && !clients.some(c => c.id === value);

  return (
    <div>
      {label && (
        <label className={LBL}>
          {label}{required && <span className="text-red-400"> *</span>}
        </label>
      )}
      <div className="flex gap-2">
        <select
          value={value || ''}
          onChange={handleSelect}
          disabled={disabled || loading}
          className={SEL}
        >
          <option value="">{loading ? 'Loading clients…' : '— Select client —'}</option>
          {missingCurrent && <option value={value}>{clientName || 'Current client'}</option>}
          {clients.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}{c.company_name && c.company_name !== c.name ? ` — ${c.company_name}` : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          disabled={disabled}
          title="Add a new client"
          className="shrink-0 px-3 rounded-lg border border-primary/30 bg-primary/10 text-primary text-xs font-bold flex items-center gap-1 hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-base leading-none">add</span>
          <span className="hidden sm:inline">New</span>
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}

      <ClientFormModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        client={null}
        onSaved={handleCreated}
      />
    </div>
  );
};

export default ClientSelect;
