import { body, param, query, validationResult } from 'express-validator';

// Validation rules for user registration
export const validateRegister = [
  body('name')
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters')
    .trim()
    .escape(),
  
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail()
    .trim(),
  
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[A-Za-z])(?=.*\d)/).withMessage('Password must contain at least one letter and one number'),
  
  body('role')
    .optional()
    .isIn(['customer', 'agent', 'admin']).withMessage('Invalid role selected')
];

// Validation rules for user login
export const validateLogin = [
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail()
    .trim(),
  
  body('password')
    .notEmpty().withMessage('Password is required')
];

// Validation rules for creating a ticket
export const validateCreateTicket = [
  body('subject')
    .notEmpty().withMessage('Subject is required')
    .isLength({ min: 3, max: 100 }).withMessage('Subject must be between 3 and 100 characters')
    .trim()
    .escape(),
  
  body('description')
    .notEmpty().withMessage('Description is required')
    .isLength({ min: 10, max: 5000 }).withMessage('Description must be between 10 and 5000 characters')
    .trim(),
  
  body('category')
    .optional()
    .isIn(['Technical', 'Billing', 'Account', 'Product', 'Other']).withMessage('Invalid category')
];

// Validation rules for updating ticket status
export const validateUpdateTicketStatus = [
  param('id')
    .isMongoId().withMessage('Invalid ticket ID format'),
  
  body('status')
    .notEmpty().withMessage('Status is required')
    .isIn(['New', 'Assigned', 'In Progress', 'Resolved']).withMessage('Invalid status'),
  
  body('resolutionNote')
    .optional()
    .isLength({ max: 2000 }).withMessage('Resolution note cannot exceed 2000 characters')
    .trim()
];

// Validation rules for assigning a ticket
export const validateAssignTicket = [
  param('id')
    .isMongoId().withMessage('Invalid ticket ID format'),
  
  body('agentId')
    .notEmpty().withMessage('Agent ID is required')
    .isMongoId().withMessage('Invalid agent ID format')
];

// Validation rules for sending a message
export const validateSendMessage = [
  body('ticketId')
    .notEmpty().withMessage('Ticket ID is required')
    .isMongoId().withMessage('Invalid ticket ID format'),
  
  body('content')
    .notEmpty().withMessage('Message content is required')
    .isLength({ min: 1, max: 5000 }).withMessage('Message cannot exceed 5000 characters')
    .trim(),
  
  body('isResolution')
    .optional()
    .isBoolean().withMessage('isResolution must be a boolean')
];

// Validation rules for ticket ID parameter
export const validateTicketId = [
  param('id')
    .isMongoId().withMessage('Invalid ticket ID format')
];

// Validation rules for pagination
export const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer')
    .toInt(),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
    .toInt()
];

// Validation rules for ticket search/filter
export const validateTicketFilters = [
  query('status')
    .optional()
    .isIn(['New', 'Assigned', 'In Progress', 'Resolved']).withMessage('Invalid status filter'),
  
  query('priority')
    .optional()
    .isIn(['Low', 'Medium', 'High']).withMessage('Invalid priority filter'),
  
  query('category')
    .optional()
    .isIn(['Technical', 'Billing', 'Account', 'Product', 'Other']).withMessage('Invalid category filter'),
  
  query('search')
    .optional()
    .isLength({ max: 100 }).withMessage('Search term too long')
    .trim()
];

// Validation rules for reopening a ticket
export const validateReopenTicket = [
  param('id')
    .isMongoId().withMessage('Invalid ticket ID format'),
  
  body('reason')
    .optional()
    .isLength({ max: 500 }).withMessage('Reason cannot exceed 500 characters')
    .trim()
];

// Custom validation middleware
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.param,
      message: error.msg
    }));
    
    return res.status(400).json({
      error: 'Validation failed',
      details: formattedErrors
    });
  }
  
  next();
};

// Sanitization helpers
export const sanitizeInput = (input) => {
  if (typeof input === 'string') {
    return input.trim().replace(/<[^>]*>/g, ''); // Remove HTML tags
  }
  return input;
};

export const sanitizeObject = (obj) => {
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeInput(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

// Validation helper for email format
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Validation helper for phone number (if needed)
export const isValidPhone = (phone) => {
  const phoneRegex = /^\+?[\d\s-]{10,}$/;
  return phoneRegex.test(phone);
};

// Validation helper for URL
export const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// Password strength validation
export const isStrongPassword = (password) => {
  const requirements = {
    minLength: password.length >= 8,
    hasUpperCase: /[A-Z]/.test(password),
    hasLowerCase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password)
  };
  
  const passed = Object.values(requirements).filter(Boolean).length;
  return {
    passed: passed >= 4,
    requirements,
    strength: passed >= 5 ? 'strong' : passed >= 4 ? 'medium' : 'weak'
  };
};

// Validation rules for bulk operations (if needed)
export const validateBulkTicketUpdate = [
  body('ticketIds')
    .isArray().withMessage('ticketIds must be an array')
    .notEmpty().withMessage('At least one ticket ID is required'),
  
  body('ticketIds.*')
    .isMongoId().withMessage('Invalid ticket ID format in array'),
  
  body('status')
    .optional()
    .isIn(['New', 'Assigned', 'In Progress', 'Resolved']).withMessage('Invalid status'),
  
  body('priority')
    .optional()
    .isIn(['Low', 'Medium', 'High']).withMessage('Invalid priority')
];

export default {
  validateRegister,
  validateLogin,
  validateCreateTicket,
  validateUpdateTicketStatus,
  validateAssignTicket,
  validateSendMessage,
  validateTicketId,
  validatePagination,
  validateTicketFilters,
  validateReopenTicket,
  validateBulkTicketUpdate,
  handleValidationErrors,
  sanitizeInput,
  sanitizeObject,
  isValidEmail,
  isValidPhone,
  isValidUrl,
  isStrongPassword
};