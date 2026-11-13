/**
 * Lightweight HTTP and Socket.IO Client for E2E Testing
 * Built with native Node.js fetch and http/https - zero external test dependencies.
 */
const http = require('http');
const https = require('https');

class HttpClient {
    constructor(baseUrl = '', options = {}) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.defaultHeaders = { ...(options.defaultHeaders || {}) };
        if (options.cookie) {
            this.setCookie(options.cookie);
        }
    }

    setBaseUrl(baseUrl) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }

    setCookie(cookieStr) {
        if (cookieStr) {
            this.defaultHeaders['cookie'] = String(cookieStr);
        } else {
            this.clearCookie();
        }
    }

    getCookie() {
        return this.defaultHeaders['cookie'] || '';
    }

    clearCookie() {
        delete this.defaultHeaders['cookie'];
    }

    async request(method, path, options = {}) {
        const url = path.startsWith('http://') || path.startsWith('https://')
            ? path
            : `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;

        const headers = { ...this.defaultHeaders };
        if (options.anonymous) {
            delete headers.cookie;
            delete headers.Cookie;
        }
        if (options.headers) {
            for (const [k, v] of Object.entries(options.headers)) {
                if (v === undefined || v === null) {
                    delete headers[k];
                    delete headers[k.toLowerCase()];
                } else {
                    headers[k] = v;
                }
            }
        }
        let body = options.body;

        if (body && typeof body === 'object' && !(body instanceof Buffer)) {
            headers['content-type'] = headers['content-type'] || headers['Content-Type'] || 'application/json';
            body = JSON.stringify(body);
        }

        const controller = new AbortController();
        const timeoutMs = options.timeout || 15000;
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const res = await fetch(url, {
                method,
                headers,
                body: ['GET', 'HEAD'].includes(method.toUpperCase()) ? undefined : body,
                signal: controller.signal
            });

            const rawText = await res.text();
            let parsedBody = null;
            try {
                parsedBody = JSON.parse(rawText);
            } catch {
                parsedBody = rawText;
            }

            return {
                status: res.status,
                ok: res.ok,
                headers: Object.fromEntries(res.headers.entries()),
                body: parsedBody,
                rawText
            };
        } catch (err) {
            if (err.name === 'AbortError') {
                throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
            }
            throw err;
        } finally {
            clearTimeout(timer);
        }
    }

    get(path, options = {}) {
        return this.request('GET', path, options);
    }

    post(path, body, options = {}) {
        return this.request('POST', path, { ...options, body });
    }

    put(path, body, options = {}) {
        return this.request('PUT', path, { ...options, body });
    }

    delete(path, options = {}) {
        return this.request('DELETE', path, options);
    }
}

/**
 * Lightweight Socket.IO / Engine.IO v4 client using HTTP long-polling.
 * Zero external dependency.
 */
class SocketIoClient {
    constructor(serverUrl, options = {}) {
        this.serverUrl = serverUrl.replace(/\/$/, '');
        this.sid = null;
        this.pingInterval = 25000;
        this.isPolling = false;
        this.listeners = new Map();
        this.abortController = new AbortController();
        this.packetBuffer = [];
        this.headers = { ...(options.headers || {}) };
        if (options.cookie) {
            this.headers['cookie'] = String(options.cookie);
        }
    }

    async connect(timeoutMs = 5000) {
        const startTime = Date.now();
        // Step 1: Handshake
        const handshakeUrl = `${this.serverUrl}/socket.io/?EIO=4&transport=polling`;
        const res = await fetch(handshakeUrl, {
            headers: this.headers,
            signal: this.abortController.signal
        });
        const text = await res.text();
        
        // Handshake packet begins with 0
        if (!text.startsWith('0')) {
            throw new Error(`Unexpected Socket.IO handshake response: ${text.slice(0, 100)}`);
        }
        
        const payload = JSON.parse(text.slice(1));
        this.sid = payload.sid;
        this.pingInterval = payload.pingInterval || 25000;

        // Step 2: Send Socket.IO connection packet (40)
        const connectUrl = `${this.serverUrl}/socket.io/?EIO=4&transport=polling&sid=${this.sid}`;
        await fetch(connectUrl, {
            method: 'POST',
            body: '40',
            headers: { ...this.headers, 'Content-Type': 'text/plain;charset=UTF-8' },
            signal: this.abortController.signal
        });

        this.isPolling = true;
        this._startPollingLoop();
        return this;
    }

    async emit(event, ...args) {
        if (!this.sid) {
            throw new Error('SocketIoClient is not connected');
        }
        const postUrl = `${this.serverUrl}/socket.io/?EIO=4&transport=polling&sid=${this.sid}`;
        const packet = `42${JSON.stringify([event, ...args])}`;
        const res = await fetch(postUrl, {
            method: 'POST',
            body: packet,
            headers: { ...this.headers, 'Content-Type': 'text/plain;charset=UTF-8' },
            signal: this.abortController.signal
        });
        return res.ok;
    }

    _startPollingLoop() {
        const poll = async () => {
            if (!this.isPolling || !this.sid) return;
            try {
                const pollUrl = `${this.serverUrl}/socket.io/?EIO=4&transport=polling&sid=${this.sid}`;
                const res = await fetch(pollUrl, {
                    headers: this.headers,
                    signal: this.abortController.signal
                });
                const text = await res.text();
                this._parseEngineIoPayload(text);
            } catch (err) {
                if (!this.isPolling) return;
            }
            if (this.isPolling) {
                setTimeout(poll, 50);
            }
        };
        poll();
    }

    _parseEngineIoPayload(payload) {
        if (!payload) return;
        // Engine.IO v4 separator is \x1e (Record Separator)
        const packets = payload.split('\x1e');
        for (const packet of packets) {
            if (!packet) continue;
            const type = packet[0];
            const data = packet.slice(1);

            if (type === '2') {
                // Ping -> respond with Pong (3)
                if (this.sid && this.isPolling) {
                    fetch(`${this.serverUrl}/socket.io/?EIO=4&transport=polling&sid=${this.sid}`, {
                        method: 'POST',
                        body: '3',
                        headers: { ...this.headers, 'Content-Type': 'text/plain;charset=UTF-8' },
                        signal: this.abortController.signal
                    }).catch(() => {});
                }
            } else if (type === '4') {
                // Socket.IO packet
                this._parseSocketIoPacket(data);
            }
        }
    }

    _parseSocketIoPacket(packet) {
        if (!packet) return;
        const type = packet[0];
        const rest = packet.slice(1);
        if (type === '2') {
            // EVENT
            try {
                const parsed = JSON.parse(rest);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    const event = parsed[0];
                    const data = parsed.length > 1 ? parsed[1] : null;
                    this._emit(event, data);
                }
            } catch {}
        }
    }

    _emit(event, data) {
        const list = this.listeners.get(event) || [];
        for (const fn of [...list]) {
            try { fn(data); } catch {}
        }
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
        return this;
    }

    off(event, callback) {
        const list = this.listeners.get(event);
        if (!list) return this;
        this.listeners.set(event, list.filter(fn => fn !== callback));
        return this;
    }

    waitForEvent(event, timeoutMs = 8000) {
        return new Promise((resolve, reject) => {
            const handler = (data) => {
                clearTimeout(timer);
                this.off(event, handler);
                resolve(data);
            };

            const timer = setTimeout(() => {
                this.off(event, handler);
                reject(new Error(`Timed out waiting for socket event '${event}' after ${timeoutMs}ms`));
            }, timeoutMs);

            this.on(event, handler);
        });
    }

    disconnect() {
        this.isPolling = false;
        try { this.abortController.abort(); } catch {}
    }
}

module.exports = {
    HttpClient,
    SocketIoClient
};
