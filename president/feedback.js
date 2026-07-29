(() => {
    const form = document.getElementById('my-form');
    const status = document.getElementById('fs-status');
    const button = document.getElementById('submit-btn');
    if (!form || !status || !button) return;

    function setStatus(message, state) {
        status.textContent = message;
        status.className = `form-status ${state}`;
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (button.disabled) return;

        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.textContent = '傳送中…';
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
            setStatus('訊息已送達會長室，謝謝你留下聲音。', 'is-success');
        } catch (error) {
            console.error('意見回饋傳送失敗：', error);
            setStatus('目前無法送出。請稍後再試，或寄信至 tlsh.student@gmail.com。', 'is-error');
        } finally {
            clearTimeout(timeout);
            button.disabled = false;
            button.removeAttribute('aria-busy');
            button.textContent = '匯集成水';
        }
    });
})();
