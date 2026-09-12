const { error } = require('../utils/response');

/**
 * Generic Joi validation middleware
 * @param {Joi.ObjectSchema} schema
 * @param {{ stripUnknown?: boolean }} [opts] - stripUnknown defaults to true
 *        (legacy behaviour). Pass { stripUnknown: false } on routes where the
 *        schema validates only a subset of fields and unknown keys must survive.
 */
const validate = (schema, opts = {}) => (req, res, next) => {
    const stripUnknown = opts.stripUnknown !== false;
    const { error: validationError, value } = schema.validate(req.body, {
        abortEarly: false,
        allowUnknown: true,
        stripUnknown,
    });

    if (validationError) {
        const message = validationError.details.map(d => d.message).join(', ');
        return res.status(400).json(error(message, 400));
    }

    // Replace req.body with validated and stripped version
    req.body = value;
    next();
};

module.exports = validate;
