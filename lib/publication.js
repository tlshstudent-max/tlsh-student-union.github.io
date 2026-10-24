export const departments = Object.freeze({
    union: { label: '首頁／學生會公告', path: './' },
    president: { label: '正副會長室', path: 'president/' },
    activities: { label: '活動組', path: 'activities/' },
    pr: { label: '公關組', path: 'pr/' },
    rights: { label: '學權組', path: 'rights/' },
    design: { label: '美宣組', path: 'design/' },
    docs: { label: '文書組', path: 'docs/' },
    general: { label: '總務組', path: 'general/' },
});

export function legacyDepartment(item) {
    if (item.kind === 'document') return 'docs';
    if (['校園活動', '活動公告'].includes(item.category)) return 'activities';
    if (item.category === '學生權益') return 'rights';
    return 'union';
}

export function publication(item) {
    return {
        department: Object.hasOwn(departments, item.department) ? item.department : legacyDepartment(item),
        show_on_home: typeof item.show_on_home === 'boolean' ? item.show_on_home : item.kind !== 'document',
    };
}

export function contentHref(item, articlePath = 'announcement.html') {
    if (item.kind === 'document' && !item.body?.trim() && item.url) return item.url;
    if (!item.id) return item.url;
    return `${articlePath}?id=${encodeURIComponent(item.id)}${item.kind === 'document' ? '&kind=document' : ''}`;
}
