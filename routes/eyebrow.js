/**
 * Eyebrow AI Generation Routes
 * POST /api/eyebrow/generate — supports 2 engines: Imagen 3 (mask-based) & Gemini (prompt-based)
 */
const express = require('express');
const router = express.Router();
const { bucket, GCS_CONFIG } = require('../config/gcs');
const authExpert = require('../middleware/authExpert');

// Lazy-loaded services
let _faceLandmarks = null;
let _imagenInpainting = null;
let _geminiImageEdit = null;

function getFaceLandmarks() {
    if (!_faceLandmarks) _faceLandmarks = require('../services/faceLandmarks');
    return _faceLandmarks;
}
function getImagenInpainting() {
    if (!_imagenInpainting) _imagenInpainting = require('../services/imagenInpainting');
    return _imagenInpainting;
}
function getGeminiImageEdit() {
    if (!_geminiImageEdit) _geminiImageEdit = require('../services/geminiImageEdit');
    return _geminiImageEdit;
}

// Eyebrow style → detailed prompt mapping
const STYLE_PROMPTS = {
    round: 'Perfectly groomed round-shaped eyebrows with a soft gentle curved arch. Medium thickness with natural-looking hair strokes. The eyebrow follows a smooth continuous curve from the inner corner to the outer corner. Clean well-defined edges that blend naturally into surrounding skin. Photorealistic high-resolution quality, matching the person\'s natural hair color.',
    ascending: 'Sharp ascending eyebrows angled upward from the inner corner to the outer corner. The tail is noticeably higher than the head of the eyebrow, creating an upward diagonal line. Clean defined edges with natural hair texture and medium-thick strokes. Well-groomed appearance. Photorealistic quality matching the person\'s natural hair color.',
    semi_arch: 'Semi-arched eyebrows with a gentle natural arch. The highest point is slightly past the middle of the eyebrow. Balanced even thickness throughout from head to tail. Natural hair strands visible with soft edges blending into skin. Elegant but not dramatic curve. Photorealistic quality matching the person\'s natural hair color.',
    arch: 'Dramatic high-arched eyebrows with a clearly defined peak at the highest point. Well-sculpted shape with an elegant curve that lifts at the arch and tapers toward the tail. Clean groomed appearance with visible hair texture. The arch creates a lifted sophisticated look. Photorealistic quality matching the person\'s natural hair color.',
    straight: 'Perfectly straight horizontal eyebrows in Korean beauty style. Flat even shape from inner corner to outer corner with consistent thickness throughout. No arch or curve, completely horizontal line. Natural hair texture with soft edges and clean groomed appearance. Photorealistic quality matching the person\'s natural hair color.'
};

/**
 * POST /api/eyebrow/generate
 * Generate AI eyebrow image for a customer
 * Body: { customerId, eyebrowStyle, engine: 'imagen' | 'gemini' }
 */
router.post('/generate', authExpert, async (req, res, next) => {
    try {
        const { customerId, eyebrowStyle, engine = 'imagen' } = req.body;

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

        console.log(`[Eyebrow] Starting generation: customer=${customerId}, style=${eyebrowStyle}, engine=${engine}`);

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

        const timestamp = Date.now();
        const enginePrefix = engine === 'gemini' ? 'gm' : 'ig';
        let resultBuffers = [];
        let maskBuffer = null;

        if (engine === 'gemini') {
            // === Gemini Engine (prompt-based, no mask) ===
            console.log(`[Eyebrow] Using Gemini engine...`);
            resultBuffers = await getGeminiImageEdit().editEyebrows(imageBuffer, prompt);
            console.log(`[Eyebrow] Gemini returned ${resultBuffers.length} result(s)`);
        } else {
            // === Imagen 3 Engine (mask-based, 2-step) ===
            console.log('[Eyebrow] Detecting face landmarks...');
            maskBuffer = await getFaceLandmarks().detectEyebrowsAndCreateMask(imageBuffer);
            console.log(`[Eyebrow] Mask created (${(maskBuffer.length / 1024).toFixed(1)}KB)`);

            console.log(`[Eyebrow] Using Imagen 3 engine (2-step, 4 candidates)...`);
            resultBuffers = await getImagenInpainting().inpaintEyebrows(imageBuffer, maskBuffer, prompt);
            console.log(`[Eyebrow] Imagen returned ${resultBuffers.length} result(s)`);
        }

        // 3. Upload all results to GCS
        const candidates = [];

        // Upload mask once (Imagen only)
        let maskGcsKey = null;
        let maskViewUrl = null;
        if (maskBuffer) {
            maskGcsKey = `${customerId}/face/eyebrow_mask_${enginePrefix}_${eyebrowStyle}_${timestamp}.png`;
            const maskFile = bucket.file(maskGcsKey);
            await maskFile.save(maskBuffer, {
                contentType: 'image/png',
                metadata: { cacheControl: 'public, max-age=31536000' }
            });
            const [url] = await maskFile.getSignedUrl({
                version: 'v4',
                action: 'read',
                expires: Date.now() + GCS_CONFIG.viewExpires * 1000
            });
            maskViewUrl = url;
        }

        // Upload each candidate
        for (let i = 0; i < resultBuffers.length; i++) {
            const gcsKey = `${customerId}/face/eyebrow_${enginePrefix}_${eyebrowStyle}_${timestamp}_${i}.jpg`;
            const file = bucket.file(gcsKey);

            await file.save(resultBuffers[i], {
                contentType: 'image/jpeg',
                metadata: { cacheControl: 'public, max-age=31536000' }
            });

            const [viewUrl] = await file.getSignedUrl({
                version: 'v4',
                action: 'read',
                expires: Date.now() + GCS_CONFIG.viewExpires * 1000
            });

            candidates.push({
                viewUrl,
                gcsKey,
                index: i
            });
        }

        console.log(`[Eyebrow] Uploaded ${candidates.length} candidates for customer=${customerId}`);

        res.json({
            success: true,
            data: {
                engine,
                candidates,
                maskViewUrl,
                maskGcsKey
            }
        });

    } catch (error) {
        console.error(`[Eyebrow] Generation error (${req.body.engine || 'imagen'}):`, error.message);
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

            // New format: eyebrow_{engine}_{style}_{timestamp}_{index}.jpg
            // Old format: eyebrow_{style}_{timestamp}.jpg
            let style = 'unknown';
            let timestamp = 0;
            let engine = 'imagen';

            const newMatch = name.match(/eyebrow_(ig|gm)_([a-z_]+)_(\d+)_(\d+)\.jpg$/);
            const oldMatch = name.match(/eyebrow_([a-z_]+)_(\d+)\.jpg$/);

            if (newMatch) {
                engine = newMatch[1] === 'gm' ? 'gemini' : 'imagen';
                style = newMatch[2];
                timestamp = parseInt(newMatch[3]);
            } else if (oldMatch) {
                style = oldMatch[1];
                timestamp = parseInt(oldMatch[2]);
            }

            const [viewUrl] = await file.getSignedUrl({
                version: 'v4',
                action: 'read',
                expires: Date.now() + GCS_CONFIG.viewExpires * 1000
            });

            const result = {
                gcsKey: name,
                viewUrl,
                style,
                timestamp,
                engine
            };

            // Find matching mask
            const maskPattern = name
                .replace(/eyebrow_(ig|gm)_/, 'eyebrow_mask_$1_')
                .replace(/eyebrow_(?!(ig|gm)_)/, 'eyebrow_mask_')
                .replace(/_\d+\.jpg$/, '')
                .replace(/\.jpg$/, '');

            const maskFile = files.find(f =>
                f.name.includes('_mask_') &&
                f.name.includes(style) &&
                f.name.includes(String(timestamp))
            );

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
