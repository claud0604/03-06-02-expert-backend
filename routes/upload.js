/**
 * GCS Signed URL Routes (Expert)
 */
const express = require('express');
const router = express.Router();
const { bucket, GCS_CONFIG } = require('../config/gcs');
const authExpert = require('../middleware/authExpert');

/**
 * POST /api/upload/view-urls
 * Generate signed URLs for viewing GCS objects (public — no auth)
 * Accepts both gcsKeys and s3Keys for backward compatibility
 */
router.post('/view-urls', async (req, res, next) => {
    try {
        const keys = req.body.gcsKeys || req.body.s3Keys;

        if (!keys || !Array.isArray(keys)) {
            return res.status(400).json({
                success: false,
                message: 'gcsKeys array is required.'
            });
        }

        const viewUrls = await Promise.all(
            keys.filter(key => key).map(async (gcsKey) => {
                const file = bucket.file(gcsKey);
                const [presignedUrl] = await file.getSignedUrl({
                    version: 'v4',
                    action: 'read',
                    expires: Date.now() + GCS_CONFIG.viewExpires * 1000
                });

                return {
                    gcsKey,
                    presignedUrl,
                    expiresIn: GCS_CONFIG.viewExpires
                };
            })
        );

        res.json({
            success: true,
            data: viewUrls
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/upload/presigned-url
 * Generate signed URLs for expert image uploads (protected)
 */
router.post('/presigned-url', authExpert, async (req, res, next) => {
    try {
        const { customerId, files } = req.body;

        if (!customerId || !files || !Array.isArray(files)) {
            return res.status(400).json({
                success: false,
                message: 'customerId and files array are required.'
            });
        }

        const presignedUrls = await Promise.all(
            files.map(async (file) => {
                const { category, type, filename, contentType = 'image/jpeg' } = file;

                const timestamp = Date.now();
                const ext = contentType.split('/')[1] || 'jpg';
                const gcsKey = `${customerId}/${category}/${type}_${timestamp}.${ext}`;

                const gcsFile = bucket.file(gcsKey);
                const [presignedUrl] = await gcsFile.getSignedUrl({
                    version: 'v4',
                    action: 'write',
                    expires: Date.now() + GCS_CONFIG.uploadExpires * 1000,
                    contentType: contentType
                });

                return {
                    presignedUrl,
                    gcsKey,
                    category,
                    type,
                    filename
                };
            })
        );

        res.json({
            success: true,
            data: presignedUrls,
            expiresIn: GCS_CONFIG.uploadExpires
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/upload/base64-to-gcs
 * Upload base64 images to GCS (protected)
 * Used by expert frontend to upload pasted/dropped images
 */
router.post('/base64-to-gcs', authExpert, async (req, res, next) => {
    try {
        const { customerId, images } = req.body;

        if (!customerId || !images || !Array.isArray(images)) {
            return res.status(400).json({
                success: false,
                message: 'customerId and images array are required.'
            });
        }

        const results = await Promise.all(
            images.map(async (img) => {
                const { path: imgPath, base64Data } = img;

                // Parse base64 data URL
                const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
                if (!matches) {
                    return { path: imgPath, gcsKey: null, error: 'Invalid base64 format' };
                }

                const contentType = matches[1];
                const buffer = Buffer.from(matches[2], 'base64');
                const ext = contentType.split('/')[1] || 'jpg';

                // Build GCS path: {customerId}/{category}/{filename}_{timestamp}.{ext}
                const safePath = imgPath.replace(/\./g, '/');
                const timestamp = Date.now();
                const gcsKey = `${customerId}/${safePath}_${timestamp}.${ext}`;

                // Upload to GCS
                const file = bucket.file(gcsKey);
                await file.save(buffer, {
                    contentType,
                    metadata: { cacheControl: 'public, max-age=31536000' }
                });

                return { path: imgPath, gcsKey };
            })
        );

        res.json({
            success: true,
            results
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
