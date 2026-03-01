/**
 * AWS S3 Client Configuration
 */
const { S3Client } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const S3_CONFIG = {
    bucket: process.env.S3_BUCKET,
    uploadExpires: parseInt(process.env.PRESIGNED_URL_UPLOAD_EXPIRES) || 900,
    viewExpires: parseInt(process.env.PRESIGNED_URL_VIEW_EXPIRES) || 3600
};

module.exports = { s3Client, S3_CONFIG };
