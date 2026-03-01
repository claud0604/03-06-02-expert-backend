/**
 * S3 Presigned URL Routes (Expert)
 */
const express = require('express');
const router = express.Router();
const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { s3Client, S3_CONFIG } = require('../config/s3');
const authExpert = require('../middleware/authExpert');

// S3 base path for expert uploads
const S3_BASE_PATH = 'APLCOLOR/03-06-02-expert';

/**
 * POST /api/upload/view-urls
 * Generate presigned URLs for viewing S3 objects (public — no auth)
 * Used to display customer photos uploaded via cust-info
 */
router.post('/view-urls', async (req, res, next) => {
    try {
        const { s3Keys } = req.body;

        if (!s3Keys || !Array.isArray(s3Keys)) {
            return res.status(400).json({
                success: false,
                message: 's3Keys array is required.'
            });
        }

        const viewUrls = await Promise.all(
            s3Keys.filter(key => key).map(async (s3Key) => {
                const command = new GetObjectCommand({
                    Bucket: S3_CONFIG.bucket,
                    Key: s3Key
                });

                const presignedUrl = await getSignedUrl(s3Client, command, {
                    expiresIn: S3_CONFIG.viewExpires
                });

                return {
                    s3Key,
                    presignedUrl,
                    expiresIn: S3_CONFIG.viewExpires
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
 * Generate presigned URLs for expert image uploads (protected)
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
                const s3Key = `${S3_BASE_PATH}/${customerId}/${category}/${type}_${timestamp}.${ext}`;

                const command = new PutObjectCommand({
                    Bucket: S3_CONFIG.bucket,
                    Key: s3Key,
                    ContentType: contentType
                });

                const presignedUrl = await getSignedUrl(s3Client, command, {
                    expiresIn: S3_CONFIG.uploadExpires
                });

                return {
                    presignedUrl,
                    s3Key,
                    category,
                    type,
                    filename
                };
            })
        );

        res.json({
            success: true,
            data: presignedUrls,
            expiresIn: S3_CONFIG.uploadExpires
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
