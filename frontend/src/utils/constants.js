export const ROLES = {
  ADMIN: 'admin',
  PROJECT_MANAGER: 'project_manager',
  PILOT: 'pilot',
  CO_PILOT: 'co_pilot',
};

export const ROLE_LABELS = {
  admin: 'Admin',
  project_manager: 'Project Manager',
  pilot: 'Pilot',
  co_pilot: 'Co-Pilot',
  super_admin: 'Super Admin',
};

// Single source of truth for project / pipeline service-line types.
// Used by the Project form, Pipeline form, Estimation form and list filters so a
// type is never free-typed (which caused values like "solarpv" vs "solar_pv").
export const PROJECT_TYPES = [
  { value: 'solar_pv',   label: 'Solar PV' },
  { value: 'wind',       label: 'Wind' },
  { value: 'td_lines',   label: 'T&D Lines' },
  { value: 'tower',      label: 'Tower' },
  { value: 'pipeline',   label: 'Pipeline' },
  { value: 'volumetric', label: 'Volumetric' },
  { value: 'other',      label: 'Other' },
];

// Project document categories — single source of truth for the Documents tab
// (upload picker + edit modal). Mirrors backend/src/core/utils/constants.js.
export const DOCUMENT_CATEGORIES = [
  'Work Order',
  'Purchase Order',
  'Scope of Work',
  'Contracts',
  'Commercial Documents',
  'Pipeline Documents',
  'Field Reports',
  'Client Communications',
  'Site Photo',
  'Miscellaneous',
];

// Commercially sensitive categories. A document filed here is visible only to
// admins and to the project's own project managers — pilots never receive it.
// The backend enforces this (core/utils/docVisibility.js); the list here only
// drives the UI (restricted options are hidden from users who can't manage docs,
// and visible restricted rows get a "Hidden from pilots" badge).
export const RESTRICTED_DOC_CATEGORIES = ['Commercial Documents'];

export const isRestrictedDocCategory = (category) =>
  Boolean(category) &&
  RESTRICTED_DOC_CATEGORIES.some(c => c.toLowerCase() === String(category).trim().toLowerCase());

// Shared Indian states list for State dropdowns (Project + Pipeline forms).
export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
  'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  // Union Territories
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

// Common drone manufacturers — used as datalist suggestions on the drone form
// (a datalist still allows a custom make to be typed, unlike a hard select).
export const DRONE_MAKES = [
  'DJI', 'Autel Robotics', 'Parrot', 'Skydio', 'senseFly',
  'Quantum Systems', 'Wingtra', 'Yuneec', 'Other',
];

export const ROUTES = {
  LOGIN: '/login',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  DASHBOARD: '/',
  PROJECTS: '/projects',
  PIPELINE: '/pipeline',
  RESOURCES: '/resources',
  COPILOTS: '/resources/copilots',
  CALENDAR: '/calendar',
  ESTIMATIONS: '/estimations',
  LIBRARY: '/library',
  ARCHIVE: '/archive',
  USERS: '/admin/users',
  AUDIT: '/admin/audit',
  PROFILE: '/profile',
  NOTIFICATIONS: '/notifications',
  SYSTEM_SETTINGS: '/admin/settings',
  ASSETS: '/assets',
  CLIENTS: '/clients',
  WEEKLY_REPORT: '/admin/reports/weekly',
  ATTENDANCE: '/admin/attendance',
  SUPER_ADMIN: '/super-admin',
  BD: '/bd',
  BD_CLIENTS: '/bd/clients',
  BD_FOLLOWUPS: '/bd/followups',
  BD_SETTINGS: '/bd/settings',
};

// Business Development — independent lead-generation module (see
// BD_MODULE_PLAN.md). These enums mirror backend/src/domains/bd/bd.validation.js.
export const BD_PRIORITIES = ['A', 'B', 'C'];

export const BD_STATUSES = [
  { value: 'to_be_initiated',  label: 'To Be Initiated' },
  { value: 'wip',               label: 'WIP' },
  { value: 'closed_onboard',    label: 'Onboarded' },
  { value: 'closed_cancelled',  label: 'Cancelled' },
];

export const BD_CHANNEL_TYPES = ['email', 'phone', 'linkedin', 'whatsapp'];

export const BD_INTERACTION_TYPES = [
  { value: 'email',      label: 'Email' },
  { value: 'call',       label: 'Call' },
  { value: 'linkedin',   label: 'LinkedIn' },
  { value: 'whatsapp',   label: 'WhatsApp' },
  { value: 'meeting',    label: 'Meeting' },
  { value: 'site_visit', label: 'Site Visit' },
  { value: 'other',      label: 'Other' },
];

export const BD_RESPONSE_STATUSES = [
  { value: 'positive',    label: 'Positive' },
  { value: 'negative',    label: 'Negative' },
  { value: 'neutral',     label: 'Neutral' },
  { value: 'no_response', label: 'No response (closing out)' },
  { value: 'bounced',     label: 'Bounced' },
];
