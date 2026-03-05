/**
 * Ollama Adapter for VLM Live
 * Supports Ollama API endpoints
 */

class OllamaAdapter extends VLMAdapter {
    /**
     * Create Ollama adapter
     * @param {Object} config
     * @param {string} config.baseUrl - Ollama API base URL
     * @param {string} [config.model] - Model name
     */
    constructor(config = {}) {
        super();
        this.baseUrl = config.baseUrl?.replace(/\/+$/, '') || 'http://localhost:11434';
        this.model = config.model || null;
        this.abortController = null;
    }

    /**
     * Set configuration
     * @param {Object} config
     */
    setConfig(config) {
        if (config.baseUrl) {
            this.baseUrl = config.baseUrl.replace(/\/+$/, '');
        }
        if (config.model !== undefined) {
            this.model = config.model || null;
        }
    }

    /**
     * Build headers for request
     * @returns {Object}
     */
    buildHeaders(options = {}) {
        const { includeContentType = true } = options;
        const headers = {};
        if (includeContentType) {
            headers['Content-Type'] = 'application/json';
        }
        return headers;
    }

    /**
     * List available models
     * @returns {Promise<Array<{id: string, name: string}>>}
     */
    async listModels() {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`, {
                method: 'GET',
                headers: this.buildHeaders({ includeContentType: false })
            });

            if (!response.ok) {
                throw await this.buildError(response);
            }

            const data = await response.json();

            // Ollama format: { models: [{ name: "...", ... }, ...] }
            if (data.models && Array.isArray(data.models)) {
                return data.models.map(model => ({
                    id: model.name,
                    name: model.name,
                    details: model.details
                }));
            }

            return [];
        } catch (error) {
            console.error('Failed to list models:', error);
            throw error;
        }
    }

    /**
     * Test connection to the backend
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async testConnection() {
        try {
            const models = await this.listModels();
            return {
                success: true,
                message: `Connected. ${models.length} model(s) available.`
            };
        } catch (error) {
            return {
                success: false,
                message: error.message || 'Connection failed'
            };
        }
    }

    /**
     * Analyze image with VLM
     * @param {Object} options
     * @param {string} options.imageBase64 - Base64 encoded image
     * @param {string} options.mimeType - Image MIME type (not used in Ollama)
     * @param {string} options.prompt - User prompt
     * @param {string} [options.systemPrompt] - System prompt
     * @param {Object} [options.options] - Additional options
     * @returns {Promise<{text: string, raw: Object}>}
     */
    async analyze({ imageBase64, prompt, systemPrompt, options = {} }) {
        const {
            maxTokens = 1024,
            temperature = 0.7,
            timeout = 30000,
            signal
        } = options;

        // Create abort controller with timeout
        const abortController = this.createAbortController(signal);
        let timedOut = false;
        const timeoutId = setTimeout(() => {
            timedOut = true;
            abortController.abort();
        }, timeout);

        try {
            // Build request body for Ollama chat API
            const body = {
                model: this.model,
                messages: [],
                options: {
                    num_predict: maxTokens,
                    temperature
                }
            };

            // Add system prompt if provided
            if (systemPrompt) {
                body.messages.push({
                    role: 'system',
                    content: systemPrompt
                });
            }

            // Add user message with image
            body.messages.push({
                role: 'user',
                content: prompt,
                images: [imageBase64]
            });

            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: this.buildHeaders(),
                body: JSON.stringify(body),
                signal: abortController.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw await this.buildError(response);
            }

            const data = await response.json();

            // Extract text from response
            // Ollama format: { message: { role: "assistant", content: "..." }, ... }
            const text = data.message?.content || '';

            return {
                text,
                raw: data
            };

        } catch (error) {
            clearTimeout(timeoutId);

            // Handle abort
            if (error.name === 'AbortError') {
                if (timedOut) {
                    const timeoutError = new Error('Request timed out');
                    timeoutError.name = 'TimeoutError';
                    throw timeoutError;
                }
                const abortError = new Error('Request aborted');
                abortError.name = 'AbortError';
                throw abortError;
            }

            throw error;
        }
    }

    /**
     * Analyze with streaming response
     * @param {Object} options - Same as analyze
     * @param {Function} onChunk - Callback for each chunk
     * @returns {Promise<{text: string, raw: Object}>}
     */
    async analyzeStream({ imageBase64, prompt, systemPrompt, options = {} }, onChunk) {
        const {
            maxTokens = 1024,
            temperature = 0.7,
            timeout = 30000,
            signal
        } = options;

        const abortController = this.createAbortController(signal);
        let timedOut = false;
        const timeoutId = setTimeout(() => {
            timedOut = true;
            abortController.abort();
        }, timeout);

        try {
            const body = {
                model: this.model,
                messages: [],
                options: {
                    num_predict: maxTokens,
                    temperature
                },
                stream: true
            };

            if (systemPrompt) {
                body.messages.push({
                    role: 'system',
                    content: systemPrompt
                });
            }

            body.messages.push({
                role: 'user',
                content: prompt,
                images: [imageBase64]
            });

            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: this.buildHeaders(),
                body: JSON.stringify(body),
                signal: abortController.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw await this.buildError(response);
            }

            // Handle streaming response (newline-delimited JSON)
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            const chunks = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                chunks.push(chunk);

                // Parse NDJSON format
                const lines = chunk.split('\n').filter(line => line.trim());
                for (const line of lines) {
                    try {
                        const parsed = JSON.parse(line);
                        const content = parsed.message?.content || '';
                        if (content) {
                            fullText += content;
                            if (onChunk) {
                                onChunk(content, fullText);
                            }
                        }
                    } catch {
                        // Ignore parse errors
                    }
                }
            }

            return {
                text: fullText,
                raw: { chunks }
            };

        } catch (error) {
            clearTimeout(timeoutId);

            if (error.name === 'AbortError') {
                if (timedOut) {
                    const timeoutError = new Error('Request timed out');
                    timeoutError.name = 'TimeoutError';
                    throw timeoutError;
                }
                const abortError = new Error('Request aborted');
                abortError.name = 'AbortError';
                throw abortError;
            }

            throw error;
        }
    }

    /**
     * Get model info
     * @param {string} modelName - Model name
     * @returns {Promise<Object>}
     */
    async getModelInfo(modelName) {
        const response = await fetch(`${this.baseUrl}/api/show`, {
            method: 'POST',
            headers: this.buildHeaders(),
            body: JSON.stringify({ name: modelName || this.model })
        });

        if (!response.ok) {
            throw await this.buildError(response);
        }

        return response.json();
    }

    /**
     * Pull/download a model
     * @param {string} modelName - Model name
     * @param {Function} [onProgress] - Progress callback
     * @returns {Promise<void>}
     */
    async pullModel(modelName, onProgress) {
        const response = await fetch(`${this.baseUrl}/api/pull`, {
            method: 'POST',
            headers: this.buildHeaders(),
            body: JSON.stringify({ name: modelName, stream: true })
        });

        if (!response.ok) {
            throw await this.buildError(response);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim());

            for (const line of lines) {
                try {
                    const data = JSON.parse(line);
                    if (onProgress) {
                        onProgress(data);
                    }
                } catch {
                    // Ignore parse errors
                }
            }
        }
    }
}

// Export for use in other modules
window.OllamaAdapter = OllamaAdapter;
