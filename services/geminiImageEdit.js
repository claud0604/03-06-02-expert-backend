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

    const editPrompt = `You are a professional beauty retouching expert. Edit ONLY the eyebrows in this photo. Keep everything else EXACTLY the same — same face, same skin, same eyes, same hair, same background, same lighting, same angle. Do NOT change anything except the eyebrows.

Change the eyebrows to: ${prompt}

CRITICAL RULES:
- The result must look like a real photograph, NOT a painting or illustration
- The eyebrows must have realistic individual hair strands
- Match the person's natural hair color for the eyebrows
- Maintain photorealistic quality throughout
- Do NOT alter any other facial features
- The output image must have the same dimensions and composition as the input`;

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
