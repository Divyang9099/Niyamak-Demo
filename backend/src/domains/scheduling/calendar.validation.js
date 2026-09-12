const Joi = require('joi');

// Mounted with { stripUnknown: false } so unlisted keys pass through untouched.
exports.createEventSchema = Joi.object({
  title:         Joi.string().min(1).required(),
  // Must mirror the calendar_events.event_type CHECK constraint in the DB.
  event_type:    Joi.string().valid('project', 'pipeline', 'expo', 'training', 'maintenance', 'leave', 'meeting', 'deadline', 'other'),
  resource_type: Joi.string().valid('all', 'pilot', 'drone'),
  resource_id:   Joi.string().uuid().allow(null, ''),
  start_date:    Joi.date().iso().required(),
  end_date:      Joi.date().iso().min(Joi.ref('start_date')).required().messages({
    'date.min': 'end_date must be on or after start_date',
  }),
  location:      Joi.string().allow('', null),
  notes:         Joi.string().allow('', null),
});

// Update only touches title/dates/location/notes (per the service).
exports.updateEventSchema = Joi.object({
  title:      Joi.string().min(1),
  start_date: Joi.date().iso(),
  end_date:   Joi.date().iso().min(Joi.ref('start_date')).messages({
    'date.min': 'end_date must be on or after start_date',
  }),
  location:   Joi.string().allow('', null),
  notes:      Joi.string().allow('', null),
});
