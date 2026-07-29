(() => {
    const dataUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQEU3zPSLHP7riuOfJrG3jurKybYQRV3ecfPQfdUItMZvX-2H2oYyZUxJGQVCILoCL4IWDuPildQFAT/pub?gid=20260713&single=true&output=csv';

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
            const url = new URL((value || '').trim());
            return url.protocol === 'https:' ? url.href : null;
        } catch {
            return null;
        }
    }

    function normalizeDate(value) {
        const parts = (value || '').trim().split(/[./-]/).map(Number);
        if (parts.length !== 3 || parts.some(part => !Number.isInteger(part))) return null;

        let year;
        let month;
        let day;
        if (parts[0] >= 1900) {
            [year, month, day] = parts;
        } else if (parts[2] >= 1900) {
            [month, day, year] = parts;
        } else {
            return null;
        }

        const timestamp = Date.UTC(year, month - 1, day);
        const date = new Date(timestamp);
        if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;

        const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return { iso, label: iso.replaceAll('-', '.'), timestamp };
    }

    async function fetchRows() {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
            const response = await fetch(dataUrl, { signal: controller.signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return parseCsv(await response.text());
        } finally {
            clearTimeout(timeout);
        }
    }

    window.StudentUnionData = Object.freeze({ fetchRows, normalizeDate, safeHttpsUrl });
})();
