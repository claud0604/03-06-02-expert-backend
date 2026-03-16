/**
 * AI Beauty Consultant Chat Routes
 * POST /api/chat — Gemini-powered beauty consultation agent
 */
const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const authExpert = require('../middleware/authExpert');
const Customer = require('../models/Customer');

const API_KEY = process.env.GEMINI_API_KEY;

const SYSTEM_PROMPT = `You are an expert AI beauty consultant working for APL COLOR, a professional personal color and image consulting service.

You have access to a customer's diagnosis data including:
- Personal color season and sub-tone (e.g., Spring Light, Autumn Deep)
- Face shape and features
- Body type
- Best/avoid colors
- Styling keywords

Based on this data, you provide professional beauty and styling advice:
- Eyebrow shape recommendations based on face shape
- Glasses frame recommendations
- Accessory recommendations (earrings, necklaces, rings, watches)
- Hair style and color suggestions
- Makeup color recommendations (lip, shadow, blush)
- Overall styling direction

Rules:
- Be specific and actionable in your recommendations
- Reference the customer's actual data in your answers
- Keep responses concise (2-4 paragraphs max)
- If asked about something outside beauty/styling, politely redirect
- You can respond in the language the user writes in (Korean, English, Japanese, Chinese)`;

/**
 * POST /api/chat
 * Body: { customerId, message, history[] }
 */
router.post('/', authExpert, async (req, res, next) => {
    try {
        const { customerId, message, history = [] } = req.body;

        if (!message) {
            return res.status(400).json({ success: false, message: 'message is required.' });
        }

        if (!API_KEY) {
            return res.status(500).json({ success: false, message: 'GEMINI_API_KEY not configured.' });
        }

        // Build customer context
        let customerContext = '';
        if (customerId) {
            const customer = await Customer.findById(customerId).lean();
            if (customer) {
                const d = customer.aiDiagnosis || {};
                const parts = [];
                if (customer.name) parts.push(`Name: ${customer.name}`);
                if (customer.gender) parts.push(`Gender: ${customer.gender}`);
                if (d.personalColor) parts.push(`Personal Color: ${d.personalColor}`);
                if (d.personalColorDetail) parts.push(`Color Detail: ${d.personalColorDetail}`);
                if (d.personalColorCharacteristics) {
                    const c = d.personalColorCharacteristics;
                    if (c.hue) parts.push(`Hue: ${c.hue}`);
                    if (c.value) parts.push(`Value: ${c.value}`);
                    if (c.chroma) parts.push(`Chroma: ${c.chroma}`);
                    if (c.contrast) parts.push(`Contrast: ${c.contrast}`);
                }
                if (d.faceShape) parts.push(`Face Shape: ${d.faceShape}`);
                if (d.faceShapeDetail) parts.push(`Face Shape Detail: ${d.faceShapeDetail}`);
                if (d.faceFeatures) {
                    const f = d.faceFeatures;
                    if (f.forehead) parts.push(`Forehead: ${f.forehead}`);
                    if (f.cheekbone) parts.push(`Cheekbone: ${f.cheekbone}`);
                    if (f.jawline) parts.push(`Jawline: ${f.jawline}`);
                }
                if (d.bodyType) parts.push(`Body Type: ${d.bodyType}`);
                if (d.bodyTypeDetail) parts.push(`Body Type Detail: ${d.bodyTypeDetail}`);
                if (d.bestColors && d.bestColors.length) parts.push(`Best Colors: ${d.bestColors.join(', ')}`);
                if (d.avoidColors && d.avoidColors.length) parts.push(`Avoid Colors: ${d.avoidColors.join(', ')}`);
                if (d.stylingKeywords && d.stylingKeywords.length) parts.push(`Styling Keywords: ${d.stylingKeywords.join(', ')}`);

                customerContext = `\n\n--- CUSTOMER DATA ---\n${parts.join('\n')}`;
            }
        }

        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: SYSTEM_PROMPT + customerContext
        });

        // Build chat history
        const chatHistory = history.map(h => ({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.text }]
        }));

        const chat = model.startChat({ history: chatHistory });
        const result = await chat.sendMessage(message);
        const reply = result.response.text();

        console.log(`[Chat] customer=${customerId || 'none'}, msg="${message.substring(0, 50)}...", reply=${reply.length}chars`);

        res.json({
            success: true,
            data: { reply }
        });

    } catch (error) {
        console.error('[Chat] Error:', error.message);
        next(error);
    }
});

module.exports = router;
