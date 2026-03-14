/**
 * Face Landmarks Service
 * MediaPipe FaceMesh via TensorFlow.js — eyebrow landmark detection + mask generation
 */
const tf = require('@tensorflow/tfjs-node');
const faceLandmarksDetection = require('@tensorflow-models/face-landmarks-detection');
const sharp = require('sharp');

let detector = null;

// Eyebrow landmark indices (MediaPipe FaceMesh 468 keypoints)
const RIGHT_EYEBROW_TOP = [70, 63, 105, 66, 107];
const RIGHT_EYEBROW_BOTTOM = [46, 53, 52, 65, 55];
const LEFT_EYEBROW_TOP = [300, 293, 334, 296, 336];
const LEFT_EYEBROW_BOTTOM = [276, 283, 282, 295, 285];

const MASK_DILATE_PX = 14;
const MASK_BLUR_SIGMA = 7;

/**
 * Initialize FaceMesh detector (singleton)
 */
async function getDetector() {
    if (detector) return detector;

    const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
    detector = await faceLandmarksDetection.createDetector(model, {
        runtime: 'tfjs',
        refineLandmarks: true,
        maxFaces: 1
    });
    console.log('FaceMesh detector initialized');
    return detector;
}

/**
 * Detect eyebrow landmarks from image buffer
 * @param {Buffer} imageBuffer - JPEG/PNG image
 * @returns {Object} { keypoints, width, height }
 */
async function detectFace(imageBuffer) {
    const det = await getDetector();

    // Decode image to tensor
    const decoded = tf.node.decodeImage(imageBuffer, 3);
    const [height, width] = decoded.shape;

    const faces = await det.estimateFaces(decoded);
    decoded.dispose();

    if (!faces || faces.length === 0) {
        throw new Error('No face detected in image');
    }

    return { keypoints: faces[0].keypoints, width, height };
}

/**
 * Build closed polygon points for one eyebrow with dilation
 */
function buildEyebrowPolygon(keypoints, topIndices, bottomIndices, dilate) {
    const topPoints = topIndices.map(i => keypoints[i]);
    const bottomPoints = bottomIndices.map(i => keypoints[i]);

    // Compute centroid for dilation direction
    const allPts = [...topPoints, ...bottomPoints];
    const cx = allPts.reduce((s, p) => s + p.x, 0) / allPts.length;
    const cy = allPts.reduce((s, p) => s + p.y, 0) / allPts.length;

    function dilatePoint(px, py) {
        const dx = px - cx;
        const dy = py - cy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        return {
            x: Math.round(px + (dx / len) * dilate),
            y: Math.round(py + (dy / len) * dilate)
        };
    }

    // Top points (left to right) + bottom points reversed (right to left) = closed polygon
    const polygon = [];
    for (const p of topPoints) {
        const d = dilatePoint(p.x, p.y);
        // Extra upward push for top points
        polygon.push({ x: d.x, y: d.y - Math.round(dilate * 0.5) });
    }
    for (const p of [...bottomPoints].reverse()) {
        const d = dilatePoint(p.x, p.y);
        // Extra downward push for bottom points
        polygon.push({ x: d.x, y: d.y + Math.round(dilate * 0.3) });
    }

    return polygon;
}

/**
 * Generate eyebrow mask PNG from image buffer
 * White = eyebrow region (to inpaint), Black = keep original
 * @param {Buffer} imageBuffer
 * @returns {Buffer} mask PNG buffer (same dimensions as input)
 */
async function detectEyebrowsAndCreateMask(imageBuffer) {
    const { keypoints, width, height } = await detectFace(imageBuffer);

    // Build polygons for both eyebrows
    const rightPoly = buildEyebrowPolygon(keypoints, RIGHT_EYEBROW_TOP, RIGHT_EYEBROW_BOTTOM, MASK_DILATE_PX);
    const leftPoly = buildEyebrowPolygon(keypoints, LEFT_EYEBROW_TOP, LEFT_EYEBROW_BOTTOM, MASK_DILATE_PX);

    // Create SVG with white eyebrow polygons on black background
    const polyToSvg = (poly) =>
        poly.map(p => `${p.x},${p.y}`).join(' ');

    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="black"/>
        <polygon points="${polyToSvg(rightPoly)}" fill="white"/>
        <polygon points="${polyToSvg(leftPoly)}" fill="white"/>
    </svg>`;

    // Render SVG to PNG and apply Gaussian blur for soft edges
    const maskBuffer = await sharp(Buffer.from(svg))
        .png()
        .blur(MASK_BLUR_SIGMA)
        .toBuffer();

    return maskBuffer;
}

module.exports = { detectEyebrowsAndCreateMask };
