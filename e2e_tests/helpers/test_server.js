/**
 * Test Server Launcher & Process Lifecycle Manager
 * Handles ephemeral port allocation, child process lifecycle, readiness probing,
 * temporary admin session seeding, and clean teardown.
 */
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const path = require('path');
const child_process = require('child_process');

function snapshotFile(filePath) {
    if (fs.existsSync(filePath)) {
        return { existed: true, content: fs.readFileSync(filePath) };
    }
    return { existed: false, content: null };
}

function restoreFile(filePath, snapshot) {
    if (!snapshot) return;
    if (snapshot.existed) {
        fs.writeFileSync(filePath, snapshot.content);
    } else if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

function getEphemeralPort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.unref();
        srv.listen(0, '127.0.0.1', () => {
            const port = srv.address().port;
            srv.close((err) => {
                if (err) reject(err);
                else resolve(port);
            });
        });
    });
}

class TestServer {
    constructor(options = {}) {
        this.options = options;
        this.projectRoot = options.projectRoot || path.resolve(__dirname, '../..');
        this.child = null;
        this.port = options.port || null;
        this.serverUrl = options.serverUrl || null;
        this.isExternal = Boolean(options.serverUrl);
        this.stdoutBuffer = [];
        this.stderrBuffer = [];
        this.adminSessionToken = null;
        this.adminCookie = options.adminCookie || process.env.E2E_ADMIN_COOKIE || '';
        this._sessionsPath = path.join(this.projectRoot, 'sessions.json');
        this._adminConfigPath = path.join(this.projectRoot, 'admin.json');
        this._sessionsSnapshot = null;
    }

    _readAdminUsername() {
        try {
            if (fs.existsSync(this._adminConfigPath)) {
                const cfg = JSON.parse(fs.readFileSync(this._adminConfigPath, 'utf-8'));
                if (cfg && typeof cfg.username === 'string' && cfg.username.trim()) {
                    return cfg.username.trim();
                }
            }
        } catch {}
        return 'admin';
    }

    _seedAdminSession() {
        const adminUsername = this._readAdminUsername();
        this._sessionsSnapshot = snapshotFile(this._sessionsPath);

        let sessions = {};
        if (this._sessionsSnapshot.existed) {
            try {
                const parsed = JSON.parse(this._sessionsSnapshot.content.toString('utf-8'));
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    sessions = parsed;
                }
            } catch {}
        }

        const token = crypto.randomUUID();
        sessions[token] = { username: adminUsername, role: 'admin' };
        fs.writeFileSync(this._sessionsPath, JSON.stringify(sessions, null, 2), 'utf-8');

        this.adminSessionToken = token;
        this.adminCookie = `session_token=${token}`;
    }

    _resolveExternalAdminCookie() {
        if (this.adminCookie) return;
        const envToken = process.env.E2E_ADMIN_TOKEN;
        if (envToken) {
            this.adminSessionToken = envToken;
            this.adminCookie = `session_token=${envToken}`;
            return;
        }
        try {
            if (fs.existsSync(this._sessionsPath)) {
                const sessions = JSON.parse(fs.readFileSync(this._sessionsPath, 'utf-8'));
                const adminUsername = this._readAdminUsername();
                for (const [token, val] of Object.entries(sessions || {})) {
                    const isAdminObj = val && typeof val === 'object' && val.role === 'admin';
                    const isAdminStr = typeof val === 'string' && (val === adminUsername || (val !== '1' && val.length > 0));
                    if (isAdminObj || isAdminStr) {
                        this.adminSessionToken = token;
                        this.adminCookie = `session_token=${token}`;
                        return;
                    }
                }
            }
        } catch {}
    }

    restoreSessionsFile() {
        if (this._sessionsSnapshot) {
            restoreFile(this._sessionsPath, this._sessionsSnapshot);
            this._sessionsSnapshot = null;
        }
    }

    async start() {
        if (this.isExternal && this.serverUrl) {
            this._resolveExternalAdminCookie();
            await this.waitForReady(this.serverUrl, 10000);
            return {
                serverUrl: this.serverUrl,
                port: new URL(this.serverUrl).port,
                adminSessionToken: this.adminSessionToken,
                adminCookie: this.adminCookie
            };
        }

        if (!this.port) {
            this.port = await getEphemeralPort();
        }

        this.serverUrl = `http://127.0.0.1:${this.port}`;

        // Seed a temporary admin session before spawning server.js (loaded once on startup)
        this._seedAdminSession();

        const env = {
            ...process.env,
            PORT: String(this.port),
            NODE_ENV: 'test',
            ...(this.options.env || {})
        };

        try {
            this.child = child_process.spawn('node', ['server.js'], {
                cwd: this.projectRoot,
                env,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            this.child.stdout.on('data', (data) => {
                const str = data.toString();
                this.stdoutBuffer.push(str);
                if (this.options.verbose) {
                    process.stdout.write(`[SERVER] ${str}`);
                }
            });

            this.child.stderr.on('data', (data) => {
                const str = data.toString();
                this.stderrBuffer.push(str);
                if (this.options.verbose) {
                    process.stderr.write(`[SERVER_ERR] ${str}`);
                }
            });

            this.child.on('error', (err) => {
                console.error('[TestServer] Process error:', err);
            });

            // Readiness probing
            await this.waitForReady(this.serverUrl, 12000);
            return {
                serverUrl: this.serverUrl,
                port: this.port,
                adminSessionToken: this.adminSessionToken,
                adminCookie: this.adminCookie
            };
        } catch (err) {
            await this.stop().catch(() => {});
            throw err;
        }
    }

    async waitForReady(url, timeoutMs = 10000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            try {
                // Check if child exited prematurely
                if (this.child && this.child.exitCode !== null) {
                    throw new Error(`Server process exited prematurely with code ${this.child.exitCode}.\nStderr: ${this.stderrBuffer.join('')}`);
                }

                const res = await fetch(`${url}/`, { signal: AbortSignal.timeout(1000) });
                if (res.status < 500) {
                    return true;
                }
            } catch (err) {
                // Server not ready yet
            }
            await new Promise((r) => setTimeout(r, 100));
        }

        const errOutput = this.stderrBuffer.join('');
        throw new Error(`Server at ${url} failed to become ready within ${timeoutMs}ms.\nProcess output: ${errOutput}`);
    }

    stop() {
        if (this.isExternal || !this.child) {
            if (!this.isExternal) this.restoreSessionsFile();
            return Promise.resolve();
        }

        const child = this.child;
        const pid = child.pid;

        return new Promise((resolve) => {
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                this.child = null;
                this.restoreSessionsFile();
                resolve();
            };

            if (child.exitCode !== null) {
                finish();
                return;
            }

            child.once('exit', finish);
            child.once('close', finish);

            try {
                if (process.platform === 'win32') {
                    // Windows taskkill to ensure tree cleanup
                    child_process.exec(`taskkill /pid ${pid} /T /F`, () => {
                        setTimeout(finish, 50);
                    });
                    setTimeout(finish, 2000);
                } else {
                    child.kill('SIGTERM');
                    setTimeout(() => {
                        if (!settled) {
                            try { child.kill('SIGKILL'); } catch {}
                        }
                    }, 500);
                    setTimeout(finish, 2000);
                }
            } catch {
                finish();
            }
        });
    }
}

module.exports = {
    TestServer,
    getEphemeralPort,
    snapshotFile,
    restoreFile
};
