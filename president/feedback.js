(() => {
    const form = document.getElementById('my-form');
    const status = document.getElementById('fs-status');
    const button = document.getElementById('submit-btn');
    if (!form || !status || !button) return;
    const buttonLabel = button.querySelector('[data-submit-label]') || button;

    function setStatus(message, state) {
        status.textContent = message;
        status.className = `form-status ${state}`;
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (button.disabled) return;
        const message = form.elements.message;
        message.setCustomValidity(message.value.trim() ? '' : '請填寫意見內容。');
        if (!form.reportValidity()) return;

        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        buttonLabel.textContent = '傳送中…';
        setStatus('正在安全傳送你的訊息…', 'is-loading');

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(form.action, {
                method: 'POST',
                body: new FormData(form),
                headers: { Accept: 'application/json' },
                signal: controller.signal,
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            form.reset();
            setStatus('訊息已送達會長室。若有留下聯絡信箱，學生會可就本案回覆；實際處理時間依案件情況而定。', 'is-success');
        } catch (error) {
            console.error('意見回饋傳送失敗：', error);
            setStatus('目前無法送出。請稍後再試，或寄信至 tlsh.student@gmail.com。', 'is-error');
        } finally {
            clearTimeout(timeout);
            button.disabled = false;
            button.removeAttribute('aria-busy');
            buttonLabel.textContent = '送出意見';
        }
    });
    form.elements.message.addEventListener('input', () => form.elements.message.setCustomValidity(''));
})();
