const rateLimit = new Map();

export const rateLimiter = (options = {}) => {
    const {
        windowMs = 60000, // 1 minute
        max = 100, // max requests per window
        message = 'Too many requests, please try again later.'
    } = options;

    return (req, res, next) => {
        const key = req.ip || req.connection.remoteAddress;
        const now = Date.now();

        if (!rateLimit.has(key)) {
            rateLimit.set(key, {
                count: 1,
                resetTime: now + windowMs
            });
            return next();
        }

        const record = rateLimit.get(key);

        if (now > record.resetTime) {
            // Reset the counter
            rateLimit.set(key, {
                count: 1,
                resetTime: now + windowMs
            });
            return next();
        }

        if (record.count >= max) {
            return res.status(429).json({
                error: message,
                retryAfter: Math.ceil((record.resetTime - now) / 1000)
            });
        }

        record.count++;
        next();
    };
};

// Clean up old rate limit records periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimit) {
        if (now > record.resetTime) {
            rateLimit.delete(key);
        }
    }
}, 60000); // Clean up every minute