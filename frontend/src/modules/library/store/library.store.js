import { create } from 'zustand';
import axiosInstance from '../../../api/axios';

const API = '/library';

export const useLibraryStore = create((set) => ({
  files: [],
  folders: [],
  categories: [],
  tags: [],
  isLoading: false,   // initial full-page load only
  isFetchingFiles: false, // silent file refresh (folder switch / upload)
  uploading: false,
  currentFolderId: null,

  // Initial load — fetches both files and folders, shows skeleton
  fetchLibraryData: async (params = {}) => {
    set({ isLoading: true });
    try {
      const [filesRes, foldersRes] = await Promise.all([
        axiosInstance.get(`${API}/documents`, { params }),
        axiosInstance.get(`${API}/folders`),
      ]);
      set({
        files: filesRes.data.data.documents || filesRes.data.data || [],
        folders: foldersRes.data.data || [],
      });
    } catch (error) {
      if (error?.code !== 'ERR_NETWORK' && error?.message !== 'Network Error') {
        console.error('Failed to fetch library data', error);
      }
    } finally {
      set({ isLoading: false });
    }
  },

  // Silent file-only refresh — no skeleton, no folder re-fetch
  fetchFiles: async (params = {}) => {
    set({ isFetchingFiles: true });
    try {
      const res = await axiosInstance.get(`${API}/documents`, { params });
      set({ files: res.data.data.documents || res.data.data || [] });
    } catch (error) {
      if (error?.code !== 'ERR_NETWORK' && error?.message !== 'Network Error') {
        console.error('Failed to fetch files', error);
      }
    } finally {
      set({ isFetchingFiles: false });
    }
  },

  setCurrentFolder: (folderId) => {
    set({ currentFolderId: folderId });
  },

  uploadNewFile: async (formData) => {
    set({ uploading: true });
    try {
      await axiosInstance.post(`${API}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      // Refresh is driven by the 'library:doc_uploaded' socket event in LibraryPage
    } catch (error) {
      console.error('Upload failed', error);
      throw error;
    } finally {
      set({ uploading: false });
    }
  },

  deleteDocument: async (id) => {
    try {
      await axiosInstance.delete(`${API}/documents/${id}`);
      // Refresh is driven by the 'library:doc_deleted' socket event in LibraryPage
    } catch (error) {
      console.error('Delete failed', error);
      throw error;
    }
  },

  createFolder: async (name, parentId = null) => {
    try {
      await axiosInstance.post(`${API}/folders`, { name, parent_id: parentId });
      // Refresh folders
      const res = await axiosInstance.get(`${API}/folders`);
      set({ folders: res.data.data || [] });
    } catch (error) {
      console.error('Create folder failed', error);
      throw error;
    }
  },

  deleteFolder: async (id) => {
    try {
      await axiosInstance.delete(`${API}/folders/${id}`);
      const res = await axiosInstance.get(`${API}/folders`);
      set({ folders: res.data.data || [], currentFolderId: null });
      // LibraryPage's useEffect re-fetches when currentFolderId resets to null
    } catch (error) {
      console.error('Delete folder failed', error);
      throw error;
    }
  }
}));
