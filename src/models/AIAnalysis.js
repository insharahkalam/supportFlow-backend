import mongoose from 'mongoose';

const aiAnalysisSchema = new mongoose.Schema({
    ticket: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ticket',
        required: true,
        unique: true // One analysis per ticket
    },
    category: {
        type: String,
        enum: ['Technical', 'Billing', 'Account', 'Product', 'Other'],
        required: true
    },
    priority: {
        type: String,
        enum: ['Low', 'Medium', 'High'],
        required: true
    },
    summary: {
        type: String,
        required: true,
        trim: true,
        maxlength: 500
    },
    confidence: {
        type: Number,
        min: 0,
        max: 1,
        default: 0.5
    },
    rawResponse: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    isApplied: {
        type: Boolean,
        default: false
    },
    appliedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    appliedAt: {
        type: Date
    },
    isEdited: {
        type: Boolean,
        default: false
    },
    originalSuggestion: {
        category: String,
        priority: String,
        summary: String
    },
    editedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    editedAt: {
        type: Date
    },
    // For duplicate detection
    similarTickets: [{
        ticketId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Ticket'
        },
        similarityScore: {
            type: Number,
            min: 0,
            max: 1
        },
        matchReason: String
    }],
    // For resolution summary
    resolutionSummary: {
        summary: String,
        keyPoints: [String],
        sentiment: {
            type: String,
            enum: ['Positive', 'Neutral', 'Negative']
        },
        generatedAt: Date
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

// Pre-save middleware to update updatedAt
aiAnalysisSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

// Index for faster queries
// aiAnalysisSchema.index({ ticket: 1 });
aiAnalysisSchema.index({ createdAt: -1 });
aiAnalysisSchema.index({ isApplied: 1 });

// Static method to get analysis by ticket
aiAnalysisSchema.statics.findByTicket = function (ticketId) {
    return this.findOne({ ticket: ticketId });
};

// Static method to get all applied analyses
aiAnalysisSchema.statics.findApplied = function () {
    return this.find({ isApplied: true })
        .populate('ticket', 'ticketNumber subject customer')
        .sort({ appliedAt: -1 });
};

// Method to apply analysis to ticket
aiAnalysisSchema.methods.applyToTicket = async function (userId) {
    this.isApplied = true;
    this.appliedBy = userId;
    this.appliedAt = new Date();

    // Update the associated ticket
    const Ticket = mongoose.model('Ticket');
    await Ticket.findByIdAndUpdate(this.ticket, {
        category: this.category,
        priority: this.priority,
        'aiSuggestion.category': this.category,
        'aiSuggestion.priority': this.priority,
        'aiSuggestion.summary': this.summary,
        'aiSuggestion.processed': true
    });

    await this.save();
    return this;
};

// Method to edit analysis - FIXED: Made async
aiAnalysisSchema.methods.editAnalysis = async function (updates, userId) {
    // Store original if not already stored
    if (!this.originalSuggestion) {
        this.originalSuggestion = {
            category: this.category,
            priority: this.priority,
            summary: this.summary
        };
    }

    // Apply updates
    if (updates.category) this.category = updates.category;
    if (updates.priority) this.priority = updates.priority;
    if (updates.summary) this.summary = updates.summary;

    this.isEdited = true;
    this.editedBy = userId;
    this.editedAt = new Date();

    // If already applied, update the ticket
    if (this.isApplied) {
        const Ticket = mongoose.model('Ticket');
        await Ticket.findByIdAndUpdate(this.ticket, {
            category: this.category,
            priority: this.priority,
            'aiSuggestion.category': this.category,
            'aiSuggestion.priority': this.priority,
            'aiSuggestion.summary': this.summary
        });
    }

    await this.save();
    return this;
};

const AIAnalysis = mongoose.model('AIAnalysis', aiAnalysisSchema);

export default AIAnalysis;