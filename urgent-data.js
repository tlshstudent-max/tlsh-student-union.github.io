import { getClient, usesSupabaseForContent } from './backend.js';

export async function publishedUrgentContent() {
    if (!usesSupabaseForContent) return [];
    const client = await getClient(), signal = AbortSignal.timeout(12000), items = [];
    for (let from = 0; ; from += 200) {
        const { data, error } = await client.from('content')
            .select('id,kind,title,summary,status,is_urgent,urgent_until,updated_at')
            .eq('status', 'published').eq('kind', 'announcement').eq('is_urgent', true)
            .gt('urgent_until', new Date().toISOString()).order('updated_at', { ascending: false }).order('id')
            .range(from, from + 199).abortSignal(signal);
        if (['42703', 'PGRST204'].includes(error?.code)) return []; // Additive migration pending.
        if (error) throw error;
        items.push(...data);
        if (data.length < 200) return items;
    }
}
