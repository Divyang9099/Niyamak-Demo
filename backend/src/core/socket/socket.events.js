// Canonical socket event names — import these everywhere instead of using raw strings

module.exports = {
  // ── Projects ──────────────────────────────────────────────────
  PROJECT_CREATED:        'project:created',
  PROJECT_UPDATED:        'project:updated',
  PROJECT_DELETED:        'project:deleted',
  PROJECT_STATUS_CHANGED: 'project:status_changed',
  PROJECT_SCOPE_UPDATED:  'project:scope_updated',
  PROJECT_MEMBER_ADDED:   'project:member_added',
  PROJECT_MEMBER_REMOVED: 'project:member_removed',

  // ── Allocations ────────────────────────────────────────────────
  ALLOCATION_CREATED:     'allocation:created',
  ALLOCATION_UPDATED:     'allocation:updated',
  ALLOCATION_DELETED:     'allocation:deleted',

  // ── Deliverables ───────────────────────────────────────────────
  DELIVERABLE_CREATED:    'deliverable:created',
  DELIVERABLE_UPDATED:    'deliverable:updated',
  DELIVERABLE_DELETED:    'deliverable:deleted',
  DELIVERABLE_APPROVED:   'deliverable:approved',

  // ── Documents ─────────────────────────────────────────────────
  DOCUMENT_UPLOADED:      'document:uploaded',
  DOCUMENT_UPDATED:       'document:updated',
  DOCUMENT_DELETED:       'document:deleted',

  // ── Pipeline ──────────────────────────────────────────────────
  PIPELINE_CREATED:       'pipeline:created',
  PIPELINE_UPDATED:       'pipeline:updated',
  PIPELINE_STAGE_CHANGED: 'pipeline:stage_changed',
  PIPELINE_CONVERTED:     'pipeline:converted',
  PIPELINE_DELETED:       'pipeline:deleted',

  // ── Resources ─────────────────────────────────────────────────
  PILOT_CREATED:          'pilot:created',
  PILOT_UPDATED:          'pilot:updated',
  PILOT_DELETED:          'pilot:deleted',
  DRONE_CREATED:          'drone:created',
  DRONE_UPDATED:          'drone:updated',
  DRONE_DELETED:          'drone:deleted',

  // ── Estimations ───────────────────────────────────────────────
  ESTIMATION_CREATED:     'estimation:created',
  ESTIMATION_UPDATED:     'estimation:updated',
  ESTIMATION_DELETED:     'estimation:deleted',

  // ── Calendar ──────────────────────────────────────────────────
  CALENDAR_EVENT_CREATED: 'calendar:event_created',
  CALENDAR_EVENT_UPDATED: 'calendar:event_updated',
  CALENDAR_EVENT_DELETED: 'calendar:event_deleted',

  // ── Library ───────────────────────────────────────────────────
  LIBRARY_DOC_UPLOADED:   'library:doc_uploaded',
  LIBRARY_DOC_DELETED:    'library:doc_deleted',

  // ── Assets ────────────────────────────────────────────────────
  ASSET_CREATED:          'asset:created',
  ASSET_UPDATED:          'asset:updated',
  ASSET_DELETED:          'asset:deleted',

  // ── Notifications ─────────────────────────────────────────────
  NOTIFICATION_NEW:       'notification:new',
  NOTIFICATION_READ:      'notification:read',
  NOTIFICATION_ALL_READ:  'notification:all_read',
  NOTIFICATION_DELETED:   'notification:deleted',

  // ── Chunked Upload lifecycle ───────────────────────────────────
  UPLOAD_STARTED:         'upload:started',
  UPLOAD_PROGRESS:        'upload:progress',
  UPLOAD_COMPLETE:        'upload:complete',
  UPLOAD_FAILED:          'upload:failed',

  // ── Post-upload processing pipeline ───────────────────────────
  FILE_PROCESSING:        'file:processing',   // { stage: 'validation'|'metadata'|'scan' }
  FILE_READY:             'file:ready',         // processing done, entity updated
  FILE_FAILED:            'file:failed',        // processing failed

  // ── Deliverable bundle (ZIP download) ─────────────────────────
  BUNDLE_STARTED:         'bundle:started',
  BUNDLE_READY:           'bundle:ready',
  BUNDLE_FAILED:          'bundle:failed',

  // ── KML / Map processing ───────────────────────────────────────
  MAP_KML_PROCESSED:      'map:kml_processed',
  MAP_KML_FAILED:         'map:kml_failed',

  // ── Export ────────────────────────────────────────────────────
  EXPORT_READY:           'export:ready',

  // ── System / Scheduler ────────────────────────────────────────
  SCHEDULER_ALERT:        'scheduler:alert',
  OVERDUE_ALERT:          'scheduler:overdue_alert',
};
