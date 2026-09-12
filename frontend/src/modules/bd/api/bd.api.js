import axiosInstance from '../../../api/axios';

const API = '/bd';

// ── Clients ──────────────────────────────────────────────────────────────────
export const getClients = (params = {}) => axiosInstance.get(`${API}/clients`, { params });
export const getClient = (id) => axiosInstance.get(`${API}/clients/${id}`);
export const createClient = (data) => axiosInstance.post(`${API}/clients`, data);
export const updateClient = (id, data) => axiosInstance.put(`${API}/clients/${id}`, data);
export const updateClientStatus = (id, data) => axiosInstance.patch(`${API}/clients/${id}/status`, data);
export const updateClientPriority = (id, priority) => axiosInstance.patch(`${API}/clients/${id}/priority`, { priority });
export const deleteClient = (id) => axiosInstance.delete(`${API}/clients/${id}`);

export const uploadClientLogo = (id, file) => {
  const form = new FormData();
  form.append('logo', file);
  return axiosInstance.post(`${API}/clients/${id}/logo`, form);
};
export const removeClientLogo = (id) => axiosInstance.delete(`${API}/clients/${id}/logo`);
export const clientLogoUrl = (id) => `${axiosInstance.defaults.baseURL}${API}/clients/${id}/logo`;

// ── Dashboard & stats ────────────────────────────────────────────────────────
export const getDashboard = (params = {}) => axiosInstance.get(`${API}/dashboard`, { params });
export const getStats = () => axiosInstance.get(`${API}/stats`);

// ── Contacts ─────────────────────────────────────────────────────────────────
export const getContacts = (clientId) => axiosInstance.get(`${API}/clients/${clientId}/contacts`);
export const createContact = (clientId, data) => axiosInstance.post(`${API}/clients/${clientId}/contacts`, data);
export const updateContact = (contactId, data) => axiosInstance.put(`${API}/contacts/${contactId}`, data);
export const deleteContact = (contactId) => axiosInstance.delete(`${API}/contacts/${contactId}`);

// ── Channels ─────────────────────────────────────────────────────────────────
export const getChannels = (clientId, params = {}) => axiosInstance.get(`${API}/clients/${clientId}/channels`, { params });
export const createChannel = (clientId, data) => axiosInstance.post(`${API}/clients/${clientId}/channels`, data);
export const updateChannel = (channelId, data) => axiosInstance.put(`${API}/channels/${channelId}`, data);
export const deleteChannel = (channelId) => axiosInstance.delete(`${API}/channels/${channelId}`);
export const reorderChannels = (items) => axiosInstance.patch(`${API}/channels/reorder`, { items });

// ── The checkbox actions ───────────────────────────────────────────────────────
export const logOutreach = (channelId, data) => axiosInstance.post(`${API}/channels/${channelId}/log`, data);
export const logResponse = (touchpointId, data) => axiosInstance.patch(`${API}/touchpoints/${touchpointId}/response`, data);
export const correctTouchpoint = (touchpointId, data) => axiosInstance.put(`${API}/touchpoints/${touchpointId}`, data);
export const createTouchpoint = (data) => axiosInstance.post(`${API}/touchpoints`, data);
export const getTouchpoints = (clientId, params = {}) => axiosInstance.get(`${API}/clients/${clientId}/touchpoints`, { params });
export const deleteTouchpoint = (touchpointId) => axiosInstance.delete(`${API}/touchpoints/${touchpointId}`);

// ── Follow-ups ───────────────────────────────────────────────────────────────
export const getFollowups = (params = {}) => axiosInstance.get(`${API}/followups`, { params });
export const createFollowup = (data) => axiosInstance.post(`${API}/followups`, data);
export const completeFollowup = (id) => axiosInstance.patch(`${API}/followups/${id}/complete`);
export const snoozeFollowup = (id, data) => axiosInstance.patch(`${API}/followups/${id}/snooze`, data);
export const cancelFollowup = (id) => axiosInstance.patch(`${API}/followups/${id}/cancel`);

// ── Activity ─────────────────────────────────────────────────────────────────
export const getActivity = (params = {}) => axiosInstance.get(`${API}/activity`, { params });

// ── Config: sectors, departments, settings ────────────────────────────────────
export const getSectors = (params = {}) => axiosInstance.get(`${API}/sectors`, { params });
export const createSector = (data) => axiosInstance.post(`${API}/sectors`, data);
export const updateSector = (id, data) => axiosInstance.put(`${API}/sectors/${id}`, data);
export const deleteSector = (id) => axiosInstance.delete(`${API}/sectors/${id}`);

export const getDepartments = (params = {}) => axiosInstance.get(`${API}/departments`, { params });
export const createDepartment = (data) => axiosInstance.post(`${API}/departments`, data);
export const updateDepartment = (id, data) => axiosInstance.put(`${API}/departments/${id}`, data);
export const deleteDepartment = (id) => axiosInstance.delete(`${API}/departments/${id}`);

export const getSettings = () => axiosInstance.get(`${API}/settings`);
export const updateSettings = (data) => axiosInstance.put(`${API}/settings`, data);
