/**
 * Customer Model - MongoDB Schema
 * Collection: 01-custinfo (shared with cust-info backend)
 */
const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
    customerId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    customerInfo: {
        name: { type: String, required: true },
        gender: { type: String, enum: ['female', 'male'], required: true },
        age: { type: Number, required: true },
        phone: { type: String, required: true },
        email: { type: String, default: '' },
        occupation: { type: String, default: '' },
        height: { type: Number, required: true },
        weight: { type: Number, required: true },
        clothingSize: { type: String, default: '' },
        diagnosisReason: { type: String, default: '' },
        stylePreference: { type: String, default: '' }
    },

    appointment: {
        date: { type: String, default: '' },
        time: { type: String, default: '' }
    },

    customerPhotos: {
        face: {
            front: { type: String, default: '' },
            angle45: { type: String, default: '' },
            side: { type: String, default: '' },
            video: { type: String, default: '' }
        },
        body: {
            front: { type: String, default: '' },
            angle45: { type: String, default: '' },
            side: { type: String, default: '' },
            video: { type: String, default: '' }
        },
        reference: {
            makeup: [{ type: String }],
            fashion: [{ type: String }]
        }
    },

    mediaMetadata: {
        totalSizeBytes: { type: Number, default: 0 },
        uploadedAt: { type: Date, default: null },
        processingStatus: {
            type: String,
            enum: ['pending', 'completed', 'failed'],
            default: 'pending'
        }
    },

    colorDiagnosis: {
        type: { type: String, default: '' },
        bestColors: [{ type: String }],
        worstColors: [{ type: String }],
        palette: {
            primary: [{ type: String }],
            accent: [{ type: String }],
            avoid: [{ type: String }]
        },
        makeupMuse: {
            name: { type: String, default: '' },
            imageUrl: { type: String, default: '' }
        },
        description: { type: String, default: '' }
    },

    faceAnalysis: {
        type: { type: String, default: '' },
        features: {
            forehead: { type: String, default: '' },
            cheekbone: { type: String, default: '' },
            jawline: { type: String, default: '' },
            chin: { type: String, default: '' }
        },
        referenceImage: { type: String, default: '' },
        description: { type: String, default: '' },
        typeImageUrl: { type: String, default: '' },
        eyebrow: {
            afterImageUrl: { type: String, default: '' },
            comment: { type: String, default: '' }
        },
        glassesRecommendation: [{ type: String }],
        bangsRecommendation: [{ type: String }],
        hairstyleRecommendation: [{ type: String }],
        accessoryRecommendation: [{ type: String }],
        hairstyleExamples: [{ type: String }],
        makeupExamples: [{ type: String }]
    },

    bodyAnalysis: {
        skeletonType: { type: String, default: '' },
        silhouetteType: { type: String, default: '' },
        features: {
            shoulder: { type: String, default: '' },
            waist: { type: String, default: '' },
            hip: { type: String, default: '' },
            leg: { type: String, default: '' }
        },
        bestItems: [{ type: String }],
        worstItems: [{ type: String }],
        description: { type: String, default: '' }
    },

    styling: {
        keywords: [{ type: String }],
        recommendations: {
            tops: [{ type: String }],
            bottoms: [{ type: String }],
            outerwear: [{ type: String }],
            accessories: [{ type: String }],
            overall: [{ type: String }]
        },
        avoidItems: [{ type: String }],
        description: { type: String, default: '' }
    },

    aiDiagnosis: {
        personalColor: { type: String, default: '' },
        personalColorDetail: { type: String, default: '' },
        personalColorCharacteristics: {
            hue: { type: String, default: '' },
            value: { type: String, default: '' },
            chroma: { type: String, default: '' },
            contrast: { type: String, default: '' }
        },
        faceShape: { type: String, default: '' },
        faceShapeDetail: { type: String, default: '' },
        faceFeatures: {
            forehead: { type: String, default: '' },
            cheekbone: { type: String, default: '' },
            jawline: { type: String, default: '' }
        },
        bodyType: { type: String, default: '' },
        bodyTypeDetail: { type: String, default: '' },
        bodyFeatures: {
            shoulder: { type: String, default: '' },
            waist: { type: String, default: '' },
            hip: { type: String, default: '' }
        },
        stylingKeywords: [{ type: String }],
        bestColors: [{ type: String }],
        avoidColors: [{ type: String }],
        generatedAt: { type: Date, default: null },
        isCompleted: { type: Boolean, default: false },
        rawGeminiResponse: { type: String, default: '' }
    },

    meta: {
        status: {
            type: String,
            enum: ['pending', 'in_progress', 'completed'],
            default: 'pending'
        },
        diagnosedBy: { type: String, default: '' }
    }
}, {
    timestamps: true,
    collection: '01-custinfo'
});

customerSchema.index({ 'meta.status': 1 });
customerSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Customer', customerSchema);
