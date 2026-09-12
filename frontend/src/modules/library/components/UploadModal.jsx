import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useLibraryStore } from '../store/library.store';
import { Modal } from '../../../components/ui/Modal';
import { ChunkedUploader } from '../../../components/upload/ChunkedUploader';

export const UploadModal = ({ isOpen, onClose, onUploaded }) => {
    const { fetchLibraryData, currentFolderId, folders } = useLibraryStore();
    const [targetFolder,  setTargetFolder]  = useState(currentFolderId);
    const [description,   setDescription]   = useState('');
    const [completed,     setCompleted]     = useState(0);
    const fetchTimerRef                     = useRef(null);

    // Sync targetFolder when the modal opens (in case currentFolderId changed)
    useEffect(() => {
        if (isOpen) { setTargetFolder(currentFolderId); setDescription(''); }
    }, [isOpen, currentFolderId]);

    const extraMeta = useMemo(() => ({
        folder_id:   targetFolder   || undefined,
        description: description.trim() || undefined,
    }), [targetFolder, description]);

    const handleComplete = () => {
        setCompleted(prev => prev + 1);
        if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
        fetchTimerRef.current = setTimeout(() => {
            fetchTimerRef.current = null;
            fetchLibraryData({ folder_id: targetFolder });
            if (onUploaded) onUploaded(targetFolder);
            onClose();
        }, 800);
    };

    const handleClose = () => {
        setCompleted(0);
        setDescription('');
        onClose();
    };

    if (!isOpen) return null;

    return (
        <Modal title="Upload to Library" onClose={handleClose} isOpen={isOpen}>
            <div className="space-y-4">
                {/* Folder selector */}
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wider">Upload to Folder</label>
                    <select
                        value={targetFolder || ''}
                        onChange={(e) => setTargetFolder(e.target.value || null)}
                        className="w-full bg-surface border border-blue-500/50 text-slate-900 text-sm p-2 rounded-lg focus:outline-none focus:border-blue-400"
                    >
                        <option value="">All Files (no folder)</option>
                        {folders.map(f => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                    </select>
                </div>

                {/* Description */}
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wider">Description <span className="normal-case text-slate-400">(shown under the file name)</span></label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="e.g. Final survey report for Q3 2025…"
                        rows={2}
                        className="w-full bg-surface border border-slate-200 text-slate-900 text-sm p-2 rounded-lg resize-none focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 placeholder:text-slate-400"
                    />
                </div>

                {/* Upload zone */}
                <ChunkedUploader
                    entityType="library"
                    extraMeta={extraMeta}
                    onComplete={handleComplete}
                    label="Drag & drop files here or click to browse"
                />

                {completed > 0 && (
                    <p className="text-xs text-green-500 text-center font-bold">
                        {completed} file{completed !== 1 ? 's' : ''} uploaded successfully.
                    </p>
                )}

                <div className="flex justify-end pt-1">
                    <button
                        onClick={handleClose}
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-surface hover:bg-slate-200 text-slate-900 transition-colors"
                    >
                        {completed > 0 ? 'Done' : 'Cancel'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};
