// All staff deadline inputs and public labels use Taiwan time, independent of device timezone.
export function taipeiInput(value) {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? new Date(time + 8 * 3600000).toISOString().slice(0, 16) : '';
}

export function urgentDeadline(value) {
    if (typeof value !== 'string' || value.length > 40) return null;
    const local = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value);
    if (!local && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    const calendar = new Date(Date.UTC(year, month - 1, day));
    if (year < 1900 || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;
    const time = new Date(local ? `${value}:00+08:00` : value).getTime();
    if (!Number.isFinite(time) || (local && taipeiInput(time) !== value)) return null;
    return new Date(time).toISOString();
}

export function activeUrgent(item, now = Date.now()) {
    return item.kind === 'announcement' && item.status === 'published' && item.is_urgent === true
        && new Date(item.urgent_until).getTime() > now;
}

export function urgentTimeLabel(value) {
    return new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date(value));
}
