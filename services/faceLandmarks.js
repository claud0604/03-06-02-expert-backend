/**
 * Face Landmarks Service
 * Google Cloud Vision API — eyebrow landmark detection + mask generation
 */
const { GoogleAuth } = require('google-auth-library');
const sharp = require('sharp');
const path = require('path');

const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';
const MASK_DILATE_PX = 18;
const MASK_BLUR_SIGMA = 8;

let authClient = null;

async function getAuthClient() {
    if (authClient) return authClient;
    const keyFile = path.resolve(process.env.GCS_KEY_FILE || './config/gcs-key.json');
    const auth = new GoogleAuth({
        keyFile,
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    authClient = await auth.getClient();
    return authClient;
}

/**
 * Detect face landmarks using Cloud Vision API
 * @param {Buffer} imageBuffer
 * @returns {Object} { landmarks, width, height }
 */
async function detectFaceLandmarks(imageBuffer) {
    const client = await getAuthClient();

    const response = await client.request({
        url: VISION_API_URL,
        method: 'POST',
        data: {
            requests: [{
                image: { content: imageBuffer.toString('base64') },
                features: [{ type: 'FACE_DETECTION', maxResults: 1 }]
            }]
        }
    });

    const faces = response.data.responses[0].faceAnnotations;
    if (!faces || faces.length === 0) {
        throw new Error('No face detected in image');
    }

    // Get image dimensions
    const meta = await sharp(imageBuffer).metadata();

    return {
        landmarks: faces[0].landmarks,
        boundingPoly: faces[0].fdBoundingPoly,
        width: meta.width,
        height: meta.height
    };
}

/**
 * Build eyebrow polygon from Vision API landmarks
 * Vision API provides these eyebrow-related landmarks:
 * - LEFT_OF_LEFT_EYEBROW, RIGHT_OF_LEFT_EYEBROW, LEFT_EYEBROW_UPPER_MIDPOINT
 * - LEFT_OF_RIGHT_EYEBROW, RIGHT_OF_RIGHT_EYEBROW, RIGHT_EYEBROW_UPPER_MIDPOINT
 * Plus eye landmarks to define the lower boundary of eyebrow region
 */
function buildEyebrowMaskPolygons(landmarks, dilate) {
    const lm = {};
    for (const l of landmarks) {
        lm[l.type] = { x: l.position.x, y: l.position.y };
    }

    // Left eyebrow (viewer's left = person's right)
    const leftOuter = lm['LEFT_OF_LEFT_EYEBROW'];
    const leftInner = lm['RIGHT_OF_LEFT_EYEBROW'];
    const leftUpper = lm['LEFT_EYEBROW_UPPER_MIDPOINT'];
    const leftEyeTop = lm['LEFT_EYE_TOP_BOUNDARY'];

    // Right eyebrow
    const rightInner = lm['LEFT_OF_RIGHT_EYEBROW'];
    const rightOuter = lm['RIGHT_OF_RIGHT_EYEBROW'];
    const rightUpper = lm['RIGHT_EYEBROW_UPPER_MIDPOINT'];
    const rightEyeTop = lm['RIGHT_EYE_TOP_BOUNDARY'];

    if (!leftOuter || !leftInner || !leftUpper || !rightInner || !rightOuter || !rightUpper) {
        throw new Error('Required eyebrow landmarks not found');
    }

    function buildPoly(outer, inner, upper, eyeTop) {
        // Eyebrow height estimate
        const browHeight = eyeTop
            ? Math.abs(upper.y - eyeTop.y) * 0.6
            : dilate * 2;

        // Top edge (above eyebrow)
        const topY = upper.y - browHeight - dilate;
        // Bottom edge (between eyebrow and eye)
        const bottomY = eyeTop ? eyeTop.y - dilate * 0.3 : upper.y + browHeight * 0.5;

        return [
            { x: outer.x - dilate, y: topY },
            { x: upper.x, y: topY - dilate * 0.3 },
            { x: inner.x + dilate, y: topY },
            { x: inner.x + dilate, y: bottomY },
            { x: upper.x, y: bottomY + dilate * 0.2 },
            { x: outer.x - dilate, y: bottomY }
        ];
    }

    const leftPoly = buildPoly(leftOuter, leftInner, leftUpper, leftEyeTop);
    const rightPoly = buildPoly(rightInner, rightOuter, rightUpper, rightEyeTop);

    // Mirror right polygon direction (inner is on left side for right eyebrow)
    const rightPolyFixed = [
        { x: rightInner.x - dilate, y: rightPoly[0].y },
        { x: rightUpper.x, y: rightPoly[1].y },
        { x: rightOuter.x + dilate, y: rightPoly[2].y },
        { x: rightOuter.x + dilate, y: rightPoly[3].y },
        { x: rightUpper.x, y: rightPoly[4].y },
        { x: rightInner.x - dilate, y: rightPoly[5].y }
    ];

    return { leftPoly, rightPoly: rightPolyFixed };
}

/**
 * Generate eyebrow mask PNG from image buffer
 * White = eyebrow region (to inpaint), Black = keep original
 * @param {Buffer} imageBuffer
 * @returns {Buffer} mask PNG buffer
 */
async function detectEyebrowsAndCreateMask(imageBuffer) {
    const { landmarks, width, height } = await detectFaceLandmarks(imageBuffer);
    const { leftPoly, rightPoly } = buildEyebrowMaskPolygons(landmarks, MASK_DILATE_PX);

    const polyToSvg = (poly) => poly.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ');

    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="black"/>
        <polygon points="${polyToSvg(leftPoly)}" fill="white"/>
        <polygon points="${polyToSvg(rightPoly)}" fill="white"/>
    </svg>`;

    const maskBuffer = await sharp(Buffer.from(svg))
        .png()
        .blur(MASK_BLUR_SIGMA)
        .toBuffer();

    return maskBuffer;
}

module.exports = { detectEyebrowsAndCreateMask };
