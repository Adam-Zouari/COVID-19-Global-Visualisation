// The main globe owns its DOM, event listeners and animation lifetimes.
class GlobeVis {
    constructor(service = window.dataService) {
        if (!service) throw new Error('A data service is required to create the globe.');
        this.dataService = service;
        this.currentRotation = [-10, -15, 0];
        this.sensitivity = 5;
        this.selectedCountry = null;
        this.selectedCountryCode = null;
        this.worldData = null;
        this.countryFeatures = [];
        this.autoRotate = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches && window.AtlasView?.current !== 'compare';
        this.autoRotateSpeed = 0.035;
        this.lastFrameTime = null;
        this.animationFrameId = null;
        this.rotationFrameId = null;
        this.destroyed = false;
        this.listeners = new AbortController();
        this.worldRequest = new AbortController();
        this.measure();
        window.globeInstance = this;
        this.ready = this.initVis();
    }

    measure() {
        const container = document.getElementById('globe');
        const bounds = container?.getBoundingClientRect?.();
        const width = Math.max(120, bounds?.width || container?.clientWidth || 360);
        const height = Math.max(180, bounds?.height || container?.clientHeight || 420);
        const stage = container?.closest?.('.globe-stage');

        // The canvas fills the panel. Reserve the actual corner text and
        // controls, rather than discarding their entire horizontal rows.
        const obstacles = [];
        const chrome = stage && bounds?.width && bounds?.height ? stage.querySelectorAll(
            '.stage-topline .eyebrow, #mapMetricLabel, #mapUnitsLabel, .coverage-status, .globe-hint, .globe-controls'
        ) : [];
        for (const node of chrome) {
            const range = document.createRange(); range.selectNodeContents(node);
            const rectangles = node.classList.contains('globe-controls') ? [node.getBoundingClientRect()] : range.getClientRects();
            for (const rect of rectangles) if (rect.width && rect.height) obstacles.push({
                left: rect.left - bounds.left, right: rect.right - bounds.left,
                top: rect.top - bounds.top, bottom: rect.bottom - bounds.top
            });
        }
        // Timeline and coverage updates often replace text without changing its
        // bounds. Keep the existing fit and paths when the layout is identical.
        const layout = [width, height, ...obstacles.flatMap(rect => [rect.left, rect.right, rect.top, rect.bottom])].join(',');
        if (layout === this.measuredLayout) return false;
        this.measuredLayout = layout;
        this.width = width;
        this.height = height;
        // Approximately one normal mouse-wheel step below the maximum fit.
        const defaultScale = 0.87;
        this.center = [width / 2, height / 2];
        this.radius = (Math.min(width, height) / 2 - 8) * defaultScale;
        if (!obstacles.length) return true;
        let bestScore = -Infinity;
        for (let dx = 0; dx <= Math.min(80, this.width * 0.12); dx += 4) {
            for (let dy = 0; dy <= Math.min(80, this.height * 0.2); dy += 4) {
                const x = this.width / 2 + dx, y = this.height / 2 + dy;
                let radius = Math.min(x, this.width - x, y, this.height - y) - 8;
                for (const rect of obstacles) radius = Math.min(radius, Math.hypot(
                    Math.max(rect.left - x, 0, x - rect.right), Math.max(rect.top - y, 0, y - rect.bottom)
                ) - 6);
                // Prefer the center when an offset offers little extra room.
                const score = radius - Math.hypot(dx, dy) * 0.08;
                if (score > bestScore) { bestScore = score; this.radius = Math.max(1, radius) * defaultScale; this.center = [x, y]; }
            }
        }
        return true;
    }

    async initVis() {
        const container = document.getElementById('globe');
        if (!container) throw new Error('The globe container was not found.');

        this.svg = d3.select(container).append('svg')
            .attr('width', this.width).attr('height', this.height)
            .attr('viewBox', `0 0 ${this.width} ${this.height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .attr('aria-label', 'Interactive globe. Drag to rotate and scroll to zoom.')
            .style('touch-action', 'none');
        this.globeGroup = this.svg.append('g')
            .attr('transform', `translate(${this.center[0]}, ${this.center[1]})`);
        // Clip each polygon at the horizon so far-side countries cannot cover
        // or intercept clicks on the visible hemisphere.
        this.projection = d3.geoOrthographic().scale(this.radius)
            .translate([0, 0]).rotate(this.currentRotation).clipAngle(90);
        this.path = d3.geoPath().projection(this.projection);
        this.tooltip = d3.select('body').append('div').attr('class', 'tooltip')
            .attr('role', 'tooltip').style('opacity', 0);
        this.drag = d3.drag()
            .filter(event => !event.ctrlKey && !event.button && (!event.touches || event.touches.length === 1))
            .on('start', event => this.dragstarted(event))
            .on('drag', event => this.dragged(event))
            .on('end', () => this.dragended());
        // Mouse drag rotates; wheel and a two-finger pinch zoom.
        this.zoom = d3.zoom().scaleExtent([0.7, 5])
            .filter(event => event.type === 'wheel' || (event.touches && event.touches.length > 1))
            .on('zoom', event => this.zoomed(event));
        this.svg.call(this.drag).call(this.zoom);
        this.setupEventListeners();
        this.setControlsDisabled(true);

        try {
            // Keep geometry available when CSV loading fails, so a later file
            // upload can recover this same globe without a page reload.
            const [dataResult, mapResult] = await Promise.allSettled([
                this.dataService.loadData(), this.ensureWorldData()
            ]);
            if (this.destroyed) return;
            if (mapResult.status === 'rejected') throw mapResult.reason;
            if (dataResult.status === 'rejected') throw dataResult.reason;
            this.refreshData();
            this.dispatchStateEvent('atlas-ready');
            return this;
        } catch (error) {
            if (this.destroyed) return;
            console.error('Unable to initialize globe:', error);
            this.stopAutoRotation();
            this.svg.style('display', 'none');
            this.showGlobeError(`Unable to load the globe: ${error.message}. Upload CSV files to recover, or reload to retry.`);
        } finally {
            if (!this.destroyed) {
                const loader = document.getElementById('loader');
                if (loader) loader.style.display = 'none';
            }
        }
    }

    async ensureWorldData() {
        if (this.worldData) return this.worldData;
        if (!this.mapLoadPromise) {
            this.mapLoadPromise = d3.json('/assets/world/countries-110m.json', {
                signal: this.worldRequest.signal
            }).then(worldData => {
                if (!worldData?.objects?.countries) throw new Error('Invalid world map data.');
                if (!this.destroyed) this.worldData = worldData;
                return worldData;
            }).finally(() => { this.mapLoadPromise = null; });
        }
        return this.mapLoadPromise;
    }

    showGlobeError(text) {
        const container = document.getElementById('globe');
        if (!container || this.destroyed) return;
        let message = container.querySelector('.globe-error');
        if (!message) {
            message = document.createElement('div');
            message.className = 'error-message globe-error';
            message.setAttribute('role', 'alert');
            container.appendChild(message);
        }
        message.textContent = text;
    }

    async recoverAfterDataLoad() {
        if (this.destroyed) return;
        try {
            await this.ensureWorldData();
            if (this.destroyed) return;
            this.refreshData();
            this.dispatchStateEvent('atlas-ready');
        } catch (error) {
            if (this.destroyed) return;
            console.error('Unable to recover globe:', error);
            this.showGlobeError(`Map unavailable: ${error.message}. Reload the page to retry.`);
        }
    }

    setControlsDisabled(disabled) {
        for (const id of ['dataSelector', 'dateSlider', 'prevDateBtn', 'nextDateBtn', 'resetBtn', 'zoomInBtn', 'zoomOutBtn']) {
            const control = document.getElementById(id);
            if (control) control.disabled = disabled;
        }
        document.querySelectorAll?.('.dataset-btn').forEach(control => { control.disabled = disabled; });
        if (!disabled) this.syncDateControls();
    }

    resize() {
        if (this.destroyed) return;
        const zoomScale = d3.zoomTransform(this.svg.node()).k;
        if (!this.measure()) return;
        this.svg.attr('width', this.width).attr('height', this.height)
            .attr('viewBox', `0 0 ${this.width} ${this.height}`);
        this.globeGroup.attr('transform', `translate(${this.center[0]}, ${this.center[1]})`);
        this.projection.scale(this.radius * zoomScale);
        this.render();
    }

    render() {
        if (this.destroyed) return;
        this.globeGroup.selectAll('path').attr('d', this.path);
        this.globeGroup.select('.ocean').attr('r', this.projection.scale());
    }

    dispatchStateEvent(name, detail = {}) {
        if (typeof CustomEvent !== 'undefined' && document.dispatchEvent) {
            document.dispatchEvent(new CustomEvent(name, { detail: {
                countryCode: this.selectedCountryCode,
                category: this.dataService.currentDataset,
                metric: this.dataService.currentColumn,
                date: this.dataService.currentDate,
                ...detail
            } }));
        }
    }

    destroy() {
        this.destroyed = true;
        this.stopAutoRotation();
        this.cancelRotationAnimation();
        this.listeners.abort();
        this.dateListeners?.abort();
        this.worldRequest.abort();
        this.resizeObserver?.disconnect();
        this.chromeObserver?.disconnect();
        this.svg?.interrupt().on('.drag', null).on('.zoom', null).remove();
        this.tooltip?.remove();
        if (window.globeInstance === this) window.globeInstance = null;
    }
}

window.GlobeVis = GlobeVis;
