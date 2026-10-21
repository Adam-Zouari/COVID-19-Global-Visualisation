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
        this.autoRotate = false;
        this.autoRotateSpeed = 0.2;
        this.lastFrameTime = null;
        this.animationFrameId = null;
        this.rotationFrameId = null;
        this.destroyed = false;
        this.debug = false;
        this.listeners = new AbortController();
        this.worldRequest = new AbortController();
        this.measure();
        window.globeInstance = this;
        this.ready = this.initVis();
    }

    log(message, data) {
        if (this.debug) console.debug(`[GlobeVis] ${message}`, data ?? '');
    }

    measure() {
        const container = document.getElementById('globe');
        const bounds = container?.getBoundingClientRect?.();
        this.width = Math.max(120, bounds?.width || container?.clientWidth || 360);
        this.height = Math.max(180, bounds?.height || container?.clientHeight || 420);
        this.radius = Math.max(44, Math.min(this.width / 2 - 28, this.height / 2 - 28));
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
            .attr('transform', `translate(${this.width / 2}, ${this.height / 2})`);
        // Clip each polygon at the horizon so far-side countries cannot cover
        // or intercept clicks on the visible hemisphere.
        this.projection = d3.geoOrthographic().scale(this.radius)
            .translate([0, 0]).rotate(this.currentRotation).clipAngle(90);
        this.path = d3.geoPath().projection(this.projection);
        this.tooltip = d3.select('body').append('div').attr('class', 'tooltip')
            .attr('role', 'tooltip').style('opacity', 0);
        this.drag = d3.drag()
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
            const message = document.createElement('div');
            message.className = 'error-message globe-error';
            message.textContent = `Unable to load the globe: ${error.message}`;
            container.appendChild(message);
            const status = document.getElementById('dataStatus');
            if (status) status.textContent = 'Data unavailable. Upload CSV files to recover, or reload to retry.';
        } finally {
            const loader = document.getElementById('loader');
            if (loader) loader.style.display = 'none';
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

    async recoverAfterDataLoad() {
        if (this.destroyed) return;
        try {
            await this.ensureWorldData();
            if (this.destroyed) return;
            this.refreshData();
            this.dispatchStateEvent('atlas-ready');
        } catch (error) {
            console.error('Unable to recover globe:', error);
            const status = document.getElementById('dataStatus');
            if (status) status.textContent = `Map unavailable: ${error.message}. Reload the page to retry.`;
        }
    }

    setControlsDisabled(disabled) {
        for (const id of ['dataSelector', 'dateSlider', 'prevDateBtn', 'nextDateBtn', 'resetBtn', 'compareBtn', 'zoomInBtn', 'zoomOutBtn']) {
            const control = document.getElementById(id);
            if (control) control.disabled = disabled;
        }
        document.querySelectorAll?.('.dataset-btn').forEach(control => { control.disabled = disabled; });
        if (!disabled) this.syncDateControls();
    }

    resize() {
        if (this.destroyed) return;
        const zoomScale = d3.zoomTransform(this.svg.node()).k;
        this.measure();
        this.svg.attr('width', this.width).attr('height', this.height)
            .attr('viewBox', `0 0 ${this.width} ${this.height}`);
        this.globeGroup.attr('transform', `translate(${this.width / 2}, ${this.height / 2})`);
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
        clearTimeout(this.dateUpdateTimeout);
        this.svg?.interrupt().on('.drag', null).on('.zoom', null).remove();
        this.tooltip?.remove();
        if (window.globeInstance === this) window.globeInstance = null;
    }
}

window.GlobeVis = GlobeVis;
