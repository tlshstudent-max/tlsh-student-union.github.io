import { mountUrgentNotices } from './urgent-banner.js';

const root = new URL('./', import.meta.url);
const bar = document.createElement('nav');
bar.className = 'sitebar';
bar.setAttribute('aria-label', '全站導覽');
const brand = document.createElement('a');
brand.className = 'site-brand';
brand.href = root.href;
const emblem = document.createElement('span');
emblem.className = 'brand-emblem';
emblem.textContent = '斗';
emblem.setAttribute('aria-hidden', 'true');
const name = document.createElement('span');
name.textContent = '斗六高中學生會';
brand.append(emblem, name);
const links = document.createElement('div');
links.className = 'sitebar-links';
for (const [label, path] of [['最新消息', '#announcements'], ['校園活動', 'activities/'], ['公開文件', 'docs/'], ['意見回饋', 'president/#feedback'], ['幹部登入', 'admin/']]) {
    const a = document.createElement('a');
    a.textContent = label;
    a.href = new URL(path, root).href;
    if (path === 'admin/') a.className = 'staff-link';
    const target = new URL(a.href);
    if (!target.hash && location.pathname.startsWith(target.pathname)) a.setAttribute('aria-current', 'page');
    links.append(a);
}
bar.append(brand, links);
const skipLink = document.querySelector('.skip-link');
if (skipLink) skipLink.after(bar); else document.body.prepend(bar);
if (!document.body.classList.contains('admin-page')) mountUrgentNotices(bar);
const main = document.querySelector('main');
if (main) main.tabIndex = -1;
// The original return links remain available when JavaScript is disabled.
document.querySelectorAll('.back-link, .top-nav').forEach(node => node.remove());
