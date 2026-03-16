/**
 * AI Expert Data Analysis Agent — with Function Calling
 * POST /api/chat — Gemini-powered agent that can search customer DB
 *
 * ── CURRENT FUNCTIONS ──
 * 1. searchCustomers — DB에서 고객 검색 (퍼스널컬러, 얼굴형, 체형, 성별, 나이, 직업 등)
 *
 * ── FUTURE FUNCTIONS (TODO) ──
 * 데이터가 쌓일수록 에이전트의 분석/추천 정확도가 높아짐
 *
 * 2. getCustomerStats — 전체 고객 통계 (타입별 비율, 평균 나이, 성별 분포 등)
 *    예: "가장 많은 퍼스널컬러 타입이 뭐야?" → 파이차트 데이터 반환
 *
 * 3. getPopularProducts — 특정 컬러 타입에 가장 많이 추천된 화장품/액세서리
 *    예: "여름 라이트에 가장 인기있는 립 컬러는?" → 추천 빈도 집계
 *
 * 4. findSimilarCustomers — 현재 고객과 유사한 프로필의 고객 검색
 *    예: "이 고객이랑 비슷한 사람들은 어떤 진단 받았어?" → 유사도 기반 검색
 *
 * 5. getExpertSchedule — 전문가의 오늘/이번주 예약 고객 목록
 *    예: "오늘 내 담당 고객 알려줘" → appointment 필드 기반 조회
 *
 * 6. getColorTrends — 기간별 진단 트렌드 분석
 *    예: "최근 3개월간 겨울 타입이 늘었어?" → 시계열 데이터
 */
const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const authExpert = require('../middleware/authExpert');
const Customer = require('../models/Customer');

const API_KEY = process.env.GEMINI_API_KEY;

// ─── Function Declarations (Gemini에게 사용 가능한 도구 알려줌) ───
const tools = [{
    functionDeclarations: [{
        name: 'searchCustomers',
        description: 'Search customer database by personal color type, face shape, body type, name, gender, age range, or occupation. Returns matching customers with their diagnosis summary. Use this when the expert asks about specific customer groups, statistics, or wants to find customers by diagnosis criteria.',
        parameters: {
            type: 'OBJECT',
            properties: {
                personalColor: {
                    type: 'STRING',
                    description: 'Personal color season to filter by (e.g., "Spring", "Summer", "Autumn", "Winter", or sub-types like "Summer Light", "Winter Dark")'
                },
                faceShape: {
                    type: 'STRING',
                    description: 'Face shape to filter by (e.g., "Oval", "Round", "Square", "Heart", "Oblong")'
                },
                bodyType: {
                    type: 'STRING',
                    description: 'Body type to filter by (e.g., "Straight", "Wave", "Natural")'
                },
                gender: {
                    type: 'STRING',
                    description: 'Gender filter: "male" or "female"'
                },
                name: {
                    type: 'STRING',
                    description: 'Customer name to search (partial match supported)'
                },
                occupation: {
                    type: 'STRING',
                    description: 'Occupation keyword to search'
                },
                ageMin: {
                    type: 'NUMBER',
                    description: 'Minimum age filter'
                },
                ageMax: {
                    type: 'NUMBER',
                    description: 'Maximum age filter'
                },
                limit: {
                    type: 'NUMBER',
                    description: 'Max number of results to return (default: 10, max: 20)'
                }
            }
        }
    }]
}];

// ─── Function 실행 (서버에서 안전하게 DB 조회) ───
async function executeSearchCustomers(params) {
    const query = {};

    if (params.personalColor) {
        query['aiDiagnosis.personalColor'] = { $regex: params.personalColor, $options: 'i' };
    }
    if (params.faceShape) {
        query['aiDiagnosis.faceShape'] = { $regex: params.faceShape, $options: 'i' };
    }
    if (params.bodyType) {
        query['aiDiagnosis.bodyType'] = { $regex: params.bodyType, $options: 'i' };
    }
    if (params.gender) {
        query['customerInfo.gender'] = params.gender;
    }
    if (params.name) {
        query['customerInfo.name'] = { $regex: params.name, $options: 'i' };
    }
    if (params.occupation) {
        query['customerInfo.occupation'] = { $regex: params.occupation, $options: 'i' };
    }
    if (params.ageMin || params.ageMax) {
        query['customerInfo.age'] = {};
        if (params.ageMin) query['customerInfo.age'].$gte = params.ageMin;
        if (params.ageMax) query['customerInfo.age'].$lte = params.ageMax;
    }

    const limit = Math.min(params.limit || 10, 20);

    // 민감 정보 제외: 전화번호, 이메일, 사진 URL 제외
    const customers = await Customer.find(query)
        .select('customerInfo.name customerInfo.gender customerInfo.age customerInfo.occupation customerInfo.height customerInfo.weight customerInfo.stylePreference customerInfo.diagnosisReason aiDiagnosis meta.status createdAt')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

    const total = await Customer.countDocuments(query);

    const results = customers.map(c => {
        const info = c.customerInfo || {};
        const d = c.aiDiagnosis || {};
        return {
            name: info.name || 'Unknown',
            gender: info.gender || '',
            age: info.age || '',
            occupation: info.occupation || '',
            personalColor: d.personalColor || '',
            personalColorDetail: d.personalColorDetail || '',
            faceShape: d.faceShape || '',
            bodyType: d.bodyType || '',
            stylingKeywords: (d.stylingKeywords || []).join(', '),
            status: (c.meta || {}).status || '',
            date: c.createdAt ? new Date(c.createdAt).toLocaleDateString('ko-KR') : ''
        };
    });

    return JSON.stringify({
        totalMatched: total,
        showing: results.length,
        customers: results
    });
}

// ─── System Prompt ───
const SYSTEM_PROMPT = `You are an advanced data analysis agent for APL COLOR, a professional personal color and image consulting service with 12,000+ real consultation records.

You assist professional colorists and beauty experts by analyzing customer diagnosis data and finding insights.

TOOLS AVAILABLE:
You have access to the searchCustomers function to query the customer database. Use it when the expert asks about:
- Finding customers by color type, face shape, body type, etc.
- Statistics or patterns across multiple customers
- Comparing a current customer against similar profiles
- Looking up specific customers by name
Always use the tool rather than guessing — the database has real data.

Your capabilities:
- Analyze a customer's personal color data (season, sub-tone, hue, value, chroma, contrast) and identify unusual or noteworthy patterns
- Compare against typical ranges from 12,000+ diagnoses to flag anomalies
- Identify face shape and feature combinations that require special styling approaches
- Cross-reference personal color with body type for holistic styling insights
- Spot contradictions or edge cases in diagnosis results
- Use customer profile info (occupation, age, gender, style preference, diagnosis reason) to suggest practical styling direction tailored to their lifestyle
- Search and analyze the customer database to find patterns and similar cases

LIFESTYLE & PROFILE-BASED ANALYSIS:
When customer profile data is available, incorporate it into your analysis:
- **Occupation**: Suggest styling atmosphere that fits their work environment (e.g., corporate = polished/authoritative, creative = expressive/unique, service = approachable/trustworthy, student = fresh/trendy)
- **Age**: Consider age-appropriate styling — not stereotyping, but practical guidance
- **Gender**: Factor in gender-specific styling norms and opportunities
- **Style Preference**: Check if their color/body diagnosis aligns or conflicts with it
- **Diagnosis Reason**: Understanding WHY they came helps prioritize recommendations
- **Body Measurements**: Height, weight, clothing size context for practical fashion advice

When the expert asks you to analyze a customer:
- Focus on what is UNUSUAL or NOTEWORTHY about this specific customer
- Point out where they deviate from typical patterns
- Suggest areas the expert should pay extra attention to
- Provide data-driven reasoning, not generic advice
- If the data seems standard/typical, say so honestly
- When profile info is available, proactively suggest overall styling atmosphere/direction based on their occupation and lifestyle

Rules:
- You are speaking to a PROFESSIONAL expert, not a customer. Use technical terminology.
- Be analytical and precise. Back claims with the customer's actual data.
- Keep responses concise (2-3 paragraphs max)
- Respond in the language the expert writes in (Korean, English, Japanese, Chinese)`;

/**
 * POST /api/chat
 * Body: { customerId, message, history[] }
 */
router.post('/', authExpert, async (req, res, next) => {
    try {
        const { customerId, message, history = [] } = req.body;

        if (!message) {
            return res.status(400).json({ success: false, message: 'message is required.' });
        }

        if (!API_KEY) {
            return res.status(500).json({ success: false, message: 'GEMINI_API_KEY not configured.' });
        }

        // Build customer context
        let customerContext = '';
        if (customerId) {
            const customer = await Customer.findById(customerId).lean();
            if (customer) {
                const d = customer.aiDiagnosis || {};
                const info = customer.customerInfo || {};
                const parts = [];

                // Profile info
                if (info.name) parts.push(`Name: ${info.name}`);
                if (info.gender) parts.push(`Gender: ${info.gender}`);
                if (info.age) parts.push(`Age: ${info.age}`);
                if (info.occupation) parts.push(`Occupation: ${info.occupation}`);
                if (info.height) parts.push(`Height: ${info.height}cm`);
                if (info.weight) parts.push(`Weight: ${info.weight}kg`);
                if (info.clothingSize) parts.push(`Clothing Size: ${info.clothingSize}`);
                if (info.stylePreference) parts.push(`Style Preference: ${info.stylePreference}`);
                if (info.diagnosisReason) parts.push(`Diagnosis Reason: ${info.diagnosisReason}`);

                // AI diagnosis data
                if (d.personalColor) parts.push(`Personal Color: ${d.personalColor}`);
                if (d.personalColorDetail) parts.push(`Color Detail: ${d.personalColorDetail}`);
                if (d.personalColorCharacteristics) {
                    const c = d.personalColorCharacteristics;
                    if (c.hue) parts.push(`Hue: ${c.hue}`);
                    if (c.value) parts.push(`Value: ${c.value}`);
                    if (c.chroma) parts.push(`Chroma: ${c.chroma}`);
                    if (c.contrast) parts.push(`Contrast: ${c.contrast}`);
                }
                if (d.faceShape) parts.push(`Face Shape: ${d.faceShape}`);
                if (d.faceShapeDetail) parts.push(`Face Shape Detail: ${d.faceShapeDetail}`);
                if (d.faceFeatures) {
                    const f = d.faceFeatures;
                    if (f.forehead) parts.push(`Forehead: ${f.forehead}`);
                    if (f.cheekbone) parts.push(`Cheekbone: ${f.cheekbone}`);
                    if (f.jawline) parts.push(`Jawline: ${f.jawline}`);
                }
                if (d.bodyType) parts.push(`Body Type: ${d.bodyType}`);
                if (d.bodyTypeDetail) parts.push(`Body Type Detail: ${d.bodyTypeDetail}`);
                if (d.bestColors && d.bestColors.length) parts.push(`Best Colors: ${d.bestColors.join(', ')}`);
                if (d.avoidColors && d.avoidColors.length) parts.push(`Avoid Colors: ${d.avoidColors.join(', ')}`);
                if (d.stylingKeywords && d.stylingKeywords.length) parts.push(`Styling Keywords: ${d.stylingKeywords.join(', ')}`);

                customerContext = `\n\n--- CURRENT CUSTOMER DATA ---\n${parts.join('\n')}`;
            }
        }

        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: SYSTEM_PROMPT + customerContext,
            tools: tools
        });

        // Build chat history
        const chatHistory = history.map(h => ({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.text }]
        }));

        const chat = model.startChat({ history: chatHistory });
        let result = await chat.sendMessage(message);
        let response = result.response;

        // Function Calling 루프 (AI가 함수 호출을 요청하면 실행 후 결과 전달)
        let loopCount = 0;
        while (response.functionCalls() && response.functionCalls().length > 0 && loopCount < 3) {
            const functionCall = response.functionCalls()[0];
            console.log(`[Chat] Function call: ${functionCall.name}(${JSON.stringify(functionCall.args)})`);

            let functionResult;
            if (functionCall.name === 'searchCustomers') {
                functionResult = await executeSearchCustomers(functionCall.args || {});
            } else {
                functionResult = JSON.stringify({ error: 'Unknown function' });
            }

            // 함수 결과를 Gemini에게 전달
            result = await chat.sendMessage([{
                functionResponse: {
                    name: functionCall.name,
                    response: { result: functionResult }
                }
            }]);
            response = result.response;
            loopCount++;
        }

        const reply = response.text();

        console.log(`[Chat] customer=${customerId || 'none'}, msg="${message.substring(0, 50)}...", reply=${reply.length}chars, fnCalls=${loopCount}`);

        res.json({
            success: true,
            data: { reply }
        });

    } catch (error) {
        console.error('[Chat] Error:', error.message);
        next(error);
    }
});

module.exports = router;
