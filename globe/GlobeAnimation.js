// Globe Animation Methods
GlobeVis.prototype.startAutoRotation = function() {
    if (!this.autoRotate) return;

    // Track rotation speed and apply easing for smoother animation
    let currentSpeed = this.autoRotateSpeed;

    const animate = (timestamp) => {
        if (!this.autoRotate) return;

        if (!this.lastFrameTime) {
            this.lastFrameTime = timestamp;
        }

        const elapsed = timestamp - this.lastFrameTime;
        this.lastFrameTime = timestamp;

        // Don't process extremely short frames for smoother animation
        if (elapsed < 5) {
            this.animationFrameId = requestAnimationFrame(animate);
            return;
        }

        // Cap elapsed time for consistent animation
        const cappedElapsed = Math.min(elapsed, 33); // Cap at 30fps equivalent

        // Rotate the globe
        this.currentRotation[0] += currentSpeed * cappedElapsed / 16;
        this.projection.rotate(this.currentRotation);

        // Update path geometry
        this.globeGroup.selectAll('path')
            .attr('d', this.path);

        // Apply depth-based rendering for transparent mode
        if (this.projection.clipAngle() > 90) {
            this.renderCountriesByDepth();
        }

        this.animationFrameId = requestAnimationFrame(animate);
    };

    this.animationFrameId = requestAnimationFrame(animate);
};

GlobeVis.prototype.stopAutoRotation = function() {
    this.autoRotate = false;
    if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
    }
};

GlobeVis.prototype.resetView = function() {
    // Ensure the globe element and SVG are visible
    const globeElement = document.getElementById('globe');
    if (globeElement) {
        globeElement.style.display = 'block';
        globeElement.style.opacity = '1';
    }

    // Make sure the SVG is visible
    if (this.svg) {
        this.svg.style('display', 'block')
            .style('opacity', 1);
    }

    this.stopAutoRotation();

    const targetRotation = [0, 0, 0];
    this.lastFrameTime = 0;

    // Pre-load computation for rendering efficiency
    const startRotation = this.projection.rotate();

    // Use a custom easing function for smoother rotation
    const customEasing = t => {
        // Ease in-out cubic for smoother feel
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    };

    let startTime = null;
    const duration = 1000;

    // Use requestAnimationFrame for smoother animation than D3 transitions
    const animateReset = (timestamp) => {
        if (startTime === null) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = customEasing(progress);

        // Interpolate rotation
        const newRotation = startRotation.map((start, i) => {
            // Find the shortest path for rotation (handle 360 degree wrapping)
            let end = targetRotation[i];
            let diff = end - start;

            // Handle wrapping around 360 degrees
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;

            return start + diff * easedProgress;
        });

        // Apply rotation
        this.projection.rotate(newRotation);
        this.currentRotation = [...newRotation];

        // Update paths
        this.globeGroup.selectAll('path').attr('d', this.path);

        // Update depth-based rendering
        if (this.projection.clipAngle() > 90) {
            this.renderCountriesByDepth();
        }

        // Continue animation or end
        if (progress < 1) {
            requestAnimationFrame(animateReset);
        } else {
            // Reset complete, start auto rotation
            this.projection.rotate([0, 0, 0]);
            this.currentRotation = [0, 0, 0];

            setTimeout(() => {
                this.autoRotate = true;
                this.startAutoRotation();
            }, 20);
        }
    };

    requestAnimationFrame(animateReset);

    // Reset zoom level
    this.svg.transition()
        .duration(750)
        .call(this.zoom.transform, d3.zoomIdentity);

    // Force a re-render after a short delay
    setTimeout(() => {
        if (this.renderCountriesByDepth) {
            this.renderCountriesByDepth();
        }
    }, 100);
};

GlobeVis.prototype.animateToRotation = function(targetRotation, callback) {
    const startRotation = this.projection.rotate();
    let startTime = null;
    const duration = 1000; // 1 second duration

    // Custom easing function for smooth animation
    const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

    const animateRotation = (timestamp) => {
        if (startTime === null) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeOutCubic(progress);

        // Interpolate rotation
        const newRotation = startRotation.map((start, i) => {
            let end = targetRotation[i];
            let diff = end - start;

            // Handle wrapping around 360 degrees (for longitude)
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;

            return start + diff * easedProgress;
        });

        // Apply new rotation
        this.projection.rotate(newRotation);
        this.currentRotation = [...newRotation];

        // Update paths
        this.globeGroup.selectAll('path')
            .attr('d', this.path);

        // Update depth-based rendering if needed
        if (this.projection.clipAngle() > 90) {
            this.renderCountriesByDepth();
        }

        // Continue animation or end
        if (progress < 1) {
            requestAnimationFrame(animateRotation);
        } else {
            // Animation complete
            if (callback) callback();
        }
    };

    requestAnimationFrame(animateRotation);
};
