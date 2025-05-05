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

    // Update the See More Visualizations button color based on dataset
    const seeMoreBtn = document.getElementById('seeMoreBtn');
    if (seeMoreBtn) {
        // Define colors for each dataset (matching the Reset View button colors)
        const buttonColors = {
            'epidem': '#8b0000',            // Dark red for epidemiology
            'hospitalizations': '#1a315a',  // Dark blue for hospitalizations
            'vaccinations': '#004d40'       // Dark green for vaccinations
        };

        // Define hover colors for each dataset
        const hoverColors = {
            'epidem': '#a00000',            // Lighter red for hover
            'hospitalizations': '#2a4570',  // Lighter blue for hover
            'vaccinations': '#00695c'       // Lighter green for hover
        };

        // Apply the color without transition
        seeMoreBtn.style.backgroundColor = buttonColors[datasetKey] || '#8b0000';

        // Update hover style
        const styleId = 'see-more-button-style';
        let styleEl = document.getElementById(styleId);

        // Remove existing style element if it exists
        if (styleEl) {
            styleEl.remove();
        }

        // Create new style element with updated hover color
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.textContent = `
            #seeMoreBtn:hover {
                background-color: ${hoverColors[datasetKey] || hoverColors['epidem']} !important;
            }
        `;

        // Add the style element to the document head
        document.head.appendChild(styleEl);
    }

    // Update the Compare button color based on dataset
    const compareBtn = document.getElementById('compareBtn');
    if (compareBtn) {
        // Use the same colors as the See More button
        const buttonColors = {
            'epidem': '#8b0000',            // Dark red for epidemiology
            'hospitalizations': '#1a315a',  // Dark blue for hospitalizations
            'vaccinations': '#004d40'       // Dark green for vaccinations
        };

        // Define hover colors for each dataset
        const hoverColors = {
            'epidem': '#a00000',            // Lighter red for hover
            'hospitalizations': '#2a4570',  // Lighter blue for hover
            'vaccinations': '#00695c'       // Lighter green for hover
        };

        // Apply the color without transition
        compareBtn.style.backgroundColor = buttonColors[datasetKey] || '#8b0000';

        // Update hover style
        const styleId = 'compare-button-style';
        let styleEl = document.getElementById(styleId);

        // Remove existing style element if it exists
        if (styleEl) {
            styleEl.remove();
        }

        // Create new style element with updated hover color
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.textContent = `
            #compareBtn:hover {
                background-color: ${hoverColors[datasetKey] || hoverColors['epidem']} !important;
            }
        `;

        // Add the style element to the document head
        document.head.appendChild(styleEl);

        // Also update the compare UI if it's active
        if (typeof CompareUI !== 'undefined') {
            CompareUI.updateCompareButtonColor(datasetKey);

            // If compare mode is active, update the compare UI colors and refresh the charts
            if (typeof CompareMode !== 'undefined' && CompareMode.state.active) {
                CompareUI.updateCompareUIColors(datasetKey);
                CompareMode.updateComparisonView();
            }
        }
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

            // Initialize See More button color to match default dataset (epidem)
            const seeMoreBtn = document.getElementById('seeMoreBtn');
            if (seeMoreBtn) {
                // Set color without transition
                seeMoreBtn.style.transition = 'none';
                seeMoreBtn.style.backgroundColor = '#8b0000'; // Dark red for epidemiology (same as Reset button)

                // Set up hover style for the See More button
                const styleId = 'see-more-button-style';
                let styleEl = document.getElementById(styleId);

                // Remove existing style element if it exists
                if (styleEl) {
                    styleEl.remove();
                }

                // Create new style element with hover color
                styleEl = document.createElement('style');
                styleEl.id = styleId;
                styleEl.textContent = `
                    #seeMoreBtn:hover {
                        background-color: #a00000 !important; /* Lighter red for hover */
                    }
                `;

                // Add the style element to the document head
                document.head.appendChild(styleEl);
            }

            // Initialize Compare button color to match default dataset (epidem)
            const compareBtn = document.getElementById('compareBtn');
            if (compareBtn) {
                // Set color without transition
                compareBtn.style.transition = 'none';
                compareBtn.style.backgroundColor = '#8b0000'; // Dark red for epidemiology (same as Reset button)

                // Set up hover style for the Compare button
                const styleId = 'compare-button-style';
                let styleEl = document.getElementById(styleId);

                // Remove existing style element if it exists
                if (styleEl) {
                    styleEl.remove();
                }

                // Create new style element with hover color
                styleEl = document.createElement('style');
                styleEl.id = styleId;
                styleEl.textContent = `
                    #compareBtn:hover {
                        background-color: #a00000 !important; /* Lighter red for hover */
                    }
                `;

                // Add the style element to the document head
                document.head.appendChild(styleEl);
            }
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
