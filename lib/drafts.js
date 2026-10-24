const limits = { kind: 20, title: 160, summary: 500, body: 20000, category: 60, date: 10, academic_year: 20, url: 2048, status: 20 };

function validValues(values) {
    return values && ['announcement', 'document'].includes(values.kind)
        && ['draft', 'published', 'archived'].includes(values.status)
        && Object.entries(limits).every(([key, limit]) => typeof values[key] === 'string' && values[key].length <= limit);
}

// Local copies contain editor fields only; authentication tokens are never copied here.
export function createDraftStore(storage, service, email) {
    if (!service || !email?.trim()) throw new Error('Drafts require a project and an authenticated owner.');
    const prefix = `tlsh-draft:v1:${encodeURIComponent(service)}:${encodeURIComponent(email.trim().toLowerCase())}:`;
    const key = id => prefix + encodeURIComponent(id || 'new');
    return {
        load(id) {
            try {
                const draft = JSON.parse(storage.getItem(key(id)));
                if (!draft || !validValues(draft.values) || !Number.isFinite(draft.savedAt)
                    || !(draft.version === null || (Number.isInteger(draft.version) && draft.version > 0))) return null;
                return { values: Object.fromEntries(Object.keys(limits).map(field => [field, draft.values[field]])), version: draft.version, savedAt: draft.savedAt };
            } catch { return null; }
        },
        save(id, values, version = null) {
            if (!validValues(values) || !(version === null || (Number.isInteger(version) && version > 0))) return false;
            try {
                const fields = Object.fromEntries(Object.keys(limits).map(field => [field, values[field]]));
                storage.setItem(key(id), JSON.stringify({ values: fields, version, savedAt: Date.now() }));
                return true;
            } catch { return false; }
        },
        remove(id) {
            try { storage.removeItem(key(id)); return true; } catch { return false; }
        },
    };
}
