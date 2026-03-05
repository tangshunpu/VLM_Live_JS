/**
 * Scheduler module for VLM Live
 * Handles real-time inference scheduling with latest-frame-first strategy
 */

class Scheduler {
    constructor() {
        this.isRunning = false;
        this.inferenceFps = 1;
        this.lastCaptureTime = 0;
        this.lastInferenceTime = 0;

        // Request state
        this.pendingRequest = null;
        this.requestInProgress = false;

        // Metrics
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            droppedFrames: 0,
            totalLatency: 0,
            lastLatency: 0,
            startTime: null
        };

        // Callbacks
        this.onResult = null;
        this.onError = null;
        this.onMetricsUpdate = null;
        this.onCapture = null;

        // References
        this.camera = null;
        this.adapter = null;
        this.config = null;
    }

    /**
     * Initialize scheduler
     * @param {Object} options
     * @param {Camera} options.camera - Camera instance
     * @param {Object} options.adapter - API adapter instance
     * @param {Object} options.config - Configuration
     */
    init(options = {}) {
        this.camera = options.camera;
        this.adapter = options.adapter;
        this.config = options.config;
    }

    /**
     * Set inference FPS
     * @param {number} fps - Frames per second (0.1 to 10)
     */
    setInferenceFps(fps) {
        this.inferenceFps = Math.max(0.1, Math.min(10, fps));
    }

    /**
     * Start inference loop
     * @param {Object} options - Inference options
     */
    start(options = {}) {
        if (this.isRunning) {
            console.warn('Scheduler already running');
            return;
        }

        this.isRunning = true;
        this.metrics.startTime = Date.now();
        this.metrics.totalRequests = 0;
        this.metrics.successfulRequests = 0;
        this.metrics.failedRequests = 0;
        this.metrics.droppedFrames = 0;
        this.metrics.totalLatency = 0;

        this.runLoop(options);
    }

    /**
     * Stop inference loop
     */
    stop() {
        this.isRunning = false;

        // Cancel pending request
        if (this.pendingRequest) {
            this.pendingRequest.abort();
            this.pendingRequest = null;
        }

        this.requestInProgress = false;
    }

    /**
     * Main run loop
     * @param {Object} options - Inference options
     */
    async runLoop(options) {
        let nextInferenceDue = Date.now();

        while (this.isRunning) {
            const interval = 1000 / this.inferenceFps;
            const now = Date.now();

            if (now < nextInferenceDue) {
                await Utils.sleep(Math.min(10, nextInferenceDue - now));
                continue;
            }

            if (this.requestInProgress) {
                // Count missed inference slots while a request is in flight.
                const missedSlots = Math.max(1, Math.floor((now - nextInferenceDue) / interval) + 1);
                this.metrics.droppedFrames += missedSlots;
                nextInferenceDue += missedSlots * interval;
                this.updateMetrics();
                continue;
            }

            await this.performInference(options);
            nextInferenceDue = Date.now() + interval;
        }
    }

    /**
     * Perform single inference
     * @param {Object} options - Inference options
     */
    async performInference(options) {
        if (!this.camera || !this.adapter) {
            console.error('Scheduler not initialized');
            return;
        }

        const captureStartTime = Date.now();

        // Capture frame
        let frameData;
        try {
            if (this.onCapture) {
                frameData = this.onCapture();
            } else {
                const imageConfig = Config.getImageConfig(this.config);
                frameData = this.camera.captureFrame(imageConfig);
            }
        } catch (error) {
            console.error('Frame capture failed:', error);
            this.metrics.failedRequests++;
            this.updateMetrics();
            return;
        }

        this.requestInProgress = true;
        this.lastCaptureTime = captureStartTime;

        const inferenceStartTime = Date.now();
        const maxRetries = this.config.maxRetries || 0;
        let lastError = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            if (!this.isRunning) break;

            try {
                if (attempt > 0) {
                    // Wait before retry with exponential backoff
                    const delay = Utils.getBackoffDelay(attempt - 1, 1000, 10000);
                    await Utils.sleep(delay);
                }

                this.metrics.totalRequests++;

                // Create abort controller for this request
                const abortController = new AbortController();
                this.pendingRequest = abortController;

                // Perform inference
                const result = await this.adapter.analyze({
                    imageBase64: frameData.base64,
                    mimeType: frameData.mimeType,
                    prompt: options.userPrompt || this.config.userPrompt,
                    systemPrompt: options.systemPrompt || this.config.systemPrompt,
                    options: {
                        maxTokens: this.config.maxTokens,
                        temperature: this.config.temperature,
                        timeout: this.config.timeout,
                        signal: abortController.signal,
                        thinkingMode: this.config.thinkingMode
                    }
                });

                const latency = Date.now() - inferenceStartTime;
                this.metrics.lastLatency = latency;
                this.metrics.totalLatency += latency;
                this.metrics.successfulRequests++;
                this.lastInferenceTime = Date.now();

                // Callback with result
                if (this.onResult) {
                    this.onResult({
                        ...result,
                        latency,
                        timestamp: new Date(),
                        frameData,
                        retryCount: attempt
                    });
                }

                lastError = null;
                break; // Success, exit retry loop

            } catch (error) {
                lastError = error;

                // Don't retry if aborted
                if (error.name === 'AbortError') {
                    console.log('Request aborted');
                    this.requestInProgress = false;
                    return;
                }

                // Don't retry on auth errors
                if (error.status === 401 || error.status === 403) {
                    break;
                }

                console.warn(`Inference attempt ${attempt + 1} failed:`, error.message);
            }
        }

        // Handle final error after all retries
        if (lastError) {
            this.metrics.failedRequests++;
            console.error('Inference error after retries:', lastError);

            if (this.onError) {
                const classified = Utils.classifyError(lastError);
                this.onError({
                    error: lastError,
                    type: classified.type,
                    message: classified.message,
                    timestamp: new Date()
                });
            }
        }

        this.requestInProgress = false;
        this.pendingRequest = null;
        this.updateMetrics();
    }

    /**
     * Update metrics callback
     */
    updateMetrics() {
        if (this.onMetricsUpdate) {
            const elapsed = this.metrics.startTime ? (Date.now() - this.metrics.startTime) / 1000 : 0;
            const throughput = elapsed > 0 ? this.metrics.successfulRequests / elapsed : 0;
            const avgLatency = this.metrics.successfulRequests > 0
                ? this.metrics.totalLatency / this.metrics.successfulRequests
                : 0;
            const dropRate = this.metrics.totalRequests > 0
                ? (this.metrics.droppedFrames / this.metrics.totalRequests * 100)
                : 0;

            this.onMetricsUpdate({
                totalRequests: this.metrics.totalRequests,
                successfulRequests: this.metrics.successfulRequests,
                failedRequests: this.metrics.failedRequests,
                droppedFrames: this.metrics.droppedFrames,
                lastLatency: this.metrics.lastLatency,
                avgLatency,
                throughput,
                dropRate,
                elapsed
            });
        }
    }

    /**
     * Get current metrics
     * @returns {Object}
     */
    getMetrics() {
        return { ...this.metrics };
    }

    /**
     * Reset metrics
     */
    resetMetrics() {
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            droppedFrames: 0,
            totalLatency: 0,
            lastLatency: 0,
            startTime: this.isRunning ? Date.now() : null
        };
        this.updateMetrics();
    }

    /**
     * Check if request is in progress
     * @returns {boolean}
     */
    isBusy() {
        return this.requestInProgress;
    }

    /**
     * Abort current request
     */
    abort() {
        if (this.pendingRequest) {
            this.pendingRequest.abort();
            this.pendingRequest = null;
            this.requestInProgress = false;
        }
    }
}

// Export for use in other modules
window.Scheduler = Scheduler;
