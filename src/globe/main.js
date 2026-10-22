// Called by the application bootstrap after the data service and UI are ready.
window.initializeGlobe = function() {
    if (window.globeInstance && !window.globeInstance.destroyed) return window.globeInstance;
    if (!document.getElementById('globe')) return null;
    return new GlobeVis(window.dataService);
};
