/**
 * App-wide constants — single source of truth for enums
 */

module.exports = {
  ROLES: ['admin', 'project_manager', 'pilot', 'co_pilot'],

  PROJECT_STATUS: [
    'initiate', 'planned', 'on_going', 'executed',
    'post_processing', 'complete', 'cancelled',
  ],

  PIPELINE_STAGE: [
    'enquiry', 'proposal', 'negotiation',
    'verbal_confirmation', 'lost', 'converted',
  ],

  PILOT_STATUS: ['active', 'inactive', 'on_leave'],

  DRONE_STATUS: ['active', 'maintenance', 'retired'],

  DELIVERABLE_STATUS: ['pending', 'uploaded', 'approved'],

  EVENT_TYPES: ['project', 'pipeline', 'expo', 'training', 'maintenance', 'leave'],

  RESOURCE_TYPES: ['pilot', 'copilot', 'drone', 'all'],

  // Categories offered on the project Documents tab. Kept in sync with
  // frontend/src/utils/constants.js → DOCUMENT_CATEGORIES.
  DOCUMENT_CATEGORIES: [
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
  ],

  // Commercially sensitive categories — quotations, rate cards, priced POs.
  // Documents in these categories are visible ONLY to admins and to the project's
  // own project managers; pilots never see the row, the file name, or the file.
  // Enforcement lives in core/utils/docVisibility.js.
  RESTRICTED_DOC_CATEGORIES: ['Commercial Documents'],
};
