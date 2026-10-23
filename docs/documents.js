import { fetchDocuments } from '../public-data.js';
(() => {
    const elements = {
        list: document.getElementById('archive-list'),
        status: document.getElementById('archive-status'),
        count: document.getElementById('document-count'),
        search: document.getElementById('document-search'),
        category: document.getElementById('category-filter'),
        year: document.getElementById('year-filter'),
        sort: document.getElementById('sort-order'),
    };

    if (!elements.list) return;
    let documents = [];

    function appendOptions(select, values) {
        values.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            select.append(option);
        });
    }

    function createDocumentItem(item) {
        const article = document.createElement('article');
        article.className = 'archive-item';

        const meta = document.createElement('div');
        meta.className = 'document-meta';
        const date = document.createElement('time');
        date.className = 'date';
        date.dateTime = item.isoDate;
        date.textContent = item.date;
        const year = document.createElement('span');
        year.className = 'document-year';
        year.textContent = item.year ? `${item.year} 學年度` : '';
        meta.append(date, year);

        const body = document.createElement('div');
        body.className = 'document-body';
        const category = document.createElement('span');
        category.className = 'document-category';
        category.textContent = item.category;
        const title = document.createElement('h3');
        title.className = 'title';
        title.textContent = item.title;
        body.append(category, title);
        if (item.description) {
            const description = document.createElement('p');
            description.className = 'document-description';
            description.textContent = item.description;
            body.append(description);
        }

        const link = document.createElement('a');
        link.className = 'download-link';
        link.href = item.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = '檢視文件 ↗';
        link.setAttribute('aria-label', `檢視文件：${item.title}`);
        article.append(meta, body, link);
        return article;
    }

    function render() {
        const query = elements.search.value.trim().toLocaleLowerCase('zh-TW');
        const category = elements.category.value;
        const year = elements.year.value;
        const direction = elements.sort.value === 'oldest' ? 1 : -1;

        const filtered = documents
            .filter(item => !category || item.category === category)
            .filter(item => !year || item.year === year)
            .filter(item => !query || [item.title, item.description, item.category, item.year].join(' ').toLocaleLowerCase('zh-TW').includes(query))
            .sort((a, b) => (a.timestamp - b.timestamp) * direction);

        elements.list.replaceChildren(...filtered.map(createDocumentItem));
        elements.count.textContent = `${filtered.length} 份公開文件`;
        elements.status.className = 'archive-status';
        elements.status.textContent = filtered.length ? '' : '目前沒有符合條件的公開文件。';
    }

    async function loadDocuments() {
        elements.list.setAttribute('aria-busy', 'true');
        try {
            documents = await fetchDocuments();
            elements.category.replaceChildren(new Option('全部類別', ''));
            elements.year.replaceChildren(new Option('全部年度', ''));
            appendOptions(elements.category, [...new Set(documents.map(item => item.category))].sort());
            appendOptions(elements.year, [...new Set(documents.map(item => item.year).filter(Boolean))].sort((a, b) => b.localeCompare(a, 'zh-TW', { numeric: true })));
            render();
        } catch (error) {
            console.error('公開文件載入失敗：', error);
            elements.status.className = 'archive-status is-error';
            elements.status.textContent = '文件庫暫時無法讀取。請重試，或聯絡學生會文書組。';
            const retry = document.createElement('button');
            retry.className = 'button button-secondary';
            retry.textContent = '重新載入';
            retry.addEventListener('click', () => { retry.disabled = true; loadDocuments(); });
            elements.status.append(' ', retry);
            elements.count.textContent = '';
        } finally {
            elements.list.setAttribute('aria-busy', 'false');
        }
    }

    [elements.search, elements.category, elements.year, elements.sort].forEach(control => {
        control.addEventListener('input', render);
        control.addEventListener('change', render);
    });

    loadDocuments();
})();
