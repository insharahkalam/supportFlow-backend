import aiService from '../services/aiService.js';
import Ticket from '../models/Ticket.js';
import AIAnalysis from '../models/AIAnalysis.js';
import Message from '../models/Message.js';

export const analyzeTicket = async (req, res) => {
    try {
        const { description, subject, category, ticketId } = req.body;

        if (!description) {
            return res.status(400).json({ error: 'Description is required for analysis' });
        }

        const suggestions = await aiService.analyzeTicket(description, subject, category);

        // If ticketId is provided, save the analysis
        if (ticketId) {
            const ticket = await Ticket.findById(ticketId);
            if (ticket) {
                await aiService.saveAnalysis(ticketId, {
                    ...suggestions,
                    rawResponse: { ...suggestions }
                });

                // Update ticket with AI suggestions
                ticket.aiSuggestion = {
                    category: suggestions.category,
                    priority: suggestions.priority,
                    summary: suggestions.summary,
                    processed: true
                };
                await ticket.save();
            }
        }

        res.json({
            ...suggestions,
            timestamp: new Date().toISOString(),
            source: suggestions.confidence > 0.7 ? 'ai' : 'rule-based'
        });
    } catch (error) {
        console.error('AI Analysis Error:', error);
        const fallback = aiService.getMockSuggestions(req.body.description || '');
        res.status(500).json({
            error: 'AI analysis failed',
            fallback: fallback,
            timestamp: new Date().toISOString()
        });
    }
};

export const getAISuggestions = async (req, res) => {
    try {
        const { ticketId } = req.params;

        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        // Check if AI analysis exists in the database
        const analysis = await AIAnalysis.findByTicket(ticketId);

        if (analysis) {
            return res.json({
                ...analysis.toJSON(),
                source: 'database'
            });
        }

        // If no saved analysis, generate new suggestions
        const suggestions = await aiService.analyzeTicket(
            ticket.description,
            ticket.subject,
            ticket.category
        );

        // Save the analysis
        await aiService.saveAnalysis(ticketId, suggestions);

        res.json({
            ...suggestions,
            source: 'generated',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Get AI suggestions error:', error);
        res.status(500).json({ error: 'Failed to get AI suggestions' });
    }
};

export const applyAISuggestions = async (req, res) => {
    try {
        const { ticketId } = req.params;
        const userId = req.user._id;

        const analysis = await AIAnalysis.findByTicket(ticketId);
        if (!analysis) {
            return res.status(404).json({ error: 'AI analysis not found' });
        }

        // Apply the analysis to the ticket
        await analysis.applyToTicket(userId);

        res.json({
            success: true,
            message: 'AI suggestions applied successfully',
            ticket: await Ticket.findById(ticketId)
                .populate('customer', 'name email')
                .populate('agent', 'name email')
        });
    } catch (error) {
        console.error('Apply AI suggestions error:', error);
        res.status(500).json({ error: 'Failed to apply AI suggestions' });
    }
};

export const editAISuggestions = async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { category, priority, summary } = req.body;
        const userId = req.user._id;

        const analysis = await AIAnalysis.findByTicket(ticketId);
        if (!analysis) {
            return res.status(404).json({ error: 'AI analysis not found' });
        }

        // Edit the analysis
        const updated = await analysis.editAnalysis({
            category,
            priority,
            summary
        }, userId);

        res.json({
            success: true,
            message: 'AI suggestions updated',
            analysis: updated
        });
    } catch (error) {
        console.error('Edit AI suggestions error:', error);
        res.status(500).json({ error: 'Failed to edit AI suggestions' });
    }
};

export const generateResolutionSummary = async (req, res) => {
    try {
        const { ticketId } = req.params;

        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        // Get all messages for this ticket
        const messages = await Message.find({ ticket: ticketId })
            .sort({ createdAt: 1 });

        const summary = aiService.generateResolutionSummary(messages);

        // Save the resolution summary to the AI analysis
        const analysis = await AIAnalysis.findByTicket(ticketId);
        if (analysis) {
            analysis.resolutionSummary = {
                ...summary,
                generatedAt: new Date()
            };
            await analysis.save();
        }

        res.json({
            ...summary,
            ticketNumber: ticket.ticketNumber,
            generatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Generate resolution summary error:', error);
        res.status(500).json({ error: 'Failed to generate resolution summary' });
    }
};

export const detectDuplicates = async (req, res) => {
    try {
        const { ticketId } = req.params;

        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        // Find similar tickets
        const similarTickets = await Ticket.find({
            _id: { $ne: ticketId },
            status: { $ne: 'Resolved' },
            $or: [
                { subject: { $regex: ticket.subject.split(' ').slice(0, 3).join('|'), $options: 'i' } },
                { description: { $regex: ticket.description.split(' ').slice(0, 5).join('|'), $options: 'i' } }
            ]
        }).limit(10)
            .populate('customer', 'name email')
            .populate('agent', 'name email');

        const duplicates = aiService.detectDuplicateTickets(
            ticket.description,
            similarTickets
        );

        // Save duplicates to AI analysis
        const analysis = await AIAnalysis.findByTicket(ticketId);
        if (analysis) {
            analysis.similarTickets = duplicates.map(d => ({
                ticketId: d.ticketId,
                similarityScore: d.similarity / 100,
                matchReason: d.matchReason
            }));
            await analysis.save();
        }

        res.json({
            ticketId: ticketId,
            ticketNumber: ticket.ticketNumber,
            duplicates: duplicates,
            totalFound: duplicates.length
        });
    } catch (error) {
        console.error('Duplicate detection error:', error);
        res.status(500).json({ error: 'Failed to detect duplicates' });
    }
};

export const getAnalysisStats = async (req, res) => {
    try {
        const totalAnalyses = await AIAnalysis.countDocuments();
        const appliedAnalyses = await AIAnalysis.countDocuments({ isApplied: true });
        const editedAnalyses = await AIAnalysis.countDocuments({ isEdited: true });

        const categories = await AIAnalysis.aggregate([
            { $group: { _id: '$category', count: { $sum: 1 } } }
        ]);

        const priorities = await AIAnalysis.aggregate([
            { $group: { _id: '$priority', count: { $sum: 1 } } }
        ]);

        res.json({
            total: totalAnalyses,
            applied: appliedAnalyses,
            edited: editedAnalyses,
            categories,
            priorities,
            averageConfidence: await AIAnalysis.aggregate([
                { $group: { _id: null, avg: { $avg: '$confidence' } } }
            ]).then(result => result[0]?.avg || 0)
        });
    } catch (error) {
        console.error('Get analysis stats error:', error);
        res.status(500).json({ error: 'Failed to get analysis statistics' });
    }
};