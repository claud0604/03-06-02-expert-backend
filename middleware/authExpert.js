/**
 * Expert API Key Authentication Middleware
 */
const authExpert = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        return res.status(401).json({
            success: false,
            message: 'API key is required.'
        });
    }

    if (apiKey !== process.env.EXPERT_API_KEY) {
        return res.status(403).json({
            success: false,
            message: 'Invalid API key.'
        });
    }

    next();
};

module.exports = authExpert;
