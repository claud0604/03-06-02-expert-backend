/**
 * APL IMAGE - Expert Backend Server
 * Port: 3062
 * Shares MongoDB (01-custinfo) and S3 (apl-cust-images) with cust-info backend.
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');
const { s3Client, S3_CONFIG } = require('./config/s3');
const { HeadBucketCommand } = require('@aws-sdk/client-s3');
const errorHandler = require('./middleware/errorHandler');

const authRouter = require('./routes/auth');
const customersRouter = require('./routes/customers');
const uploadRouter = require('./routes/upload');
const appSettingsRouter = require('./routes/appSettings');

const app = express();
const PORT = process.env.PORT || 3062;

// MongoDB connection
connectDB();

// S3 connection check
const checkS3Connection = async () => {
    try {
        await s3Client.send(new HeadBucketCommand({ Bucket: S3_CONFIG.bucket }));
        console.log(`S3 connected: ${S3_CONFIG.bucket} (${process.env.AWS_REGION})`);
    } catch (error) {
        console.error('S3 connection failed:', error.message);
    }
};
checkS3Connection();

// CORS
const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.length && allowedOrigins.includes(origin)) return callback(null, true);
        if (origin.includes('localhost')) return callback(null, true);
        if (origin.endsWith('.pages.dev')) return callback(null, true);
        callback(new Error('Blocked by CORS policy.'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging (development)
if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
        next();
    });
}

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'expert-backend',
        timestamp: new Date().toISOString()
    });
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/customers', customersRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/app-settings', appSettingsRouter);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Resource not found.'
    });
});

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
    console.log(`Expert backend running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
