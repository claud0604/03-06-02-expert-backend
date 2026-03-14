/**
 * Eyebrow AI Generation Routes
 * POST /api/eyebrow/generate — MediaPipe mask + Imagen 3 inpainting
 */
const express = require('express');
const router = express.Router();
const { bucket, GCS_CONFIG } = require('../config/gcs');
const authExpert = require('../middleware/authExpert');

// Lazy-loaded to avoid crashing server on startup (TF.js heavy init)
let _faceLandmarks = null;
let _imagenInpainting = null;
function getFaceLandmarks() {
    if (!_faceLandmarks) _faceLandmarks = require('../services/faceLandmarks');
    return _faceLandmarks;
}
function getImagenInpainting() {
    if (!_imagenInpainting) _imagenInpainting = require('../services/imagenInpainting');
    return _imagenInpainting;
}

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
        const maskBuffer = await getFaceLandmarks().detectEyebrowsAndCreateMask(imageBuffer);
        console.log(`[Eyebrow] Mask created (${(maskBuffer.length / 1024).toFixed(1)}KB)`);

        // 4. Inpaint eyebrows with Imagen 3
        console.log(`[Eyebrow] Calling Imagen 3 inpainting (style: ${eyebrowStyle})...`);
        const resultBuffer = await getImagenInpainting().inpaintEyebrows(imageBuffer, maskBuffer, prompt);
        console.log(`[Eyebrow] Inpainting complete (${(resultBuffer.length / 1024).toFixed(1)}KB)`);

        // 5. Upload result + mask to GCS
        const timestamp = Date.now();
        const gcsKey = `${customerId}/face/eyebrow_${eyebrowStyle}_${timestamp}.jpg`;
        const maskGcsKey = `${customerId}/face/eyebrow_mask_${eyebrowStyle}_${timestamp}.png`;

        const resultFile = bucket.file(gcsKey);
        const maskFile = bucket.file(maskGcsKey);

        await Promise.all([
            resultFile.save(resultBuffer, {
                contentType: 'image/jpeg',
                metadata: { cacheControl: 'public, max-age=31536000' }
            }),
            maskFile.save(maskBuffer, {
                contentType: 'image/png',
                metadata: { cacheControl: 'public, max-age=31536000' }
            })
        ]);
        console.log(`[Eyebrow] Uploaded result: ${gcsKey}, mask: ${maskGcsKey}`);

        // 6. Generate signed URLs for viewing
        const [[viewUrl], [maskViewUrl]] = await Promise.all([
            resultFile.getSignedUrl({
                version: 'v4',
                action: 'read',
                expires: Date.now() + GCS_CONFIG.viewExpires * 1000
            }),
            maskFile.getSignedUrl({
                version: 'v4',
                action: 'read',
                expires: Date.now() + GCS_CONFIG.viewExpires * 1000
            })
        ]);

        console.log(`[Eyebrow] Generation complete for customer=${customerId}`);

        res.json({
            success: true,
            data: {
                viewUrl,
                gcsKey,
                maskViewUrl,
                maskGcsKey
            }
        });

    } catch (error) {
        console.error('[Eyebrow] Generation error:', error.message);
        next(error);
    }
});

/**
 * GET /api/eyebrow/list/:customerId
 * List previously generated eyebrow images for a customer
 */
router.get('/list/:customerId', authExpert, async (req, res, next) => {
    try {
        const { customerId } = req.params;
        const prefix = `${customerId}/face/eyebrow_`;
        const [files] = await bucket.getFiles({ prefix });

        // Filter result images (exclude masks)
        const resultFiles = files.filter(f => !f.name.includes('_mask_'));

        if (resultFiles.length === 0) {
            return res.json({ success: true, data: [] });
        }

        // Find matching masks and generate signed URLs
        const items = await Promise.all(resultFiles.map(async (file) => {
            const name = file.name;
            // Extract style from filename: eyebrow_{style}_{timestamp}.jpg
            const match = name.match(/eyebrow_([a-z_]+)_(\d+)\.jpg$/);
            const style = match ? match[1] : 'unknown';
            const timestamp = match ? parseInt(match[2]) : 0;

            // Find matching mask
            const maskName = name.replace('eyebrow_', 'eyebrow_mask_').replace('.jpg', '.png');
            const maskFile = files.find(f => f.name === maskName);

            const [viewUrl] = await file.getSignedUrl({
                version: 'v4',
                action: 'read',
                expires: Date.now() + GCS_CONFIG.viewExpires * 1000
            });

            const result = {
                gcsKey: name,
                viewUrl,
                style,
                timestamp
            };

            if (maskFile) {
                const [maskViewUrl] = await maskFile.getSignedUrl({
                    version: 'v4',
                    action: 'read',
                    expires: Date.now() + GCS_CONFIG.viewExpires * 1000
                });
                result.maskViewUrl = maskViewUrl;
                result.maskGcsKey = maskFile.name;
            }

            return result;
        }));

        // Sort by newest first
        items.sort((a, b) => b.timestamp - a.timestamp);

        res.json({ success: true, data: items });
    } catch (error) {
        console.error('[Eyebrow] List error:', error.message);
        next(error);
    }
});

module.exports = router;
