GlobeVis.prototype.startAutoRotation = function() {
    if (!this.autoRotate || this.destroyed || this.animationFrameId !== null || document.hidden ||
        window.CompareMode?.state.active || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    this.lastFrameTime = null;
    const animate = timestamp => {
        this.animationFrameId = null;
        if (!this.autoRotate || this.destroyed || document.hidden || window.CompareMode?.state.active) return;
        const elapsed = this.lastFrameTime === null ? 0 : Math.min(timestamp - this.lastFrameTime, 33);
        this.lastFrameTime = timestamp;
        this.currentRotation[0] = (this.currentRotation[0] + this.autoRotateSpeed * elapsed / 16) % 360;
        this.projection.rotate(this.currentRotation);
        this.render();
        this.animationFrameId = requestAnimationFrame(animate);
    };
    this.animationFrameId = requestAnimationFrame(animate);
};

GlobeVis.prototype.stopAutoRotation = function() {
    this.autoRotate = false;
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
    this.lastFrameTime = null;
};

GlobeVis.prototype.cancelRotationAnimation = function() {
    if (this.rotationFrameId !== null) cancelAnimationFrame(this.rotationFrameId);
    this.rotationFrameId = null;
};

GlobeVis.prototype.resetView = function() {
    this.stopAutoRotation();
    this.svg.interrupt();
    const startZoom = d3.zoomTransform(this.svg.node()).k;
    this.animateToRotation([-10, -15, 0], () => {
        this.autoRotate = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches && !window.CompareMode?.state.active;
        this.startAutoRotation();
    }, {
        duration: 1000,
        easing: progress => progress * progress * (3 - 2 * progress),
        // Apply scale on the same frame as rotation so Reset never snaps zoom.
        onFrame: progress => this.svg.call(this.zoom.transform, d3.zoomIdentity.scale(startZoom + (1 - startZoom) * progress))
    });
};

GlobeVis.prototype.animateToRotation = function(targetRotation, callback, options = {}) {
    this.cancelRotationAnimation();
    const startRotation = this.projection.rotate();
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const duration = reducedMotion ? 0 : options.duration ?? 1000;
    let startTime = null;
    const animate = timestamp => {
        this.rotationFrameId = null;
        if (this.destroyed) return;
        if (startTime === null) startTime = timestamp;
        const progress = duration === 0 ? 1 : Math.min((timestamp - startTime) / duration, 1);
        const eased = options.easing ? options.easing(progress) : 1 - Math.pow(1 - progress, 3);
        this.currentRotation = startRotation.map((start, index) => {
            const difference = ((targetRotation[index] - start + 540) % 360 + 360) % 360 - 180;
            return start + difference * eased;
        });
        this.projection.rotate(this.currentRotation);
        if (options.onFrame) options.onFrame(eased);
        else this.render();
        if (progress < 1) this.rotationFrameId = requestAnimationFrame(animate);
        else if (callback) callback();
    };
    this.rotationFrameId = requestAnimationFrame(animate);
};
