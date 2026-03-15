/**
 * Gemini Image Editing Service (Nano Banana)
 * Vertex AI — prompt-based eyebrow editing using Gemini 2.5 Flash Image
 * No mask support — relies on Gemini's understanding to edit only eyebrows
 */
const { GoogleAuth } = require('google-auth-library');
const sharp = require('sharp');
const path = require('path');

const PROJECT_ID = process.env.GCS_PROJECT_ID;
const LOCATION = 'us-central1';
const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.0-flash-exp';
const ENDPOINT = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;

let authClient = null;

async function getAuthClient() {
    if (authClient) return authClient;
    const keyFile = path.resolve(process.env.GCS_KEY_FILE || './config/gcs-key.json');
    const auth = new GoogleAuth({
        keyFile,
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    authClient = await auth.getClient();
    console.log('Gemini Image auth client initialized');
    return authClient;
}

/**
 * Edit eyebrows using Gemini's native image editing
 * Sends original photo + detailed prompt → receives edited photo
 * @param {Buffer} imageBuffer - original face image
 * @param {string} prompt - eyebrow style description
 * @returns {Buffer[]} array of generated JPEG buffers
 */
async function editEyebrows(imageBuffer, prompt) {
    const client = await getAuthClient();

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

    const response = await client.request({
        url: ENDPOINT,
        method: 'POST',
        data: requestBody,
        headers: { 'Content-Type': 'application/json' },
        timeout: 120000
    });

    const candidates = response.data.candidates;
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

    return results;
}

module.exports = { editEyebrows };
