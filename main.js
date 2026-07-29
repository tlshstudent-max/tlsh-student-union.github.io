(() => {
    const glow = document.getElementById('cursor-glow');
    if (!glow || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 3;
    let currentX = targetX;
    let currentY = targetY;
    let frameId = 0;
    let isActive = false;

    const render = () => {
        currentX += (targetX - currentX) * 0.1;
        currentY += (targetY - currentY) * 0.1;
        glow.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) translate(-50%, -50%)`;

        if (Math.abs(targetX - currentX) > 0.1 || Math.abs(targetY - currentY) > 0.1) {
            frameId = requestAnimationFrame(render);
        } else {
            frameId = 0;
        }
    };

    document.addEventListener('pointermove', (event) => {
        targetX = event.clientX;
        targetY = event.clientY;
        if (!isActive) {
            glow.classList.add('is-active');
            isActive = true;
        }
        if (!frameId) frameId = requestAnimationFrame(render);
    }, { passive: true });

    document.addEventListener('pointerleave', () => {
        glow.classList.remove('is-active');
        isActive = false;
    });

    window.addEventListener('blur', () => {
        glow.classList.remove('is-active');
        isActive = false;
    });
})();
