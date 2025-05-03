// MiniGlobe Visualization
class MiniGlobe {
    constructor(globeInstance) {
        this.globeInstance = globeInstance;
        this.minimized = false;
        this.animationFrameId = null;
        this.container = document.getElementById('minimizedGlobe');
        this.rotationSpeed = 0.15; // Slower rotation for mini globe
    }

    // Create the miniglobe visualization
    create() {
        this.minimized = true;
        
        // Clear any existing content
        if (this.container) {
            this.container.innerHTML = '';
        }

        // Create a small version of the globe inside the minimized container
        const miniSvg = d3.select('#minimizedGlobe')
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('viewBox', '0 0 150 150')
            .style('background-color', 'transparent');

        const miniGlobeGroup = miniSvg.append('g')
            .attr('transform', 'translate(75, 75)');

        // Create a small projection for the minimized globe
        const miniProjection = d3.geoOrthographic()
            .scale(65)  // Larger scale for a bigger globe appearance
            .translate([0, 0])
            .clipAngle(180);

        const miniPath = d3.geoPath().projection(miniProjection);

        // Add ocean background
        miniGlobeGroup.append('circle')
            .attr('class', 'mini-ocean')
            .attr('cx', 0)
            .attr('cy', 0)
            .attr('r', 65)
            .attr('fill', '#000000')
            .attr('fill-opacity', 0.7)
            .attr('stroke', 'rgba(100, 200, 255, 0.25)')
            .attr('stroke-width', '0.5px');

        // Extract countries and draw them on mini globe
        if (this.globeInstance.worldData) {
            const countries = topojson.feature(this.globeInstance.worldData, this.globeInstance.worldData.objects.countries);

            miniGlobeGroup.selectAll('.mini-country')
                .data(countries.features)
                .join('path')
                .attr('class', 'mini-country')
                .attr('d', miniPath)
                .attr('fill', d => {
                    const countryCode = this.globeInstance.getCountryCode(d);
                    if (!countryCode) return this.globeInstance.dataService.getDefaultColor();
                    return this.globeInstance.dataService.getCountryColor(countryCode);
                })
                .attr('fill-opacity', 1.0)
                .attr('stroke', 'rgba(255,255,255,0.0)')
                .attr('stroke-width', '0.5px');

            // Highlight selected country if any
            if (this.globeInstance.selectedCountry) {
                const selectedFeature = countries.features.find(d => d.id === this.globeInstance.selectedCountry);
                if (selectedFeature) {
                    miniGlobeGroup.append('path')
                        .datum(selectedFeature)
                        .attr('d', miniPath)
                        .attr('fill', 'none')
                        .attr('stroke', '#ffffff')
                        .attr('stroke-width', '1.5px');
                }
            }
        }

        // Set the mini globe to the same rotation as the main globe
        miniProjection.rotate(this.globeInstance.currentRotation);

        // Start a slow auto-rotation for the mini globe
        this.startRotation(miniProjection, miniPath, miniGlobeGroup);

        // Store references for later use
        this.svg = miniSvg;
        this.projection = miniProjection;
        this.path = miniPath;
        this.group = miniGlobeGroup;

        return this;
    }

    // Handle rotation of the mini globe
    startRotation(miniProjection, miniPath, miniGlobeGroup) {
        let lastFrameTime = 0;
        
        const animate = (timestamp) => {
            if (!this.minimized) {
                cancelAnimationFrame(this.animationFrameId);
                return;
            }

            if (!lastFrameTime) {
                lastFrameTime = timestamp;
            }

            const elapsed = timestamp - lastFrameTime;
            lastFrameTime = timestamp;

            const cappedElapsed = Math.min(elapsed, 33);

            // Get current rotation and update
            const currentRotation = miniProjection.rotate();
            currentRotation[0] += this.rotationSpeed * cappedElapsed / 16;

            // Apply rotation
            miniProjection.rotate(currentRotation);

            // Update paths
            miniGlobeGroup.selectAll('path')
                .attr('d', miniPath);

            this.animationFrameId = requestAnimationFrame(animate);
        };

        this.animationFrameId = requestAnimationFrame(animate);
    }

    // Stop the rotation animation
    stopRotation() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    // Restore from minimized state
    restore() {
        this.minimized = false;
        this.stopRotation();
    }

    // Update the miniglobe colors (used when changing datasets)
    updateColors() {
        if (!this.group || !this.minimized) return;

        // Update country colors
        this.group.selectAll('.mini-country')
            .attr('fill', d => {
                const countryCode = this.globeInstance.getCountryCode(d);
                if (!countryCode) return this.globeInstance.dataService.getDefaultColor();
                return this.globeInstance.dataService.getCountryColor(countryCode);
            });
    }

    // Recreate the miniglobe (used when changing datasets)
    recreate() {
        this.stopRotation();
        return this.create();
    }
}

// Export the class
window.MiniGlobe = MiniGlobe;
