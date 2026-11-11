import Ticket from '../models/Ticket.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import aiService from '../services/aiService.js';
import { getIO } from '../config/socket.js';

const CATEGORIES = ['Technical', 'Billing', 'Account', 'Product', 'Other'];
const PRIORITIES = ['Low', 'Medium', 'High'];

// Allowed workflow: New → Assigned → In Progress → Resolved
const TRANSITIONS = {
  'New': ['Assigned'],
  'Assigned': ['In Progress', 'Resolved'],
  'In Progress': ['Resolved'],
  'Resolved': [] // sirf reopen se
};

const generateTicketNumber = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `TICKET-${timestamp}-${random}`.toUpperCase();
};

const sameId = (a, b) => String(a?._id || a) === String(b?._id || b);

// populate + sahi rooms me emit (kisi ko leak nahi hota)
const broadcastTicket = async (ticket, isNew = false) => {
  await ticket.populate([
    { path: 'customer', select: 'name email' },
    { path: 'agent', select: 'name email' }
  ]);
  const io = getIO();
  io.to(`ticket-${ticket._id}`).emit('ticket-updated', ticket);
  io.to(`user-${ticket.customer._id}`).emit('ticket-status-changed', ticket);
  io.to('agents').emit(isNew ? 'new-ticket' : 'ticket-status-changed', ticket);
};

export const createTicket = async (req, res) => {
  try {
    const { subject, description, category } = req.body;

    if (!subject?.trim() || !description?.trim()) {
      return res.status(400).json({ error: 'Subject and description are required' });
    }
    if (category && !CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    // AI fail ho to bhi ticket ban jaye (aiService khud mock pe fallback karti hai)
    let ai = null;
    try {
      ai = await aiService.analyzeTicket(description, subject, category);
    } catch (error) {
      console.error('AI analysis failed:', error);
    }
    const aiValid = ai && CATEGORIES.includes(ai.category) && PRIORITIES.includes(ai.priority);

    const ticket = new Ticket({
      ticketNumber: generateTicketNumber(),
      customer: req.user._id,
      subject: subject.trim(),
      description: description.trim(),
      // customer ki choice override nahi hoti; AI sirf suggest karta hai
      category: category || (aiValid ? ai.category : 'Other'),
      priority: aiValid ? ai.priority : 'Medium',
      aiSuggestion: aiValid
        ? { category: ai.category, priority: ai.priority, summary: ai.summary, processed: true, reviewed: false }
        : { processed: false, reviewed: false }
    });

    await ticket.save();
    await broadcastTicket(ticket, true);

    res.status(201).json(ticket);
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
};

export const getTickets = async (req, res) => {
  try {
    const query = {};

    if (req.user.role === 'customer') {
      query.customer = req.user._id;
    }

    // Agent: apne tickets + wo naye tickets jo abhi kisi ke nahi
    if (req.user.role === 'agent') {
      query.$or = [
        { agent: req.user._id },
        { agent: null, status: 'New' }
      ];
    }

    const tickets = await Ticket.find(query)
      .populate('customer', 'name email')
      .populate('agent', 'name email')
      .sort({ createdAt: -1 });

    res.json(tickets);
  } catch (error) {
    console.error('Get tickets error:', error);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
};

export const getTicketById = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('customer', 'name email')
      .populate('agent', 'name email');

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (req.user.role === 'customer' && !sameId(ticket.customer, req.user._id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (req.user.role === 'agent' && ticket.agent && !sameId(ticket.agent, req.user._id)) {
      return res.status(403).json({ error: 'Not assigned to this ticket' });
    }

    res.json(ticket);
  } catch (error) {
    console.error('Get ticket error:', error);
    res.status(500).json({ error: 'Failed to fetch ticket' });
  }
};

export const updateTicketStatus = async (req, res) => {
  try {
    const { status, resolutionNote } = req.body;

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (ticket.status === 'Resolved') {
      return res.status(400).json({ error: 'Resolved tickets cannot be changed. Reopen the ticket first.' });
    }

    if (req.user.role === 'agent' && !sameId(ticket.agent, req.user._id)) {
      return res.status(403).json({ error: 'Not assigned to this ticket. Claim it first.' });
    }

    if (!TRANSITIONS[ticket.status]?.includes(status)) {
      return res.status(400).json({ error: `Cannot move ticket from "${ticket.status}" to "${status}"` });
    }

    if (status === 'Resolved') {
      if (!resolutionNote?.trim()) {
        return res.status(400).json({ error: 'Resolution note is required to resolve a ticket' });
      }
      ticket.resolutionNote = resolutionNote.trim();
    }

    ticket.status = status;
    await ticket.save();
    await broadcastTicket(ticket);

    res.json(ticket);
  } catch (error) {
    console.error('Update ticket error:', error);
    res.status(500).json({ error: 'Failed to update ticket' });
  }
};

// Agent khud claim kare (agentId nahi dena) ya admin kisi agent ko assign kare
export const assignTicket = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    if (ticket.status === 'Resolved') {
      return res.status(400).json({ error: 'Cannot assign resolved ticket' });
    }

    let targetId = req.body.agentId;

    if (req.user.role === 'agent') {
      if (ticket.agent && !sameId(ticket.agent, req.user._id)) {
        return res.status(403).json({ error: 'Ticket is already assigned to another agent' });
      }
      targetId = req.user._id;
    } else if (!targetId) {
      targetId = req.user._id; // admin bina agentId ke khud claim kare
    }

    if (!targetId) {
      return res.status(400).json({ error: 'agentId is required' });
    }

    const agent = await User.findOne({ _id: targetId, role: { $in: ['agent', 'admin'] }, isActive: true });
    if (!agent) {
      return res.status(400).json({ error: 'Invalid agent' });
    }

    ticket.agent = agent._id;
    if (ticket.status === 'New') ticket.status = 'Assigned';
    await ticket.save();
    await broadcastTicket(ticket);

    res.json(ticket);
  } catch (error) {
    console.error('Assign ticket error:', error);
    res.status(500).json({ error: 'Failed to assign ticket' });
  }
};

// Agent AI suggestion edit karke confirm kare (review ke baad hi final hota hai)
export const reviewAiSuggestion = async (req, res) => {
  try {
    const { category, priority, summary } = req.body;

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    if (ticket.status === 'Resolved') {
      return res.status(400).json({ error: 'Ticket is resolved' });
    }
    if (req.user.role === 'agent' && !sameId(ticket.agent, req.user._id)) {
      return res.status(403).json({ error: 'Not assigned to this ticket. Claim it first.' });
    }
    // AI/agent ka output store hone se pehle validate
    if (!CATEGORIES.includes(category) || !PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: 'Invalid category or priority' });
    }

    ticket.category = category;
    ticket.priority = priority;
    ticket.aiSuggestion.category = category;
    ticket.aiSuggestion.priority = priority;
    if (summary?.trim()) ticket.aiSuggestion.summary = summary.trim();
    ticket.aiSuggestion.processed = true;
    ticket.aiSuggestion.reviewed = true;
    ticket.aiSuggestion.reviewedBy = req.user._id;
    ticket.aiSuggestion.reviewedAt = new Date();

    await ticket.save();
    await ticket.populate([
      { path: 'customer', select: 'name email' },
      { path: 'agent', select: 'name email' }
    ]);

    const io = getIO();
    io.to(`ticket-${ticket._id}`).emit('ticket-updated', ticket);

    res.json(ticket);
  } catch (error) {
    console.error('Review AI error:', error);
    res.status(500).json({ error: 'Failed to save review' });
  }
};

export const reopenTicket = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    if (ticket.status !== 'Resolved') {
      return res.status(400).json({ error: 'Only resolved tickets can be reopened' });
    }

    const allowed =
      req.user.role === 'admin' ||
      (req.user.role === 'customer' && sameId(ticket.customer, req.user._id)) ||
      (req.user.role === 'agent' && sameId(ticket.agent, req.user._id));
    if (!allowed) {
      return res.status(403).json({ error: 'Access denied' });
    }

    ticket.status = ticket.agent ? 'In Progress' : 'New';
    ticket.isReopened = true;
    ticket.resolutionNote = undefined;
    await ticket.save();
    await broadcastTicket(ticket);

    res.json(ticket);
  } catch (error) {
    console.error('Reopen ticket error:', error);
    res.status(500).json({ error: 'Failed to reopen ticket' });
  }
};

export const getTicketStatistics = async (req, res) => {
  try {
    const totalTickets = await Ticket.countDocuments();
    const openTickets = await Ticket.countDocuments({
      status: { $in: ['New', 'Assigned', 'In Progress'] }
    });
    const resolvedTickets = await Ticket.countDocuments({ status: 'Resolved' });

    const byPriority = await Ticket.aggregate([
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);

    const byCategory = await Ticket.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);

    const byStatus = await Ticket.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const recentTickets = await Ticket.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('customer', 'name');

    res.json({
      total: totalTickets,
      open: openTickets,
      resolved: resolvedTickets,
      byPriority,
      byCategory,
      byStatus,
      recentTickets
    });
  } catch (error) {
    console.error('Get statistics error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
};

export const getAvailableAgents = async (req, res) => {
  try {
    const agents = await User.find({ role: 'agent', isActive: true })
      .select('name email');
    res.json(agents);
  } catch (error) {
    console.error('Get agents error:', error);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
};