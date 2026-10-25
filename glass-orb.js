import { createOrbRenderer } from './lib/orb-renderer.js?v=gallery-1';

const stage = document.getElementById('glass-orb');
const canvas = stage.querySelector('canvas'), fallback = stage.querySelector('img');
const reset = document.getElementById('orb-reset'), help = document.getElementById('orb-help'), status = document.getElementById('orb-status');
const reduced = matchMedia('(prefers-reduced-motion: reduce)'), solid = matchMedia('(prefers-reduced-transparency: reduce)'), contrast = matchMedia('(prefers-contrast: more)');
let renderer, loading = false, failed = false, visible = false, frame = 0, lastTime = 0;
let yaw = 0, pitch = 0, vy = 0, vx = 0, target = null, pointer = null;
const tau = 2 * Math.PI, bound = 1.12;
const clamp = (value, max) => Math.max(-max, Math.min(max, value));
function stop() {
    cancelAnimationFrame(frame); frame = 0; lastTime = 0;
    const id = pointer?.id;
    vx = vy = 0; target = null; pointer = null; stage.classList.remove('orb-dragging');
    if (id !== undefined && stage.hasPointerCapture(id)) stage.releasePointerCapture(id);
}
function schedule() { if (!frame && renderer && visible && !document.hidden) frame = requestAnimationFrame(draw); }
function draw(time) {
    frame = 0;
    const dt = lastTime ? Math.min((time - lastTime) / 1000, .035) : 1 / 60; lastTime = time;
    if (!pointer && target !== null) {
        // Critically damped return, carrying the current angular velocity; a new drag interrupts it.
        const omega = 12, decay = Math.exp(-omega * dt);
        for (const axis of ['yaw', 'pitch']) {
            const position = axis === 'yaw' ? yaw : pitch, velocity = axis === 'yaw' ? vy : vx, goal = axis === 'yaw' ? target : 0;
            const delta = position - goal, carry = velocity + omega * delta;
            const next = goal + (delta + carry * dt) * decay, speed = (velocity - omega * carry * dt) * decay;
            if (axis === 'yaw') { yaw = next; vy = speed; } else { pitch = next; vx = speed; }
        }
        if (Math.abs(yaw - target) + Math.abs(pitch) + Math.abs(vx) + Math.abs(vy) < .003) {
            yaw = target; pitch = vx = vy = 0; target = null; status.textContent = '會標已回正。';
        }
    } else if (!pointer && !reduced.matches) {
        const friction = Math.exp(-4.8 * dt);
        yaw += vy * (1 - friction) / 4.8; pitch += vx * (1 - friction) / 4.8;
        vx *= friction; vy *= friction;
        if (Math.abs(vx) + Math.abs(vy) < .008) vx = vy = 0;
    }
    if (Math.abs(pitch) > bound) { pitch = clamp(pitch, bound); vx = 0; }
    renderer.render(yaw, pitch, document.documentElement.dataset.theme === 'light', solid.matches || contrast.matches);
    if (!pointer && (vx || vy || target !== null)) schedule(); else lastTime = 0;
}
function staticBadge() {
    stop(); renderer?.dispose(); renderer = null;
    stage.classList.remove('orb-ready'); stage.removeAttribute('tabindex'); stage.removeAttribute('role'); stage.removeAttribute('aria-label'); stage.removeAttribute('aria-describedby');
    canvas.hidden = reset.hidden = true; fallback.removeAttribute('aria-hidden'); help.textContent = 'TLSH STUDENT UNION';
}
async function initialize() {
    if (renderer || loading || failed || !visible) return;
    loading = true;
    try {
        const image = new Image(); image.src = new URL('assets/union-logo.jpg', import.meta.url).href; await image.decode();
        renderer = createOrbRenderer(canvas, image);
        if (!renderer) { failed = true; return; }
        canvas.hidden = false; reset.hidden = false;
        stage.classList.add('orb-ready'); stage.tabIndex = 0; stage.setAttribute('role', 'group');
        stage.setAttribute('aria-label', '可旋轉的學生會會標玻璃球'); stage.setAttribute('aria-describedby', 'orb-help');
        fallback.setAttribute('aria-hidden', 'true'); help.textContent = '拖曳轉動 · 方向鍵微調'; schedule();
    } catch { failed = true; staticBadge(); }
    finally { loading = false; }
}
const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) { initialize(); schedule(); } else stop();
}, { threshold: .05 });
observer.observe(stage);
new ResizeObserver(() => schedule()).observe(stage);
new MutationObserver(() => schedule()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
stage.addEventListener('pointerdown', event => {
    if (!renderer || !event.isPrimary || event.button !== 0) return;
    target = null; vx = vy = 0; lastTime = 0;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, startX: event.clientX, startY: event.clientY, moved: false };
    stage.classList.add('orb-pointer-focus');
    stage.setPointerCapture(event.pointerId); stage.focus({ preventScroll: true }); status.textContent = '';
});
stage.addEventListener('pointermove', event => {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (!pointer.moved && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < 6) return;
    pointer.moved = true; stage.classList.add('orb-dragging');
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y, dt = Math.max(8, event.timeStamp - pointer.time) / 1000;
    yaw += dx * .009; pitch = clamp(pitch + dy * .009, bound);
    vy = clamp(dx * .009 / dt, 6); vx = clamp(dy * .009 / dt, 4);
    pointer.x = event.clientX; pointer.y = event.clientY; pointer.time = event.timeStamp; schedule();
});
function release(event, cancel = false) {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (cancel || reduced.matches || event.timeStamp - pointer.time > 100) vx = vy = 0;
    const id = pointer.id; pointer = null; stage.classList.remove('orb-dragging');
    if (stage.hasPointerCapture(id)) stage.releasePointerCapture(id);
    schedule();
}
stage.addEventListener('pointerup', event => release(event));
stage.addEventListener('pointercancel', event => release(event, true));
stage.addEventListener('lostpointercapture', event => release(event, true));
function recenter() {
    if (!renderer) return;
    status.textContent = ''; pointer = null; stage.classList.remove('orb-dragging');
    if (reduced.matches) { yaw = pitch = vx = vy = 0; target = null; status.textContent = '會標已回正。'; }
    else target = Math.round(yaw / tau) * tau;
    schedule();
}
reset.addEventListener('click', recenter);
stage.addEventListener('keydown', event => {
    stage.classList.remove('orb-pointer-focus');
    if (!renderer || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Home') { event.preventDefault(); recenter(); return; }
    if (event.key === 'Escape') { stop(); schedule(); return; }
    const directions = { ArrowLeft: [-.18, 0], ArrowRight: [.18, 0], ArrowUp: [0, -.12], ArrowDown: [0, .12] };
    if (!directions[event.key]) return;
    event.preventDefault(); stop(); yaw += directions[event.key][0]; pitch = clamp(pitch + directions[event.key][1], bound); schedule();
    status.textContent = '已轉動會標。按 Home 或「回正」可重新置中。';
});
stage.addEventListener('blur', () => stage.classList.remove('orb-pointer-focus'));
reduced.addEventListener('change', () => { stop(); schedule(); });
solid.addEventListener('change', schedule); contrast.addEventListener('change', schedule);
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else schedule(); });
window.addEventListener('pagehide', stop);
canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); staticBadge(); });
canvas.addEventListener('webglcontextrestored', () => { failed = false; initialize(); });
