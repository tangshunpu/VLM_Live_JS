/**
 * Utility functions for VLM Live
 */

const Utils = {
    /**
     * Debounce function execution
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in ms
     * @returns {Function}
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Throttle function execution
     * @param {Function} func - Function to throttle
     * @param {number} limit - Minimum time between calls in ms
     * @returns {Function}
     */
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    /**
     * Format timestamp to human readable string
     * @param {Date|number} date - Date object or timestamp
     * @returns {string}
     */
    formatTimestamp(date) {
        const d = date instanceof Date ? date : new Date(date);
        return d.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3
        });
    },

    /**
     * Format duration in milliseconds to human readable
     * @param {number} ms - Duration in milliseconds
     * @returns {string}
     */
    formatDuration(ms) {
        if (ms < 1000) return `${Math.round(ms)}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.round((ms % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    },

    /**
     * Format file size in bytes to human readable
     * @param {number} bytes - Size in bytes
     * @returns {string}
     */
    formatFileSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    },

    /**
     * Resize image using canvas
     * @param {HTMLVideoElement|HTMLImageElement|HTMLCanvasElement} source - Source element
     * @param {number} targetWidth - Target width
     * @param {number} targetHeight - Target height
     * @param {string} mode - 'contain', 'cover', or 'center-crop'
     * @returns {HTMLCanvasElement}
     */
    resizeImage(source, targetWidth, targetHeight, mode = 'contain') {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        const sourceWidth = source.videoWidth || source.naturalWidth || source.width;
        const sourceHeight = source.videoHeight || source.naturalHeight || source.height;

        let drawWidth, drawHeight, offsetX = 0, offsetY = 0;

        if (mode === 'contain') {
            // Fit within bounds, maintain aspect ratio
            const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
            drawWidth = sourceWidth * scale;
            drawHeight = sourceHeight * scale;
            offsetX = (targetWidth - drawWidth) / 2;
            offsetY = (targetHeight - drawHeight) / 2;
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, targetWidth, targetHeight);
        } else if (mode === 'cover' || mode === 'center-crop') {
            // Fill bounds, crop excess
            const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
            drawWidth = sourceWidth * scale;
            drawHeight = sourceHeight * scale;
            offsetX = (targetWidth - drawWidth) / 2;
            offsetY = (targetHeight - drawHeight) / 2;
        } else {
            drawWidth = targetWidth;
            drawHeight = targetHeight;
        }

        ctx.drawImage(source, offsetX, offsetY, drawWidth, drawHeight);
        return canvas;
    },

    /**
     * Convert canvas to base64 data URL
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @param {string} format - 'jpeg' or 'webp'
     * @param {number} quality - Quality 0.1 to 1.0
     * @returns {string} Base64 data URL
     */
    canvasToBase64(canvas, format = 'jpeg', quality = 0.8) {
        const mimeType = format === 'webp' ? 'image/webp' : 'image/jpeg';
        return canvas.toDataURL(mimeType, quality);
    },

    /**
     * Extract base64 data from data URL
     * @param {string} dataUrl - Data URL
     * @returns {string} Base64 string without prefix
     */
    extractBase64(dataUrl) {
        const base64Prefix = 'base64,';
        const index = dataUrl.indexOf(base64Prefix);
        return index !== -1 ? dataUrl.substring(index + base64Prefix.length) : dataUrl;
    },

    /**
     * Get MIME type from format string
     * @param {string} format - 'jpeg' or 'webp'
     * @returns {string}
     */
    getMimeType(format) {
        return format === 'webp' ? 'image/webp' : 'image/jpeg';
    },

    /**
     * Classify error type for user-friendly messages
     * @param {Error} error - Error object
     * @returns {{type: string, message: string}}
     */
    classifyError(error) {
        const errorMap = {
            'NetworkError': { type: 'network', message: 'Network connection failed' },
            'TypeError': { type: 'network', message: 'Failed to connect to server' },
            'AbortError': { type: 'timeout', message: 'Request timed out' },
            'NotAllowedError': { type: 'permission', message: 'Camera permission denied' },
            'NotFoundError': { type: 'device', message: 'Camera not found' },
            'NotReadableError': { type: 'device', message: 'Camera is in use by another application' },
            'OverconstrainedError': { type: 'device', message: 'Camera does not support requested settings' }
        };

        // Check for HTTP status errors
        if (error.status) {
            if (error.status === 401 || error.status === 403) {
                return { type: 'auth', message: 'Authentication failed. Check your API key.' };
            }
            if (error.status === 404) {
                return { type: 'notfound', message: 'Endpoint not found. Check the API URL.' };
            }
            if (error.status >= 500) {
                return { type: 'server', message: 'Server error. Please try again later.' };
            }
        }

        // Check for network errors
        if (error.message?.includes('fetch')) {
            return { type: 'network', message: 'Network error. Check your connection.' };
        }

        if (error.message?.includes('CORS')) {
            return { type: 'cors', message: 'CORS error. The server may not allow browser requests.' };
        }

        // Check error name
        if (errorMap[error.name]) {
            return errorMap[error.name];
        }

        return { type: 'unknown', message: error.message || 'An unexpected error occurred' };
    },

    /**
     * Sleep for specified duration
     * @param {number} ms - Duration in milliseconds
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Generate unique ID
     * @returns {string}
     */
    generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    },

    /**
     * Deep clone object
     * @param {Object} obj - Object to clone
     * @returns {Object}
     */
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    /**
     * Safely parse JSON
     * @param {string} str - JSON string
     * @param {*} fallback - Fallback value if parsing fails
     * @returns {*}
     */
    safeJsonParse(str, fallback = null) {
        try {
            return JSON.parse(str);
        } catch {
            return fallback;
        }
    },

    /**
     * Download data as file
     * @param {string} data - Data to download
     * @param {string} filename - File name
     * @param {string} type - MIME type
     */
    downloadFile(data, filename, type = 'application/json') {
        const blob = new Blob([data], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /**
     * Download canvas as image
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @param {string} filename - File name
     * @param {string} format - 'jpeg' or 'webp'
     */
    downloadCanvas(canvas, filename, format = 'jpeg') {
        const mimeType = format === 'webp' ? 'image/webp' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(mimeType, 0.95);
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    },

    /**
     * Create exponential backoff delay
     * @param {number} attempt - Current attempt number (0-indexed)
     * @param {number} baseDelay - Base delay in ms
     * @param {number} maxDelay - Maximum delay in ms
     * @returns {number} Delay in ms
     */
    getBackoffDelay(attempt, baseDelay = 1000, maxDelay = 30000) {
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        // Add jitter
        return delay + Math.random() * 1000;
    }
};

// Export for use in other modules
window.Utils = Utils;