import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { sendMessage, getMessages } from '../controllers/messageController.js';

const router = express.Router();

router.use(authenticate);

router.post('/', sendMessage);
router.get('/:ticketId', getMessages);

export default router;