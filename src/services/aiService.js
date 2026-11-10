import axios from 'axios';
import AIAnalysis from '../models/AIAnalysis.js';

class AIService {
    async analyzeTicket(description, subject, category = null) {
        try {
            // Check if we should use real AI or mock
            const useRealAI = process.env.AI_API_KEY &&
                process.env.AI_API_KEY !== 'your_ai_api_key_here' &&
                process.env.NODE_ENV !== 'test';

            if (!useRealAI) {
                console.log('Using mock AI suggestions (no API key configured)');
                return this.getMockSuggestions(description);
            }

            const prompt = this.buildPrompt(description, subject, category);

            const response = await axios.post(
                process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions',
                {
                    model: process.env.AI_MODEL || 'gpt-3.5-turbo',
                    messages: [
                        {
                            role: 'system',
                            content: `You are a customer support ticket analyzer. 
                       Analyze the ticket and provide structured suggestions.
                       Respond ONLY with valid JSON.
                       Categories: Technical, Billing, Account, Product, Other
                       Priorities: Low, Medium, High`
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.3,
                    max_tokens: 200,
                    response_format: { type: "json_object" }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.AI_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000 // 10 second timeout
                }
            );

            const result = this.parseAIResponse(response.data);

            // If AI failed to parse properly, fallback to mock
            if (!result || !result.category) {
                console.warn('AI response parsing failed, using mock suggestions');
                return this.getMockSuggestions(description);
            }

            return result;
        } catch (error) {
            console.error('AI Service Error:', error.message);
            if (error.response) {
                console.error('AI API Response:', error.response.data);
            }
            // Fallback to mock suggestions on any error
            return this.getMockSuggestions(description);
        }
    }

    buildPrompt(description, subject, category) {
        return `
      Analyze this customer support ticket and provide structured analysis:
      
      Subject: ${subject}
      Description: ${description}
      ${category ? `User-provided category: ${category}` : ''}
      
      Return JSON with these exact fields:
      {
        "category": "one of: Technical, Billing, Account, Product, Other",
        "priority": "one of: Low, Medium, High",
        "summary": "brief 1-2 sentence summary of the issue",
        "confidence": "number between 0 and 1 indicating confidence in analysis",
        "keywords": ["array", "of", "key", "words"],
        "urgency_indicators": ["array", "of", "urgency", "indicators", "found"]
      }
      
      Guidelines:
      - Billing issues: category Billing, priority High
      - Login/account issues: category Account, priority High
      - Technical bugs: category Technical, priority Medium
      - Feature questions: category Product, priority Low
      - Payment/refund issues: category Billing, priority High
      - System crash/error: category Technical, priority High
      - General questions: category Other, priority Low
      
      Consider these urgency indicators:
      - "urgent", "asap", "critical", "emergency", "immediate": High priority
      - "soon", "important", "priority": Medium priority
      - "question", "how to", "help": Low priority
    `;
    }

    parseAIResponse(response) {
        try {
            const content = response.choices[0].message.content;
            const parsed = JSON.parse(content);

            // Validate required fields
            const validCategories = ['Technical', 'Billing', 'Account', 'Product', 'Other'];
            const validPriorities = ['Low', 'Medium', 'High'];

            const category = validCategories.includes(parsed.category) ? parsed.category : 'Other';
            const priority = validPriorities.includes(parsed.priority) ? parsed.priority : 'Medium';

            return {
                category,
                priority,
                summary: parsed.summary || 'No summary available',
                confidence: parsed.confidence || 0.7,
                keywords: parsed.keywords || [],
                urgency_indicators: parsed.urgency_indicators || []
            };
        } catch (error) {
            console.error('Error parsing AI response:', error);
            return null;
        }
    }

    getMockSuggestions(description) {
        const lowerDesc = description.toLowerCase();

        // Determine urgency based on keywords
        const urgentKeywords = ['urgent', 'asap', 'critical', 'emergency', 'immediate', 'billing', 'charge', 'payment', 'refund'];
        const mediumKeywords = ['soon', 'important', 'priority', 'bug', 'error', 'crash', 'login', 'password', 'access'];

        let urgencyLevel = 'Medium';
        let category = 'Other';
        let summary = 'Ticket requires manual review';
        let keywords = [];
        let confidence = 0.5;

        // Check for urgent keywords
        if (urgentKeywords.some(word => lowerDesc.includes(word))) {
            urgencyLevel = 'High';
            confidence = 0.7;
        } else if (mediumKeywords.some(word => lowerDesc.includes(word))) {
            urgencyLevel = 'Medium';
            confidence = 0.6;
        } else {
            urgencyLevel = 'Low';
            confidence = 0.5;
        }

        // Determine category
        if (lowerDesc.includes('billing') || lowerDesc.includes('charge') ||
            lowerDesc.includes('payment') || lowerDesc.includes('refund') ||
            lowerDesc.includes('invoice') || lowerDesc.includes('subscription')) {
            category = 'Billing';
            summary = 'Billing issue detected, requires financial review';
            keywords = ['billing', 'payment', 'financial'];
            confidence = 0.8;
        } else if (lowerDesc.includes('login') || lowerDesc.includes('password') ||
            lowerDesc.includes('access') || lowerDesc.includes('account') ||
            lowerDesc.includes('username') || lowerDesc.includes('email')) {
            category = 'Account';
            summary = 'Account access issue reported, requires verification';
            keywords = ['account', 'login', 'access'];
            confidence = 0.75;
        } else if (lowerDesc.includes('bug') || lowerDesc.includes('error') ||
            lowerDesc.includes('crash') || lowerDesc.includes('not working') ||
            lowerDesc.includes('failed') || lowerDesc.includes('issue')) {
            category = 'Technical';
            summary = 'Technical issue reported, needs investigation';
            keywords = ['technical', 'bug', 'error'];
            confidence = 0.7;
        } else if (lowerDesc.includes('feature') || lowerDesc.includes('how to') ||
            lowerDesc.includes('question') || lowerDesc.includes('help') ||
            lowerDesc.includes('guide') || lowerDesc.includes('tutorial')) {
            category = 'Product';
            summary = 'Product question or feature inquiry';
            keywords = ['question', 'feature', 'help'];
            confidence = 0.6;
        }

        // Extract some keywords from description
        const words = lowerDesc.split(' ').filter(w => w.length > 3);
        const uniqueKeywords = [...new Set(words.slice(0, 5))];
        keywords = [...new Set([...keywords, ...uniqueKeywords])];

        return {
            category,
            priority: urgencyLevel,
            summary,
            confidence,
            keywords,
            urgency_indicators: this.getUrgencyIndicators(lowerDesc)
        };
    }

    getUrgencyIndicators(text) {
        const indicators = [];
        const urgentPhrases = ['urgent', 'asap', 'immediate', 'critical', 'emergency', 'right away', 'quickly'];
        const highPriorityPhrases = ['important', 'high priority', 'major issue', 'serious'];

        urgentPhrases.forEach(phrase => {
            if (text.includes(phrase)) indicators.push('urgent_issue');
        });

        highPriorityPhrases.forEach(phrase => {
            if (text.includes(phrase)) indicators.push('high_priority');
        });

        if (text.includes('billing') || text.includes('payment') || text.includes('refund')) {
            indicators.push('financial_impact');
        }

        if (text.includes('all') || text.includes('multiple') || text.includes('system')) {
            indicators.push('widespread_impact');
        }

        return [...new Set(indicators)];
    }

    async saveAnalysis(ticketId, analysisData) {
        try {
            // Check if analysis already exists
            let analysis = await AIAnalysis.findByTicket(ticketId);

            if (analysis) {
                // Update existing analysis
                analysis.category = analysisData.category;
                analysis.priority = analysisData.priority;
                analysis.summary = analysisData.summary;
                analysis.confidence = analysisData.confidence || 0.5;
                analysis.rawResponse = analysisData.rawResponse || null;
                await analysis.save();
            } else {
                // Create new analysis
                analysis = new AIAnalysis({
                    ticket: ticketId,
                    category: analysisData.category,
                    priority: analysisData.priority,
                    summary: analysisData.summary,
                    confidence: analysisData.confidence || 0.5,
                    rawResponse: analysisData.rawResponse || null
                });
                await analysis.save();
            }

            return analysis;
        } catch (error) {
            console.error('Error saving AI analysis:', error);
            return null;
        }
    }

    async getAnalysisForTicket(ticketId) {
        try {
            return await AIAnalysis.findByTicket(ticketId);
        } catch (error) {
            console.error('Error getting AI analysis:', error);
            return null;
        }
    }

    generateResolutionSummary(messages) {
        try {
            if (!messages || messages.length === 0) {
                return {
                    summary: 'No conversation history available',
                    keyPoints: ['No messages found'],
                    sentiment: 'Neutral'
                };
            }

            const allMessages = messages.map(m => m.content).join(' ');
            const isResolved = allMessages.toLowerCase().includes('resolve') ||
                allMessages.toLowerCase().includes('fixed') ||
                allMessages.toLowerCase().includes('solved');

            // Extract key points
            const keyPoints = [];
            const sentences = allMessages.split(/[.!?]+/).filter(s => s.trim().length > 20);

            // Take top 3 most informative sentences
            const sortedSentences = sentences.sort((a, b) => b.length - a.length).slice(0, 3);
            sortedSentences.forEach(s => keyPoints.push(s.trim()));

            // Determine sentiment
            let sentiment = 'Neutral';
            const positiveWords = ['great', 'good', 'thanks', 'thank you', 'excellent', 'helpful', 'resolved', 'fixed'];
            const negativeWords = ['bad', 'terrible', 'unhappy', 'disappointed', 'frustrated', 'worst'];

            const positiveCount = positiveWords.filter(w => allMessages.toLowerCase().includes(w)).length;
            const negativeCount = negativeWords.filter(w => allMessages.toLowerCase().includes(w)).length;

            if (positiveCount > negativeCount) sentiment = 'Positive';
            else if (negativeCount > positiveCount) sentiment = 'Negative';

            return {
                summary: isResolved ? 'Issue resolved through customer support interaction' : 'Ticket requires further attention',
                keyPoints: keyPoints.length > 0 ? keyPoints : ['Customer issue addressed'],
                sentiment,
                resolved: isResolved
            };
        } catch (error) {
            console.error('Error generating resolution summary:', error);
            return {
                summary: 'Unable to generate summary',
                keyPoints: ['Error generating summary'],
                sentiment: 'Neutral'
            };
        }
    }

    detectDuplicateTickets(description, existingTickets) {
        // Simple duplicate detection based on keyword matching
        const keywords = description.toLowerCase().split(' ');
        const matches = [];

        existingTickets.forEach(ticket => {
            const ticketText = `${ticket.subject} ${ticket.description}`.toLowerCase();
            const matchCount = keywords.filter(word =>
                word.length > 3 && ticketText.includes(word)
            ).length;

            if (matchCount > 2) {
                const similarity = Math.min((matchCount / keywords.length) * 100, 100);
                matches.push({
                    ticketId: ticket._id,
                    ticketNumber: ticket.ticketNumber,
                    similarity: Math.round(similarity),
                    matchReason: `${matchCount} common keywords found`
                });
            }
        });

        return matches.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
    }
}

export default new AIService();