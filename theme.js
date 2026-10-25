// Run before styles: keep the chosen appearance consistent across pages without a flash.
(() => {
    const key = 'tlsh-appearance', root = document.documentElement;
    const animateTheme = matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    let timer;
    function apply(value, animate = false) {
        const theme = value === 'light' ? 'light' : 'dark';
        clearTimeout(timer);
        root.removeAttribute('data-theme-changing');
        if (animate && animateTheme.matches) {
            root.setAttribute('data-theme-changing', '');
            timer = setTimeout(() => root.removeAttribute('data-theme-changing'), 180);
        }
        root.dataset.theme = theme;
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f7f7f4' : '#050606');
        for (const button of document.querySelectorAll('[data-theme-toggle]')) {
            const next = theme === 'light' ? '黑金版' : '白色版';
            button.querySelector('.theme-label').textContent = next;
            button.setAttribute('aria-label', `切換為${next}`);
            button.title = `切換為${next}`;
            button.querySelector('.theme-icon').textContent = theme === 'light' ? '◐' : '◑';
        }
    }
    let saved;
    try { saved = localStorage.getItem(key); } catch { /* Appearance still works when storage is blocked. */ }
    apply(saved);
    document.addEventListener('click', event => {
        if (!event.target.closest('[data-theme-toggle]')) return;
        const theme = root.dataset.theme === 'light' ? 'dark' : 'light';
        apply(theme, true);
        try { localStorage.setItem(key, theme); } catch { /* Keep this page usable without persistence. */ }
    });
    window.addEventListener('storage', event => { if (event.key === key) apply(event.newValue); });
    document.addEventListener('tlsh:theme-control-ready', () => apply(root.dataset.theme));
})();
