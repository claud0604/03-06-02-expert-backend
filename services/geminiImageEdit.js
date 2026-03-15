/**
 * Gemini Image Editing Service (Nano Banana)
 * Google AI API — prompt-based eyebrow editing using Gemini 2.5 Flash Image
 * No mask support — relies on Gemini's understanding to edit only eyebrows
 */
const sharp = require('sharp');

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash-image';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

/**
 * Edit eyebrows using Gemini's native image editing
 * Sends original photo + detailed prompt → receives edited photo
 * @param {Buffer} imageBuffer - original face image
 * @param {string} prompt - eyebrow style description
 * @returns {Buffer[]} array of generated JPEG buffers
 */
async function editEyebrows(imageBuffer, prompt) {
    if (!API_KEY) {
        throw new Error('GEMINI_API_KEY is not set in environment variables');
    }

    const jpegBuffer = await sharp(imageBuffer)
        .jpeg({ quality: 95 })
        .toBuffer();

    const imageBase64 = jpegBuffer.toString('base64');

    const editPrompt = `You are a professional beauty retouching expert.

MOST IMPORTANT RULE — IDENTITY PRESERVATION:
The attached photo is of a REAL person. You MUST preserve this person's face EXACTLY as it is. The face shape, eyes, nose, mouth, skin tone, skin texture, wrinkles, moles, facial hair, head hair, ears — ALL must remain 100% identical to the original photo. The person in the output image must be clearly recognizable as the SAME person. Do NOT generate a different face. Do NOT smooth, beautify, or alter the skin. Do NOT change the lighting, background, angle, or composition. The ONLY change allowed is the eyebrows.

TASK:
Change ONLY the eyebrows to: ${prompt}

EYEBROW RULES:
- The eyebrows must look like real human eyebrows with natural individual hair strands
- Match the person's natural hair color and skin tone
- The result must be indistinguishable from a real photograph
- Do NOT paint, draw, or illustrate the eyebrows — they must be photorealistic

FORBIDDEN — Do NOT change:
- Face shape, eyes, nose, mouth, lips, teeth
- Skin color, skin texture, pores, wrinkles, moles, freckles
- Hair, ears, neck, clothing, jewelry, accessories
- Background, lighting, camera angle, image dimensions, composition
- Expression, gaze direction, head tilt`;

    const requestBody = {
        contents: [
            {
                role: 'user',
                parts: [
                    {
                        inlineData: {
                            mimeType: 'image/jpeg',
                            data: imageBase64
                        }
                    },
                    {
                        text: editPrompt
                    }
                ]
            }
        ],
        generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
            temperature: 0.4
        }
    };

    console.log('[Gemini] Calling Gemini 2.5 Flash Image API...');

    const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(120000)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const candidates = data.candidates;
    if (!candidates || candidates.length === 0) {
        throw new Error('Gemini returned no candidates');
    }

    const results = [];

    for (const candidate of candidates) {
        if (!candidate.content || !candidate.content.parts) continue;
        for (const part of candidate.content.parts) {
            if (part.inlineData && part.inlineData.data) {
                const buf = Buffer.from(part.inlineData.data, 'base64');
                const jpegResult = await sharp(buf)
                    .jpeg({ quality: 92 })
                    .toBuffer();
                results.push(jpegResult);
            }
        }
    }

    if (results.length === 0) {
        throw new Error('Gemini returned no image data');
    }

    console.log(`[Gemini] Got ${results.length} image(s)`);
    return results;
}

module.exports = { editEyebrows };
