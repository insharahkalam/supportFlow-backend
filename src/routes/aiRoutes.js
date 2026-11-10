import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  analyzeTicket,
  getAISuggestions,
  applyAISuggestions,
  editAISuggestions,
  generateResolutionSummary,
  detectDuplicates,
  getAnalysisStats
} from '../controllers/aiController.js';
import { validateTicketId, validateCreateTicket } from '../utils/validators.js';

const router = express.Router();

// All AI routes require authentication
router.use(authenticate);

// Analyze a ticket description (any authenticated user)
router.post('/analyze', validateCreateTicket, analyzeTicket);

// Get AI suggestions for a specific ticket
router.get('/suggestions/:ticketId', 
  authorize('agent', 'admin'),
  validateTicketId,
  getAISuggestions
);

// Apply AI suggestions to a ticket (agents only)
router.post('/suggestions/:ticketId/apply',
  authorize('agent', 'admin'),
  validateTicketId,
  applyAISuggestions
);

// Edit AI suggestions (agents only)
router.put('/suggestions/:ticketId/edit',
  authorize('agent', 'admin'),
  validateTicketId,
  editAISuggestions
);

// Generate resolution summary (agents only)
router.get('/resolution-summary/:ticketId',
  authorize('agent', 'admin'),
  validateTicketId,
  generateResolutionSummary
);

// Detect duplicate tickets (agents only)
router.get('/duplicates/:ticketId',
  authorize('agent', 'admin'),
  validateTicketId,
  detectDuplicates
);

// Get AI analysis statistics (admin only)
router.get('/stats',
  authorize('admin'),
  getAnalysisStats
);

export default router;