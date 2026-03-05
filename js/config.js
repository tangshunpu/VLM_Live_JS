/**
 * Configuration management for VLM Live
 */

const Config = {
    // Default configuration
    defaults: {
        // API Settings
        backendType: 'openai-compatible',
        apiUrl: 'http://localhost:8000/v1',
        apiKey: '',
        rememberKey: false,
        model: '',

        // Camera Settings
        cameraId: '',
        resolution: '1280x720',
        cameraFps: 30,
        inferenceFps: 1,

        // Image Processing
        imageSize: '512',
        customWidth: 512,
        customHeight: 512,
        imageFormat: 'jpeg',
        imageQuality: 0.8,
        resizeMode: 'contain',

        // Prompt Settings
        systemPrompt: '',
        userPrompt: 'Describe what you see in this image.',

        // Advanced Settings
        timeout: 30000,
        maxTokens: 1024,
        temperature: 0.7,
        maxRetries: 3,
        debugMode: false,
        thinkingMode: false,

        // UI Settings
        theme: 'light',
        layout: 'horizontal',

        // Prompt History (stored separately, max 20 items)
        promptHistory: []
    },

    // Prompt templates
    promptTemplates: {
        describe: {
            system: 'You are a helpful visual assistant.',
            user: 'Describe in detail what you see in this image. Include objects, people, actions, and the overall scene.'
        },
        detect: {
            system: 'You are an object detection assistant.',
            user: 'List all objects you can identify in this image. For each object, provide its approximate location and description.'
        },
        ocr: {
            system: 'You are an OCR and text recognition assistant.',
            user: 'Extract and transcribe all visible text from this image. Preserve the approximate layout and formatting.'
        },
        changes: {
            system: 'You are a change detection assistant.',
            user: 'Analyze this image frame and describe any significant changes or movements compared to typical expectations. Focus on dynamic elements.'
        }
    },

    // Storage keys
    STORAGE_KEY: 'vlm_live_config',

    /**
     * Get current configuration
     * @returns {Object} Configuration object
     */
    get() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                return { ...this.defaults, ...parsed };
            }
        } catch (error) {
            console.warn('Failed to load config:', error);
        }
        return { ...this.defaults };
    },

    /**
     * Save configuration
     * @param {Object} config - Configuration to save
     */
    save(config) {
        try {
            // Don't persist API key unless explicitly allowed
            const toSave = { ...config };
            if (!toSave.rememberKey) {
                delete toSave.apiKey;
            }
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(toSave));
        } catch (error) {
            console.warn('Failed to save config:', error);
        }
    },

    /**
     * Update specific config values
     * @param {Object} updates - Partial config updates
     */
    update(updates) {
        const current = this.get();
        const updated = { ...current, ...updates };
        this.save(updated);
        return updated;
    },

    /**
     * Reset to defaults
     */
    reset() {
        localStorage.removeItem(this.STORAGE_KEY);
        return { ...this.defaults };
    },

    /**
     * Validate configuration
     * @param {Object} config - Configuration to validate
     * @returns {{valid: boolean, errors: string[]}}
     */
    validate(config) {
        const errors = [];

        // API URL validation
        if (config.apiUrl) {
            try {
                new URL(config.apiUrl);
            } catch {
                errors.push('Invalid API URL format');
            }
        }

        // Numeric ranges
        if (config.cameraFps < 1 || config.cameraFps > 60) {
            errors.push('Camera FPS must be between 1 and 60');
        }
        if (config.inferenceFps < 0.1 || config.inferenceFps > 10) {
            errors.push('Inference FPS must be between 0.1 and 10');
        }
        if (config.imageQuality < 0.1 || config.imageQuality > 1) {
            errors.push('Image quality must be between 0.1 and 1.0');
        }
        if (config.timeout < 1000 || config.timeout > 120000) {
            errors.push('Timeout must be between 1000ms and 120000ms');
        }
        if (config.maxTokens < 1 || config.maxTokens > 8192) {
            errors.push('Max tokens must be between 1 and 8192');
        }
        if (config.temperature < 0 || config.temperature > 2) {
            errors.push('Temperature must be between 0 and 2');
        }
        if (config.maxRetries < 0 || config.maxRetries > 10) {
            errors.push('Max retries must be between 0 and 10');
        }

        // Custom image size validation
        if (config.imageSize === 'custom') {
            if (config.customWidth < 64 || config.customWidth > 2048) {
                errors.push('Custom width must be between 64 and 2048');
            }
            if (config.customHeight < 64 || config.customHeight > 2048) {
                errors.push('Custom height must be between 64 and 2048');
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    },

    /**
     * Get prompt template by name
     * @param {string} name - Template name
     * @returns {Object|null} Template object with system and user prompts
     */
    getTemplate(name) {
        return this.promptTemplates[name] || null;
    },

    /**
     * Export configuration as JSON string
     * @param {boolean} includeApiKey - Whether to include API key
     * @returns {string}
     */
    export(includeApiKey = false) {
        const config = this.get();
        if (!includeApiKey) {
            delete config.apiKey;
        }
        return JSON.stringify(config, null, 2);
    },

    /**
     * Import configuration from JSON string
     * @param {string} jsonStr - JSON string
     * @returns {{success: boolean, error?: string}}
     */
    import(jsonStr) {
        try {
            const config = JSON.parse(jsonStr);
            const validation = this.validate(config);
            if (!validation.valid) {
                return { success: false, error: validation.errors.join(', ') };
            }
            this.save(config);
            return { success: true };
        } catch (error) {
            return { success: false, error: 'Invalid JSON format' };
        }
    },

    /**
     * Get API configuration for current backend type
     * @param {Object} config - Full config
     * @returns {Object} API config object
     */
    getApiConfig(config) {
        const { backendType, apiUrl, apiKey, model, timeout, maxTokens, temperature } = config;

        return {
            type: backendType,
            baseUrl: apiUrl,
            apiKey: apiKey || null,
            model: model,
            options: {
                timeout,
                maxTokens,
                temperature
            }
        };
    },

    /**
     * Get image processing config
     * @param {Object} config - Full config
     * @returns {Object} Image config
     */
    getImageConfig(config) {
        const { imageSize, customWidth, customHeight, imageFormat, imageQuality, resizeMode } = config;

        const size = imageSize === 'custom'
            ? { width: customWidth, height: customHeight }
            : { width: parseInt(imageSize), height: parseInt(imageSize) };

        return {
            width: size.width,
            height: size.height,
            format: imageFormat,
            quality: imageQuality,
            mode: resizeMode
        };
    },

    /**
     * Apply theme to document
     * @param {string} theme - 'light' or 'dark'
     */
    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        this.update({ theme });
    },

    /**
     * Apply layout to document
     * @param {string} layout - 'horizontal' or 'vertical'
     */
    applyLayout(layout) {
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.className = `main-content layout-${layout}`;
        }
        this.update({ layout });
    },

    /**
     * Add prompt to history
     * @param {string} systemPrompt - System prompt
     * @param {string} userPrompt - User prompt
     */
    addToPromptHistory(systemPrompt, userPrompt) {
        if (!userPrompt.trim()) return;

        const config = this.get();
        const history = config.promptHistory || [];

        // Check for duplicates
        const exists = history.some(item =>
            item.userPrompt === userPrompt && item.systemPrompt === systemPrompt
        );

        if (!exists) {
            history.unshift({
                systemPrompt,
                userPrompt,
                timestamp: Date.now()
            });

            // Keep only last 20 items
            if (history.length > 20) {
                history.pop();
            }

            this.update({ promptHistory: history });
        }
    },

    /**
     * Get prompt history
     * @returns {Array} Prompt history array
     */
    getPromptHistory() {
        return this.get().promptHistory || [];
    },

    /**
     * Clear prompt history
     */
    clearPromptHistory() {
        this.update({ promptHistory: [] });
    }
};

// Export for use in other modules
window.Config = Config;