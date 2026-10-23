import { siteConfig } from './site-config.js';

export const isConfigured = Boolean(siteConfig.supabaseUrl && siteConfig.supabasePublishableKey);
let clientPromise;

export function getClient() {
    if (!isConfigured) throw new Error('管理系統尚未啟用，請聯絡學生會管理員。');
    if (!clientPromise) clientPromise = (async () => {
        const url = new URL(siteConfig.supabaseUrl);
        const key = siteConfig.supabasePublishableKey;
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error('後台服務設定有誤。');
        if (key.startsWith('sb_secret_')) throw new Error('後台設定必須使用公開金鑰。');
        if (!key.startsWith('sb_publishable_')) {
            try {
                const payload = JSON.parse(atob(key.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')));
                if (payload.role !== 'anon') throw new Error();
            } catch { throw new Error('後台設定必須使用 publishable 或 anon 公開金鑰。'); }
        }
        const { createClient } = await import('./vendor/supabase.js');
        return createClient(url.href, key, {
            auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
        });
    })();
    return clientPromise;
}

export async function publishedContent(kind, id) {
    const client = await getClient();
    let query = client.from('content').select('id,kind,title,summary,body,category,date,academic_year,url,updated_at')
        .eq('status', 'published').eq('kind', kind).order('date', { ascending: false }).order('id');
    if (id) query = query.eq('id', id);
    const { data, error } = await query.abortSignal(AbortSignal.timeout(12000));
    if (error) throw error;
    return data;
}
