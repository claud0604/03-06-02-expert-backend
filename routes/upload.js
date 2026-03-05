/**
 * GCS Signed URL Routes (Expert)
 */
const express = require('express');
const router = express.Router();
const { bucket, GCS_CONFIG } = require('../config/gcs');
const authExpert = require('../middleware/authExpert');

// GCS base path for expert uploads
const GCS_BASE_PATH = 'expert-uploads';

/**
 * POST /api/upload/view-urls
 * Generate signed URLs for viewing GCS objects (public — no auth)
 * Used to display customer photos uploaded via cust-info
 */
router.post('/view-urls', async (req, res, next) => {
    try {
        const { gcsKeys } = req.body;

        if (!gcsKeys || !Array.isArray(gcsKeys)) {
            return res.status(400).json({
                success: false,
                message: 'gcsKeys array is required.'
            });
        }

        const viewUrls = await Promise.all(
            gcsKeys.filter(key => key).map(async (gcsKey) => {
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
                const gcsKey = `${GCS_BASE_PATH}/${customerId}/${category}/${type}_${timestamp}.${ext}`;

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

module.exports = router;
