import type { Municipality } from '@/types/bidding';

/**
 * 各自治体の入札情報ページ。
 *
 * ここに載せるURLは「実際にスクレイパーが見ている場所」に揃えている。
 * 自分で原本を確認したい時に使えるだけでなく、このサイトが正しいページを
 * 見ているかを利用者が検証できるようにするのが目的なので、
 * スクレイパーの定数と食い違わないよう変更時は両方を直すこと。
 */
export interface MunicipalitySource {
    label: string;
    url: string;
    /** 電子入札システム(EPI/efftis/PPI)など、自治体サイト外のもの */
    external?: boolean;
    note?: string;
}

export interface MunicipalitySourceGroup {
    municipality: Municipality;
    /** スクレイパーのファイル名。対応関係を追えるようにしておく */
    scraper: string;
    sources: MunicipalitySource[];
}

export const MUNICIPALITY_SOURCES: MunicipalitySourceGroup[] = [
    {
        municipality: '奈良県',
        scraper: 'nara_pref.ts',
        sources: [
            { label: '入札情報サービス(PPI)', url: 'https://ppi.ebid-kouji-gyoumu.pref.nara.jp/DENCHO/PPJ/PPJ0050_0010/', external: true, note: '工事・コンサルの発注案件一覧' },
        ],
    },
    {
        municipality: '奈良市',
        scraper: 'nara_city.ts',
        sources: [
            { label: '入札情報公開システム(efftis)', url: 'https://nara.efftis.jp/PPI/Public/PPUBC00100?kikanno=0201', external: true },
        ],
    },
    {
        municipality: '橿原市',
        scraper: 'kashihara_city.ts',
        sources: [
            { label: '入札予報(公告)', url: 'https://www.city.kashihara.nara.jp/jigyosha/nyusatsu_keiyaku/1/7/index.html', note: '配下の予報ページを都度解決' },
            { label: '入札・見積結果', url: 'https://www.city.kashihara.nara.jp/jigyosha/nyusatsu_keiyaku/1/8/index.html', note: '年度別サブページを都度解決' },
        ],
    },
    {
        municipality: '生駒市',
        scraper: 'ikoma_city.ts',
        sources: [
            { label: '電子入札システム(EPI)', url: 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200680', external: true },
        ],
    },
    {
        municipality: '大和高田市',
        scraper: 'yamato_takada_city.ts',
        sources: [
            { label: '入札・契約情報', url: 'https://www.city.yamatotakada.nara.jp/soshikikarasagasu/somuka/keiyakukanri/nyusatsu_keiyaku/1/index.html' },
            { label: '入札情報公開サービス(EPI)', url: 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=06200640072006E0', external: true, note: '発注情報(公告)・入札契約結果の両方' },
        ],
    },
    {
        municipality: '大和郡山市',
        scraper: 'yamatokoriyama_city.ts',
        sources: [
            { label: '入札・契約情報', url: 'https://www.city.yamatokoriyama.lg.jp/soshiki/nyusatsukensaka/nyusatsu_keiyaku/2/1893.html' },
            { label: '建設工事等入札結果', url: 'https://www.city.yamatokoriyama.lg.jp/shigoto_sangyo/nyusatsu_keiyaku/kensetsu/6247.html' },
        ],
    },
    {
        municipality: '葛城市',
        scraper: 'katsuragi_city.ts',
        sources: [
            { label: '電子入札システム(EPI)', url: 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200720', external: true },
        ],
    },
    {
        municipality: '五條市',
        scraper: 'gojo_city.ts',
        sources: [
            { label: '入札・契約情報', url: 'https://www.city.gojo.lg.jp/jigyousha/nyuusatsu/2/index.html' },
            { label: '電子入札システム(EPI)', url: 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=06200640072006C0', external: true },
        ],
    },
    {
        municipality: '御所市',
        scraper: 'gose_city.ts',
        sources: [
            { label: '入札・契約情報', url: 'https://www.city.gose.nara.jp/category/6-9-0-0-0-0-0-0-0-0.html' },
        ],
    },
    {
        municipality: '天理市',
        scraper: 'tenri_city.ts',
        sources: [
            { label: '入札公告', url: 'https://www.city.tenri.nara.jp/kakuka/soumubu/nyuusatsushinsashitsu/construction_work/kouji_hattyuu_kanren/1395887232147.html' },
            { label: '入札結果', url: 'https://www.city.tenri.nara.jp/kakuka/soumubu/nyuusatsushinsashitsu/construction_work/kouji_hattyuu_kanren/1395912138562.html', note: '案件別PDFを解析して落札者を取得' },
        ],
    },
    {
        municipality: '桜井市',
        scraper: 'sakurai_city.ts',
        sources: [
            { label: '入札公告', url: 'https://www.city.sakurai.lg.jp/sosiki/soumu/kanzaikeiyaku/nyuusatukeiyakukensa/notice/6596.html' },
            { label: '電子入札情報システム(EPI)', url: 'https://www.epi-cloud.fwd.ne.jp/koukai/do/logon?name1=06200640072006A0', external: true, note: '発注情報(公告)・入札契約結果の両方' },
        ],
    },
    {
        municipality: '宇陀市',
        scraper: 'uda_city.ts',
        sources: [
            { label: '電子入札システム(EPI)', url: 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200700', external: true },
        ],
    },
    {
        municipality: '田原本町',
        scraper: 'tawaramoto_town.ts',
        sources: [
            { label: '入札情報公開システム(efftis)', url: 'https://tawaramoto.efftis.jp/PPI/Public/PPUBC00100', external: true },
            { label: '入札結果等', url: 'https://www.town.tawaramoto.nara.jp/buisiness/nyusatsu/5103.html' },
        ],
    },
    {
        municipality: '広陵町',
        scraper: 'koryo_town.ts',
        sources: [
            { label: '入札・契約(親カテゴリ)', url: 'https://www.town.koryo.nara.jp/category/19-4-0-0-0-0-0-0-0-0.html', note: '公告側のサブカテゴリを都度解決' },
            { label: '指名競争入札結果', url: 'https://www.town.koryo.nara.jp/category/19-4-2-0-0-0-0-0-0-0.html' },
        ],
    },
    {
        municipality: '香芝市',
        scraper: 'kashiba_city.ts',
        sources: [
            { label: '入札情報', url: 'https://www.city.kashiba.lg.jp/site/nyuusatsu/' },
            { label: '入札情報公開サービス(EPI)', url: 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=062006E007200640', external: true, note: '発注情報(公告)・入札契約結果の両方' },
        ],
    },
    {
        municipality: '川西町',
        scraper: 'kawanishi_city.ts',
        sources: [
            { label: '入札・契約情報(一覧)', url: 'https://www.town.nara-kawanishi.lg.jp/category/22-1-0-0-0-0-0-0-0-0.html', note: '一覧から個別記事を都度解決' },
        ],
    },
    {
        municipality: '三宅町',
        scraper: 'miyake_city.ts',
        sources: [
            { label: '入札・契約情報', url: 'https://www.town.miyake.lg.jp/soshiki/1/index.html' },
            { label: '入札結果', url: 'https://www.town.miyake.lg.jp/soshiki/1/7653.html' },
        ],
    },
    {
        municipality: '山添村',
        scraper: 'yamazohiragawa_city.ts',
        sources: [
            { label: 'お知らせ(入札公告・結果)', url: 'https://www.vill.yamazoe.nara.jp/life/news' },
        ],
    },
    {
        municipality: '平群町',
        scraper: 'yamazohiragawa_city.ts',
        sources: [
            { label: '入札・契約情報', url: 'https://www.town.heguri.nara.jp/soshiki/list7-1.html' },
        ],
    },
    {
        municipality: '安堵町',
        scraper: 'ando_city.ts',
        sources: [
            { label: '入札・契約情報', url: 'https://www.town.ando.nara.jp/category/4-1-0-0-0-0-0-0-0-0.html' },
        ],
    },
    {
        municipality: '高取町',
        scraper: 'takatori_ikaruga.ts',
        sources: [
            { label: '入札情報(カテゴリ)', url: 'https://www.town.takatori.nara.jp/contents_detail.php?co=cat&frmId=2683&frmCd=2-6-0-0-0', note: '公告側の詳細ページを都度解決' },
            { label: '入札結果', url: 'https://www.town.takatori.nara.jp/contents_detail.php?frmId=2205' },
        ],
    },
    {
        municipality: '斑鳩町',
        scraper: 'takatori_ikaruga.ts',
        sources: [
            { label: '入札・契約情報', url: 'https://www.town.ikaruga.nara.jp/category/1-10-0-0-0-0-0-0-0-0.html' },
        ],
    },
    {
        municipality: '三郷町',
        scraper: 'sango_town.ts',
        sources: [
            { label: '入札・契約情報', url: 'https://www.town.sango.nara.jp/soshiki/4/13385.html' },
            { label: '電子入札システム(EPI)', url: 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0660064007200640', external: true },
        ],
    },
    {
        municipality: '王寺町',
        scraper: 'oji_town.ts',
        sources: [
            { label: '入札公表', url: 'https://www.town.oji.nara.jp/kakuka/somu/somu/gyomuannai/nyuusatu/nyuusatukouhyou/index.html' },
        ],
    },
    {
        municipality: '大淀町',
        scraper: 'oyodo_town.ts',
        sources: [
            { label: '入札・契約情報', url: 'https://www.town.oyodo.lg.jp/0000000218.html' },
            { label: '入札結果', url: 'https://www.town.oyodo.lg.jp/0000001945.html' },
        ],
    },
];
