import Message from '../models/Message.js';
import Ticket from '../models/Ticket.js';
import { getIO } from '../config/socket.js';

export const sendMessage = async (req, res) => {
  try {
    const { ticketId, content, isResolution } = req.body;
    const senderId = req.user._id;
    const isFromAgent = req.user.role === 'agent' || req.user.role === 'admin';

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Check permissions
    if (req.user.role === 'customer' && ticket.customer.toString() !== senderId.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (req.user.role === 'agent' && ticket.agent && ticket.agent.toString() !== senderId.toString()) {
      return res.status(403).json({ error: 'Not assigned to this ticket' });
    }

    const message = new Message({
      ticket: ticketId,
      sender: senderId,
      content,
      isFromAgent,
      isResolution: isResolution || false
    });

    await message.save();

    // Populate sender info
    await message.populate('sender', 'name email role');

    // If ticket is New, move to Assigned
    if (ticket.status === 'New' && isFromAgent) {
      ticket.status = 'Assigned';
      await ticket.save();
    }

    // Emit real-time event
    const io = getIO();
    io.to(`ticket-${ticketId}`).emit('new-message', {
      message,
      ticketId
    });

    res.status(201).json(message);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { ticketId } = req.params;

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Check permissions
    if (req.user.role === 'customer' && ticket.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (req.user.role === 'agent' && ticket.agent && ticket.agent.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not assigned to this ticket' });
    }
    
    const messages = await Message.find({ ticket: ticketId })
      .populate('sender', 'name email role')
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};