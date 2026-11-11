// import dns from 'dns'
// dns.setServers(['8.8.8.8', '1.1.1.1'])
// import express from 'express';
// import http from 'http';
// import cors from 'cors';
// import dotenv from 'dotenv';
// import connectDB from './config/database.js';
// import { initializeSocket } from './config/socket.js';
// import authRoutes from './routes/authRoutes.js';
// import ticketRoutes from './routes/ticketRoutes.js';
// import messageRoutes from './routes/messageRoutes.js';
// import aiRoutes from './routes/aiRoutes.js'; // Add this line

// dotenv.config();

// const app = express();
// const server = http.createServer(app);

// // Initialize Socket.IO
// const io = initializeSocket(server);

// // Middleware
// app.use(cors({
//     origin: process.env.NODE_ENV === 'production'
//         ? 'https://support-flow-frontend-zeta.vercel.app'
//         : 'http://localhost:5173',
//     credentials: true
// }));
// app.use(express.json());

// // Connect to MongoDB
// connectDB();

// // Routes
// app.use('/api/auth', authRoutes);
// app.use('/api/tickets', ticketRoutes);
// app.use('/api/messages', messageRoutes);
// app.use('/api/ai', aiRoutes); // Add this line

// // Health check
// app.get('/health', (req, res) => {
//     res.json({ status: 'OK', timestamp: new Date().toISOString() });
// });

// // Error handling middleware
// app.use((err, req, res, next) => {
//     console.error('Unhandled error:', err);
//     res.status(500).json({ error: 'Internal server error' });
// });

// const PORT = process.env.PORT || 3000;
// server.listen(PORT, () => {
//     console.log(`Server running on port ${PORT}`);
// });



import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';

import connectDB from './config/database.js';
import { initializeSocket } from './config/socket.js';

import authRoutes from './routes/authRoutes.js';
import ticketRoutes from './routes/ticketRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import aiRoutes from './routes/aiRoutes.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

// Allowed Frontend Origins
const allowedOrigins = [
    'http://localhost:5173',
    'https://support-flow-frontend-zeta.vercel.app'
];

// CORS Configuration
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS: ' + origin));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());

// Initialize Socket.IO
const io = initializeSocket(server);

// Connect to MongoDB
connectDB();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/ai', aiRoutes);

// Health Check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString()
    });
});

// Error Handling
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error'
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
