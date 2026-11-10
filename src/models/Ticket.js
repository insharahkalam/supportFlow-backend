import mongoose from 'mongoose';

const ticketSchema = new mongoose.Schema({
    ticketNumber: {
        type: String,
        required: true,
        unique: true
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    agent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    subject: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    category: {
        type: String,
        enum: ['Technical', 'Billing', 'Account', 'Product', 'Other'],
        default: 'Other'
    },
    priority: {
        type: String,
        enum: ['Low', 'Medium', 'High'],
        default: 'Medium'
    },
    status: {
        type: String,
        enum: ['New', 'Assigned', 'In Progress', 'Resolved'],
        default: 'New'
    },
    aiSuggestion: {
        category: { type: String, enum: ['Technical', 'Billing', 'Account', 'Product', 'Other'] },
        priority: { type: String, enum: ['Low', 'Medium', 'High'] },
        summary: String,
        processed: { type: Boolean, default: false },
        reviewed: { type: Boolean, default: false },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reviewedAt: Date
    },
    resolutionNote: {
        type: String,
        trim: true
    },
    isReopened: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

ticketSchema.pre('save', async function () {
    this.updatedAt = Date.now();
});

const Ticket = mongoose.model('Ticket', ticketSchema);
export default Ticket;