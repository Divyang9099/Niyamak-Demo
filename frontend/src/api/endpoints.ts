/// <reference types="vite/client" />
export const API_BASE_URL: string = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

export interface EndpointRegistry {
  AUTH: {
    LOGIN: string;
    LOGOUT: string;
    REGISTER: string;
    PROFILE: string;
    FORGOT_PASSWORD: string;
    RESET_PASSWORD: string;
    CHANGE_PASSWORD: string;
    THEME: string;
    TWO_FA_STATUS: string;
    TWO_FA_SETUP: string;
    TWO_FA_ENABLE: string;
    TWO_FA_DISABLE: string;
  };
  USERS: {
    GET_ALL: string;
    GET_BY_ID: (id: string) => string;
    UPDATE: (id: string) => string;
    DELETE: (id: string) => string;
    AVATAR: (id: string) => string;
  };
  PROJECTS: {
    GET_ALL: string;
    GET_BY_ID: (id: string) => string;
    CREATE: string;
    UPDATE: (id: string) => string;
    DELETE: (id: string) => string;
    ARCHIVE: (id: string) => string;
    COMPLETE: (id: string) => string;
    CANCEL: (id: string) => string;
    INVOICE_DOWNLOAD: (id: string) => string;
    BULK_STATUS: string;
    SCOPE: (id: string) => string;
    RESOURCES: (id: string) => string;
    RESOURCE: (id: string, allocId: string) => string;
    DOCUMENTS: (id: string) => string;
    DOCUMENT: (id: string, docId: string) => string;
    DOC_DOWNLOAD: (id: string, docId: string) => string;
    DELIVERABLES: (id: string) => string;
    DELIVERABLE: (id: string, delId: string) => string;
    DEL_APPROVE:      (id: string, delId: string) => string;
    DEL_REJECT:       (id: string, delId: string) => string;
    DEL_RESUBMIT:     (id: string, delId: string) => string;
    DEL_DOWNLOAD:     (id: string, delId: string) => string;
    DEL_DOWNLOAD_ALL: (id: string) => string;
    DEL_BUNDLE:       (id: string) => string;
    DEL_VERSIONS:     (id: string, delId: string) => string;
    MAP:              (id: string) => string;
    MAP_KML:          (id: string) => string;
    MAP_KML_HISTORY:  (id: string) => string;
    MAP_IMPORT_DOC:   (id: string) => string;
    MEMBERS: (id: string) => string;
    MEMBER: (id: string, userId: string) => string;
    TEAM_DRONES: (id: string) => string;
    TEAM_DRONE: (id: string, droneId: string) => string;
    INVOICES:          (id: string) => string;
    INVOICE:           (id: string, invId: string) => string;
    INVOICE_EXTRACT:   (id: string) => string;
    INVOICE_PDF:       (id: string, invId: string) => string;
    EXPENSES:          (id: string) => string;
    EXPENSE:           (id: string, expId: string) => string;
    EXPENSES_IMPORT:   (id: string) => string;
  };
  PIPELINE: {
    GET_ALL: string;
    HISTORY: string;
    GET_BY_ID: (id: string) => string;
    CREATE: string;
    UPDATE: (id: string) => string;
    DELETE: (id: string) => string;
    UPDATE_STAGE: (id: string) => string;
    CONVERT: (id: string) => string;
    DOCUMENTS:       (id: string) => string;
    DOCUMENT:        (id: string, docId: string) => string;
    DOCUMENT_REVOKE: (id: string, docId: string) => string;
    CALENDAR_VIEW:   string;
  };
  RESOURCES: {
    PILOTS: string;
    PILOT: (id: string) => string;
    PILOT_AVAIL: (id: string) => string;
    PILOT_HISTORY: (id: string) => string;
    DRONES: string;
    DRONE: (id: string) => string;
    DRONE_MAINT: (id: string) => string;
    DRONE_HISTORY: (id: string) => string;
    ALLOCATIONS: string;
  };
  CALENDAR: {
    GET_ALL: string;
    EVENTS: string;
    EVENT: (id: string) => string;
    CONFLICTS: string;
    RESOLVE: (id: string) => string;
  };
  ESTIMATIONS: {
    GET_ALL: string;
    GET_BY_ID: (id: string) => string;
    CREATE: string;
    UPDATE: (id: string) => string;
    DELETE: (id: string) => string;
    RENAME: (id: string) => string;
    CLONE: (id: string) => string;
    ITEMS: (id: string) => string;
    ITEM: (id: string, itemId: string) => string;
    EXPORT_XLS: (id: string) => string;
    EXPORT_PDF: (id: string) => string;
    RATE_CARDS: string;
  };
  LIBRARY: {
    CATEGORIES: string;
    CATEGORY: (id: string) => string;
    FOLDERS: string;
    FOLDER: (id: string) => string;
    TAGS: string;
    TAG: (id: string) => string;
    DOCUMENTS: string;
    DOCUMENT: (id: string) => string;
    DOWNLOAD: (id: string) => string;
    CATEGORY_DOWNLOAD: (id: string) => string;
    PREVIEW: (id: string) => string;
    VERSIONS: (id: string) => string;
    VERSION_RESTORE: (id: string, versionId: string) => string;
    ARCHIVE: (id: string) => string;
    ADD_VERSION: (id: string) => string;
  };
  NOTIFICATIONS: {
    GET_ALL: string;
    MARK_READ: (id: string) => string;
    READ_ALL: string;
    DELETE: (id: string) => string;
    PREFS: string;
  };
  DASHBOARD: {
    SUMMARY: string;
    PROJECTS: string;
    PROJECT_DETAILS: (id: string) => string;
    ACTIVITY: string;
    UPCOMING: string;
    UTILIZATION: string;
    DRONE_UTILIZATION: string;
    ALERTS: string;
    REMINDERS: string;
    EXPORT: string;
    PILOT_GANTT: string;
    DRONE_GANTT: string;
  };
  AUDIT: {
    GET_ALL: string;
  };
  SYSTEM: {
    CONFIG: string;
    LOGO_UPLOAD: string;
    LOGO: string;
    PROJECT_TYPES: string;
    PROJECT_TYPE: (id: string) => string;
    RATE_CARDS_LIST: string;
    RATE_CARDS: string;
    RATE_CARD: (id: string) => string;
  };
  JOBS: {
    STATUS: (jobId: string, queue: string) => string;
  };
  UPLOADS: {
    INITIATE:  string;
    CHUNK:     (sessionId: string, partNumber: number) => string;
    PRESIGN:   (sessionId: string) => string;
    COMPLETE:  (sessionId: string) => string;
    ABORT:     (sessionId: string) => string;
    SESSION:   (sessionId: string) => string;
  };
  ARCHIVE: {
    LIST:    string;
    RESTORE: (entityType: string, entityId: string) => string;
    DELETE:  (entityType: string, entityId: string) => string;
  };
  CLIENTS: {
    GET_ALL:   string;
    GET_BY_ID: (id: string) => string;
    CREATE:    string;
    UPDATE:    (id: string) => string;
    DELETE:    (id: string) => string;
  };
  ASSETS: {
    GET_ALL:  string;
    SUMMARY:  string;
    GET_BY_ID:(id: string) => string;
    CREATE:   string;
    UPDATE:   (id: string) => string;
    DELETE:   (id: string) => string;
  };
  REPORTS: {
    WEEKLY_SETTINGS:     string;
    WEEKLY_SEND_TEST:    string;
    WEEKLY_PREVIEW_DATA: string;
  };
}

export const ENDPOINTS: EndpointRegistry = {
  AUTH: {
    LOGIN:           '/auth/login',
    LOGOUT:          '/auth/logout',
    REGISTER:        '/auth/register',
    PROFILE:         '/auth/profile',
    FORGOT_PASSWORD: '/auth/forgot-password',
    RESET_PASSWORD:  '/auth/reset-password',
    CHANGE_PASSWORD: '/auth/change-password',
    THEME:           '/auth/theme',
    TWO_FA_STATUS:   '/auth/2fa/status',
    TWO_FA_SETUP:    '/auth/2fa/setup',
    TWO_FA_ENABLE:   '/auth/2fa/enable',
    TWO_FA_DISABLE:  '/auth/2fa/disable',
  },
  USERS: {
    GET_ALL:  '/users',
    GET_BY_ID: (id: string) => `/users/${id}`,
    UPDATE:   (id: string) => `/users/${id}`,
    DELETE:   (id: string) => `/users/${id}`,
    AVATAR:   (id: string) => `/users/${id}/avatar`,
  },
  PROJECTS: {
    GET_ALL:     '/projects',
    GET_BY_ID:   (id: string) => `/projects/${id}`,
    CREATE:      '/projects',
    UPDATE:      (id: string) => `/projects/${id}`,
    DELETE:      (id: string) => `/projects/${id}`,
    ARCHIVE:     (id: string) => `/projects/${id}/archive`,
    RESTORE:     (id: string) => `/projects/${id}/restore`,
    COMPLETE:    (id: string) => `/projects/${id}/complete`,
    CANCEL:      (id: string) => `/projects/${id}/cancel`,
    INVOICE_DOWNLOAD: (id: string) => `/projects/${id}/invoice`,
    BULK_STATUS: '/projects/bulk-status',
    // Submodules
    SCOPE:      (id: string) => `/projects/${id}/scope`,
    RESOURCES:  (id: string) => `/projects/${id}/resources`,
    RESOURCE:   (id: string, allocId: string) => `/projects/${id}/resources/${allocId}`,
    DOCUMENTS:  (id: string) => `/projects/${id}/documents`,
    DOCUMENT:   (id: string, docId: string) => `/projects/${id}/documents/${docId}`,
    DOC_DOWNLOAD: (id: string, docId: string) => `/projects/${id}/documents/${docId}/download`,
    DELIVERABLES: (id: string) => `/projects/${id}/deliverables`,
    DELIVERABLE:  (id: string, delId: string) => `/projects/${id}/deliverables/${delId}`,
    DEL_APPROVE:   (id: string, delId: string) => `/projects/${id}/deliverables/${delId}/approve`,
    DEL_REJECT:    (id: string, delId: string) => `/projects/${id}/deliverables/${delId}/reject`,
    DEL_RESUBMIT:  (id: string, delId: string) => `/projects/${id}/deliverables/${delId}/resubmit`,
    DEL_DOWNLOAD:  (id: string, delId: string) => `/projects/${id}/deliverables/${delId}/download`,
    DEL_DOWNLOAD_ALL: (id: string) => `/projects/${id}/deliverables/download-all`,
    DEL_BUNDLE:    (id: string) => `/projects/${id}/deliverables/bundle`,
    DEL_VERSIONS:  (id: string, delId: string) => `/projects/${id}/deliverables/${delId}/versions`,
    MAP:             (id: string) => `/projects/${id}/map`,
    MAP_KML:         (id: string) => `/projects/${id}/map/kml`,
    MAP_KML_HISTORY: (id: string) => `/projects/${id}/map/kml-history`,
    MAP_IMPORT_DOC:  (id: string) => `/projects/${id}/map/import-document`,
    MEMBERS:      (id: string) => `/projects/${id}/members`,
    MEMBER:       (id: string, userId: string) => `/projects/${id}/members/${userId}`,
    TEAM_DRONES:  (id: string) => `/projects/${id}/team-drones`,
    TEAM_DRONE:   (id: string, droneId: string) => `/projects/${id}/team-drones/${droneId}`,
    INVOICES:          (id: string) => `/projects/${id}/invoices`,
    INVOICE:           (id: string, invId: string) => `/projects/${id}/invoices/${invId}`,
    INVOICE_EXTRACT:   (id: string) => `/projects/${id}/invoices/extract`,
    INVOICE_PDF:       (id: string, invId: string) => `/projects/${id}/invoices/${invId}/download`,
    EXPENSES:          (id: string) => `/projects/${id}/expenses`,
    EXPENSE:           (id: string, expId: string) => `/projects/${id}/expenses/${expId}`,
    EXPENSES_IMPORT:   (id: string) => `/projects/${id}/expenses/import`,
  },
  PIPELINE: {
    GET_ALL:      '/pipeline',
    HISTORY:      '/pipeline/history',
    GET_BY_ID:    (id: string) => `/pipeline/${id}`,
    CREATE:       '/pipeline',
    UPDATE:       (id: string) => `/pipeline/${id}`,
    DELETE:       (id: string) => `/pipeline/${id}`,
    UPDATE_STAGE: (id: string) => `/pipeline/${id}/stage`,
    CONVERT:      (id: string) => `/pipeline/${id}/convert`,
    DOCUMENTS:         (id: string) => `/pipeline/${id}/documents`,
    DOCUMENT:          (id: string, docId: string) => `/pipeline/${id}/documents/${docId}`,
    DOCUMENT_REVOKE:   (id: string, docId: string) => `/pipeline/${id}/documents/${docId}/file`,
    CALENDAR_VIEW:'/pipeline/calendar-view',
  },
  RESOURCES: {
    PILOTS:        '/resources/pilots',
    PILOT:         (id: string) => `/resources/pilots/${id}`,
    PILOT_AVAIL:   (id: string) => `/resources/pilots/${id}/availability`,
    PILOT_HISTORY: (id: string) => `/resources/pilots/${id}/history`,
    DRONES:        '/resources/drones',
    DRONE:         (id: string) => `/resources/drones/${id}`,
    DRONE_MAINT:   (id: string) => `/resources/drones/${id}/maintenance`,
    DRONE_HISTORY: (id: string) => `/resources/drones/${id}/history`,
    ALLOCATIONS:   '/resources/allocations',
  },
  CALENDAR: {
    GET_ALL:       '/calendar',
    EVENTS:        '/calendar/events',
    EVENT:         (id: string) => `/calendar/events/${id}`,
    CONFLICTS:     '/calendar/conflicts',
    RESOLVE:       (id: string) => `/calendar/conflicts/${id}/resolve`,
  },
  ESTIMATIONS: {
    GET_ALL:    '/estimations',
    GET_BY_ID:  (id: string) => `/estimations/${id}`,
    CREATE:     '/estimations',
    UPDATE:     (id: string) => `/estimations/${id}`,
    DELETE:     (id: string) => `/estimations/${id}`,
    RENAME:     (id: string) => `/estimations/${id}/rename`,
    CLONE:      (id: string) => `/estimations/${id}/clone`,
    ITEMS:      (id: string) => `/estimations/${id}/items`,
    ITEM:       (id: string, itemId: string) => `/estimations/${id}/items/${itemId}`,
    EXPORT_XLS: (id: string) => `/estimations/${id}/export/excel`,
    EXPORT_PDF: (id: string) => `/estimations/${id}/export/pdf`,
    RATE_CARDS: '/estimations/rate-cards',
  },
  LIBRARY: {
    CATEGORIES:    '/library/categories',
    CATEGORY:      (id: string) => `/library/categories/${id}`,
    FOLDERS:       '/library/folders',
    FOLDER:        (id: string) => `/library/folders/${id}`,
    TAGS:          '/library/tags',
    TAG:           (id: string) => `/library/tags/${id}`,
    DOCUMENTS:     '/library/documents',
    DOCUMENT:      (id: string) => `/library/documents/${id}`,
    DOWNLOAD:          (id: string) => `/library/documents/${id}/download`,
    CATEGORY_DOWNLOAD: (id: string) => `/library/categories/${id}/download`,
    PREVIEW:           (id: string) => `/library/documents/${id}/preview`,
    VERSIONS:        (id: string) => `/library/documents/${id}/versions`,
    VERSION_RESTORE: (id: string, versionId: string) => `/library/documents/${id}/versions/${versionId}/restore`,
    ARCHIVE:         (id: string) => `/library/documents/${id}/archive`,
    ADD_VERSION:     (id: string) => `/library/documents/${id}/versions`,
  },
  NOTIFICATIONS: {
    GET_ALL:  '/notifications',
    MARK_READ:(id: string) => `/notifications/${id}/read`,
    READ_ALL: '/notifications/read-all',
    DELETE:   (id: string) => `/notifications/${id}`,
    PREFS:    '/notifications/prefs',
  },
  DASHBOARD: {
    SUMMARY:         '/dashboard/summary',
    PROJECTS:        '/dashboard/projects',
    PROJECT_DETAILS: (id: string) => `/dashboard/project/${id}`,
    ACTIVITY:        '/dashboard/activity',
    UPCOMING:        '/dashboard/upcoming',
    UTILIZATION:     '/dashboard/utilization',
    DRONE_UTILIZATION: '/dashboard/drone-utilization',
    ALERTS:          '/dashboard/alerts',
    REMINDERS:       '/dashboard/reminders',
    EXPORT:          '/dashboard/export',
    PILOT_GANTT:     '/dashboard/pilot-gantt',
    DRONE_GANTT:     '/dashboard/drone-gantt',
  },
  AUDIT: {
    GET_ALL: '/audit',
  },
  SYSTEM: {
    CONFIG:      '/system/config',
    LOGO_UPLOAD: '/system/config/logo',
    LOGO:        '/system/config/logo',
    PROJECT_TYPES:   '/system/project-types',
    PROJECT_TYPE:    (id: string) => `/system/project-types/${id}`,
    RATE_CARDS_LIST: '/system/rate-cards/list',
    RATE_CARDS:      '/system/rate-cards',
    RATE_CARD:       (id: string) => `/system/rate-cards/${id}`,
  },
  JOBS: {
    STATUS: (jobId: string, queue: string) => `/jobs/${jobId}?queue=${queue}`,
  },
  UPLOADS: {
    INITIATE: '/uploads/initiate',
    CHUNK:    (sessionId: string, partNumber: number) => `/uploads/${sessionId}/chunk/${partNumber}`,
    PRESIGN:  (sessionId: string) => `/uploads/${sessionId}/presign`,
    COMPLETE: (sessionId: string) => `/uploads/${sessionId}/complete`,
    ABORT:    (sessionId: string) => `/uploads/${sessionId}`,
    SESSION:  (sessionId: string) => `/uploads/${sessionId}`,
  },
  ARCHIVE: {
    LIST:    '/archive',
    RESTORE: (entityType: string, entityId: string) => `/archive/${entityType}/${entityId}/restore`,
    DELETE:  (entityType: string, entityId: string) => `/archive/${entityType}/${entityId}`,
  },
  CLIENTS: {
    GET_ALL:   '/clients',
    GET_BY_ID: (id: string) => `/clients/${id}`,
    CREATE:    '/clients',
    UPDATE:    (id: string) => `/clients/${id}`,
    DELETE:    (id: string) => `/clients/${id}`,
  },
  ASSETS: {
    GET_ALL:   '/assets',
    SUMMARY:   '/assets/summary',
    GET_BY_ID: (id: string) => `/assets/${id}`,
    CREATE:    '/assets',
    UPDATE:    (id: string) => `/assets/${id}`,
    DELETE:    (id: string) => `/assets/${id}`,
  },
  REPORTS: {
    WEEKLY_SETTINGS:      '/reports/weekly-settings',
    WEEKLY_SEND_TEST:     '/reports/weekly-send-test',
    WEEKLY_PREVIEW_DATA:  '/reports/weekly-preview-data',
  },
};
