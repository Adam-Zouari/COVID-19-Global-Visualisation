// Function to show visualizations panel and minimize globe
function showVisualizations() {
    if (!window.globeInstance || !window.globeInstance.selectedCountry) return;

    const globe = document.getElementById('globe');
    const vizPanel = document.getElementById('visualizationPanel');
    const minimizedGlobe = document.getElementById('minimizedGlobe');

    // Get the current country data
    const countryEl = document.getElementById(`country-${window.globeInstance.selectedCountry}`);
    const countryCode = countryEl ? countryEl.getAttribute('data-country-code') : null;
    const countryData = window.globeInstance.dataService.getCountryData(countryCode);

    if (!countryData) return;

    // Set flag and country name in visualization panel
    document.getElementById('viz-flag').src = `https://flagcdn.com/${countryCode.toLowerCase()}.svg`;
    document.getElementById('viz-country-name').textContent = countryData.countryName;

    // Start fade-out animation for main globe
    globe.classList.add('globe-animating');

    // After animation completes, show the visualization panel
    setTimeout(() => {
        // Hide main globe
        globe.style.display = 'none';

        // Create mini globe using the MiniGlobe class
        window.globeInstance.miniGlobe.create();

        // Show minimized globe with fade-in animation
        minimizedGlobe.style.display = 'block';
        minimizedGlobe.classList.add('showing');

        // Show visualization panel with animation
        vizPanel.style.display = 'flex';
        vizPanel.classList.add('panel-appearing');

        // Generate initial visualization
        changeVisualization();
    }, 400); // Match the fade-out animation duration
}

// Function to restore globe to original size
function restoreGlobe() {
    const globe = document.getElementById('globe');
    const vizPanel = document.getElementById('visualizationPanel');
    const minimizedGlobe = document.getElementById('minimizedGlobe');

    // Start fade out animation for mini globe
    minimizedGlobe.classList.remove('showing');
    minimizedGlobe.classList.add('hiding');

    // Hide visualization panel with fade out
    vizPanel.style.opacity = '0';
    vizPanel.classList.remove('panel-appearing');

    // Wait for mini globe to fade out before showing main globe
    setTimeout(() => {
        // Hide minimized globe
        minimizedGlobe.style.display = 'none';
        minimizedGlobe.classList.remove('hiding');

        // Restore from minimized state
        if (window.globeInstance) {
            window.globeInstance.miniGlobe.restore();
        }

        // Prepare main globe for fade in
        globe.style.display = 'block';
        globe.style.opacity = '0';
        globe.classList.remove('globe-animating');
        globe.classList.add('globe-restoring');

        // Re-render the globe to ensure proper display
        if (window.globeInstance) {
            window.globeInstance.renderCountriesByDepth();
        }

        // Hide visualization panel after its fade out completes
        vizPanel.style.display = 'none';

        // Trigger browser reflow to ensure animation works
        void globe.offsetWidth;

        // Fade in the main globe
        globe.style.opacity = '1';
    }, 400); // Match the fade-out animation duration
}

// Replace changeVisualization function with ChartFactory implementation
function changeVisualization() {
    const vizType = document.getElementById('vizTypeSelector').value;
    const chartContainer = document.getElementById('chartContainer');

    if (!chartContainer) return;

    try {
        // Get country code from selected country
        const countryEl = document.getElementById(`country-${window.globeInstance.selectedCountry}`);
        const countryCode = countryEl ? countryEl.getAttribute('data-country-code') : null;

        if (!countryCode) {
            console.error("No country selected");
            chartContainer.innerHTML = `
                <div style="color: white; text-align: center; padding: 20px;">
                    <h3>No Country Selected</h3>
                    <p>Please select a country first</p>
                </div>
            `;
            return;
        }

        // Create chart using factory
        ChartFactory.createChart(chartContainer, countryCode, vizType);
    } catch (error) {
        console.error("Error creating visualization:", error);
        chartContainer.innerHTML = `
            <div style="color: white; text-align: center; padding: 20px;">
                <h3>Visualization Error</h3>
                <p>${error.message || "Failed to create visualization"}</p>
            </div>
        `;
    }
}
