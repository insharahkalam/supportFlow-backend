import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Ticket from '../models/Ticket.js';

let io;

export const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.NODE_ENV === 'production'
        ? 'https://your-frontend-domain.com'
        : ['http://localhost:5173', 'http://localhost:3000'],
      methods: ['GET', 'POST']
    }
  });

  // JWT check handshake pe
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      if (!user) return next(new Error('User not found'));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const { _id, role } = socket.user;
    console.log('Client connected:', socket.id, role);

    socket.join(`user-${_id}`);
    if (role === 'agent' || role === 'admin') socket.join('agents');

    socket.on('join-ticket', async (ticketId) => {
      try {
        const ticket = await Ticket.findById(ticketId).select('customer agent');
        if (!ticket) return;

        const isOwner = String(ticket.customer) === String(_id);
        const isStaff =
          role === 'admin' ||
          (role === 'agent' && (!ticket.agent || String(ticket.agent) === String(_id)));

        if (!isOwner && !isStaff) return;
        socket.join(`ticket-${ticketId}`);
        console.log(`Socket ${socket.id} joined ticket-${ticketId}`);
      } catch (err) {
        console.error('join-ticket error:', err.message);
      }
    });

    socket.on('leave-ticket', (ticketId) => {
      socket.leave(`ticket-${ticketId}`);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};