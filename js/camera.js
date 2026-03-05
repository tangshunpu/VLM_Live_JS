/**
 * Camera module for VLM Live
 * Handles webcam access, device enumeration, and frame capture
 */

class Camera {
    constructor() {
        this.stream = null;
        this.videoElement = null;
        this.canvasElement = null;
        this.devices = [];
        this.isRunning = false;
        this.frameCallback = null;
        this.frameInterval = null;
        this.currentConfig = {
            deviceId: null,
            width: 1280,
            height: 720,
            fps: 30
        };
    }

    /**
     * Initialize camera module
     * @param {HTMLVideoElement} videoElement - Video element for preview
     * @param {HTMLCanvasElement} canvasElement - Canvas for frame capture
     */
    init(videoElement, canvasElement) {
        this.videoElement = videoElement;
        this.canvasElement = canvasElement;
    }

    /**
     * Get available camera devices
     * @returns {Promise<Array<{deviceId: string, label: string}>>}
     */
    async getDevices() {
        try {
            // Request permission first
            const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
            tempStream.getTracks().forEach(track => track.stop());

            const devices = await navigator.mediaDevices.enumerateDevices();
            this.devices = devices
                .filter(device => device.kind === 'videoinput')
                .map(device => ({
                    deviceId: device.deviceId,
                    label: device.label || `Camera ${device.deviceId.slice(0, 8)}`
                }));

            return this.devices;
        } catch (error) {
            console.error('Failed to enumerate devices:', error);
            const classified = Utils.classifyError(error);
            throw new Error(classified.message);
        }
    }

    /**
     * Start camera stream
     * @param {Object} options - Camera options
     * @param {string} options.deviceId - Device ID
     * @param {number} options.width - Video width
     * @param {number} options.height - Video height
     * @param {number} options.fps - Frame rate
     * @returns {Promise<void>}
     */
    async start(options = {}) {
        const { deviceId, width = 1280, height = 720, fps = 30 } = options;

        // Stop existing stream if running
        if (this.isRunning) {
            await this.stop();
        }

        const constraints = {
            video: {
                width: { ideal: width },
                height: { ideal: height },
                frameRate: { ideal: fps }
            }
        };

        if (deviceId) {
            constraints.video.deviceId = { exact: deviceId };
        }

        try {
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = this.stream;

            await new Promise((resolve, reject) => {
                this.videoElement.onloadedmetadata = resolve;
                this.videoElement.onerror = reject;
            });

            this.currentConfig = { deviceId, width, height, fps };
            this.isRunning = true;

            // Hide placeholder
            const placeholder = document.getElementById('video-placeholder');
            if (placeholder) {
                placeholder.classList.add('hidden');
            }
            this.videoElement.classList.remove('hidden');

        } catch (error) {
            console.error('Failed to start camera:', error);
            const classified = Utils.classifyError(error);
            throw new Error(classified.message);
        }
    }

    /**
     * Stop camera stream
     */
    async stop() {
        this.isRunning = false;

        // Stop frame capture
        this.stopFrameCapture();

        // Stop all tracks
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        // Clear video element
        if (this.videoElement) {
            this.videoElement.srcObject = null;
            this.videoElement.classList.add('hidden');
        }

        // Show placeholder
        const placeholder = document.getElementById('video-placeholder');
        if (placeholder) {
            placeholder.classList.remove('hidden');
        }
    }

    /**
     * Capture current frame
     * @param {Object} options - Capture options
     * @param {number} options.width - Target width
     * @param {number} options.height - Target height
     * @param {string} options.format - 'jpeg' or 'webp'
     * @param {number} options.quality - Quality 0.1-1.0
     * @param {string} options.mode - Resize mode
     * @returns {{dataUrl: string, base64: string, mimeType: string, width: number, height: number}}
     */
    captureFrame(options = {}) {
        if (!this.isRunning || !this.videoElement) {
            throw new Error('Camera not running');
        }

        const {
            width = 512,
            height = 512,
            format = 'jpeg',
            quality = 0.8,
            mode = 'contain'
        } = options;

        // Resize video frame to target dimensions
        const canvas = Utils.resizeImage(this.videoElement, width, height, mode);

        // Convert to base64
        const mimeType = Utils.getMimeType(format);
        const dataUrl = Utils.canvasToBase64(canvas, format, quality);
        const base64 = Utils.extractBase64(dataUrl);

        return {
            dataUrl,
            base64,
            mimeType,
            width,
            height
        };
    }

    /**
     * Get current video dimensions
     * @returns {{width: number, height: number}}
     */
    getVideoDimensions() {
        if (!this.videoElement) {
            return { width: 0, height: 0 };
        }
        return {
            width: this.videoElement.videoWidth,
            height: this.videoElement.videoHeight
        };
    }

    /**
     * Start continuous frame capture at specified interval
     * @param {Function} callback - Callback for each captured frame
     * @param {number} fps - Frames per second
     */
    startFrameCapture(callback, fps) {
        this.frameCallback = callback;
        const interval = 1000 / fps;
        this.frameInterval = setInterval(() => {
            if (this.isRunning && this.frameCallback) {
                try {
                    this.frameCallback();
                } catch (error) {
                    console.error('Frame capture error:', error);
                }
            }
        }, interval);
    }

    /**
     * Stop continuous frame capture
     */
    stopFrameCapture() {
        if (this.frameInterval) {
            clearInterval(this.frameInterval);
            this.frameInterval = null;
        }
        this.frameCallback = null;
    }

    /**
     * Take screenshot
     * @param {string} filename - Filename for download
     * @param {string} format - 'jpeg' or 'webp'
     */
    takeScreenshot(filename = 'screenshot', format = 'jpeg') {
        if (!this.isRunning) {
            throw new Error('Camera not running');
        }

        const canvas = document.createElement('canvas');
        canvas.width = this.videoElement.videoWidth;
        canvas.height = this.videoElement.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.videoElement, 0, 0);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        Utils.downloadCanvas(canvas, `${filename}-${timestamp}.${format}`, format);
    }

    /**
     * Check if camera is supported
     * @returns {boolean}
     */
    static isSupported() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }

    /**
     * Check if camera permission is granted
     * @returns {Promise<boolean>}
     */
    static async checkPermission() {
        try {
            const result = await navigator.permissions.query({ name: 'camera' });
            return result.state === 'granted';
        } catch {
            // Fallback: try to access camera
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                stream.getTracks().forEach(track => track.stop());
                return true;
            } catch {
                return false;
            }
        }
    }
}

// Export for use in other modules
window.Camera = Camera;
