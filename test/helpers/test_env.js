/**
 * Shared test environment helper for unit and integration tests under `test/`.
 * Handles cross-process locking, config file snapshot/restore, temporary admin
 * session seeding (via sessions.json + admin.json without bypassing auth),
 * ephemeral server lifecycle, HTTP requests, and deterministic teardown cleanup.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const SESSIONS_FILE = path.join(ROOT_DIR, 'sessions.json');
const ADMIN_FILE = path.join(ROOT_DIR, 'admin.json');
const PAYMENT_CONFIG_FILE = path.join(ROOT_DIR, 'payment_config.json');
const PROXY_CONFIG_FILE = path.join(ROOT_DIR, 'proxy_config.json');
const TELEGRAM_CONFIG_FILE = path.join(ROOT_DIR, 'telegram_config.json');
const CAMPAIGNS_DIR = path.join(ROOT_DIR, 'campaigns');
const LOCK_FILE = path.join(os.tmpdir(), 'traffic_server_unit_test.lock');

const MANAGED_FILES = [
    SESSIONS_FILE,
    PAYMENT_CONFIG_FILE,
    PROXY_CONFIG_FILE,
    TELEGRAM_CONFIG_FILE
];

function isPidAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        return err.code !== 'ESRCH';
    }
}

async function acquireTestLock(timeoutMs = 60000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const fd = fs.openSync(LOCK_FILE, 'wx');
            fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: Date.now() }));
            fs.closeSync(fd);
            return;
        } catch (err) {
            if (err.code !== 'EEXIST') throw err;
            try {
                const raw = fs.readFileSync(LOCK_FILE, 'utf-8');
                const meta = JSON.parse(raw);
                const age = Date.now() - (meta.createdAt || 0);
                if (age > timeoutMs || !isPidAlive(meta.pid)) {
                    fs.unlinkSync(LOCK_FILE);
                    continue;
                }
            } catch {
                try {
                    const stat = fs.statSync(LOCK_FILE);
                    if (Date.now() - stat.mtimeMs > 5000) {
                        fs.unlinkSync(LOCK_FILE);
                        continue;
                    }
                } catch {}
            }
            await new Promise(resolve => setTimeout(resolve, 25));
        }
    }
    throw new Error(`Timed out waiting for test lock: ${LOCK_FILE}`);
}

function releaseTestLock() {
    try {
        if (!fs.existsSync(LOCK_FILE)) return;
        const raw = fs.readFileSync(LOCK_FILE, 'utf-8');
        const meta = JSON.parse(raw);
        if (meta.pid === process.pid) {
            fs.unlinkSync(LOCK_FILE);
        }
    } catch {}
}

function snapshotFiles(paths) {
    return paths.map((filePath) => {
        if (fs.existsSync(filePath)) {
            return { filePath, existed: true, content: fs.readFileSync(filePath) };
        }
        return { filePath, existed: false, content: null };
    });
}

function restoreFiles(snapshots) {
    for (const snap of snapshots) {
        if (snap.existed) {
            fs.writeFileSync(snap.filePath, snap.content);
        } else if (fs.existsSync(snap.filePath)) {
            fs.unlinkSync(snap.filePath);
        }
    }
}

function seedTemporaryAdminSession() {
    let adminUsername = 'admin';
    if (fs.existsSync(ADMIN_FILE)) {
        const adminCfg = JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf-8'));
        if (adminCfg && adminCfg.username) adminUsername = adminCfg.username;
    }

    let sessions = {};
    if (fs.existsSync(SESSIONS_FILE)) {
        try {
            sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8')) || {};
        } catch {
            sessions = {};
        }
    }

    const token = `test-admin-${crypto.randomUUID()}`;
    sessions[token] = { username: adminUsername, role: 'admin' };
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf-8');
    return { token, username: adminUsername };
}

function parseSetCookies(setCookieHeader) {
    const cookies = {};
    const list = Array.isArray(setCookieHeader)
        ? setCookieHeader
        : (setCookieHeader ? [setCookieHeader] : []);
    for (const entry of list) {
        const pair = String(entry).split(';')[0];
        const eqIdx = pair.indexOf('=');
        if (eqIdx > 0) {
            cookies[pair.slice(0, eqIdx).trim()] = pair.slice(eqIdx + 1).trim();
        }
    }
    return cookies;
}

/**
 * Sets up an isolated server test environment:
 * - Acquires cross-process test lock
 * - Snapshots sessions.json, payment_config.json, proxy_config.json, telegram_config.json
 * - Seeds a temporary admin session in sessions.json BEFORE requiring server.js
 * - Starts server on an ephemeral 127.0.0.1 port
 */
async function setupServerEnv(options = {}) {
    await acquireTestLock();
    const onExit = () => releaseTestLock();
    process.once('exit', onExit);

    const snapshots = snapshotFiles(MANAGED_FILES);
    let testServer = null;
    let adminSession = null;
    let serverModule = null;
    let orderService = null;

    const trackedOrders = new Set();
    const trackedCampaigns = new Set();
    const trackedProxyKeys = new Set();
    const httpRequestImpl = options.httpRequest || http.request;

    try {
        adminSession = seedTemporaryAdminSession();
        orderService = require('../../orderService');
        serverModule = require('../../server');

        await new Promise((resolve, reject) => {
            const onErr = (err) => reject(err);
            serverModule.server.once('error', onErr);
            testServer = serverModule.server.listen(0, '127.0.0.1', () => {
                serverModule.server.removeListener('error', onErr);
                resolve();
            });
        });
    } catch (err) {
        restoreFiles(snapshots);
        process.removeListener('exit', onExit);
        releaseTestLock();
        throw err;
    }

    const port = testServer.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;
    const adminCookie = `session_token=${adminSession.token}`;

    function trackOrder(orderId) {
        if (orderId) trackedOrders.add(String(orderId));
        return orderId;
    }

    function trackCampaign(campaignId) {
        if (campaignId) trackedCampaigns.add(String(campaignId));
        return campaignId;
    }

    function trackProxyKey(key) {
        if (key) trackedProxyKeys.add(String(key));
        return key;
    }

    function request(method, urlPath, reqOpts = {}) {
        const {
            body = null,
            headers = {},
            cookie = null,
            rawBody = null
        } = reqOpts;

        return new Promise((resolve, reject) => {
            const url = new URL(urlPath, baseUrl);
            const finalHeaders = { ...headers };
            let payloadStr = null;

            if (rawBody !== null) {
                payloadStr = rawBody;
            } else if (body !== null && body !== undefined) {
                payloadStr = JSON.stringify(body);
                if (!finalHeaders['Content-Type'] && !finalHeaders['content-type']) {
                    finalHeaders['Content-Type'] = 'application/json';
                }
            }
            if (payloadStr !== null && !finalHeaders['Content-Length'] && !finalHeaders['content-length']) {
                finalHeaders['Content-Length'] = Buffer.byteLength(payloadStr);
            }
            if (cookie) {
                finalHeaders.Cookie = cookie;
            }

            const req = httpRequestImpl(
                {
                    hostname: url.hostname,
                    port: url.port,
                    path: url.pathname + url.search,
                    method,
                    headers: finalHeaders
                },
                (res) => {
                    let raw = '';
                    res.on('data', (chunk) => { raw += chunk; });
                    res.on('end', () => {
                        let parsed = null;
                        try {
                            parsed = JSON.parse(raw);
                        } catch {
                            parsed = raw;
                        }

                        if (parsed && typeof parsed === 'object') {
                            if (method === 'POST' && url.pathname === '/api/orders' && parsed.orderId) {
                                trackOrder(parsed.orderId);
                            }
                            if (parsed.campaignId) {
                                trackCampaign(parsed.campaignId);
                            }
                            if (method === 'POST' && url.pathname === '/api/campaigns' && parsed.id) {
                                trackCampaign(parsed.id);
                            }
                        }

                        const cookies = parseSetCookies(res.headers['set-cookie']);
                        resolve({
                            status: res.statusCode,
                            headers: res.headers,
                            cookies,
                            body: parsed,
                            raw
                        });
                    });
                }
            );

            req.on('error', reject);
            if (payloadStr !== null) {
                req.write(payloadStr);
            }
            req.end();
        });
    }

    async function loginAsGuest() {
        const res = await request('POST', '/api/login', {
            body: { username: '1', password: '1', rememberMe: false }
        });
        if (res.status !== 200 || !res.cookies.session_token) {
            throw new Error(`Failed to obtain guest session cookie: status=${res.status}`);
        }
        return `session_token=${res.cookies.session_token}`;
    }

    async function teardown() {
        try {
            if (testServer) {
                await new Promise((resolve) => testServer.close(resolve));
                testServer = null;
            }
        } finally {
            for (const orderId of trackedOrders) {
                try { orderService.deleteOrder(orderId); } catch {}
            }
            for (const campId of trackedCampaigns) {
                try {
                    const camp = serverModule.campaigns.get(campId);
                    if (camp) camp.status = 'stopped';
                    serverModule.campaigns.delete(campId);
                } catch {}
                try {
                    const campPath = path.join(CAMPAIGNS_DIR, `${campId}.json`);
                    if (fs.existsSync(campPath)) fs.unlinkSync(campPath);
                } catch {}
            }
            for (const key of trackedProxyKeys) {
                try { serverModule.globalProxyPool.delete(key); } catch {}
            }
            restoreFiles(snapshots);
            process.removeListener('exit', onExit);
            releaseTestLock();
        }
    }

    return {
        port,
        baseUrl,
        testServer,
        adminToken: adminSession.token,
        adminUsername: adminSession.username,
        adminCookie,
        orderService,
        serverModule,
        snapshots,
        request,
        loginAsGuest,
        trackOrder,
        trackCampaign,
        trackProxyKey,
        teardown
    };
}

module.exports = {
    ROOT_DIR,
    CAMPAIGNS_DIR,
    SESSIONS_FILE,
    PAYMENT_CONFIG_FILE,
    PROXY_CONFIG_FILE,
    setupServerEnv
};
