// Chart Controls - Provides additional controls for chart customization
const ChartControls = {
    // Store the current state of controls
    state: {
        selectedColumns: {},
        dateMode: 'range', // 'range' or 'single'
        dateRange: {
            start: 0,
            end: 100
        },
        singleDate: 100, // Default to most recent date (100%)
        pendingChanges: false // Flag to indicate if there are pending changes
    },

    // Initialize chart controls
    initialize(container, countryCode, vizType) {
        // Get data for this country
        const data = ChartFactory.prepareDataForCountry(countryCode);
        if (!data || !data.columns || data.columns.length === 0) {
            console.error("No data available for chart controls");
            return;
        }

        // Create controls container if it doesn't exist
        let controlsContainer = document.getElementById('chartControlsContainer');
        if (!controlsContainer) {
            controlsContainer = document.createElement('div');
            controlsContainer.id = 'chartControlsContainer';
            controlsContainer.className = 'chart-controls-container';
            container.parentNode.insertBefore(controlsContainer, container);
        } else {
            controlsContainer.innerHTML = ''; // Clear existing controls
        }

        // For pie and radar charts, force single date mode
        if (vizType === 'pie' || vizType === 'radar') {
            this.state.dateMode = 'single';
        }

        // Initialize column selection state (but don't create UI elements)
        this.createColumnSelector(data, countryCode, vizType);

        // Create date mode selector (only if not pie or radar chart)
        this.createDateModeSelector(controlsContainer, data, vizType);

        // Create date range slider(s)
        this.createDateSliders(controlsContainer, data, vizType);

        // Create Apply Changes button
        this.createApplyChangesButton(controlsContainer);

        return this.state;
    },

    // Create column selector - now removed as columns are only toggled from the legend
    createColumnSelector(data, countryCode, vizType) {
        // Initialize state with all columns selected by default
        data.columns.forEach(column => {
            if (this.state.selectedColumns[column] === undefined) {
                this.state.selectedColumns[column] = true;
            }
        });

        // No UI elements are created here anymore
    },

    // Create date mode selector (range or single)
    createDateModeSelector(container, data, vizType) {
        const dateModeSection = document.createElement('div');
        dateModeSection.className = 'chart-control-section';

        const sectionTitle = document.createElement('h4');
        sectionTitle.textContent = 'Date Selection';
        dateModeSection.appendChild(sectionTitle);

        // Create radio buttons for date mode
        const radioContainer = document.createElement('div');
        radioContainer.className = 'date-mode-radio-container';

        // For pie and radar charts, only show single date option
        const isPieOrRadar = (vizType === 'pie' || vizType === 'radar');

        if (!isPieOrRadar) {
            // Range option - only show for non-pie/radar charts
            const rangeRadio = document.createElement('input');
            rangeRadio.type = 'radio';
            rangeRadio.id = 'date-mode-range';
            rangeRadio.name = 'date-mode';
            rangeRadio.value = 'range';
            rangeRadio.checked = this.state.dateMode === 'range';

            rangeRadio.addEventListener('change', () => {
                if (rangeRadio.checked) {
                    this.state.dateMode = 'range';
                    document.getElementById('date-range-controls').style.display = 'block';
                    document.getElementById('single-date-controls').style.display = 'none';
                    // Update chart in real-time
                    this.updateChartInRealTime();
                }
            });

            const rangeLabel = document.createElement('label');
            rangeLabel.htmlFor = 'date-mode-range';
            rangeLabel.textContent = 'Date Range';

            // Add range option to container
            const rangeOption = document.createElement('div');
            rangeOption.className = 'date-mode-option';
            rangeOption.appendChild(rangeRadio);
            rangeOption.appendChild(rangeLabel);
            radioContainer.appendChild(rangeOption);
        }

        // Single date option - always show this
        const singleRadio = document.createElement('input');
        singleRadio.type = 'radio';
        singleRadio.id = 'date-mode-single';
        singleRadio.name = 'date-mode';
        singleRadio.value = 'single';
        singleRadio.checked = this.state.dateMode === 'single';

        // For pie/radar charts, force single date and disable the radio
        if (isPieOrRadar) {
            singleRadio.checked = true;
            singleRadio.disabled = true; // Disable the radio button since it's the only option
        }

        singleRadio.addEventListener('change', () => {
            if (singleRadio.checked) {
                this.state.dateMode = 'single';
                document.getElementById('date-range-controls').style.display = 'none';
                document.getElementById('single-date-controls').style.display = 'block';
                // Update chart in real-time
                this.updateChartInRealTime();
            }
        });

        const singleLabel = document.createElement('label');
        singleLabel.htmlFor = 'date-mode-single';
        singleLabel.textContent = 'Single Date';

        // Add single date option to container
        const singleOption = document.createElement('div');
        singleOption.className = 'date-mode-option';
        singleOption.appendChild(singleRadio);
        singleOption.appendChild(singleLabel);
        radioContainer.appendChild(singleOption);

        dateModeSection.appendChild(radioContainer);
        container.appendChild(dateModeSection);
    },

    // Create date range sliders
    createDateSliders(container, data, vizType) {
        // Format dates for display
        const formatDateLabel = (percent) => {
            const index = Math.floor(percent / 100 * (data.dates.length - 1));
            return data.displayDates[index] || '';
        };

        // Check if we're dealing with pie or radar chart
        const isPieOrRadar = (vizType === 'pie' || vizType === 'radar');

        // Date range controls - only create for non-pie/radar charts
        if (!isPieOrRadar) {
            const rangeControls = document.createElement('div');
            rangeControls.id = 'date-range-controls';
            rangeControls.className = 'date-slider-container';
            rangeControls.style.display = this.state.dateMode === 'range' ? 'block' : 'none';

            // Start date slider
            const startContainer = document.createElement('div');
            startContainer.className = 'slider-with-label';

            const startLabel = document.createElement('label');
            startLabel.htmlFor = 'date-range-start';
            startLabel.textContent = 'Start Date:';

            const startValue = document.createElement('span');
            startValue.id = 'date-range-start-value';
            startValue.className = 'slider-value';
            startValue.textContent = formatDateLabel(this.state.dateRange.start);

            const startSlider = document.createElement('input');
            startSlider.type = 'range';
            startSlider.id = 'date-range-start';
            startSlider.min = 0;
            startSlider.max = 100;
            startSlider.value = this.state.dateRange.start;

            startSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                // Ensure start doesn't go beyond end
                if (value > this.state.dateRange.end) {
                    e.target.value = this.state.dateRange.end;
                    this.state.dateRange.start = this.state.dateRange.end;
                } else {
                    this.state.dateRange.start = value;
                }
                startValue.textContent = formatDateLabel(this.state.dateRange.start);

                // Update chart in real-time
                this.updateChartInRealTime();
            });

            startContainer.appendChild(startLabel);
            startContainer.appendChild(startValue);
            startContainer.appendChild(startSlider);

            // End date slider
            const endContainer = document.createElement('div');
            endContainer.className = 'slider-with-label';

            const endLabel = document.createElement('label');
            endLabel.htmlFor = 'date-range-end';
            endLabel.textContent = 'End Date:';

            const endValue = document.createElement('span');
            endValue.id = 'date-range-end-value';
            endValue.className = 'slider-value';
            endValue.textContent = formatDateLabel(this.state.dateRange.end);

            const endSlider = document.createElement('input');
            endSlider.type = 'range';
            endSlider.id = 'date-range-end';
            endSlider.min = 0;
            endSlider.max = 100;
            endSlider.value = this.state.dateRange.end;

            endSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                // Ensure end doesn't go below start
                if (value < this.state.dateRange.start) {
                    e.target.value = this.state.dateRange.start;
                    this.state.dateRange.end = this.state.dateRange.start;
                } else {
                    this.state.dateRange.end = value;
                }
                endValue.textContent = formatDateLabel(this.state.dateRange.end);

                // Update chart in real-time
                this.updateChartInRealTime();
            });

            endContainer.appendChild(endLabel);
            endContainer.appendChild(endValue);
            endContainer.appendChild(endSlider);

            rangeControls.appendChild(startContainer);
            rangeControls.appendChild(endContainer);

            // Add range controls to container
            container.appendChild(rangeControls);
        }

        // Single date controls - always create these
        const singleControls = document.createElement('div');
        singleControls.id = 'single-date-controls';
        singleControls.className = 'date-slider-container';

        // For pie/radar charts, always show single date controls
        // For other charts, show based on dateMode
        singleControls.style.display = isPieOrRadar || this.state.dateMode === 'single' ? 'block' : 'none';

        const singleContainer = document.createElement('div');
        singleContainer.className = 'slider-with-label';

        const singleLabel = document.createElement('label');
        singleLabel.htmlFor = 'single-date-slider';
        singleLabel.textContent = 'Select Date:';

        const singleValue = document.createElement('span');
        singleValue.id = 'single-date-value';
        singleValue.className = 'slider-value';
        singleValue.textContent = formatDateLabel(this.state.singleDate);

        const singleSlider = document.createElement('input');
        singleSlider.type = 'range';
        singleSlider.id = 'single-date-slider';
        singleSlider.min = 0;
        singleSlider.max = 100;
        singleSlider.value = this.state.singleDate;

        singleSlider.addEventListener('input', (e) => {
            this.state.singleDate = parseInt(e.target.value);
            singleValue.textContent = formatDateLabel(this.state.singleDate);

            // Update chart in real-time
            this.updateChartInRealTime();
        });

        singleContainer.appendChild(singleLabel);
        singleContainer.appendChild(singleValue);
        singleContainer.appendChild(singleSlider);

        singleControls.appendChild(singleContainer);

        // Add single date controls to container
        container.appendChild(singleControls);
    },

    // Create Apply Changes button (now hidden since we update in real-time)
    createApplyChangesButton(container) {
        // We're not adding the Apply Changes button anymore since charts update in real-time
        // This method is kept for compatibility with existing code
        console.log("Apply Changes button not needed - charts update in real-time");
    },

    // Update the Apply Changes button state
    updateApplyChangesButton() {
        const applyButton = document.getElementById('applyChangesBtn');
        if (applyButton) {
            applyButton.disabled = !this.state.pendingChanges;
            applyButton.className = this.state.pendingChanges ?
                'apply-changes-btn active' : 'apply-changes-btn';
        }
    },

    // Get current settings for chart creation
    getSettings() {
        return {
            selectedColumns: this.state.selectedColumns,
            dateMode: this.state.dateMode,
            dateRange: this.state.dateRange,
            singleDate: this.state.singleDate
        };
    },

    // Update chart in real-time without requiring the Apply Changes button
    updateChartInRealTime() {
        // Get the current country code and visualization type
        const countryEl = document.getElementById(`country-${window.globeInstance.selectedCountry}`);
        const countryCode = countryEl ? countryEl.getAttribute('data-country-code') : null;
        const vizType = document.getElementById('vizTypeSelector').value;

        // For pie and radar charts, ensure we're in single date mode
        if (vizType === 'pie' || vizType === 'radar') {
            this.state.dateMode = 'single';

            // Update UI to reflect this change
            const singleDateControls = document.getElementById('single-date-controls');
            if (singleDateControls) {
                singleDateControls.style.display = 'block';
            }

            const dateRangeControls = document.getElementById('date-range-controls');
            if (dateRangeControls) {
                dateRangeControls.style.display = 'none';
            }

            // Update radio button if it exists
            const singleRadio = document.getElementById('date-mode-single');
            if (singleRadio) {
                singleRadio.checked = true;
                singleRadio.disabled = true;
            }
        } else {
            // For other chart types, enable the single date radio if it was disabled
            const singleRadio = document.getElementById('date-mode-single');
            if (singleRadio) {
                singleRadio.disabled = false;
            }
        }

        // Get the chart container
        const chartContainer = document.getElementById('chartContainer');

        if (chartContainer && countryCode) {
            // Update the chart with new settings
            ChartFactory.createChart(chartContainer, countryCode, vizType, this.getSettings());

            // Since we're updating in real-time, we don't need the Apply Changes button
            this.state.pendingChanges = false;
            this.updateApplyChangesButton();
        }
    }
};
