import { mountUrgentNotices } from './urgent-banner.js?v=refinement-1';

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
const destinations = [];
const actions = document.createElement('div');
actions.className = 'sitebar-actions';
const appearance = document.createElement('button');
appearance.type = 'button';
appearance.className = 'theme-toggle';
appearance.dataset.themeToggle = '';
const themeIcon = document.createElement('span'), themeLabel = document.createElement('span');
themeIcon.className = 'theme-icon'; themeIcon.setAttribute('aria-hidden', 'true');
themeLabel.className = 'theme-label';
appearance.append(themeIcon, themeLabel);
actions.append(appearance);
for (const [label, path] of [['最新消息', '#announcements'], ['校園活動', 'activities/'], ['公開文件', 'docs/'], ['意見回饋', 'president/#feedback'], ['幹部登入', 'admin/']]) {
    const a = document.createElement('a');
    a.textContent = label;
    a.href = new URL(path, root).href;
    if (path === 'admin/') a.className = 'staff-link';
    destinations.push(a);
    if (path === 'admin/') actions.append(a); else links.append(a);
}
bar.append(brand, links, actions);
function updateCurrentLocation() {
    const normalizedPath = path => path.replace(/index\.html$/, '').replace(/\/$/, '') || '/';
    for (const a of destinations) {
        const target = new URL(a.href), samePage = normalizedPath(location.pathname) === normalizedPath(target.pathname);
        a.removeAttribute('aria-current');
        if (samePage && (!target.hash || location.hash === target.hash)) a.setAttribute('aria-current', target.hash ? 'location' : 'page');
    }
}
updateCurrentLocation();
window.addEventListener('hashchange', updateCurrentLocation);
const skipLink = document.querySelector('.skip-link');
if (skipLink) skipLink.after(bar); else document.body.prepend(bar);
document.dispatchEvent(new Event('tlsh:theme-control-ready'));
if (!document.body.classList.contains('admin-page')) mountUrgentNotices(bar);
const main = document.querySelector('main');
if (main) main.tabIndex = -1;
// The original return links remain available when JavaScript is disabled.
document.querySelectorAll('.back-link, .top-nav').forEach(node => node.remove());
