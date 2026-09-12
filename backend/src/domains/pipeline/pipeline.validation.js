const Joi = require('joi');
const { normalizePhone } = require('../../core/utils/phone');

// Dates may arrive as ISO strings or be cleared with '' / null.
const dateish = Joi.alternatives().try(Joi.date().iso(), Joi.string().allow('', null));

// Required mobile number → validated AND normalized to E.164 (e.g. +919876543210)
// so the stored value is always a clean, valid international number.
const requiredPhone = Joi.string().required().custom((value, helpers) => {
  const e164 = normalizePhone(value);
  if (!e164) return helpers.error('any.invalid');
  return e164;
}, 'E.164 phone').messages({
  'any.invalid':    'A valid mobile number is required (e.g. +91 98765 43210)',
  'string.empty':   'Mobile number is required',
  'any.required':   'Mobile number is required',
});

// Validate only the fields we care about; unknown keys are preserved
// (routes mount this with { stripUnknown: false }).
exports.createPipelineSchema = Joi.object({
  name:            Joi.string().min(1).required(),
  client_name:     Joi.string().allow('', null),
  client_id:       Joi.string().uuid().allow('', null),
  project_type:    Joi.string().allow('', null),
  stage:           Joi.string(),                       // lenient — stage vocabulary lives in the service
  estimated_value: Joi.number().min(0),
  win_probability: Joi.number().min(0).max(100),
  state:           Joi.string().allow('', null),
  latitude:        Joi.number().min(-90).max(90).allow(null),
  longitude:       Joi.number().min(-180).max(180).allow(null),
  enquiry_date:    dateish,
  estimated_start: dateish,
  estimated_end:   dateish,
  requirement:      Joi.string().allow('', null),
  estimation_notes: Joi.string().allow('', null),
  contact_number:   requiredPhone,
  contact_email:    Joi.string().email({ tlds: false }).allow('', null),
  sales_executive:  Joi.string().max(120).allow('', null),
});

exports.updatePipelineSchema = Joi.object({
  name:            Joi.string().min(1),
  client_name:     Joi.string().allow('', null),
  client_id:       Joi.string().uuid().allow('', null),
  project_type:    Joi.string().allow('', null),
  stage:           Joi.string(),
  estimated_value: Joi.number().min(0),
  win_probability: Joi.number().min(0).max(100),
  state:           Joi.string().allow('', null),
  latitude:        Joi.number().min(-90).max(90).allow(null),
  longitude:       Joi.number().min(-180).max(180).allow(null),
  enquiry_date:    dateish,
  estimated_start: dateish,
  estimated_end:   dateish,
  requirement:      Joi.string().allow('', null),
  estimation_notes: Joi.string().allow('', null),
  contact_number:   requiredPhone,
  contact_email:    Joi.string().email({ tlds: false }).allow('', null),
  sales_executive:  Joi.string().max(120).allow('', null),
  onboarding_po_number: Joi.string().allow('', null),
  onboarding_wo_number: Joi.string().allow('', null),
});

exports.stageSchema = Joi.object({
  stage:  Joi.string().min(1).required(),
  reason: Joi.string().allow('', null),
});
