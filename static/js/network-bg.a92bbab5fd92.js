/**
 * network-bg.js
 *
 * Moving points connected by lines, drawn on a <canvas>.
 * Replaces particles.js with the same visual settings as particles.json:
 * 80 points per 800×800 px area, speed 6, links within 150 px,
 * link colour #0083f7 at 0.4 opacity, points invisible (size 0).
 */
function networkBackground(container, opts = {}) {
    const o = {
        density: 80 / (800 * 1000), // points per px², same formula as particles.js
        speed: 6,                   // particles.js speed unit
        linkDistance: 150,
        linkColor: '0, 131, 247',
        linkOpacity: 0.4,
        lineWidth: 1,
        ...opts,
    };

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%';
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    let width = 0, height = 0, points = [];

    function resize() {
        const dpr = window.devicePixelRatio || 1;
        width = container.clientWidth;
        height = container.clientHeight;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const count = Math.round(width * height * o.density);
        while (points.length < count) points.push(randomPoint());
        points.length = count;
    }

    function randomPoint() {
        // particles.js: velocity per axis is (random - 0.5) * speed / 2 px per frame.
        const k = o.speed / 2;
        return { x: Math.random() * width, y: Math.random() * height, vx: (Math.random() - 0.5) * k, vy: (Math.random() - 0.5) * k };
    }

    function step(dt) {
        for (const p of points) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            // Leave one edge, come back at a random place on the opposite edge,
            // like particles.js out_mode "out". All points stay visible.
            if (p.x < 0) { p.x = width; p.y = Math.random() * height; }
            else if (p.x > width) { p.x = 0; p.y = Math.random() * height; }
            if (p.y < 0) { p.y = height; p.x = Math.random() * width; }
            else if (p.y > height) { p.y = 0; p.x = Math.random() * width; }
        }
    }

    // Lines fade with distance. Group them into LEVELS opacity levels and
    // draw each level as one path: a few stroke() calls per frame, not one
    // per line.
    const LEVELS = 8;
    const levels = Array.from({ length: LEVELS }, () => []);

    function draw() {
        ctx.clearRect(0, 0, width, height);
        ctx.lineWidth = o.lineWidth;
        const max2 = o.linkDistance * o.linkDistance;
        for (const level of levels) level.length = 0;
        for (let i = 0; i < points.length; i++) {
            const a = points[i];
            for (let j = i + 1; j < points.length; j++) {
                const b = points[j];
                const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
                if (d2 > max2) continue;
                const fade = 1 - Math.sqrt(d2) / o.linkDistance;
                levels[Math.min(LEVELS - 1, Math.floor(fade * LEVELS))].push(a.x, a.y, b.x, b.y);
            }
        }
        levels.forEach((lines, level) => {
            if (!lines.length) return;
            ctx.strokeStyle = `rgba(${o.linkColor}, ${o.linkOpacity * (level + 0.5) / LEVELS})`;
            ctx.beginPath();
            for (let k = 0; k < lines.length; k += 4) {
                ctx.moveTo(lines[k], lines[k + 1]);
                ctx.lineTo(lines[k + 2], lines[k + 3]);
            }
            ctx.stroke();
        });
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let last = performance.now();
    function frame(now) {
        // particles.js moves one step per frame, so on a 120 Hz screen it moves
        // at 120 steps per second. Use that speed on every screen.
        // Cap dt so a background tab does not jump.
        const dt = Math.min((now - last) / (1000 / 120), 6);
        last = now;
        step(dt);
        draw();
        requestAnimationFrame(frame);
    }

    window.addEventListener('resize', resize);
    resize();
    if (reduceMotion) draw(); else requestAnimationFrame(frame);
}
