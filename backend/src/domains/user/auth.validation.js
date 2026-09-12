const { ROLES } = require('../../core/utils/constants');
const { error }  = require('../../core/utils/response');

/**
 * Validate register body
 */
const validateRegister = (req, res, next) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !role || (role !== 'co_pilot' && !password)) {
    return res.status(400).json(error('name, email, role, and password are required', 400));
  }

  if (!ROLES.includes(role)) {
    return res.status(400).json(error(`Invalid role. Must be: ${ROLES.join(', ')}`, 400));
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json(error('Invalid email format', 400));
  }

  // Password validation only for roles that can log in
  if (role !== 'co_pilot') {
    if (password.length < 8) {
      return res.status(400).json(error('Password must be at least 8 characters', 400));
    }

    const pwdRegex = /^(?=.*[A-Z])(?=.*[\d\W]).+$/;
    if (!pwdRegex.test(password)) {
      return res.status(400).json(error('Password must contain at least 1 uppercase letter and 1 number or special character', 400));
    }
  }

  next();
};

/**
 * Validate login body
 */
const validateLogin = (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json(error('email and password are required', 400));
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json(error('Invalid email format', 400));
  }

  next();
};

module.exports = { validateRegister, validateLogin };
