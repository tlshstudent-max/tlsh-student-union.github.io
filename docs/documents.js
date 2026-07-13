(() => {
    const dataUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQEU3zPSLHP7riuOfJrG3jurKybYQRV3ecfPQfdUItMZvX-2H2oYyZUxJGQVCILoCL4IWDuPildQFAT/pub?gid=20260713&single=true&output=csv';

    const elements = {
        list: document.getElementById('archive-list'),
        status: document.getElementById('archive-status'),
        count: document.getElementById('document-count'),
        search: document.getElementById('document-search'),
        category: document.getElementById('category-filter'),
        year: document.getElementById('year-filter'),
        sort: document.getElementById('sort-order'),
    };

    let documents = [];

    function parseCsv(text) {
        const rows = [];
        let row = [];
        let field = '';
        let quoted = false;

        for (let index = 0; index < text.length; index += 1) {
            const char = text[index];
            const next = text[index + 1];
            if (char === '"' && quoted && next === '"') {
                field += '"';
                index += 1;
            } else if (char === '"') {
                quoted = !quoted;
            } else if (char === ',' && !quoted) {
                row.push(field);
                field = '';
            } else if ((char === '\n' || char === '\r') && !quoted) {
                if (char === '\r' && next === '\n') index += 1;
                row.push(field);
                if (row.some(value => value.trim())) rows.push(row);
                row = [];
                field = '';
            } else {
                field += char;
            }
        }
        row.push(field);
        if (row.some(value => value.trim())) rows.push(row);
        return rows;
    }

    function safeHttpsUrl(value) {
        try {
            const url = new URL(value.trim());
            return url.protocol === 'https:' ? url.href : null;
        } catch {
            return null;
        }
    }

    function normalizeDate(value) {
        const normalized = value.trim().replaceAll('.', '-').replaceAll('/', '-');
        const timestamp = Date.parse(normalized);
        return Number.isNaN(timestamp) ? null : { label: normalized, timestamp };
    }

    function rowToDocument(cols) {
        const url = safeHttpsUrl(cols[5] || '');
        const date = normalizeDate(cols[0] || '');
        if (!url || !date || !(cols[3] || '').trim()) return null;
        return {
            date: date.label,
            timestamp: date.timestamp,
            year: (cols[1] || '').trim(),
            category: (cols[2] || '其他公開文件').trim(),
            title: cols[3].trim(),
            description: (cols[4] || '').trim(),
            url,
        };
    }

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
        date.dateTime = item.date;
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
        try {
            const response = await fetch(dataUrl, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const rows = parseCsv(await response.text());
            documents = rows.slice(1).map(rowToDocument).filter(Boolean);
            appendOptions(elements.category, [...new Set(documents.map(item => item.category))].sort());
            appendOptions(elements.year, [...new Set(documents.map(item => item.year).filter(Boolean))].sort((a, b) => b.localeCompare(a, 'zh-TW', { numeric: true })));
            render();
        } catch (error) {
            console.error('公開文件載入失敗：', error);
            elements.status.className = 'archive-status is-error';
            elements.status.textContent = '文件庫暫時無法讀取。請稍後再試，或聯絡學生會文書組。';
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
