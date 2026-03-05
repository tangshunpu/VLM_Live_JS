/**
 * UI module for VLM Live
 * Handles DOM events, updates, and user interactions
 */

const UI = {
    // DOM element references
    elements: {},

    // Result history
    results: [],
    isRawView: false,

    /**
     * Initialize UI module
     */
    init() {
        this.cacheElements();
        this.bindEvents();
        this.loadConfig();
        this.initTheme();
        this.initKeyboardShortcuts();
    },

    /**
     * Cache DOM element references
     */
    cacheElements() {
        this.elements = {
            // API Config
            backendType: document.getElementById('backend-type'),
            apiUrl: document.getElementById('api-url'),
            apiKey: document.getElementById('api-key'),
            rememberKey: document.getElementById('remember-key'),
            modelSelect: document.getElementById('model-select'),
            modelInput: document.getElementById('model-input'),
            refreshModels: document.getElementById('refresh-models'),
            testConnection: document.getElementById('test-connection'),
            connectionStatus: document.getElementById('connection-status'),

            // Camera
            cameraSelect: document.getElementById('camera-select'),
            resolution: document.getElementById('resolution'),
            cameraFps: document.getElementById('camera-fps'),
            cameraFpsValue: document.getElementById('camera-fps-value'),
            inferenceFps: document.getElementById('inference-fps'),
            inferenceFpsValue: document.getElementById('inference-fps-value'),
            cameraToggle: document.getElementById('camera-toggle'),
            videoPreview: document.getElementById('video-preview'),
            videoPlaceholder: document.getElementById('video-placeholder'),
            captureCanvas: document.getElementById('capture-canvas'),

            // Image Processing
            imageSize: document.getElementById('image-size'),
            customSizeGroup: document.getElementById('custom-size-group'),
            customWidth: document.getElementById('custom-width'),
            customHeight: document.getElementById('custom-height'),
            imageFormat: document.getElementById('image-format'),
            imageQuality: document.getElementById('image-quality'),
            imageQualityValue: document.getElementById('image-quality-value'),
            resizeMode: document.getElementById('resize-mode'),

            // Prompt
            systemPrompt: document.getElementById('system-prompt'),
            userPrompt: document.getElementById('user-prompt'),
            promptTemplate: document.getElementById('prompt-template'),
            promptHistory: document.getElementById('prompt-history'),
            clearHistory: document.getElementById('clear-history'),

            // Advanced
            timeout: document.getElementById('timeout'),
            maxTokens: document.getElementById('max-tokens'),
            temperature: document.getElementById('temperature'),
            temperatureValue: document.getElementById('temperature-value'),
            maxRetries: document.getElementById('max-retries'),
            debugMode: document.getElementById('debug-mode'),
            thinkingMode: document.getElementById('thinking-mode'),

            // Video Controls
            startInference: document.getElementById('start-inference'),
            takeScreenshot: document.getElementById('take-screenshot'),

            // Stats
            fpsDisplay: document.getElementById('fps-display'),
            latencyDisplay: document.getElementById('latency-display'),
            dropRateDisplay: document.getElementById('drop-rate-display'),

            // Results
            resultsContainer: document.getElementById('results-container'),
            toggleView: document.getElementById('toggle-view'),
            exportJson: document.getElementById('export-json'),
            exportTxt: document.getElementById('export-txt'),
            clearResults: document.getElementById('clear-results'),

            // Header
            themeToggle: document.getElementById('theme-toggle'),
            layoutToggle: document.getElementById('layout-toggle'),

            // Debug
            debugPanel: document.getElementById('debug-panel'),
            debugContent: document.getElementById('debug-content')
        };
    },

    /**
     * Bind DOM events
     */
    bindEvents() {
        // Range inputs
        this.bindRangeInput('cameraFps', 'cameraFpsValue', v => v);
        this.bindRangeInput('inferenceFps', 'inferenceFpsValue', v => v.toFixed(1));
        this.bindRangeInput('imageQuality', 'imageQualityValue', v => `${Math.round(v * 100)}%`);
        this.bindRangeInput('temperature', 'temperatureValue', v => v.toFixed(1));

        // Image size
        this.elements.imageSize?.addEventListener('change', (e) => {
            const isCustom = e.target.value === 'custom';
            this.elements.customSizeGroup?.classList.toggle('hidden', !isCustom);
        });

        // Prompt template
        this.elements.promptTemplate?.addEventListener('change', (e) => {
            if (e.target.value) {
                const template = Config.getTemplate(e.target.value);
                if (template) {
                    this.elements.systemPrompt.value = template.system;
                    this.elements.userPrompt.value = template.user;
                }
            }
        });

        // Prompt history
        this.elements.promptHistory?.addEventListener('change', (e) => {
            if (e.target.value) {
                const item = JSON.parse(e.target.value);
                this.elements.systemPrompt.value = item.systemPrompt || '';
                this.elements.userPrompt.value = item.userPrompt || '';
                e.target.value = ''; // Reset selection
            }
        });

        // Clear prompt history
        this.elements.clearHistory?.addEventListener('click', () => {
            Config.clearPromptHistory();
            this.updatePromptHistory();
            this.showToast('Prompt history cleared', 'info');
        });

        // Theme toggle
        this.elements.themeToggle?.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            Config.applyTheme(newTheme);
        });

        // Layout toggle
        this.elements.layoutToggle?.addEventListener('click', () => {
            const mainContent = document.querySelector('.main-content');
            const isVertical = mainContent?.classList.contains('layout-vertical');
            Config.applyLayout(isVertical ? 'horizontal' : 'vertical');
        });

        // Toggle view
        this.elements.toggleView?.addEventListener('click', () => {
            this.isRawView = !this.isRawView;
            this.elements.toggleView.textContent = this.isRawView ? 'Text View' : 'Raw View';
            this.renderResults();
        });

        // Export JSON
        this.elements.exportJson?.addEventListener('click', () => {
            this.exportResults('json');
        });

        // Export TXT
        this.elements.exportTxt?.addEventListener('click', () => {
            this.exportResults('txt');
        });

        // Clear results
        this.elements.clearResults?.addEventListener('click', () => {
            this.clearResults();
        });

        // Collapsible panels
        document.querySelectorAll('.collapsible-header').forEach(header => {
            header.addEventListener('click', () => {
                const panel = header.closest('.collapsible');
                panel?.classList.toggle('collapsed');
            });
        });

        // Config change handlers - auto-save
        const configInputs = [
            'backendType', 'apiUrl', 'rememberKey',
            'resolution', 'imageSize', 'customWidth', 'customHeight',
            'imageFormat', 'resizeMode',
            'timeout', 'maxTokens', 'maxRetries', 'debugMode', 'thinkingMode'
        ];

        configInputs.forEach(key => {
            this.elements[key]?.addEventListener('change', () => this.saveConfig());
        });

        // Text inputs with debounce
        const debouncedInputs = ['systemPrompt', 'userPrompt', 'apiKey'];
        debouncedInputs.forEach(key => {
            this.elements[key]?.addEventListener('input',
                Utils.debounce(() => this.saveConfig(), 500)
            );
        });

        // Persist range-based config immediately so runtime uses latest values.
        const rangeInputs = ['cameraFps', 'inferenceFps', 'imageQuality', 'temperature'];
        rangeInputs.forEach(key => {
            this.elements[key]?.addEventListener('input',
                Utils.debounce(() => this.saveConfig(), 200)
            );
        });
    },

    /**
     * Bind range input with value display
     */
    bindRangeInput(inputId, displayId, formatter) {
        const input = this.elements[inputId];
        const display = this.elements[displayId];
        if (input && display) {
            input.addEventListener('input', () => {
                display.textContent = formatter(parseFloat(input.value));
            });
        }
    },

    /**
     * Initialize keyboard shortcuts
     */
    initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ignore if typing in input
            if (e.target.matches('input, textarea, select')) return;

            // Space: Start/stop inference
            if (e.code === 'Space' && !e.repeat) {
                e.preventDefault();
                this.elements.startInference?.click();
            }

            // C: Toggle camera
            if (e.code === 'KeyC' && !e.ctrlKey && !e.metaKey) {
                this.elements.cameraToggle?.click();
            }

            // S: Screenshot
            if (e.code === 'KeyS' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                this.elements.takeScreenshot?.click();
            }

            // Escape: Stop everything
            if (e.code === 'Escape') {
                if (window.App?.isInferring) {
                    window.App.stopInference();
                }
            }

            // D: Toggle debug panel
            if (e.code === 'KeyD' && e.shiftKey) {
                e.preventDefault();
                this.elements.debugPanel?.classList.toggle('hidden');
            }

            // L: Clear results
            if (e.code === 'KeyL') {
                this.clearResults();
            }
        });
    },

    /**
     * Initialize theme
     */
    initTheme() {
        const config = Config.get();
        Config.applyTheme(config.theme);
        Config.applyLayout(config.layout);
    },

    /**
     * Load configuration into UI
     */
    loadConfig() {
        const config = Config.get();

        // API Config
        if (this.elements.backendType) this.elements.backendType.value = config.backendType;
        if (this.elements.apiUrl) this.elements.apiUrl.value = config.apiUrl;
        if (this.elements.apiKey) this.elements.apiKey.value = config.apiKey;
        if (this.elements.rememberKey) this.elements.rememberKey.checked = config.rememberKey;
        if (this.elements.modelSelect) this.elements.modelSelect.value = config.model;
        if (this.elements.modelInput) this.elements.modelInput.value = config.model || '';

        // Camera
        if (this.elements.resolution) this.elements.resolution.value = config.resolution;
        if (this.elements.cameraFps) this.elements.cameraFps.value = config.cameraFps;
        if (this.elements.cameraFpsValue) this.elements.cameraFpsValue.textContent = config.cameraFps;
        if (this.elements.inferenceFps) this.elements.inferenceFps.value = config.inferenceFps;
        if (this.elements.inferenceFpsValue) this.elements.inferenceFpsValue.textContent = config.inferenceFps.toFixed(1);

        // Image
        if (this.elements.imageSize) {
            this.elements.imageSize.value = config.imageSize;
            const isCustom = config.imageSize === 'custom';
            this.elements.customSizeGroup?.classList.toggle('hidden', !isCustom);
        }
        if (this.elements.customWidth) this.elements.customWidth.value = config.customWidth;
        if (this.elements.customHeight) this.elements.customHeight.value = config.customHeight;
        if (this.elements.imageFormat) this.elements.imageFormat.value = config.imageFormat;
        if (this.elements.imageQuality) this.elements.imageQuality.value = config.imageQuality;
        if (this.elements.imageQualityValue) this.elements.imageQualityValue.textContent = `${Math.round(config.imageQuality * 100)}%`;
        if (this.elements.resizeMode) this.elements.resizeMode.value = config.resizeMode;

        // Prompt
        if (this.elements.systemPrompt) this.elements.systemPrompt.value = config.systemPrompt;
        if (this.elements.userPrompt) this.elements.userPrompt.value = config.userPrompt;

        // Advanced
        if (this.elements.timeout) this.elements.timeout.value = config.timeout;
        if (this.elements.maxTokens) this.elements.maxTokens.value = config.maxTokens;
        if (this.elements.temperature) this.elements.temperature.value = config.temperature;
        if (this.elements.temperatureValue) this.elements.temperatureValue.textContent = config.temperature.toFixed(1);
        if (this.elements.maxRetries) this.elements.maxRetries.value = config.maxRetries;
        if (this.elements.debugMode) this.elements.debugMode.checked = config.debugMode;
        if (this.elements.thinkingMode) this.elements.thinkingMode.checked = config.thinkingMode;

        // Load prompt history
        this.updatePromptHistory();
    },

    /**
     * Update prompt history dropdown
     */
    updatePromptHistory() {
        if (!this.elements.promptHistory) return;

        const history = Config.getPromptHistory();
        this.elements.promptHistory.innerHTML = '<option value="">-- Recent Prompts --</option>';

        history.forEach((item, index) => {
            const option = document.createElement('option');
            const preview = item.userPrompt.length > 50
                ? item.userPrompt.substring(0, 50) + '...'
                : item.userPrompt;
            option.value = JSON.stringify({ systemPrompt: item.systemPrompt, userPrompt: item.userPrompt });
            option.textContent = preview;
            this.elements.promptHistory.appendChild(option);
        });
    },

    /**
     * Save UI state to config
     */
    saveConfig() {
        const selectedModel = this.elements.modelSelect?.value;
        const model = selectedModel === '__manual__'
            ? (this.elements.modelInput?.value?.trim() || '')
            : (selectedModel || '');

        const config = {
            backendType: this.elements.backendType?.value,
            apiUrl: this.elements.apiUrl?.value,
            apiKey: this.elements.apiKey?.value,
            rememberKey: this.elements.rememberKey?.checked,
            model,

            resolution: this.elements.resolution?.value,
            cameraFps: parseInt(this.elements.cameraFps?.value) || 30,
            inferenceFps: parseFloat(this.elements.inferenceFps?.value) || 1,

            imageSize: this.elements.imageSize?.value,
            customWidth: parseInt(this.elements.customWidth?.value) || 512,
            customHeight: parseInt(this.elements.customHeight?.value) || 512,
            imageFormat: this.elements.imageFormat?.value,
            imageQuality: parseFloat(this.elements.imageQuality?.value) || 0.8,
            resizeMode: this.elements.resizeMode?.value,

            systemPrompt: this.elements.systemPrompt?.value,
            userPrompt: this.elements.userPrompt?.value,

            timeout: parseInt(this.elements.timeout?.value) || 30000,
            maxTokens: parseInt(this.elements.maxTokens?.value) || 1024,
            temperature: parseFloat(this.elements.temperature?.value) || 0.7,
            maxRetries: parseInt(this.elements.maxRetries?.value) || 3,
            debugMode: this.elements.debugMode?.checked,
            thinkingMode: this.elements.thinkingMode?.checked
        };

        Config.update(config);
    },

    /**
     * Update camera devices list
     */
    async updateCameraDevices() {
        if (!this.elements.cameraSelect) return;

        try {
            const devices = await window.App?.camera?.getDevices() || [];
            this.elements.cameraSelect.innerHTML = '<option value="">-- Select Camera --</option>';
            devices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label;
                this.elements.cameraSelect.appendChild(option);
            });

            // Select saved device or first available
            const config = Config.get();
            if (config.cameraId && devices.find(d => d.deviceId === config.cameraId)) {
                this.elements.cameraSelect.value = config.cameraId;
            } else if (devices.length > 0) {
                this.elements.cameraSelect.value = devices[0].deviceId;
            }
        } catch (error) {
            console.error('Failed to get camera devices:', error);
        }
    },

    /**
     * Update model list
     */
    async updateModelList() {
        if (!this.elements.modelSelect || !window.App?.adapter) return;

        try {
            this.setConnectionStatus('pending', 'Loading models...');
            const models = await window.App.adapter.listModels();

            this.elements.modelSelect.innerHTML = '<option value="">-- Select Model --</option>';
            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model.id;
                option.textContent = model.name;
                this.elements.modelSelect.appendChild(option);
            });
            const manualOption = document.createElement('option');
            manualOption.value = '__manual__';
            manualOption.textContent = '-- Manual Input --';
            this.elements.modelSelect.appendChild(manualOption);

            // Select saved model if available
            const config = Config.get();
            if (config.model && models.find(m => m.id === config.model)) {
                this.elements.modelSelect.value = config.model;
                this.elements.modelInput?.classList.add('hidden');
            } else if (config.model) {
                this.elements.modelSelect.value = '__manual__';
                if (this.elements.modelInput) {
                    this.elements.modelInput.value = config.model;
                    this.elements.modelInput.classList.remove('hidden');
                }
            } else {
                this.elements.modelInput?.classList.add('hidden');
            }

            this.setConnectionStatus('success', `${models.length} models`);
        } catch (error) {
            console.error('Failed to get models:', error);
            this.setConnectionStatus('error', 'Failed to load');
        }
    },

    /**
     * Set connection status
     */
    setConnectionStatus(type, message) {
        const el = this.elements.connectionStatus;
        if (el) {
            el.className = `status-indicator ${type}`;
            el.textContent = message;
        }
    },

    /**
     * Update metrics display
     */
    updateMetrics(metrics) {
        if (this.elements.fpsDisplay) {
            this.elements.fpsDisplay.textContent = `FPS: ${metrics.throughput.toFixed(2)}`;
        }
        if (this.elements.latencyDisplay) {
            this.elements.latencyDisplay.textContent = `Latency: ${Utils.formatDuration(metrics.lastLatency)}`;
        }
        if (this.elements.dropRateDisplay) {
            this.elements.dropRateDisplay.textContent = `Drop Rate: ${metrics.dropRate.toFixed(1)}%`;
        }
    },

    /**
     * Add result to display
     */
    addResult(result) {
        this.results.unshift(result);
        if (this.results.length > 100) {
            this.results.pop();
        }
        this.renderResults();
    },

    /**
     * Render results
     */
    renderResults() {
        if (!this.elements.resultsContainer) return;

        if (this.results.length === 0) {
            this.elements.resultsContainer.innerHTML = `
                <div class="results-placeholder">
                    <p>Start inference to see results</p>
                </div>
            `;
            return;
        }

        const html = this.results.map((result, index) => {
            const timestamp = Utils.formatTimestamp(result.timestamp);
            const latency = Utils.formatDuration(result.latency);

            if (this.isRawView) {
                const raw = JSON.stringify(result.raw, null, 2);
                return `
                    <div class="result-item">
                        <div class="result-timestamp">
                            ${timestamp}
                            <span class="result-latency">${latency}</span>
                        </div>
                        <pre class="result-raw">${this.escapeHtml(raw)}</pre>
                    </div>
                `;
            }

            return `
                <div class="result-item">
                    <div class="result-timestamp">
                        ${timestamp}
                        <span class="result-latency">${latency}</span>
                    </div>
                    ${result.thinking ? `
                        <details class="thinking-section">
                            <summary>Thinking Process</summary>
                            <div class="thinking-content">${this.escapeHtml(result.thinking)}</div>
                        </details>
                    ` : ''}
                    <div class="result-text">${this.escapeHtml(result.text)}</div>
                </div>
            `;
        }).join('');

        this.elements.resultsContainer.innerHTML = html;
    },

    /**
     * Clear results
     */
    clearResults() {
        this.results = [];
        this.renderResults();
    },

    /**
     * Export results
     */
    exportResults(format) {
        if (this.results.length === 0) {
            this.showToast('No results to export', 'warning');
            return;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        if (format === 'json') {
            const data = JSON.stringify(this.results, null, 2);
            Utils.downloadFile(data, `vlm-results-${timestamp}.json`, 'application/json');
        } else {
            const text = this.results.map(r => {
                const ts = Utils.formatTimestamp(r.timestamp);
                return `[${ts}] (${Utils.formatDuration(r.latency)})\n${r.text}\n`;
            }).join('\n---\n\n');
            Utils.downloadFile(text, `vlm-results-${timestamp}.txt`, 'text/plain');
        }

        this.showToast(`Exported as ${format.toUpperCase()}`, 'success');
    },

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    },

    /**
     * Show debug info
     */
    showDebug(title, data) {
        if (!this.elements.debugContent || !this.elements.debugPanel) return;

        const config = Config.get();
        if (!config.debugMode) return;

        const content = `[${Utils.formatTimestamp(new Date())}] ${title}\n${JSON.stringify(data, null, 2)}`;
        this.elements.debugContent.textContent = content + '\n\n' + this.elements.debugContent.textContent;
        this.elements.debugPanel.classList.remove('hidden');
    },

    /**
     * Escape HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Export for use in other modules
window.UI = UI;
