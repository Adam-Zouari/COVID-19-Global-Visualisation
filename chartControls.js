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
        singleDate: 100 // Default to most recent date (100%)
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

        // Initialize column selection state (but don't create UI elements)
        this.createColumnSelector(data, countryCode, vizType);

        // Create date mode selector
        this.createDateModeSelector(controlsContainer, data);

        // Create date range slider(s)
        this.createDateSliders(controlsContainer, data);

        // No Apply button needed as changes are applied immediately

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
    createDateModeSelector(container, data) {
        const dateModeSection = document.createElement('div');
        dateModeSection.className = 'chart-control-section';

        const sectionTitle = document.createElement('h4');
        sectionTitle.textContent = 'Date Selection';
        dateModeSection.appendChild(sectionTitle);

        // Create radio buttons for date mode
        const radioContainer = document.createElement('div');
        radioContainer.className = 'date-mode-radio-container';

        // Range option
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
                // Apply changes immediately
                ChartFactory.createChart(container, countryCode, vizType, this.getSettings());
            }
        });

        const rangeLabel = document.createElement('label');
        rangeLabel.htmlFor = 'date-mode-range';
        rangeLabel.textContent = 'Date Range';

        // Single date option
        const singleRadio = document.createElement('input');
        singleRadio.type = 'radio';
        singleRadio.id = 'date-mode-single';
        singleRadio.name = 'date-mode';
        singleRadio.value = 'single';
        singleRadio.checked = this.state.dateMode === 'single';

        singleRadio.addEventListener('change', () => {
            if (singleRadio.checked) {
                this.state.dateMode = 'single';
                document.getElementById('date-range-controls').style.display = 'none';
                document.getElementById('single-date-controls').style.display = 'block';
                // Apply changes immediately
                ChartFactory.createChart(container, countryCode, vizType, this.getSettings());
            }
        });

        const singleLabel = document.createElement('label');
        singleLabel.htmlFor = 'date-mode-single';
        singleLabel.textContent = 'Single Date';

        // Add radio buttons to container
        const rangeOption = document.createElement('div');
        rangeOption.className = 'date-mode-option';
        rangeOption.appendChild(rangeRadio);
        rangeOption.appendChild(rangeLabel);

        const singleOption = document.createElement('div');
        singleOption.className = 'date-mode-option';
        singleOption.appendChild(singleRadio);
        singleOption.appendChild(singleLabel);

        radioContainer.appendChild(rangeOption);
        radioContainer.appendChild(singleOption);
        dateModeSection.appendChild(radioContainer);

        container.appendChild(dateModeSection);
    },

    // Create date range sliders
    createDateSliders(container, data) {
        // Format dates for display
        const formatDateLabel = (percent) => {
            const index = Math.floor(percent / 100 * (data.dates.length - 1));
            return data.displayDates[index] || '';
        };

        // Date range controls
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

            // Apply changes immediately as the slider is moved
            ChartFactory.createChart(container, countryCode, vizType, this.getSettings());
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

            // Apply changes immediately as the slider is moved
            ChartFactory.createChart(container, countryCode, vizType, this.getSettings());
        });

        endContainer.appendChild(endLabel);
        endContainer.appendChild(endValue);
        endContainer.appendChild(endSlider);

        rangeControls.appendChild(startContainer);
        rangeControls.appendChild(endContainer);

        // Single date controls
        const singleControls = document.createElement('div');
        singleControls.id = 'single-date-controls';
        singleControls.className = 'date-slider-container';
        singleControls.style.display = this.state.dateMode === 'single' ? 'block' : 'none';

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

            // Apply changes immediately as the slider is moved
            ChartFactory.createChart(container, countryCode, vizType, this.getSettings());
        });

        singleContainer.appendChild(singleLabel);
        singleContainer.appendChild(singleValue);
        singleContainer.appendChild(singleSlider);

        singleControls.appendChild(singleContainer);

        // Add both control sets to container
        container.appendChild(rangeControls);
        container.appendChild(singleControls);
    },

    // Get current settings for chart creation
    getSettings() {
        return {
            selectedColumns: this.state.selectedColumns,
            dateMode: this.state.dateMode,
            dateRange: this.state.dateRange,
            singleDate: this.state.singleDate
        };
    }
};
