/**
 * Imagen 3 Inpainting Service
 * Vertex AI REST API — mask-based eyebrow inpainting + original compositing
 */
const { GoogleAuth } = require('google-auth-library');
const sharp = require('sharp');
const path = require('path');

const PROJECT_ID = process.env.GCS_PROJECT_ID;
const LOCATION = 'us-central1';
const MODEL = 'imagen-3.0-capability-001';
const ENDPOINT = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:predict`;

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
 * Call Imagen 3 inpainting API
 * @param {Buffer} imageBuffer - original image (JPEG/PNG)
 * @param {Buffer} maskBuffer - mask PNG (white=inpaint, black=keep)
 * @param {string} prompt - text prompt describing desired eyebrows
 * @returns {Buffer} generated image buffer
 */
async function callImagenInpainting(imageBuffer, maskBuffer, prompt) {
    const client = await getAuthClient();

    const imageBase64 = imageBuffer.toString('base64');
    const maskBase64 = maskBuffer.toString('base64');

    const requestBody = {
        instances: [
            {
                prompt: prompt,
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
                            maskMode: 'MASK_MODE_USER_PROVIDED'
                        }
                    }
                ]
            }
        ],
        parameters: {
            sampleCount: 1,
            editMode: 'EDIT_MODE_INPAINT_INSERTION'
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
        throw new Error('Imagen API returned no predictions');
    }

    const generatedBase64 = predictions[0].bytesBase64Encoded;
    if (!generatedBase64) {
        throw new Error('Imagen API returned empty image data');
    }

    return Buffer.from(generatedBase64, 'base64');
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
 * Full pipeline: inpaint eyebrows and composite with original
 * @param {Buffer} imageBuffer - original face image
 * @param {Buffer} maskBuffer - eyebrow mask
 * @param {string} prompt - eyebrow style prompt
 * @returns {Buffer} final image JPEG buffer
 */
async function inpaintEyebrows(imageBuffer, maskBuffer, prompt) {
    const jpegBuffer = await sharp(imageBuffer)
        .jpeg({ quality: 95 })
        .toBuffer();

    const pngMask = await sharp(maskBuffer)
        .png()
        .toBuffer();

    const generatedBuffer = await callImagenInpainting(jpegBuffer, pngMask, prompt);

    const finalBuffer = await compositeWithOriginal(jpegBuffer, generatedBuffer, pngMask);

    return finalBuffer;
}

module.exports = { inpaintEyebrows };
