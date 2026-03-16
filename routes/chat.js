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

const SYSTEM_PROMPT = `You are an advanced data analysis agent for APL COLOR, a professional personal color and image consulting service with 12,000+ real consultation records.

You assist professional colorists and beauty experts by analyzing customer diagnosis data and finding insights.

Your capabilities:
- Analyze a customer's personal color data (season, sub-tone, hue, value, chroma, contrast) and identify unusual or noteworthy patterns
- Compare against typical ranges from 12,000+ diagnoses to flag anomalies
- Identify face shape and feature combinations that require special styling approaches
- Cross-reference personal color with body type for holistic styling insights
- Spot contradictions or edge cases in diagnosis results

When the expert asks you to analyze a customer:
- Focus on what is UNUSUAL or NOTEWORTHY about this specific customer
- Point out where they deviate from typical patterns
- Suggest areas the expert should pay extra attention to
- Provide data-driven reasoning, not generic advice
- If the data seems standard/typical, say so honestly

Rules:
- You are speaking to a PROFESSIONAL expert, not a customer. Use technical terminology.
- Be analytical and precise. Back claims with the customer's actual data.
- Keep responses concise (2-3 paragraphs max)
- Respond in the language the expert writes in (Korean, English, Japanese, Chinese)`;

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
