import { publicRoot } from './seo.js';

export const hostnameRoot = new URL('/', publicRoot).href;
export const rootRepositoryName = new URL(hostnameRoot).hostname;
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

export function searchHomeHtml(description, verification = []) {
    const name = '斗六高中學生會', title = '國立斗六高中學生會｜官方入口';
    const graph = {
        '@context': 'https://schema.org',
        '@graph': [
            { '@type': 'WebSite', '@id': hostnameRoot + '#website', url: hostnameRoot, name, alternateName: ['國立斗六高中學生會', 'TLSH Student Union'], inLanguage: 'zh-TW', publisher: { '@id': hostnameRoot + '#organization' } },
            { '@type': 'Organization', '@id': hostnameRoot + '#organization', name: '國立斗六高級中學學生會', alternateName: name, url: publicRoot, description, logo: { '@type': 'ImageObject', url: hostnameRoot + 'union-logo.jpg', width: 939, height: 939 }, sameAs: ['https://www.instagram.com/tlsh_su/'] },
            { '@type': 'WebPage', '@id': hostnameRoot + '#webpage', url: hostnameRoot, name: title, description, isPartOf: { '@id': hostnameRoot + '#website' }, about: { '@id': hostnameRoot + '#organization' }, inLanguage: 'zh-TW' },
        ],
    };
    return `<!doctype html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <meta name="description" content="${escape(description)}">
    <meta name="robots" content="index, follow, max-image-preview:large">
    <meta name="theme-color" content="#f7f7f4">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    ${verification.map(value => `<meta name="google-site-verification" content="${escape(value)}">`).join('\n    ')}
    <link rel="canonical" href="${hostnameRoot}">
    <link rel="icon" href="${hostnameRoot}favicon.png" type="image/png" sizes="96x96">
    <link rel="apple-touch-icon" href="${hostnameRoot}apple-touch-icon.png" sizes="180x180">
    <meta property="og:type" content="website">
    <meta property="og:locale" content="zh_TW">
    <meta property="og:site_name" content="${name}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${escape(description)}">
    <meta property="og:url" content="${hostnameRoot}">
    <meta property="og:image" content="${hostnameRoot}og-image.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="斗六高中學生會正式會標與官網資訊">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${escape(description)}">
    <meta name="twitter:image" content="${hostnameRoot}og-image.png">
    <script type="application/ld+json">${JSON.stringify(graph).replace(/</g, '\\u003c')}</script>
    <style>
        :root{color-scheme:light;font:100%/1.8 system-ui,-apple-system,"PingFang TC","Microsoft JhengHei",sans-serif;color:#232720;background:#f7f7f4}
        *{box-sizing:border-box}body{margin:0}main{max-width:1040px;min-height:85svh;margin:auto;padding:5rem 2rem;display:grid;grid-template-columns:minmax(0,.7fr) minmax(0,1.3fr);align-items:center;gap:4rem}
        .identity{display:grid;place-items:center}.identity img{display:block;width:100%;max-width:260px;height:auto;border-radius:50%;box-shadow:0 20px 55px #242b1910}
        .eyebrow{color:#796018;font-size:.75rem;font-weight:600;letter-spacing:.14em;margin:0 0 1rem}h1{font-size:clamp(2rem,4vw,3.25rem);font-weight:550;line-height:1.35;letter-spacing:.015em;margin:0 0 1.5rem}
        .description{color:#5c6258;font-size:1rem;line-height:1.9;margin:0 0 1.75rem;max-width:36rem}.enter{display:inline-flex;align-items:center;justify-content:space-between;gap:clamp(.75rem,5vw,3rem);min-height:48px;padding:.875rem 1rem;border:1px solid #b6a062;border-radius:.6rem;background:#dfcb89;color:#24261f;text-decoration:none;font-weight:600}.enter>span:first-child{min-width:0;overflow-wrap:anywhere}
        nav{display:flex;flex-wrap:wrap;gap:.5rem 1.5rem;margin-top:1.25rem}nav a,footer a{display:inline-flex;align-items:center;min-height:44px;color:#796018;text-underline-offset:.25em}a:focus-visible{outline:2px solid #796018;outline-offset:5px}a:active{filter:brightness(.8)}footer{max-width:1040px;margin:auto;padding:1.5rem 2rem 2.5rem;border-top:1px solid #d7dbd1;color:#5c6258;font-size:.875rem;display:flex;flex-wrap:wrap;align-items:center;gap:.5rem 1.5rem}
        @media(max-width:700px){main{min-height:auto;padding:2.5rem 1.25rem;grid-template-columns:minmax(0,1fr);gap:2rem}.identity img{width:150px}.copy{max-width:36rem;margin:auto}h1{font-size:2rem}.enter{width:100%}footer{padding:1.5rem 1.25rem}}
        @media(prefers-contrast:more){.description,footer{color:#41483b}footer{border-color:#7b846f}}
    </style>
</head>
<body>
    <main>
        <div class="identity"><img src="${hostnameRoot}union-logo.jpg" alt="斗六高中學生會正式會標" width="939" height="939"></div>
        <section class="copy" aria-labelledby="site-title">
            <p class="eyebrow">TLSH STUDENT UNION</p>
            <h1 id="site-title">國立斗六高中<br>學生會</h1>
            <p class="description">${escape(description)}</p>
            <a class="enter" href="${publicRoot}"><span>進入學生會官網</span><span aria-hidden="true">↗</span></a>
            <nav aria-label="快速查詢"><a href="${publicRoot}#announcements">最新消息</a><a href="${publicRoot}activities/">校園活動</a><a href="${publicRoot}docs/">公開文件</a><a href="${publicRoot}rights/">學生權益</a></nav>
        </section>
    </main>
    <footer><span>斗六高中學生會官方入口</span><a href="https://www.instagram.com/tlsh_su/" target="_blank" rel="noopener noreferrer">Instagram ↗</a><a href="${publicRoot}privacy.html">隱私權說明</a></footer>
</body>
</html>
`;
}

export function searchHomeSitemap(projectSitemap) {
    return projectSitemap.replace(/(<urlset\b[^>]*>)/, `$1\n   <url><loc>${hostnameRoot}</loc></url>`);
}
