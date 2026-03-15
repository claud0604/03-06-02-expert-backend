/**
 * Gemini Image Editing Service
 * Google GenAI SDK — prompt-based eyebrow editing
 * Supports multiple Gemini image models
 */
const sharp = require('sharp');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const API_KEY = process.env.GEMINI_API_KEY;

const MODELS = {
    'gemini': 'gemini-2.5-flash-image',
    'gemini31': 'gemini-3.1-flash-image-preview'
};

/**
 * Edit eyebrows using Gemini's native image editing with reference image
 * @param {Buffer} imageBuffer - original face image
 * @param {Buffer} refImageBuffer - reference eyebrow style image
 * @param {string} engine - 'gemini' or 'gemini31'
 * @returns {Buffer[]} array of generated JPEG buffers
 */
async function editEyebrows(imageBuffer, refImageBuffer, engine = 'gemini') {
    if (!API_KEY) {
        throw new Error('GEMINI_API_KEY is not set in environment variables');
    }

    const modelId = MODELS[engine] || MODELS['gemini'];

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({
        model: modelId,
        generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
            temperature: 0.4
        }
    });

    const jpegBuffer = await sharp(imageBuffer)
        .jpeg({ quality: 95 })
        .toBuffer();

    const refJpegBuffer = await sharp(refImageBuffer)
        .jpeg({ quality: 95 })
        .toBuffer();

    const imageBase64 = jpegBuffer.toString('base64');
    const refImageBase64 = refJpegBuffer.toString('base64');

    const editPrompt = `You are a professional beauty retouching expert.

MOST IMPORTANT RULE — IDENTITY PRESERVATION:
The first image is a photo of a REAL person. You MUST preserve this person's face EXACTLY as it is. The face shape, eyes, nose, mouth, skin tone, skin texture, wrinkles, moles, facial hair, head hair, ears — ALL must remain 100% identical to the original photo. The person in the output image must be clearly recognizable as the SAME person. Do NOT generate a different face. Do NOT smooth, beautify, or alter the skin. Do NOT change the lighting, background, angle, or composition. The ONLY change allowed is the eyebrows.

TASK:
The second image shows a reference eyebrow shape/style. Apply EXACTLY that eyebrow shape to the person in the first image. Match the shape, angle, thickness, and arch of the reference eyebrow precisely.

EYEBROW RULES:
- Copy the exact shape and style from the reference eyebrow image
- The eyebrows must look like real human eyebrows with natural individual hair strands
- Match the person's natural hair color and skin tone (NOT the color from the reference)
- The result must be indistinguishable from a real photograph
- Do NOT paint, draw, or illustrate the eyebrows — they must be photorealistic

FORBIDDEN — Do NOT change:
- Face shape, eyes, nose, mouth, lips, teeth
- Skin color, skin texture, pores, wrinkles, moles, freckles
- Hair, ears, neck, clothing, jewelry, accessories
- Background, lighting, camera angle, image dimensions, composition
- Expression, gaze direction, head tilt`;

    console.log(`[Gemini SDK] Calling ${modelId}...`);

    const result = await model.generateContent({
        contents: [{
            role: 'user',
            parts: [
                {
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: imageBase64
                    }
                },
                {
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: refImageBase64
                    }
                },
                {
                    text: editPrompt
                }
            ]
        }]
    });

    const response = result.response;
    const candidates = response.candidates;

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

    console.log(`[Gemini SDK] Got ${results.length} image(s) from ${modelId}`);
    return results;
}

module.exports = { editEyebrows };
