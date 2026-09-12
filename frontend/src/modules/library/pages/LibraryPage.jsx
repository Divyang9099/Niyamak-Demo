import { useEffect, useRef, useState } from 'react';
import useScrollLock from '../../../hooks/useScrollLock';
import { useLibraryStore } from '../store/library.store';
import { LibrarySkeleton, SectionSkeleton } from '../../../components/ui/Skeletons';
import { UploadModal } from '../components/UploadModal';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Modal } from '../../../components/ui/Modal';
import useAuth from '../../../hooks/useAuth';
import { ROLES } from '../../../utils/constants';
import axiosInstance from '../../../api/axios';
import { ENDPOINTS } from '../../../api/endpoints';
import { formatDateOnly } from '../../../utils/dateUtils';
import { useSocket } from '../../../context/SocketContext';
import { useToast } from '../../../context/ToastContext';
import { useDialog } from '../../../context/DialogContext';

// ── File type icon helper ─────────────────────────────────────────────────────
const fileIcon = (name = '') => {
  const ext = name.split('.').pop().toLowerCase();
  if (['pdf'].includes(ext))                         return { icon: 'picture_as_pdf', color: 'text-red-500' };
  if (['doc', 'docx'].includes(ext))                 return { icon: 'description',    color: 'text-blue-600' };
  if (['xls', 'xlsx', 'csv'].includes(ext))          return { icon: 'table_chart',    color: 'text-green-600' };
  if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) return { icon: 'image',    color: 'text-purple-500' };
  if (['kml', 'kmz', 'geojson'].includes(ext))       return { icon: 'map',           color: 'text-teal-500' };
  if (['zip', 'rar', '7z'].includes(ext))            return { icon: 'folder_zip',    color: 'text-amber-500' };
  if (['mp4', 'avi', 'mov'].includes(ext))           return { icon: 'videocam',      color: 'text-pink-500' };
  return { icon: 'description', color: 'text-slate-400' };
};

const fileSizeFmt = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const LibraryPage = () => {
  const { files, folders, isLoading, isFetchingFiles, fetchLibraryData, fetchFiles, setCurrentFolder, currentFolderId, deleteDocument, createFolder, deleteFolder } = useLibraryStore();
  const [isUploadModalOpen, setUploadModalOpen] = useState(false);
  const [newFolderName,     setNewFolderName]   = useState('');
  const [isCreatingFolder,  setIsCreatingFolder] = useState(false);
  const { user }   = useAuth();
  const { socket } = useSocket();
  const { showToast } = useToast();
  const { confirmDialog } = useDialog();
  const [searchTerm,     setSearchTerm]     = useState('');
  const [versionModal,   setVersionModal]   = useState(null);
  const [versions,       setVersions]       = useState([]);
  const [versionsLoading,setVersionsLoading] = useState(false);
  const [restoringId,    setRestoringId]    = useState(null);
  const [uploadingVersion, setUploadingVersion] = useState(false);
  const versionFileRef = useRef(null);
  const [viewMode,    setViewMode]    = useState('grid');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useScrollLock(sidebarOpen);

  const canUpload = user?.role === ROLES.ADMIN;
  const canManage = user?.role === ROLES.ADMIN;

  const fetchParams = () => {
    const p = { search: searchTerm };
    if (currentFolderId) p.folder_id = currentFolderId;
    return p;
  };

  // Initial load: show skeleton + fetch folders
  useEffect(() => {
    fetchLibraryData(fetchParams());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Folder switch or search: silent file-only refresh (no skeleton)
  useEffect(() => {
    const t = setTimeout(() => fetchFiles(fetchParams()), 250);
    return () => clearTimeout(t);
  }, [searchTerm, currentFolderId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!socket) return;
    const refresh = () => fetchFiles(fetchParams());
    socket.on('library:doc_uploaded', refresh);
    socket.on('library:doc_deleted',  refresh);
    return () => { socket.off('library:doc_uploaded', refresh); socket.off('library:doc_deleted', refresh); };
  }, [socket, searchTerm, currentFolderId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectFolder = (folderId) => {
    setCurrentFolder(folderId);
    setSidebarOpen(false);
  };

  const handleSelectAll = () => {
    setCurrentFolder(null);
    setSidebarOpen(false);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await createFolder(newFolderName.trim());
      setNewFolderName(''); setIsCreatingFolder(false);
      showToast('Folder created');
    } catch { showToast('Failed to create folder', 'error'); }
  };

  // After upload: auto-switch sidebar to the folder the file was placed in
  const handleUploaded = (folderId) => {
    setCurrentFolder(folderId || null);
  };

  const handleDownload = async (id, _file, versionId = null) => {
    try {
      const endpoint = versionId
        ? `${ENDPOINTS.LIBRARY.DOWNLOAD(id)}?version_id=${versionId}`
        : ENDPOINTS.LIBRARY.DOWNLOAD(id);
      const res = await axiosInstance.get(endpoint);
      const { url, file_name } = res.data.data;
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file_name || 'download');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      showToast('Download failed', 'error');
    }
  };

  const handlePreview = async (id) => {
    try {
      const res = await axiosInstance.get(ENDPOINTS.LIBRARY.PREVIEW(id));
      window.open(res.data.data.url, '_blank', 'noopener,noreferrer');
    } catch { showToast('Preview not available', 'error'); }
  };

  const handleOpenVersions = async (file) => {
    setVersionModal({ docId: file.id, fileName: file.file_name });
    setVersions([]); setVersionsLoading(true);
    try {
      const res = await axiosInstance.get(ENDPOINTS.LIBRARY.VERSIONS(file.id));
      setVersions(Array.isArray(res.data.data) ? res.data.data : []);
    } catch { setVersions([]); }
    finally { setVersionsLoading(false); }
  };

  const handleArchive = async (fileId) => {
    if (!(await confirmDialog({ message: 'Archive this document? It will be hidden from the active library but kept for compliance.', danger: true }))) return;
    try {
      await axiosInstance.post(ENDPOINTS.LIBRARY.ARCHIVE(fileId));
      fetchFiles({ search: searchTerm, folder_id: currentFolderId });
      showToast('Document archived');
    } catch { showToast('Archive failed', 'error'); }
  };

  const handleDelete = async (fileId) => {
    if (!(await confirmDialog({ message: 'Permanently delete this document?', danger: true }))) return;
    try { await deleteDocument(fileId); showToast('Document deleted'); }
    catch { showToast('Delete failed', 'error'); }
  };

  const handleRestoreVersion = async (versionId) => {
    if (!versionModal) return;
    setRestoringId(versionId);
    try {
      await axiosInstance.post(ENDPOINTS.LIBRARY.VERSION_RESTORE(versionModal.docId, versionId));
      fetchFiles({ search: searchTerm, folder_id: currentFolderId });
      setVersionModal(null); showToast('Version restored');
    } catch { showToast('Restore failed', 'error'); }
    finally { setRestoringId(null); }
  };

  const handleUploadVersion = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !versionModal) return;
    e.target.value = '';
    setUploadingVersion(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await axiosInstance.post(ENDPOINTS.LIBRARY.ADD_VERSION(versionModal.docId), form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      showToast('New version uploaded');
      setVersionsLoading(true);
      const res = await axiosInstance.get(ENDPOINTS.LIBRARY.VERSIONS(versionModal.docId));
      setVersions(Array.isArray(res.data.data) ? res.data.data : []);
      fetchFiles(fetchParams());
    } catch {
      showToast('Version upload failed', 'error');
    } finally {
      setUploadingVersion(false);
      setVersionsLoading(false);
    }
  };

  if (isLoading && files.length === 0) return <LibrarySkeleton />;

  const activeFolderName = folders.find(f => f.id === currentFolderId)?.name;

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-slate-50">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── SIDEBAR ─────────────────────────────────────────────────────────── */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-40 md:z-auto
        w-64 md:w-60 shrink-0
        bg-surface border-r border-slate-200
        flex flex-col
        transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="px-4 py-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Folders</span>
            {canManage && (
              <button
                onClick={() => setIsCreatingFolder(v => !v)}
                className="text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary/70 transition-colors"
              >
                + New Folder
              </button>
            )}
          </div>

          {isCreatingFolder && (
            <div className="mb-2 flex gap-1">
              <input
                autoFocus
                type="text"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                placeholder="Folder name..."
                className="flex-1 bg-slate-50 border border-slate-200 text-slate-900 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
              />
              <button
                onClick={handleCreateFolder}
                className="text-xs bg-primary text-on-primary px-2 py-1.5 rounded-lg font-bold hover:bg-primary/90 transition-colors"
              >
                <span className="material-symbols-outlined text-sm leading-none">check</span>
              </button>
              <button
                onClick={() => { setIsCreatingFolder(false); setNewFolderName(''); }}
                className="text-xs text-slate-400 hover:text-slate-600 px-1"
              >
                <span className="material-symbols-outlined text-sm leading-none">close</span>
              </button>
            </div>
          )}

          <div className="space-y-0.5">
            {/* All Files */}
            <button
              onClick={handleSelectAll}
              className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                !currentFolderId ? 'bg-primary text-on-primary' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span className={`material-symbols-outlined text-base ${!currentFolderId ? 'text-white' : 'text-primary'}`}>folder_open</span>
              All Files
              <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full ${!currentFolderId ? 'bg-surface/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {files.length}
              </span>
            </button>

            {/* Folders */}
            {folders.map(folder => (
              <div key={folder.id} className="flex items-center group">
                <button
                  onClick={() => handleSelectFolder(folder.id)}
                  className={`flex-1 text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentFolderId === folder.id ? 'bg-primary text-on-primary' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span className={`material-symbols-outlined text-base ${currentFolderId === folder.id ? 'text-white' : 'text-amber-500'}`}>folder</span>
                  <span className="truncate">{folder.name}</span>
                </button>
                {canManage && (
                  <button
                    onClick={() => deleteFolder(folder.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-red-500 rounded ml-0.5"
                    title="Delete folder"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                  </button>
                )}
              </div>
            ))}

            {folders.length === 0 && !isCreatingFolder && (
              <p className="text-[11px] text-slate-400 px-3 py-2 italic">No folders yet. Click &ldquo;+ New Folder&rdquo; to create one.</p>
            )}
          </div>
        </div>
      </aside>

      {/* ── MAIN ────────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="bg-surface border-b border-slate-200 px-4 md:px-6 py-3 flex items-center gap-3">
          <button
            className="md:hidden shrink-0 p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            onClick={() => setSidebarOpen(v => !v)}
            aria-label="Toggle sidebar"
          >
            <span className="material-symbols-outlined text-xl leading-none">menu</span>
          </button>

          <div className="flex-1 relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base">search</span>
            <input
              type="text"
              placeholder="Search documents..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              {['grid', 'list'].map(m => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  className={`p-1.5 rounded-md transition-colors ${viewMode === m ? 'bg-surface shadow-sm text-primary' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <span className="material-symbols-outlined text-base">{m === 'grid' ? 'grid_view' : 'view_list'}</span>
                </button>
              ))}
            </div>
            {canUpload && (
              <Button icon="upload_file" onClick={() => setUploadModalOpen(true)} size="sm">
                <span className="hidden sm:inline">Upload</span>
              </Button>
            )}
          </div>
        </header>

        {/* Breadcrumb */}
        {activeFolderName && (
          <div className="px-4 md:px-6 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2 text-xs text-slate-500">
            <button onClick={handleSelectAll} className="hover:text-primary transition-colors">All Files</button>
            <span className="material-symbols-outlined text-sm">chevron_right</span>
            <span className="material-symbols-outlined text-sm text-amber-400">folder</span>
            <span className="font-semibold text-slate-700">{activeFolderName}</span>
          </div>
        )}

        {/* File area */}
        <div className="flex-1 overflow-auto p-3 md:p-6">
          {files.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <EmptyState
                icon="folder_open"
                title="No documents here"
                description="This folder is empty. Upload a document to get started."
                action={canUpload
                  ? <Button variant="secondary" size="sm" icon="upload_file" onClick={() => setUploadModalOpen(true)}>Upload Document</Button>
                  : null}
              />
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
              {files.map(file => {
                const { icon, color } = fileIcon(file.file_name || file.name || '');
                return (
                  <div key={file.id}
                    className="group relative bg-surface border border-slate-200 rounded-xl p-3 md:p-4 hover:border-primary/30 hover:shadow-md transition-all flex flex-col gap-2 md:gap-3 overflow-hidden"
                  >
                    <span className={`material-symbols-outlined text-3xl ${color}`}>{icon}</span>

                    {/* Action toolbar */}
                    <div className="absolute top-2 right-2 flex items-center gap-0.5 bg-surface/95 backdrop-blur-sm border border-slate-200 rounded-lg shadow-md px-0.5 py-0.5 opacity-0 group-hover:opacity-100 transition-all duration-150 z-10">
                      <button onClick={() => handlePreview(file.id)} className="p-1 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-md transition-colors" title="Preview">
                        <span className="material-symbols-outlined text-[14px] leading-none">visibility</span>
                      </button>
                      <button onClick={() => handleDownload(file.id, file)} className="p-1 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-md transition-colors" title="Download">
                        <span className="material-symbols-outlined text-[14px] leading-none">download</span>
                      </button>
                      <button onClick={() => handleOpenVersions(file)} className="p-1 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-md transition-colors" title="Version History">
                        <span className="material-symbols-outlined text-[14px] leading-none">history</span>
                      </button>
                      {canManage && !file.archived_at && (
                        <button onClick={() => handleArchive(file.id)} className="p-1 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-md transition-colors" title="Archive">
                          <span className="material-symbols-outlined text-[14px] leading-none">inventory_2</span>
                        </button>
                      )}
                      {canUpload && (
                        <button onClick={() => handleDelete(file.id)} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors" title="Delete">
                          <span className="material-symbols-outlined text-[14px] leading-none">delete</span>
                        </button>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-900 line-clamp-2 leading-snug" title={file.file_name || file.name}>
                        {file.file_name || file.name || 'Untitled'}
                      </p>
                      {file.description && (
                        <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-2 leading-snug">{file.description}</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-100 pt-2">
                      <span>{formatDateOnly(file.created_at)}</span>
                      <div className="flex items-center gap-1">
                        {file.file_size && <span>{fileSizeFmt(file.file_size)}</span>}
                        {file.version && <span className="font-mono bg-slate-100 px-1 rounded">{file.version}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-surface border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Name</th>
                      <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hidden md:table-cell">Size</th>
                      <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hidden md:table-cell">Date</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((file, i) => {
                      const { icon, color } = fileIcon(file.file_name || file.name || '');
                      return (
                        <tr key={file.id} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors group ${i % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                          <td className="px-4 py-3 min-w-0">
                            <div className="flex items-center gap-2 md:gap-3">
                              <span className={`material-symbols-outlined text-xl shrink-0 ${color}`}>{icon}</span>
                              <div className="min-w-0">
                                <span className="font-medium text-slate-900 truncate block max-w-[160px] sm:max-w-[260px] md:max-w-[360px]" title={file.file_name || file.name}>
                                  {file.file_name || file.name || 'Untitled'}
                                </span>
                                {file.description && (
                                  <span className="text-[10px] text-slate-400 truncate block max-w-[160px] sm:max-w-[260px] md:max-w-[360px]">{file.description}</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell whitespace-nowrap">{fileSizeFmt(file.file_size)}</td>
                          <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell whitespace-nowrap">{formatDateOnly(file.created_at)}</td>
                          <td className="px-3 md:px-4 py-3">
                            <div className="flex items-center gap-1 justify-end md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                              <button onClick={() => handlePreview(file.id)} className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors" title="Preview">
                                <span className="material-symbols-outlined text-sm">visibility</span>
                              </button>
                              <button onClick={() => handleDownload(file.id, file)} className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors" title="Download">
                                <span className="material-symbols-outlined text-sm">download</span>
                              </button>
                              <button onClick={() => handleOpenVersions(file)} className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors" title="History">
                                <span className="material-symbols-outlined text-sm">history</span>
                              </button>
                              {canManage && !file.archived_at && (
                                <button onClick={() => handleArchive(file.id)} className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors hidden sm:block" title="Archive">
                                  <span className="material-symbols-outlined text-sm">inventory_2</span>
                                </button>
                              )}
                              {canUpload && (
                                <button onClick={() => handleDelete(file.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                                  <span className="material-symbols-outlined text-sm">delete</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUploaded={handleUploaded}
      />

      {/* Version History Modal */}
      <Modal isOpen={!!versionModal} onClose={() => setVersionModal(null)} title={`Version History — ${versionModal?.fileName || ''}`}>
        <input ref={versionFileRef} type="file" className="hidden" onChange={handleUploadVersion} />

        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-slate-400">Restore sets a previous version as active. Current version is always kept.</p>
          {canUpload && (
            <button
              onClick={() => versionFileRef.current?.click()}
              disabled={uploadingVersion}
              className="flex items-center gap-1.5 text-xs font-bold text-on-primary bg-primary hover:bg-primary/90 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 shrink-0 ml-4"
            >
              <span className={`material-symbols-outlined text-sm leading-none ${uploadingVersion ? 'animate-spin' : ''}`}>
                {uploadingVersion ? 'progress_activity' : 'upload_file'}
              </span>
              {uploadingVersion ? 'Uploading…' : 'Upload New Version'}
            </button>
          )}
        </div>
        {versionsLoading ? (
          <SectionSkeleton rows={3} />
        ) : versions.length === 0 ? (
          <div className="py-8 text-center">
            <span className="material-symbols-outlined text-3xl text-slate-300 block mb-2">history</span>
            <p className="text-sm text-slate-500">No version history found.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[360px] overflow-y-auto custom-scrollbar pr-1">
            {versions.map((v, idx) => (
              <div key={v.id} className={`flex items-start justify-between gap-3 px-3 py-3 border rounded-xl transition-colors ${
                idx === 0 ? 'bg-primary/5 border-primary/20' : 'bg-surface border-slate-200 hover:bg-slate-50'
              }`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-900">{v.version}</span>
                    {idx === 0 && <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Current</span>}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 truncate">{v.file_name || '—'}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {formatDateOnly(v.created_at)}
                    {v.uploaded_by_name && <span className="ml-2">by {v.uploaded_by_name}</span>}
                    {v.file_size && <span className="ml-2">{fileSizeFmt(v.file_size)}</span>}
                  </p>
                  {v.notes && <p className="text-[11px] text-slate-500 italic mt-1">{v.notes}</p>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {v.file_key && (
                    <button
                      onClick={() => handleDownload(versionModal.docId, null, v.id)}
                      className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                      title="Download this version"
                    >
                      <span className="material-symbols-outlined text-base">download</span>
                    </button>
                  )}
                  {canManage && idx !== 0 && (
                    <button
                      disabled={!!restoringId}
                      onClick={() => handleRestoreVersion(v.id)}
                      className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-40"
                      title="Restore this version"
                    >
                      <span className={`material-symbols-outlined text-base ${restoringId === v.id ? 'animate-spin' : ''}`}>
                        {restoringId === v.id ? 'progress_activity' : 'restore'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default LibraryPage;
