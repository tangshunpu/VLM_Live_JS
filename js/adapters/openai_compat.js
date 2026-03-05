/**
 * OpenAI Compatible Adapter for VLM Live
 * Supports OpenAI, vLLM, and other OpenAI-compatible endpoints
 */

class OpenAICompatAdapter extends VLMAdapter {
    /**
     * Create OpenAI compatible adapter
     * @param {Object} config
     * @param {string} config.baseUrl - API base URL
     * @param {string} [config.apiKey] - API key
     * @param {string} [config.model] - Model name
     */
    constructor(config = {}) {
        super();
        this.baseUrl = config.baseUrl?.replace(/\/+$/, '') || 'http://localhost:8000/v1';
        this.apiKey = config.apiKey || null;
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
        if (config.apiKey !== undefined) {
            this.apiKey = config.apiKey || null;
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

        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        return headers;
    }

    /**
     * List available models
     * @returns {Promise<Array<{id: string, name: string}>>}
     */
    async listModels() {
        try {
            const response = await fetch(`${this.baseUrl}/models`, {
                method: 'GET',
                headers: this.buildHeaders({ includeContentType: false })
            });

            if (!response.ok) {
                throw await this.buildError(response);
            }

            const data = await response.json();

            // OpenAI format: { data: [{ id: "...", object: "model", ... }, ...] }
            if (data.data && Array.isArray(data.data)) {
                return data.data.map(model => ({
                    id: model.id,
                    name: model.id
                }));
            }

            // Alternative format: { models: [...] }
            if (data.models && Array.isArray(data.models)) {
                return data.models.map(model => ({
                    id: model.id || model,
                    name: model.id || model
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
     * @param {string} options.mimeType - Image MIME type
     * @param {string} options.prompt - User prompt
     * @param {string} [options.systemPrompt] - System prompt
     * @param {Object} [options.options] - Additional options
     * @param {number} [options.options.maxTokens] - Max tokens
     * @param {number} [options.options.temperature] - Temperature
     * @param {number} [options.options.timeout] - Request timeout
     * @param {AbortSignal} [options.options.signal] - Abort signal
     * @param {boolean} [options.options.thinkingMode] - Enable thinking mode
     * @returns {Promise<{text: string, thinking?: string, raw: Object}>}
     */
    async analyze({ imageBase64, mimeType, prompt, systemPrompt, options = {} }) {
        const {
            maxTokens = 1024,
            temperature = 0.7,
            timeout = 30000,
            signal,
            thinkingMode = false
        } = options;

        // Create abort controller with timeout
        const abortController = this.createAbortController(signal);
        let timedOut = false;
        const timeoutId = setTimeout(() => {
            timedOut = true;
            abortController.abort();
        }, timeout);

        try {
            // Build messages
            const messages = [];

            // Add system prompt if provided
            if (systemPrompt) {
                messages.push({
                    role: 'system',
                    content: systemPrompt
                });
            }

            // Build user content
            const userContent = [
                {
                    type: 'image_url',
                    image_url: {
                        url: `data:${mimeType};base64,${imageBase64}`
                    }
                },
                {
                    type: 'text',
                    text: prompt
                }
            ];

            messages.push({
                role: 'user',
                content: userContent
            });

            // Build request body
            const body = {
                model: this.model,
                messages,
                max_tokens: maxTokens,
                temperature
            };

            // Add thinking mode support for different model providers
            if (thinkingMode) {
                // For DeepSeek R1 / Qwen models that use <think> tags
                // The model should naturally output thinking in <think>...</think> tags
                // Some APIs also support explicit reasoning parameters
                body.extra_body = {
                    include_reasoning: true
                };
            }

            const response = await fetch(`${this.baseUrl}/chat/completions`, {
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

            // Extract text and thinking from response
            const fullContent = data.choices?.[0]?.message?.content || '';

            // Parse thinking content if present
            let text = fullContent;
            let thinking = null;

            // Check for <think> tags (DeepSeek R1, Qwen style)
            const thinkMatch = fullContent.match(/<think>([\s\S]*?)<\/think>/);
            if (thinkMatch) {
                thinking = thinkMatch[1].trim();
                text = fullContent.replace(/<think>[\s\S]*?<\/think>/, '').trim();
            }

            // Check for <reasoning> tags (alternative format)
            const reasoningMatch = fullContent.match(/<reasoning>([\s\S]*?)<\/reasoning>/);
            if (reasoningMatch && !thinking) {
                thinking = reasoningMatch[1].trim();
                text = fullContent.replace(/<reasoning>[\s\S]*?<\/reasoning>/, '').trim();
            }

            // Some APIs return reasoning_content separately
            if (data.choices?.[0]?.message?.reasoning_content) {
                thinking = data.choices[0].message.reasoning_content;
            }

            const result = {
                text,
                raw: data
            };

            if (thinking) {
                result.thinking = thinking;
            }

            return result;

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
    async analyzeStream({ imageBase64, mimeType, prompt, systemPrompt, options = {} }, onChunk) {
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
            const messages = [];

            if (systemPrompt) {
                messages.push({
                    role: 'system',
                    content: systemPrompt
                });
            }

            messages.push({
                role: 'user',
                content: [
                    {
                        type: 'image_url',
                        image_url: {
                            url: `data:${mimeType};base64,${imageBase64}`
                        }
                    },
                    {
                        type: 'text',
                        text: prompt
                    }
                ]
            });

            const body = {
                model: this.model,
                messages,
                max_tokens: maxTokens,
                temperature,
                stream: true
            };

            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: this.buildHeaders(),
                body: JSON.stringify(body),
                signal: abortController.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw await this.buildError(response);
            }

            // Handle streaming response
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            const chunks = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                chunks.push(chunk);

                // Parse SSE format
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;

                        try {
                            const parsed = JSON.parse(data);
                            const content = parsed.choices?.[0]?.delta?.content || '';
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
}

// Export for use in other modules
window.OpenAICompatAdapter = OpenAICompatAdapter;
