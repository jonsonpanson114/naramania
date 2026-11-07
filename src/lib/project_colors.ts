export function getProjectTypeColor(type: string): string {
    if (type === '建築' || type === '工事') return '#8b451c';
    if (type === 'コンサル' || type === '設計' || type === '委託') return '#245884';
    return '#525b55';
}

const MUNICIPALITY_HUES: Record<string, number> = {
    '奈良県': 235,
    '奈良市': 155,
    '橿原市': 30,
    '生駒市': 285,
    '大和高田市': 340,
    '大和郡山市': 80,
    '葛城市': 315,
    '五條市': 120,
    '御所市': 15,
    '天理市': 200,
    '桜井市': 45,
    '宇陀市': 265,
    '田原本町': 180,
    '広陵町': 55,
    '香芝市': 300,
    '川西町': 100,
    '三宅町': 355,
    '山添村': 135,
    '平群町': 215,
    '安堵町': 65,
    '高取町': 250,
    '斑鳩町': 170,
    '三郷町': 225,
    '王寺町': 325,
    '大淀町': 190,
};

export function getMunicipalityHue(municipality: string): number | undefined {
    return MUNICIPALITY_HUES[municipality];
}
