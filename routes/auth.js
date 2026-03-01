/**
 * Expert Authentication Routes
 */
const express = require('express');
const router = express.Router();

// Diagnostician list (hardcoded for now)
const DIAGNOSTICIANS = [
    { id: 'expert_a', name: '임경은', role: 'Lead Colorist' },
    { id: 'expert_b', name: '이예지', role: 'Style Consultant' },
    { id: 'expert_c', name: '윤현지', role: 'Image Advisor' }
];

/**
 * GET /api/auth/diagnosticians
 * Return diagnostician list for login dropdown
 */
router.get('/diagnosticians', (req, res) => {
    res.json({
        success: true,
        data: DIAGNOSTICIANS.map(d => ({ id: d.id, name: d.name, role: d.role }))
    });
});

/**
 * POST /api/auth/login
 * Expert login with id + API key
 */
router.post('/login', (req, res) => {
    const { expertId, apiKey } = req.body;

    if (!expertId || !apiKey) {
        return res.status(400).json({
            success: false,
            message: 'expertId and apiKey are required.'
        });
    }

    if (apiKey !== process.env.EXPERT_API_KEY) {
        return res.status(401).json({
            success: false,
            message: 'Invalid API key.'
        });
    }

    const expert = DIAGNOSTICIANS.find(d => d.id === expertId);
    if (!expert) {
        return res.status(404).json({
            success: false,
            message: 'Diagnostician not found.'
        });
    }

    res.json({
        success: true,
        data: {
            id: expert.id,
            name: expert.name,
            role: expert.role,
            apiKey: apiKey
        }
    });
});

/**
 * POST /api/auth/verify
 * Verify API key is still valid
 */
router.post('/verify', (req, res) => {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey || apiKey !== process.env.EXPERT_API_KEY) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired session.'
        });
    }

    res.json({ success: true });
});

module.exports = router;
