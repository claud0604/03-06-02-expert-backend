/**
 * Imagen 3 Inpainting Service (Optimized)
 * Vertex AI REST API — 2-step inpainting (REMOVAL → INSERTION) + compositing
 * Generates multiple candidates for user selection
 */
const { GoogleAuth } = require('google-auth-library');
const sharp = require('sharp');
const path = require('path');

const PROJECT_ID = process.env.GCS_PROJECT_ID;
const LOCATION = 'us-central1';
const MODEL = 'imagen-3.0-capability-001';
const ENDPOINT = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:predict`;

const NEGATIVE_PROMPT = 'cartoon, painting, drawing, artificial, flat color, unnatural, blurry, low quality, digital art, illustration, anime, watercolor, oil painting, sketch, pencil drawing, ms paint, clipart, 2D, unrealistic skin texture, disfigured, deformed';

let authClient = null;

async function getAuthClient() {
    if (authClient) return authClient;
    const keyFile = path.resolve(process.env.GCS_KEY_FILE || './config/gcs-key.json');
    const auth = new GoogleAuth({
        keyFile,
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    authClient = await auth.getClient();
    console.log('Vertex AI auth client initialized');
    return authClient;
}

/**
 * Step 1: Remove existing eyebrows (fill with skin)
 */
async function removeEyebrows(imageBase64, maskBase64) {
    const client = await getAuthClient();

    const requestBody = {
        instances: [
            {
                prompt: '',
                referenceImages: [
                    {
                        referenceType: 'REFERENCE_TYPE_RAW',
                        referenceId: 1,
                        referenceImage: { bytesBase64Encoded: imageBase64 }
                    },
                    {
                        referenceType: 'REFERENCE_TYPE_MASK',
                        referenceId: 2,
                        referenceImage: { bytesBase64Encoded: maskBase64 },
                        maskImageConfig: {
                            maskMode: 'MASK_MODE_USER_PROVIDED',
                            dilation: 0.01
                        }
                    }
                ]
            }
        ],
        parameters: {
            sampleCount: 1,
            editMode: 'EDIT_MODE_INPAINT_REMOVAL',
            editConfig: { baseSteps: 75 },
            personGeneration: 'allow_all'
        }
    };

    const response = await client.request({
        url: ENDPOINT,
        method: 'POST',
        data: requestBody,
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000
    });

    const predictions = response.data.predictions;
    if (!predictions || predictions.length === 0) {
        throw new Error('Imagen REMOVAL returned no predictions');
    }

    const base64 = predictions[0].bytesBase64Encoded;
    if (!base64) throw new Error('Imagen REMOVAL returned empty image');

    return base64;
}

/**
 * Step 2: Insert new eyebrows onto clean face
 * Returns multiple candidates
 */
async function insertEyebrows(cleanImageBase64, maskBase64, prompt) {
    const client = await getAuthClient();

    const requestBody = {
        instances: [
            {
                prompt: prompt,
                referenceImages: [
                    {
                        referenceType: 'REFERENCE_TYPE_RAW',
                        referenceId: 1,
                        referenceImage: { bytesBase64Encoded: cleanImageBase64 }
                    },
                    {
                        referenceType: 'REFERENCE_TYPE_MASK',
                        referenceId: 2,
                        referenceImage: { bytesBase64Encoded: maskBase64 },
                        maskImageConfig: {
                            maskMode: 'MASK_MODE_USER_PROVIDED',
                            dilation: 0.01
                        }
                    }
                ]
            }
        ],
        parameters: {
            sampleCount: 4,
            editMode: 'EDIT_MODE_INPAINT_INSERTION',
            editConfig: { baseSteps: 75 },
            guidanceScale: 60,
            negativePrompt: NEGATIVE_PROMPT,
            personGeneration: 'allow_all'
        }
    };

    const response = await client.request({
        url: ENDPOINT,
        method: 'POST',
        data: requestBody,
        headers: { 'Content-Type': 'application/json' },
        timeout: 90000
    });

    const predictions = response.data.predictions;
    if (!predictions || predictions.length === 0) {
        throw new Error('Imagen INSERTION returned no predictions');
    }

    return predictions
        .filter(p => p.bytesBase64Encoded)
        .map(p => Buffer.from(p.bytesBase64Encoded, 'base64'));
}

/**
 * Composite: paste inpainted eyebrow region onto original image
 * Ensures pixels outside mask are 100% original
 */
async function compositeWithOriginal(originalBuffer, generatedBuffer, maskBuffer) {
    const originalMeta = await sharp(originalBuffer).metadata();
    const { width, height } = originalMeta;

    const resizedGenerated = await sharp(generatedBuffer)
        .resize(width, height, { fit: 'fill' })
        .raw()
        .toBuffer();

    const resizedMask = await sharp(maskBuffer)
        .resize(width, height, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer();

    const originalRaw = await sharp(originalBuffer)
        .resize(width, height, { fit: 'fill' })
        .raw()
        .toBuffer();

    const channels = 3;
    const pixelCount = width * height;
    const output = Buffer.alloc(pixelCount * channels);

    for (let i = 0; i < pixelCount; i++) {
        const alpha = resizedMask[i] / 255;
        const idx = i * channels;
        for (let c = 0; c < channels; c++) {
            output[idx + c] = Math.round(
                originalRaw[idx + c] * (1 - alpha) + resizedGenerated[idx + c] * alpha
            );
        }
    }

    const result = await sharp(output, {
        raw: { width, height, channels }
    })
        .jpeg({ quality: 92 })
        .toBuffer();

    return result;
}

/**
 * Full pipeline: 2-step inpainting + compositing
 * Step 1: REMOVAL — remove existing eyebrows
 * Step 2: INSERTION — draw new eyebrows (4 candidates)
 * Step 3: Composite each candidate with original
 * @returns {Buffer[]} array of final JPEG buffers (up to 4)
 */
async function inpaintEyebrows(imageBuffer, maskBuffer, prompt) {
    const jpegBuffer = await sharp(imageBuffer)
        .jpeg({ quality: 95 })
        .toBuffer();

    const pngMask = await sharp(maskBuffer)
        .png()
        .toBuffer();

    const imageBase64 = jpegBuffer.toString('base64');
    const maskBase64 = pngMask.toString('base64');

    // Step 1: Remove existing eyebrows
    console.log('[Imagen] Step 1: Removing existing eyebrows...');
    const cleanBase64 = await removeEyebrows(imageBase64, maskBase64);
    console.log('[Imagen] Step 1 complete: eyebrows removed');

    // Step 2: Insert new eyebrows (4 candidates)
    console.log('[Imagen] Step 2: Inserting new eyebrows (4 candidates)...');
    const candidateBuffers = await insertEyebrows(cleanBase64, maskBase64, prompt);
    console.log(`[Imagen] Step 2 complete: ${candidateBuffers.length} candidates generated`);

    // Step 3: Composite each candidate with original
    console.log('[Imagen] Step 3: Compositing with original...');
    const results = await Promise.all(
        candidateBuffers.map(buf => compositeWithOriginal(jpegBuffer, buf, pngMask))
    );
    console.log(`[Imagen] Pipeline complete: ${results.length} final images`);

    return results;
}

module.exports = { inpaintEyebrows };
