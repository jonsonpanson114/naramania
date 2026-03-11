
import { extractBiddingInfoFromText } from './src/services/gemini_service';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function verifyResultsAI() {
    console.log('--- Verifying Gemini AI with Results-Focus Mock Text ---');

    const mockResultText = `
入札結果表
1  案件概要
工事名： 奈良市立西の京小学校校舎改修工事
工事場所： 奈良市六条町地内
設計： 株式会社 奈良建築設計事務所
工期： 契約締結の翌日から令和7年12月20日まで

2  入札結果
開札日： 令和6年2月15日
予定価格： 450,000,000円（税抜き）
落札者： 大和建設工業 株式会社
落札金額： 432,000,000円（税抜き）
落札率： 96.0%
`;

    const info = await extractBiddingInfoFromText(mockResultText);

    if (info) {
        console.log('--- AI Extraction Result (Results Focus) ---');
        console.log(JSON.stringify(info, null, 2));

        const success = info.winningContractor?.includes('大和建設工業') &&
            info.designFirm?.includes('奈良建築設計') &&
            info.constructionPeriod?.includes('令和7年12月20日');

        if (success) {
            console.log('SUCCESS: All key result fields extracted correctly.');
        } else {
            console.warn('WARNING: Some fields might be missing or incorrect.');
        }
    } else {
        console.error('Gemini extraction failed.');
    }
}

verifyResultsAI();
