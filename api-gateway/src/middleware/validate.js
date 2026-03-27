'use strict';

/**
 * Factory that returns an Express middleware validating that req.body
 * contains all requiredFields as non-empty values.
 *
 * @param {string[]} requiredFields - Field names that must be present
 * @returns {Function} Express middleware
 */
function validateEvent(requiredFields) {
  return function validate(req, res, next) {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({
        status: 'error',
        message: 'Request body must be a JSON object',
      });
    }

    const missing = [];
    const invalid = [];

    for (const field of requiredFields) {
      if (!(field in req.body)) {
        missing.push(field);
        continue;
      }

      const val = req.body[field];
      if (val === null || val === undefined || val === '') {
        invalid.push(field);
      }
    }

    if (missing.length > 0 || invalid.length > 0) {
      const errors = [];
      if (missing.length > 0) {
        errors.push(`Missing required fields: ${missing.join(', ')}`);
      }
      if (invalid.length > 0) {
        errors.push(`Fields must not be empty: ${invalid.join(', ')}`);
      }

      return res.status(400).json({
        status: 'error',
        message: errors.join('. '),
        missing,
        invalid,
      });
    }

    // Validate email field format if present
    if (req.body.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(req.body.email)) {
        return res.status(400).json({
          status: 'error',
          message: 'Field "email" must be a valid email address',
          invalid: ['email'],
        });
      }
    }

    // Validate numeric fields
    if ('orderTotal' in req.body) {
      const total = Number(req.body.orderTotal);
      if (isNaN(total) || total < 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Field "orderTotal" must be a non-negative number',
          invalid: ['orderTotal'],
        });
      }
    }

    return next();
  };
}

module.exports = { validateEvent };
