import { useEffect, useRef, useState, useCallback } from 'react';
import axiosInstance from '../../api/axios';
import { ENDPOINTS } from '../../api/endpoints';
import { Modal } from './Modal';
import { Input } from './Input';
import { Button } from './Button';
import { CharCounter } from './CharCounter';
import { useToast } from '../../context/ToastContext';

const BLANK = {
  name: '', company_name: '', contact_person: '', contact_email: '', contact_number: '',
  gstin: '', address: '', city: '', state: '', website: '', notes: '', status: 'active',
};

const NOTES_MAX = 500;

// GSTIN: 2-digit state + 5-char PAN-alpha + 4-digit + alpha + 1 + Z + 1
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const validateGstin = (v) => {
  if (!v) return null;
  if (v.length < 15) return 'GSTIN must be 15 characters';
  if (!GSTIN_RE.test(v)) return 'Invalid GSTIN format (e.g. 24AAACN1234A1Z5)';
  return null;
};

/**
 * Create / edit a client. Reused by the Clients page AND the inline "Add Client"
 * flow inside ClientSelect.
 *
 * Props:
 *   isOpen, onClose
 *   client   — existing client to edit, or null/undefined to create
 *   onSaved(savedClient) — called with the created/updated client on success
 */
export const ClientFormModal = ({ isOpen, onClose, client, onSaved }) => {
  const { showToast } = useToast();
  const [form, setForm] = useState({ ...BLANK });
  const [saving, setSaving] = useState(false);
  const [gstinError, setGstinError] = useState(null);
  const [dupWarning, setDupWarning] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const isEdit = !!client?.id;

  // Seed the form ONLY on closed→open transition so in-progress typing is never wiped.
  const prevOpen = useRef(false);
  useEffect(() => {
    if (isOpen && !prevOpen.current) {
      setForm(client?.id
        ? { ...BLANK, ...Object.fromEntries(Object.keys(BLANK).map(k => [k, client[k] ?? BLANK[k]])) }
        : { ...BLANK });
      setGstinError(null);
      setDupWarning(null);
      setIsDirty(false);
    }
    prevOpen.current = isOpen;
  }, [isOpen, client]);

  // Debounced duplicate-name check — fires 600ms after the name field changes.
  const dupTimer = useRef(null);
  const checkDuplicate = useCallback((name) => {
    clearTimeout(dupTimer.current);
    const trimmed = name.trim();
    if (trimmed.length < 2) { setDupWarning(null); return; }
    dupTimer.current = setTimeout(async () => {
      try {
        const res = await axiosInstance.get(ENDPOINTS.CLIENTS.GET_ALL, {
          params: { search: trimmed, limit: 5 },
        });
        const found = (res.data.data || []).find(
          c => c.name.trim().toLowerCase() === trimmed.toLowerCase() && c.id !== client?.id
        );
        setDupWarning(found ? `A client named "${found.name}" already exists.` : null);
      } catch { /* silent */ }
    }, 600);
  }, [client?.id]);

  const set = (field) => (e) => {
    let val = e.target.value;
    // Auto-uppercase GSTIN as the user types
    if (field === 'gstin') {
      val = val.toUpperCase().replace(/\s/g, '');
      setGstinError(validateGstin(val));
    }
    setForm(f => ({ ...f, [field]: val }));
    setIsDirty(true);
    if (field === 'name') checkDuplicate(val);
  };

  const handleClose = () => {
    if (isDirty && !window.confirm('You have unsaved changes. Discard them?')) return;
    onClose();
  };

  const handleSave = async () => {
    if (!form.name.trim()) { showToast('Client name is required', 'error'); return; }
    if (gstinError) { showToast(gstinError, 'error'); return; }
    setSaving(true);
    try {
      const res = isEdit
        ? await axiosInstance.put(ENDPOINTS.CLIENTS.UPDATE(client.id), form)
        : await axiosInstance.post(ENDPOINTS.CLIENTS.CREATE, form);
      const saved = res.data.data;
      showToast(isEdit ? 'Client updated' : 'Client created');
      setIsDirty(false);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to save client', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEdit ? 'Edit Client' : 'Add New Client'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} icon="check">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Client'}
          </Button>
        </div>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
        {/* Duplicate name warning */}
        {dupWarning && (
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
            <span className="material-symbols-outlined text-sm text-amber-500">warning</span>
            {dupWarning}
          </div>
        )}

        <Input label="Client Name" value={form.name} onChange={set('name')} required placeholder="e.g. NTPC Limited" autoFocus />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Company Name" value={form.company_name} onChange={set('company_name')} placeholder="Legal / registered name" />
          <Input label="Contact Person" value={form.contact_person} onChange={set('contact_person')} placeholder="e.g. Ramesh Patel" />
          <Input label="Contact Email" type="email" value={form.contact_email} onChange={set('contact_email')} placeholder="e.g. buyer@client.com" />
          <Input label="Contact Number" type="tel" value={form.contact_number} onChange={set('contact_number')} placeholder="e.g. +91 98765 43210" />
          <div>
            <Input
              label="GSTIN"
              value={form.gstin}
              onChange={set('gstin')}
              placeholder="e.g. 24AAACN1234A1Z5"
              error={gstinError}
              inputClassName="uppercase"
              maxLength={15}
            />
            {!gstinError && form.gstin.length > 0 && form.gstin.length === 15 && (
              <span className="text-[10px] text-green-600 flex items-center gap-1 mt-1">
                <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                Valid GSTIN format
              </span>
            )}
          </div>
          <Input label="Website" value={form.website} onChange={set('website')} placeholder="e.g. https://client.com" />
          <Input label="City" value={form.city} onChange={set('city')} placeholder="e.g. Surat" />
          <Input label="State" value={form.state} onChange={set('state')} placeholder="e.g. Gujarat" />
        </div>
        <Input label="Address" value={form.address} onChange={set('address')} placeholder="Billing / site address" />
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Notes</label>
            <CharCounter current={form.notes.length} max={NOTES_MAX} />
          </div>
          <textarea
            value={form.notes}
            onChange={set('notes')}
            rows={2}
            maxLength={NOTES_MAX}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-900 text-sm resize-none focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
            placeholder="Payment terms, key relationships, preferences…"
          />
        </div>
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Status</label>
          <select value={form.status} onChange={set('status')} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-900 text-sm focus:outline-none focus:border-primary transition-all">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </form>
    </Modal>
  );
};

export default ClientFormModal;
