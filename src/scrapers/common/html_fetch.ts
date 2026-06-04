import axios from 'axios';

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; naramania-scraper/1.0)',
};

export async function fetchHtml(url: string, timeoutMs = 20000): Promise<string> {
    try {
        const res = await axios.get<string>(url, {
            headers: DEFAULT_HEADERS,
            timeout: timeoutMs,
            responseType: 'text',
        });
        return res.data;
    } catch (axiosError) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, {
                headers: DEFAULT_HEADERS,
                signal: controller.signal,
            });
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            return await res.text();
        } catch (fetchError) {
            const axiosMessage = axiosError instanceof Error ? axiosError.message : String(axiosError);
            const fetchMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
            throw new Error(`axios=${axiosMessage}; fetch=${fetchMessage}`);
        } finally {
            clearTimeout(timer);
        }
    }
}

export async function fetchJson<T>(url: string, timeoutMs = 20000): Promise<T> {
    const html = await fetchHtml(url, timeoutMs);
    return JSON.parse(html) as T;
}
