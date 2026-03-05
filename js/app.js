/**
 * Main Application Entry for VLM Live
 */

const App = {
    // State
    isRunning: false,
    isInferring: false,

    // Components
    camera: null,
    scheduler: null,
    adapter: null,

    // Config
    config: null,

    /**
     * Initialize application
     */
    async init() {
        console.log('VLM Live initializing...');

        // Load config
        this.config = Config.get();

        // Initialize UI
        UI.init();

        // Initialize camera
        this.initCamera();

        // Initialize scheduler
        this.initScheduler();

        // Initialize adapter
        this.initAdapter();

        // Bind main events
        this.bindEvents();

        // Update camera devices
        await UI.updateCameraDevices();

        console.log('VLM Live ready');
    },

    /**
     * Initialize camera component
     */
    initCamera() {
        this.camera = new Camera();
        this.camera.init(
            document.getElementById('video-preview'),
            document.getElementById('capture-canvas')
        );
    },

    /**
     * Initialize scheduler
     */
    initScheduler() {
        this.scheduler = new Scheduler();
        this.scheduler.init({
            camera: this.camera,
            adapter: this.adapter,
            config: this.config
        });

        // Set callbacks
        this.scheduler.onResult = (result) => {
            UI.addResult(result);
            UI.showDebug('Result', result.raw);
        };

        this.scheduler.onError = (error) => {
            UI.showToast(error.message, 'error');
            UI.showDebug('Error', error);
        };

        this.scheduler.onMetricsUpdate = (metrics) => {
            UI.updateMetrics(metrics);
        };
    },

    /**
     * Initialize API adapter
     */
    initAdapter() {
        const { backendType, apiUrl, apiKey, model } = this.config;

        if (backendType === 'ollama') {
            this.adapter = new OllamaAdapter({
                baseUrl: apiUrl,
                model
            });
        } else {
            // OpenAI compatible (includes vLLM)
            this.adapter = new OpenAICompatAdapter({
                baseUrl: apiUrl,
                apiKey,
                model
            });
        }

        // Update scheduler adapter reference
        if (this.scheduler) {
            this.scheduler.adapter = this.adapter;
        }
    },

    /**
     * Bind main application events
     */
    bindEvents() {
        // Camera toggle
        document.getElementById('camera-toggle')?.addEventListener('click', () => {
            this.toggleCamera();
        });

        // Start/stop inference
        document.getElementById('start-inference')?.addEventListener('click', () => {
            this.toggleInference();
        });

        // Test connection
        document.getElementById('test-connection')?.addEventListener('click', () => {
            this.testConnection();
        });

        // Refresh models
        document.getElementById('refresh-models')?.addEventListener('click', () => {
            UI.updateModelList();
        });

        // Screenshot
        document.getElementById('take-screenshot')?.addEventListener('click', () => {
            this.takeScreenshot();
        });

        // Backend type change
        document.getElementById('backend-type')?.addEventListener('change', (e) => {
            this.onBackendChange(e.target.value);
        });

        // Model select change
        document.getElementById('model-select')?.addEventListener('change', (e) => {
            const modelInput = document.getElementById('model-input');
            if (e.target.value === '__manual__') {
                modelInput?.classList.remove('hidden');
                const manualModel = modelInput?.value?.trim() || '';
                if (this.adapter) {
                    this.adapter.setConfig({ model: manualModel });
                }
            } else {
                modelInput?.classList.add('hidden');
                if (this.adapter) {
                    this.adapter.setConfig({ model: e.target.value });
                }
            }
            UI.saveConfig();
        });

        // Manual model input
        document.getElementById('model-input')?.addEventListener('input', (e) => {
            if (this.adapter) {
                this.adapter.setConfig({ model: e.target.value.trim() });
            }
            UI.saveConfig();
        });

        // Camera select change
        document.getElementById('camera-select')?.addEventListener('change', (e) => {
            Config.update({ cameraId: e.target.value });
        });

        // API URL change
        document.getElementById('api-url')?.addEventListener('change', (e) => {
            if (this.adapter) {
                this.adapter.setConfig({ baseUrl: e.target.value });
            }
        });

        // API Key change
        document.getElementById('api-key')?.addEventListener('change', (e) => {
            if (this.adapter) {
                this.adapter.setConfig({ apiKey: e.target.value });
            }
        });

        // Inference FPS change
        document.getElementById('inference-fps')?.addEventListener('input', (e) => {
            if (this.scheduler) {
                this.scheduler.setInferenceFps(parseFloat(e.target.value));
            }
        });

        // Window unload
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    },

    /**
     * Handle backend type change
     */
    onBackendChange(backendType) {
        // Update default URLs
        const apiUrlInput = document.getElementById('api-url');
        const apiKeyGroup = document.getElementById('api-key')?.closest('.form-group');
        let nextApiUrl = apiUrlInput?.value || '';

        if (backendType === 'ollama') {
            if (apiUrlInput && !apiUrlInput.value.includes('11434')) {
                nextApiUrl = 'http://localhost:11434';
                apiUrlInput.value = nextApiUrl;
            }
            if (apiKeyGroup) apiKeyGroup.style.display = 'none';
        } else if (backendType === 'vllm') {
            if (apiUrlInput && !apiUrlInput.value.includes('8000')) {
                nextApiUrl = 'http://localhost:8000/v1';
                apiUrlInput.value = nextApiUrl;
            }
            if (apiKeyGroup) apiKeyGroup.style.display = 'block';
        } else {
            if (apiUrlInput && !apiUrlInput.value.includes('v1')) {
                nextApiUrl = 'http://localhost:8000/v1';
                apiUrlInput.value = nextApiUrl;
            }
            if (apiKeyGroup) apiKeyGroup.style.display = 'block';
        }

        // Persist backend/url changes before rebuilding adapter.
        this.config = Config.update({
            backendType,
            apiUrl: nextApiUrl
        });
        this.initAdapter();

        // Update model list
        UI.updateModelList();
    },

    /**
     * Toggle camera on/off
     */
    async toggleCamera() {
        const btn = document.getElementById('camera-toggle');
        const startBtn = document.getElementById('start-inference');
        const screenshotBtn = document.getElementById('take-screenshot');

        if (this.isRunning) {
            // Stop camera
            await this.camera.stop();
            this.isRunning = false;
            btn.textContent = 'Start Camera';
            btn.classList.remove('btn-danger');
            btn.classList.add('btn-primary');
            startBtn.disabled = true;
            screenshotBtn.disabled = true;
            UI.showToast('Camera stopped', 'info');
        } else {
            // Start camera
            try {
                const deviceId = document.getElementById('camera-select')?.value;
                const resolution = document.getElementById('resolution')?.value.split('x');
                const fps = parseInt(document.getElementById('camera-fps')?.value) || 30;

                await this.camera.start({
                    deviceId: deviceId || undefined,
                    width: parseInt(resolution[0]) || 1280,
                    height: parseInt(resolution[1]) || 720,
                    fps
                });

                this.isRunning = true;
                btn.textContent = 'Stop Camera';
                btn.classList.remove('btn-primary');
                btn.classList.add('btn-danger');
                startBtn.disabled = false;
                screenshotBtn.disabled = false;
                UI.showToast('Camera started', 'success');
            } catch (error) {
                UI.showToast(error.message, 'error');
            }
        }
    },

    /**
     * Toggle inference on/off
     */
    async toggleInference() {
        const btn = document.getElementById('start-inference');

        if (this.isInferring) {
            this.stopInference();
            btn.textContent = 'Start Inference';
            btn.classList.remove('btn-danger');
            btn.classList.add('btn-success');
        } else {
            // Validate model
            const modelSelect = document.getElementById('model-select')?.value;
            const manualModel = document.getElementById('model-input')?.value?.trim() || '';
            const model = modelSelect === '__manual__' ? manualModel : modelSelect;
            if (!model) {
                UI.showToast('Please select a model first', 'warning');
                return;
            }

            await this.startInference();
            btn.textContent = 'Stop Inference';
            btn.classList.remove('btn-success');
            btn.classList.add('btn-danger');
        }
    },

    /**
     * Start inference
     */
    async startInference() {
        if (!this.isRunning) {
            UI.showToast('Please start camera first', 'warning');
            return;
        }

        // Update config
        this.config = Config.get();

        // Update scheduler config
        this.scheduler.config = this.config;
        this.scheduler.setInferenceFps(this.config.inferenceFps);

        // Update adapter config
        this.adapter.setConfig({
            baseUrl: this.config.apiUrl,
            apiKey: this.config.apiKey,
            model: this.config.model
        });

        // Set custom capture handler
        const imageConfig = Config.getImageConfig(this.config);
        this.scheduler.onCapture = () => {
            return this.camera.captureFrame(imageConfig);
        };

        // Start scheduler
        this.scheduler.start({
            userPrompt: this.config.userPrompt,
            systemPrompt: this.config.systemPrompt
        });

        // Save prompt to history
        Config.addToPromptHistory(this.config.systemPrompt, this.config.userPrompt);
        UI.updatePromptHistory();

        this.isInferring = true;
        UI.showToast('Inference started', 'success');
    },

    /**
     * Stop inference
     */
    stopInference() {
        if (this.scheduler) {
            this.scheduler.stop();
        }
        this.isInferring = false;
        UI.showToast('Inference stopped', 'info');
    },

    /**
     * Test API connection
     */
    async testConnection() {
        const btn = document.getElementById('test-connection');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Testing...';

        // Update adapter config
        const apiUrl = document.getElementById('api-url')?.value;
        const apiKey = document.getElementById('api-key')?.value;
        const modelSelect = document.getElementById('model-select')?.value;
        const manualModel = document.getElementById('model-input')?.value?.trim() || '';
        const model = modelSelect === '__manual__' ? manualModel : modelSelect;

        this.adapter.setConfig({ baseUrl: apiUrl, apiKey, model });

        try {
            const result = await this.adapter.testConnection();
            UI.setConnectionStatus(result.success ? 'success' : 'error', result.message);
            UI.showToast(result.message, result.success ? 'success' : 'error');

            if (result.success) {
                UI.updateModelList();
            }
        } catch (error) {
            UI.setConnectionStatus('error', error.message);
            UI.showToast(error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Test Connection';
        }
    },

    /**
     * Take screenshot
     */
    takeScreenshot() {
        if (!this.isRunning) {
            UI.showToast('Camera not running', 'warning');
            return;
        }

        try {
            this.camera.takeScreenshot('vlm-screenshot', 'jpeg');
            UI.showToast('Screenshot saved', 'success');
        } catch (error) {
            UI.showToast('Failed to take screenshot', 'error');
        }
    },

    /**
     * Cleanup on unload
     */
    cleanup() {
        this.stopInference();
        if (this.isRunning) {
            this.camera.stop();
        }
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Export for use in other modules
window.App = App;
