import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  createTicket,
  getTickets,
  getTicketById,
  updateTicketStatus,
  assignTicket,
  reopenTicket,
  getTicketStatistics,
  getAvailableAgents,
  reviewAiSuggestion
} from '../controllers/ticketController.js';

const router = express.Router();

router.use(authenticate);

router.post('/', createTicket);
router.get('/', getTickets);
router.get('/statistics', authorize('admin', 'agent'), getTicketStatistics);
router.get('/agents', authorize('admin', 'agent'), getAvailableAgents);
router.get('/:id', getTicketById);
router.patch('/:id/status', authorize('admin', 'agent'), updateTicketStatus);
router.patch('/:id/assign', authorize('admin', 'agent'), assignTicket);
router.patch('/:id/ai-review', authorize('admin', 'agent'), reviewAiSuggestion);
router.patch('/:id/reopen', reopenTicket);

export default router;