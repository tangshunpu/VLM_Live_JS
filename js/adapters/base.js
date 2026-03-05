/**
 * Base adapter interface for VLM backends
 */

class VLMAdapter {
    /**
     * List available models
     * @returns {Promise<Array<{id: string, name: string}>>}
     */
    async listModels() {
        throw new Error('listModels() must be implemented by subclass');
    }

    /**
     * Test connection to the backend
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async testConnection() {
        throw new Error('testConnection() must be implemented by subclass');
    }

    /**
     * Analyze image with VLM
     * @param {Object} options
     * @param {string} options.imageBase64 - Base64 encoded image
     * @param {string} options.mimeType - Image MIME type
     * @param {string} options.prompt - User prompt
     * @param {string} [options.systemPrompt] - System prompt
     * @param {Object} [options.options] - Additional options
     * @returns {Promise<{text: string, raw: Object}>}
     */
    async analyze({ imageBase64, mimeType, prompt, systemPrompt, options }) {
        throw new Error('analyze() must be implemented by subclass');
    }

    /**
     * Abort current request
     */
    abort() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }

    /**
     * Create abort controller for request
     * @param {AbortSignal} [signal] - External abort signal
     * @returns {AbortController}
     */
    createAbortController(signal) {
        this.abortController = new AbortController();

        // Link external signal if provided
        if (signal) {
            signal.addEventListener('abort', () => {
                this.abortController?.abort();
            });
        }

        return this.abortController;
    }

    /**
     * Build error from response
     * @param {Response} response - Fetch response
     * @returns {Promise<Error>}
     */
    async buildError(response) {
        let message = `HTTP ${response.status}: ${response.statusText}`;
        try {
            const body = await response.json();
            if (body.error?.message) {
                message = body.error.message;
            } else if (body.message) {
                message = body.message;
            }
        } catch {
            // Ignore JSON parse errors
        }

        const error = new Error(message);
        error.status = response.status;
        return error;
    }
}

// Export for use in other modules
window.VLMAdapter = VLMAdapter;