import { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useToast } from '../../../context/ToastContext';
import { createContact, updateContact } from '../api/bd.api';
import { ChannelLogTable } from './ChannelLogTable';

const BLANK = { name: '', designation: '', department: '', is_decision_maker: false, is_primary: false };

/**
 * Add / Edit Person. Both modes render the same two-column layout; channels
 * need a contact row to attach to, so on Add the first Save creates the person
 * and keeps the modal open with the channel panel now live.
 */
export const ContactFormModal = ({ isOpen, onClose, clientId, contact, departments, onSaved, onActivityChanged }) => {
  const { showToast } = useToast();
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [createdContact, setCreatedContact] = useState(null);

  const activeContact = contact || createdContact;
  const isEdit = !!activeContact;

  useEffect(() => {
    if (!isOpen) return;
    setCreatedContact(null);
    setForm(contact
      ? {
          name: contact.name || '',
          designation: contact.designation || '',
          department: contact.department || '',
          is_decision_maker: !!contact.is_decision_maker,
          is_primary: !!contact.is_primary,
        }
      : BLANK);
  }, [isOpen, contact]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast('Name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        const res = await updateContact(activeContact.id, form);
        showToast('Contact updated');
        onSaved?.(res.data.data, true);
        onActivityChanged?.();
        onClose();
      } else {
        const res = await createContact(clientId, form);
        setCreatedContact(res.data.data);
        showToast('Person added — you can now log their channels');
        onSaved?.(res.data.data, false);
        onActivityChanged?.();
      }
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to save contact', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={contact ? 'Edit Contact' : 'Add Person'}
      className="max-w-5xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {createdContact ? 'Done' : 'Cancel'}
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving} icon="check" isLoading={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Save & Add Channels'}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 lg:gap-8">
        {/* Left Column: Contact Form Info */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleSave(); }}
          className="space-y-4 lg:col-span-2"
        >
          <Input
            label="Name"
            required
            autoFocus
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Full name"
          />
          <Input
            label="Designation"
            value={form.designation}
            onChange={e => setForm(f => ({ ...f, designation: e.target.value }))}
            placeholder="e.g. Procurement Head"
          />
          <div>
            <label className="text-xs font-semibold tracking-wide text-slate-600 mb-1.5 block">Department</label>
            <select
              value={form.department}
              onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 hover:bg-surface focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none rounded-xl px-4 py-2.5 text-sm text-slate-900 transition-all duration-200"
            >
              <option value="">— Select —</option>
              {departments.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-5">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_decision_maker}
                onChange={e => setForm(f => ({ ...f, is_decision_maker: e.target.checked }))}
                className="rounded border-slate-300 text-primary focus:ring-primary/30"
              />
              Decision maker
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_primary}
                onChange={e => setForm(f => ({ ...f, is_primary: e.target.checked }))}
                className="rounded border-slate-300 text-primary focus:ring-primary/30"
              />
              Primary contact
            </label>
          </div>
        </form>

        {/* Right Column: Logged Channels */}
        <div className="lg:col-span-3 space-y-6 lg:border-l lg:border-slate-100 lg:pl-8 dark:border-slate-800">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Logged Channels</p>
          {isEdit ? (
            <div className="space-y-6">
              <ChannelLogTable clientId={clientId} ownerType="contact" contactId={activeContact.id} channelType="email" title="Email" onActivityChanged={onActivityChanged} />
              <ChannelLogTable clientId={clientId} ownerType="contact" contactId={activeContact.id} channelType="phone" title="Phone" onActivityChanged={onActivityChanged} />
              <ChannelLogTable clientId={clientId} ownerType="contact" contactId={activeContact.id} channelType="linkedin" title="LinkedIn" onActivityChanged={onActivityChanged} />
            </div>
          ) : (
            <div className="space-y-4 opacity-50 select-none pointer-events-none">
              {['Email', 'Phone', 'LinkedIn'].map(label => (
                <div key={label}>
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">{label}</h4>
                  <div className="border border-dashed border-slate-200 rounded-xl py-6 text-center text-xs text-slate-300">
                    No {label.toLowerCase()} entries yet
                  </div>
                </div>
              ))}
            </div>
          )}
          {!isEdit && (
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-slate-300">info</span>
              Enter a name and hit Save to start logging this person’s channels.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ContactFormModal;
