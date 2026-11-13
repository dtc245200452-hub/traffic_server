/**
 * In-Memory Mock Services for E2E Test Isolation
 * - Mock KiotProxy API Server
 * - Mock Target Destination Web Server
 */
const http = require('http');

class MockKiotProxyServer {
    constructor() {
        this.server = null;
        this.port = 0;
        this.url = '';
        this.requests = [];
        this.ipPool = [
            { realIpAddress: '113.161.45.10', http: '127.0.0.1:8881', location: 'Vietnam - Hanoi', ttl: 120, ttc: 0 },
            { realIpAddress: '113.161.45.11', http: '127.0.0.1:8882', location: 'Vietnam - HCMC', ttl: 120, ttc: 0 },
            { realIpAddress: '113.161.45.12', http: '127.0.0.1:8883', location: 'Vietnam - Da Nang', ttl: 120, ttc: 0 },
            { realIpAddress: '113.161.45.13', http: '127.0.0.1:8884', location: 'Vietnam - Can Tho', ttl: 120, ttc: 0 }
        ];
        this.currentIpIndex = 0;
        this.forcedError = null;
        this.cooldownTtc = 0;
    }

    start() {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                const reqUrl = new URL(req.url, `http://${req.headers.host}`);
                const record = {
                    method: req.method,
                    pathname: reqUrl.pathname,
                    searchParams: Object.fromEntries(reqUrl.searchParams.entries()),
                    headers: req.headers,
                    time: Date.now()
                };
                this.requests.push(record);

                // Simulation: Forced Error
                if (this.forcedError) {
                    res.writeHead(this.forcedError.status || 500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(this.forcedError.body || { success: false, message: 'Simulated KiotProxy error' }));
                    return;
                }

                // Simulation: TTC Cooldown
                if (this.cooldownTtc > 0 && reqUrl.pathname.includes('/proxies/new')) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: false,
                        message: `Vui lòng đợi ${this.cooldownTtc}s để đổi IP tiếp theo`,
                        data: {
                            realIpAddress: 'cooldown',
                            ttc: this.cooldownTtc
                        }
                    }));
                    return;
                }

                // Normal /proxies/new or /proxies/current
                if (reqUrl.pathname.includes('/proxies/new') || reqUrl.pathname.includes('/proxies/current')) {
                    const proxyData = this.ipPool[this.currentIpIndex % this.ipPool.length];
                    if (reqUrl.pathname.includes('/proxies/new')) {
                        this.currentIpIndex++;
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        message: 'Success',
                        data: proxyData
                    }));
                    return;
                }

                // Default fallback
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'OK' }));
            });

            this.server.listen(0, '127.0.0.1', () => {
                this.port = this.server.address().port;
                this.url = `http://127.0.0.1:${this.port}`;
                resolve({ port: this.port, url: this.url });
            });

            this.server.on('error', reject);
        });
    }

    setIpPool(pool) {
        if (Array.isArray(pool) && pool.length > 0) {
            this.ipPool = pool.map(item => typeof item === 'string'
                ? { realIpAddress: item, http: '127.0.0.1:8888', location: 'Vietnam', ttl: 120, ttc: 0 }
                : item
            );
            this.currentIpIndex = 0;
        }
    }

    simulateError(status = 500, message = 'Simulated error') {
        this.forcedError = { status, body: { success: false, message } };
    }

    clearError() {
        this.forcedError = null;
    }

    simulateCooldown(ttcSeconds = 60) {
        this.cooldownTtc = ttcSeconds;
    }

    clearCooldown() {
        this.cooldownTtc = 0;
    }

    getCallCount() {
        return this.requests.length;
    }

    getLastKey() {
        const last = this.requests[this.requests.length - 1];
        return last ? last.searchParams.key : null;
    }

    getLastRequestQuery() {
        const last = this.requests[this.requests.length - 1];
        return last ? last.searchParams : {};
    }

    reset() {
        this.requests = [];
        this.forcedError = null;
        this.cooldownTtc = 0;
        this.currentIpIndex = 0;
    }

    stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => resolve());
            } else {
                resolve();
            }
        });
    }
}

const DEFAULT_TARGET_HTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Mock Destination Page</title>
    <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
    <h1>Welcome to Commercial Destination Target</h1>
    <p>Target landing page for lightweight HTTP request verification.</p>
    <div class="links">
        <a href="/sub-link-1">Internal Sublink 1</a>
        <a href="/sub-link-2">Internal Sublink 2</a>
        <a href="https://external.example.com/out">External Link</a>
        <a href="/documents/catalog.pdf">PDF Asset</a>
    </div>
</body>
</html>`;

class MockTargetServer {
    constructor() {
        this.server = null;
        this.port = 0;
        this.url = '';
        this.requests = [];
        this.htmlContent = DEFAULT_TARGET_HTML;
        this.forcedStatusCode = null;
        this.delayMs = 0;
    }

    start() {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                const reqUrl = new URL(req.url, `http://${req.headers.host}`);
                const record = {
                    method: req.method,
                    path: reqUrl.pathname,
                    search: reqUrl.search,
                    headers: req.headers,
                    time: Date.now()
                };
                this.requests.push(record);

                const sendResponse = () => {
                    if (this.forcedStatusCode) {
                        res.writeHead(this.forcedStatusCode, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end(`<h1>Error ${this.forcedStatusCode}</h1>`);
                        return;
                    }

                    if (reqUrl.pathname === '/sub-link-1' || reqUrl.pathname === '/sub-link-2') {
                        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end(`<html><body><h1>Sublink Page: ${reqUrl.pathname}</h1></body></html>`);
                        return;
                    }

                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(this.htmlContent);
                };

                if (this.delayMs > 0) {
                    setTimeout(sendResponse, this.delayMs);
                } else {
                    sendResponse();
                }
            });

            this.server.listen(0, '127.0.0.1', () => {
                this.port = this.server.address().port;
                this.url = `http://127.0.0.1:${this.port}`;
                resolve({ port: this.port, url: this.url });
            });

            this.server.on('error', reject);
        });
    }

    setHtml(html) {
        this.htmlContent = html;
    }

    setErrorMode(statusCode) {
        this.forcedStatusCode = statusCode;
    }

    clearErrorMode() {
        this.forcedStatusCode = null;
    }

    setDelay(ms) {
        this.delayMs = ms;
    }

    getRequestCount() {
        return this.requests.length;
    }

    getRequests() {
        return [...this.requests];
    }

    reset() {
        this.requests = [];
        this.forcedStatusCode = null;
        this.delayMs = 0;
        this.htmlContent = DEFAULT_TARGET_HTML;
    }

    stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => resolve());
            } else {
                resolve();
            }
        });
    }
}

module.exports = {
    MockKiotProxyServer,
    MockTargetServer
};
