/**
 * Eyebrow AI Generation Routes
 * POST /api/eyebrow/generate — MediaPipe mask + Imagen 3 inpainting
 */
const express = require('express');
const router = express.Router();
const { bucket, GCS_CONFIG } = require('../config/gcs');
const authExpert = require('../middleware/authExpert');
const { detectEyebrowsAndCreateMask } = require('../services/faceLandmarks');
const { inpaintEyebrows } = require('../services/imagenInpainting');

// Eyebrow style → prompt mapping
const STYLE_PROMPTS = {
    round: 'Natural round shaped eyebrows, soft curved arch, well-groomed, realistic skin texture, natural hair strands',
    ascending: 'Ascending upward angled eyebrows, sharp upward slope from inner to outer corner, well-defined, realistic skin texture',
    semi_arch: 'Semi-arch shaped eyebrows, gentle natural arch, balanced thickness, realistic skin texture, natural hair strands',
    arch: 'High arch shaped eyebrows, dramatic curved arch peak, elegant shape, realistic skin texture, natural hair strands',
    straight: 'Straight horizontal eyebrows, flat natural shape, even thickness, Korean style, realistic skin texture, natural hair strands'
};

/**
 * POST /api/eyebrow/generate
 * Generate AI eyebrow image for a customer
 * Body: { customerId, eyebrowStyle }
 */
router.post('/generate', authExpert, async (req, res, next) => {
    try {
        const { customerId, eyebrowStyle } = req.body;

        if (!customerId || !eyebrowStyle) {
            return res.status(400).json({
                success: false,
                message: 'customerId and eyebrowStyle are required.'
            });
        }

        const prompt = STYLE_PROMPTS[eyebrowStyle];
        if (!prompt) {
            return res.status(400).json({
                success: false,
                message: `Invalid eyebrowStyle. Must be one of: ${Object.keys(STYLE_PROMPTS).join(', ')}`
            });
        }

        console.log(`[Eyebrow] Starting generation for customer=${customerId}, style=${eyebrowStyle}`);

        // 1. Find customer's front face photo in GCS
        const prefix = `${customerId}/face/`;
        const [files] = await bucket.getFiles({ prefix });

        const frontFile = files.find(f => {
            const name = f.name.toLowerCase();
            return name.includes('front') && (name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png'));
        });

        if (!frontFile) {
            return res.status(404).json({
                success: false,
                message: 'Customer front face photo not found. Please upload a front face photo first.'
            });
        }

        console.log(`[Eyebrow] Found face photo: ${frontFile.name}`);

        // 2. Download the face photo
        const [imageBuffer] = await frontFile.download();
        console.log(`[Eyebrow] Downloaded face photo (${(imageBuffer.length / 1024).toFixed(1)}KB)`);

        // 3. Detect eyebrow landmarks and create mask
        console.log('[Eyebrow] Detecting face landmarks...');
        const maskBuffer = await detectEyebrowsAndCreateMask(imageBuffer);
        console.log(`[Eyebrow] Mask created (${(maskBuffer.length / 1024).toFixed(1)}KB)`);

        // 4. Inpaint eyebrows with Imagen 3
        console.log(`[Eyebrow] Calling Imagen 3 inpainting (style: ${eyebrowStyle})...`);
        const resultBuffer = await inpaintEyebrows(imageBuffer, maskBuffer, prompt);
        console.log(`[Eyebrow] Inpainting complete (${(resultBuffer.length / 1024).toFixed(1)}KB)`);

        // 5. Upload result to GCS
        const timestamp = Date.now();
        const gcsKey = `${customerId}/face/eyebrow_${eyebrowStyle}_${timestamp}.jpg`;
        const resultFile = bucket.file(gcsKey);

        await resultFile.save(resultBuffer, {
            contentType: 'image/jpeg',
            metadata: { cacheControl: 'public, max-age=31536000' }
        });
        console.log(`[Eyebrow] Uploaded result: ${gcsKey}`);

        // 6. Generate signed URL for viewing
        const [viewUrl] = await resultFile.getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: Date.now() + GCS_CONFIG.viewExpires * 1000
        });

        console.log(`[Eyebrow] Generation complete for customer=${customerId}`);

        res.json({
            success: true,
            data: {
                viewUrl,
                gcsKey
            }
        });

    } catch (error) {
        console.error('[Eyebrow] Generation error:', error.message);
        next(error);
    }
});

module.exports = router;
