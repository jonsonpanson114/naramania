
import { extractBiddingInfoFromText } from './src/services/gemini_service';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function verifyAI() {
    console.log('--- Verifying Gemini AI Intelligence with Mock Bidding Text ---');

    const mockBiddingText = `
入札公告
1  工事概要
(1) 工事名  令和6年度 奈良公園周辺整備工事（第1号）
(2) 工事場所  奈良市登大路町地内
(3) 工事内容  舗装工 A=1,200m2、縁石工 L=500m
(4) 工期  本契約締結の翌日から令和7年3月25日まで
2  入札参加資格
(1) 奈良県建設工事等入札参加資格者名簿に登録されている者であること。
(2) 土木工事の等級が「Aランク」であること。
(3) 奈良市内に本店を有するものであること。
3  予定価格
予定価格： 123,456,789円（消費税及び地方消費税を含む）
基準価格： 110,000,000円（消費税及び地方消費税を含む）
`;

    const info = await extractBiddingInfoFromText(mockBiddingText);

    if (info) {
        console.log('--- AI Extraction Result ---');
        console.log(JSON.stringify(info, null, 2));

        if (info.estimatedPrice?.includes('123,456,789')) {
            console.log('SUCCESS: Gemini extracted the price correctly.');
        }
        if (info.qualifications && info.qualifications.length > 0) {
            console.log('SUCCESS: Gemini extracted qualifications.');
        }
    } else {
        console.error('Gemini extraction failed. Check API key or Prompt.');
    }
}

verifyAI();
