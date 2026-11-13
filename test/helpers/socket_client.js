/**
 * Minimal zero-dependency Socket.IO (Engine.IO v4 HTTP long-polling) client
 * with Cookie auth support, event emission, and clean timer/abort teardown.
 */

class SocketClient {
    constructor(serverUrl, options = {}) {
        this.serverUrl = serverUrl.replace(/\/$/, '');
        this.cookie = options.cookie || null;
        this.sid = null;
        this.isConnected = false;
        this.isPolling = false;
        this.listeners = new Map();
        this.received = [];
        this.pendingTimers = new Set();
        this.abortController = new AbortController();
        this.pollTimer = null;
        this._connectWaiters = [];
    }

    _headers(extra = {}) {
        const headers = { ...extra };
        if (this.cookie) {
            headers.Cookie = this.cookie;
        }
        return headers;
    }

    async connect(timeoutMs = 5000) {
        const handshakeUrl = `${this.serverUrl}/socket.io/?EIO=4&transport=polling`;
        const res = await fetch(handshakeUrl, {
            headers: this._headers(),
            signal: this.abortController.signal
        });
        const text = await res.text();
        if (!text.startsWith('0')) {
            throw new Error(`Unexpected Engine.IO handshake: ${text.slice(0, 120)}`);
        }

        const handshake = JSON.parse(text.slice(1));
        this.sid = handshake.sid;

        const connectAckPromise = new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingTimers.delete(timer);
                reject(new Error(`Timed out waiting for Socket.IO connect ACK after ${timeoutMs}ms`));
            }, timeoutMs);
            this.pendingTimers.add(timer);
            this._connectWaiters.push(() => {
                clearTimeout(timer);
                this.pendingTimers.delete(timer);
                resolve();
            });
        });

        await fetch(`${this.serverUrl}/socket.io/?EIO=4&transport=polling&sid=${this.sid}`, {
            method: 'POST',
            headers: this._headers({ 'Content-Type': 'text/plain;charset=UTF-8' }),
            body: '40',
            signal: this.abortController.signal
        });

        this.isPolling = true;
        this._startPolling();
        await connectAckPromise;
        return this;
    }

    _startPolling() {
        const poll = async () => {
            if (!this.isPolling || !this.sid) return;
            try {
                const pollUrl = `${this.serverUrl}/socket.io/?EIO=4&transport=polling&sid=${this.sid}`;
                const res = await fetch(pollUrl, {
                    headers: this._headers(),
                    signal: this.abortController.signal
                });
                const text = await res.text();
                this._parseEngineIoPayload(text);
            } catch {
                if (!this.isPolling) return;
            }
            if (this.isPolling) {
                this.pollTimer = setTimeout(poll, 25);
            }
        };
        poll();
    }

    _parseEngineIoPayload(payload) {
        if (!payload) return;
        const packets = payload.split('\x1e');
        for (const packet of packets) {
            if (!packet) continue;
            const type = packet[0];
            const data = packet.slice(1);
            if (type === '2') {
                if (this.sid && this.isPolling) {
                    fetch(`${this.serverUrl}/socket.io/?EIO=4&transport=polling&sid=${this.sid}`, {
                        method: 'POST',
                        headers: this._headers({ 'Content-Type': 'text/plain;charset=UTF-8' }),
                        body: '3',
                        signal: this.abortController.signal
                    }).catch(() => {});
                }
            } else if (type === '4') {
                this._parseSocketIoPacket(data);
            }
        }
    }

    _parseSocketIoPacket(packet) {
        if (!packet) return;
        const type = packet[0];
        const rest = packet.slice(1);
        if (type === '0') {
            this.isConnected = true;
            const waiters = this._connectWaiters.splice(0);
            for (const fn of waiters) fn();
        } else if (type === '2') {
            try {
                const parsed = JSON.parse(rest);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    const event = parsed[0];
                    const data = parsed.length > 1 ? parsed[1] : null;
                    this.received.push({ event, data, ts: Date.now() });
                    this._notify(event, data);
                }
            } catch {}
        }
    }

    _notify(event, data) {
        const list = this.listeners.get(event) || [];
        for (const fn of [...list]) {
            try { fn(data); } catch {}
        }
    }

    on(event, handler) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(handler);
        return this;
    }

    off(event, handler) {
        const list = this.listeners.get(event);
        if (!list) return;
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
    }

    async emit(event, data) {
        if (!this.sid || !this.isPolling) {
            throw new Error('SocketClient is not connected');
        }
        const payload = data !== undefined ? [event, data] : [event];
        await fetch(`${this.serverUrl}/socket.io/?EIO=4&transport=polling&sid=${this.sid}`, {
            method: 'POST',
            headers: this._headers({ 'Content-Type': 'text/plain;charset=UTF-8' }),
            body: `42${JSON.stringify(payload)}`,
            signal: this.abortController.signal
        });
    }

    getEvents(event) {
        return this.received.filter((entry) => entry.event === event).map((entry) => entry.data);
    }

    waitForEvent(event, predicate = null, timeoutMs = 4000, includeHistory = true) {
        const matchFn = typeof predicate === 'function' ? predicate : () => true;
        if (includeHistory) {
            const existing = this.received.find((entry) => entry.event === event && matchFn(entry.data));
            if (existing) return Promise.resolve(existing.data);
        }

        return new Promise((resolve, reject) => {
            const handler = (data) => {
                if (!matchFn(data)) return;
                clearTimeout(timer);
                this.pendingTimers.delete(timer);
                this.off(event, handler);
                resolve(data);
            };
            const timer = setTimeout(() => {
                this.pendingTimers.delete(timer);
                this.off(event, handler);
                reject(new Error(`Timed out waiting for socket event '${event}' after ${timeoutMs}ms`));
            }, timeoutMs);
            this.pendingTimers.add(timer);
            this.on(event, handler);
        });
    }

    async disconnect() {
        this.isPolling = false;
        this.isConnected = false;
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }
        for (const t of this.pendingTimers) {
            clearTimeout(t);
        }
        this.pendingTimers.clear();
        this.listeners.clear();

        if (this.sid) {
            try {
                await fetch(`${this.serverUrl}/socket.io/?EIO=4&transport=polling&sid=${this.sid}`, {
                    method: 'POST',
                    headers: this._headers({ 'Content-Type': 'text/plain;charset=UTF-8' }),
                    body: '41',
                    signal: AbortSignal.timeout(300)
                });
            } catch {}
        }
        try { this.abortController.abort(); } catch {}
    }
}

module.exports = { SocketClient };
