// UI Utilities and Event Handlers

// Replace toggleDataset function with direct dataset change function
function changeDataset(datasetKey) {
    if (!window.globeInstance) return;

    // Update the dataset name display
    const datasetDisplayNames = {
        'epidem': 'Epidemiology',
        'hospitalizations': 'Hospitalizations',
        'vaccinations': 'Vaccinations'
    };

    // Update the current dataset display text
    const currentDatasetEl = document.getElementById('currentDataset');
    if (currentDatasetEl) {
        currentDatasetEl.textContent = datasetDisplayNames[datasetKey] || datasetKey;
    }

    // Change dataset in the globe visualization
    window.globeInstance.changeDataset(datasetKey);

    // Update button active states
    document.querySelectorAll('.dataset-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Activate the selected button
    const buttonMap = {
        'epidem': 'epidemBtn',
        'hospitalizations': 'hospBtn',
        'vaccinations': 'vaccBtn'
    };

    const activeBtn = document.getElementById(buttonMap[datasetKey]);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }

    // If a visualization is visible, update it with the new dataset
    const vizPanel = document.getElementById('visualizationPanel');
    if (vizPanel && vizPanel.style.display === 'flex') {
        // Wait a moment for the dataset to change, then update visualization
        setTimeout(() => {
            changeVisualization();
        }, 100);
    }
}

// Initialize UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI directly
    initializeUI();

    // Hide loader after a delay
    setTimeout(() => {
        const loader = document.getElementById('loader');
        if (loader) {
            loader.style.display = 'none';
        }
    }, 2000); // Give some time for data to load
});

// Initialize UI components
function initializeUI() {
    // Center the globe visualization properly
    document.addEventListener('GlobeVisualizationInitialized', function() {
        const globeInstance = window.globeInstance;
        if (globeInstance) {
            // Adjust the globe position to be centered and higher
            globeInstance.globeGroup.attr('transform',
                `translate(${window.innerWidth / 2}, ${window.innerHeight / 2 - 50})`); // Move up by 50px

            // Update the backdrop position
            d3.select('.globe-backdrop')
                .attr('cx', window.innerWidth / 2)
                .attr('cy', window.innerHeight / 2 - 50); // Move up by 50px

            // Force a redraw of the globe
            globeInstance.globeGroup.selectAll('path')
                .attr('d', globeInstance.path);

            // Initialize with the default dataset background without animation
            document.body.style.background = 'radial-gradient(#4a0000, #000)';

            // Initialize reset button color to match default dataset (epidem)
            globeInstance.updateResetButtonColor('epidem');
        }
    });

    // Initialize particles.js with configuration - fewer particles and no stars behind globe
    initializeParticles();

    // Set up error display close button
    const errorCloseBtn = document.getElementById('errorClose');
    if (errorCloseBtn) {
        errorCloseBtn.addEventListener('click', () => {
            const errorDisplay = document.getElementById('errorDisplay');
            if (errorDisplay) {
                errorDisplay.style.display = 'none';
            }
        });
    }
}

// Initialize particles.js
function initializeParticles() {
    particlesJS('particles', {
        "particles": {
            "number": {
                "value": 70,
                "density": {
                    "enable": true,
                    "value_area": 800
                }
            },
            "color": {
                "value": "#ffffff"
            },
            "shape": {
                "type": "circle",
                "stroke": {
                    "width": 0,
                    "color": "#000000"
                }
            },
            "opacity": {
                "value": 0.3,
                "random": true,
                "anim": {
                    "enable": true,
                    "speed": 0.5,
                    "opacity_min": 0.1,
                    "sync": false
                }
            },
            "size": {
                "value": 2,
                "random": true,
                "anim": {
                    "enable": true,
                    "speed": 2,
                    "size_min": 0.1,
                    "sync": false
                }
            },
            "line_linked": {
                "enable": false
            },
            "move": {
                "enable": true,
                "speed": 1.2,
                "direction": "none",
                "random": true,
                "straight": false,
                "out_mode": "out",
                "bounce": false,
                "attract": {
                    "enable": true,
                    "rotateX": 600,
                    "rotateY": 1200
                }
            }
        },
        "interactivity": {
            "detect_on": "canvas",
            "events": {
                "onhover": {
                    "enable": true,
                    "mode": "bubble"
                },
                "onclick": {
                    "enable": false
                },
                "resize": true
            },
            "modes": {
                "bubble": {
                    "distance": 150,
                    "size": 3,
                    "duration": 2,
                    "opacity": 0.5,
                    "speed": 3
                }
            }
        },
        "retina_detect": true
    });
}
