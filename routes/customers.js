/**
 * Customer Routes (Expert — dashboard & diagnosis)
 * Shares the same MongoDB collection as cust-info backend.
 */
const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const authExpert = require('../middleware/authExpert');
const { bucket } = require('../config/gcs');

// All customer routes require expert authentication
router.use(authExpert);

/**
 * GET /api/customers
 * List customers with pagination & filters
 */
router.get('/', async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 50,
            status,
            search
        } = req.query;

        const query = {};

        if (status && status !== 'all') {
            query['meta.status'] = status;
        }

        if (search) {
            query['customerInfo.name'] = { $regex: search, $options: 'i' };
        }

        const customers = await Customer.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .select('customerId customerInfo meta colorDiagnosis.type faceAnalysis.type bodyAnalysis.skeletonType bodyAnalysis.silhouetteType createdAt updatedAt');

        const total = await Customer.countDocuments(query);

        res.json({
            success: true,
            data: customers,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/customers/:customerId
 * Get full customer detail
 */
router.get('/:customerId', async (req, res, next) => {
    try {
        const { customerId } = req.params;
        const customer = await Customer.findOne({ customerId }).select('-__v');

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found.'
            });
        }

        res.json({
            success: true,
            data: customer
        });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/customers/:customerId
 * Update customer (save diagnosis, change status)
 */
router.put('/:customerId', async (req, res, next) => {
    try {
        const { customerId } = req.params;
        const updates = req.body;

        // Protect immutable fields
        delete updates._id;
        delete updates.customerId;
        delete updates.customerInfo;
        delete updates.customerPhotos;

        const customer = await Customer.findOneAndUpdate(
            { customerId },
            { $set: updates },
            { new: true, runValidators: true }
        ).select('-__v');

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found.'
            });
        }

        res.json({
            success: true,
            data: customer
        });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/customers/:customerId
 * Delete customer: remove MongoDB document + GCS uploaded images
 */
router.delete('/:customerId', async (req, res, next) => {
    try {
        const { customerId } = req.params;

        const customer = await Customer.findOne({ customerId });
        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found.'
            });
        }

        // Collect all GCS keys from the customer document
        const gcsKeysToDelete = [];

        // Expert-uploaded images (expert-uploads/{customerId}/...)
        try {
            const [files] = await bucket.getFiles({ prefix: `expert-uploads/${customerId}/` });
            files.forEach(file => gcsKeysToDelete.push(file.name));
        } catch (e) {
            console.error('GCS list error:', e.message);
        }

        // Cust-info uploaded photos (APLCOLOR/03-06-01-cust-info/{customerId}/...)
        try {
            const [files] = await bucket.getFiles({ prefix: `APLCOLOR/03-06-01-cust-info/${customerId}/` });
            files.forEach(file => gcsKeysToDelete.push(file.name));
        } catch (e) {
            console.error('GCS list error:', e.message);
        }

        // Delete GCS files
        if (gcsKeysToDelete.length > 0) {
            await Promise.allSettled(
                gcsKeysToDelete.map(key => bucket.file(key).delete().catch(e => {
                    console.error(`GCS delete failed: ${key}`, e.message);
                }))
            );
            console.log(`Deleted ${gcsKeysToDelete.length} GCS files for customer ${customerId}`);
        }

        // Delete MongoDB document
        await Customer.deleteOne({ customerId });

        res.json({
            success: true,
            message: 'Customer deleted successfully.',
            deletedFiles: gcsKeysToDelete.length
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
