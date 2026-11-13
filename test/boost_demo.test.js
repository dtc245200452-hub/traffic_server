const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const axios = require('axios');

const { ROOT_DIR, setupServerEnv } = require('./helpers/test_env');

describe('Boost Demo Web (/boost) & Platform Fidelity', () => {
    let env;
    let mockProxyServer;
    let mockTargetServer;
    let proxyPort;
    let targetPort;
    const kiotRequests = [];
    const targetHits = [];
    let ipCounter = 1;
    const originalAxiosGet = axios.get;
    const originalAxiosPost = axios.post;

    before(async () => {
        // 1. Start mock target HTTP site
        mockTargetServer = http.createServer((req, res) => {
            targetHits.push({ url: req.url, ua: req.headers['user-agent'] || '' });
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<html><body><h1>Target Demo</h1><a href="/sub-page">Sub</a></body></html>');
        });
        await new Promise(resolve => mockTargetServer.listen(0, '127.0.0.1', resolve));
        targetPort = mockTargetServer.address().port;

        // 2. Start mock forward HTTP proxy (handles axios { proxy: { host, port } })
        mockProxyServer = http.createServer((req, res) => {
            try {
                const parsed = new URL(req.url);
                const upstreamReq = http.request({
                    hostname: parsed.hostname,
                    port: parsed.port || 80,
                    path: parsed.pathname + parsed.search,
                    method: req.method,
                    headers: req.headers
                }, (upstreamRes) => {
                    res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
                    upstreamRes.pipe(res);
                });
                upstreamReq.on('error', (err) => {
                    res.writeHead(502);
                    res.end(err.message);
                });
                req.pipe(upstreamReq);
            } catch (err) {
                res.writeHead(400);
                res.end(err.message);
            }
        });
        await new Promise(resolve => mockProxyServer.listen(0, '127.0.0.1', resolve));
        proxyPort = mockProxyServer.address().port;

        // 3. Intercept outbound KiotProxy calls locally so real target delivery uses local proxy
        axios.get = function (url, ...rest) {
            if (typeof url === 'string' && url.startsWith('https://api.kiotproxy.com')) {
                kiotRequests.push(url);
                if (url.includes('/proxies/new') || url.includes('/proxies/current')) {
                    const ip = `203.0.113.${ipCounter++}`;
                    return Promise.resolve({
                        data: {
                            success: true,
                            code: 200,
                            data: {
                                realIpAddress: ip,
                                http: `127.0.0.1:${proxyPort}`,
                                location: 'Test City',
                                ttl: 120,
                                ttc: 0
                            }
                        }
                    });
                }
                return Promise.resolve({ data: { success: true, code: 200 } });
            }
            return originalAxiosGet.call(this, url, ...rest);
        };

        axios.post = function (url, ...rest) {
            if (typeof url === 'string' && url.startsWith('https://api.telegram.org')) {
                return Promise.resolve({ data: { ok: true, result: {} } });
            }
            return originalAxiosPost.call(this, url, ...rest);
        };

        env = await setupServerEnv();
    });

    after(async () => {
        axios.get = originalAxiosGet;
        axios.post = originalAxiosPost;
        if (env) await env.teardown();
        if (mockProxyServer) {
            mockProxyServer.closeAllConnections?.();
            await new Promise(resolve => mockProxyServer.close(resolve));
        }
        if (mockTargetServer) {
            mockTargetServer.closeAllConnections?.();
            await new Promise(resolve => mockTargetServer.close(resolve));
        }
    });

    it('Static HTML/JS consistency: every $() DOM ID in public/js/boost.js exists in public/boost.html and no signup forms exist', () => {
        const html = fs.readFileSync(path.join(ROOT_DIR, 'public', 'boost.html'), 'utf-8');
        const js = fs.readFileSync(path.join(ROOT_DIR, 'public', 'js', 'boost.js'), 'utf-8');
        const loginHtml = fs.readFileSync(path.join(ROOT_DIR, 'public', 'login.html'), 'utf-8');
        const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'public', 'index.html'), 'utf-8');
        const orderHtml = fs.readFileSync(path.join(ROOT_DIR, 'public', 'order.html'), 'utf-8');
        const trackHtml = fs.readFileSync(path.join(ROOT_DIR, 'public', 'track.html'), 'utf-8');

        const idMatches = [...js.matchAll(/\$\(\s*['"]([a-zA-Z0-9_-]+)['"]\s*\)/g)].map(m => m[1]);
        const uniqueIds = [...new Set(idMatches)];
        assert.ok(uniqueIds.length > 20, 'Expected DOM IDs in boost.js');
        for (const id of uniqueIds) {
            assert.ok(
                html.includes(`id="${id}"`),
                `Missing element id="${id}" in public/boost.html (referenced in public/js/boost.js)`
            );
        }

        // No customer registration / signup endpoint anywhere on /boost
        assert.ok(!/\/api\/register|\/api\/signup/i.test(html + js), 'Must not include customer account registration endpoints');
        assert.ok(loginHtml.includes('/boost'), 'login.html must link to /boost');
        assert.ok(indexHtml.includes('/boost'), 'index.html must link to /boost');
        assert.ok(orderHtml.includes('/boost'), 'order.html must link to /boost');
        assert.ok(trackHtml.includes('/boost'), 'track.html must link to /boost');
    });

    it('Custom schedule UI metadata in public/boost.html matches timeDistribution.js and public/js/timeDistribution.js', () => {
        const html = fs.readFileSync(path.join(ROOT_DIR, 'public', 'boost.html'), 'utf-8');
        const backendDist = require('../timeDistribution');
        const frontendDist = require('../public/js/timeDistribution');

        assert.deepEqual(frontendDist.CUSTOM_LEVEL_WEIGHTS, backendDist.CUSTOM_LEVEL_WEIGHTS);
        assert.deepEqual(frontendDist.TIME_BLOCK_DEFINITIONS, backendDist.TIME_BLOCK_DEFINITIONS);

        // Ensure stale mismatched labels/weights are never present in #custom-blocks-box
        const boxMatch = html.match(/<div id="custom-blocks-box"[\s\S]*?<\/div>\s*<\/div>/);
        assert.ok(boxMatch, 'Expected #custom-blocks-box in public/boost.html');
        const boxHtml = boxMatch[0];
        assert.ok(!/0\.5x/i.test(boxHtml), 'Custom schedule options must not display stale 0.5x multiplier');
        assert.ok(!/00h[–-]05h|05h[–-]08h|08h[–-]12h/i.test(boxHtml), 'Custom schedule block labels must not display stale hour boundaries');

        for (const def of backendDist.TIME_BLOCK_DEFINITIONS) {
            const startH = String(def.hours[0]).padStart(2, '0');
            const endH = String((def.hours[def.hours.length - 1] + 1) % 24).padStart(2, '0');
            const selectId = `cb-${def.id}`;

            const labelMatch = boxHtml.match(new RegExp(`<label\\s+for="${selectId}"[^>]*>([^<]+)</label>`));
            assert.ok(labelMatch, `Missing label for #${selectId}`);
            assert.ok(
                new RegExp(`${startH}h[–-]${endH}h`).test(labelMatch[1]),
                `Label for #${selectId} ("${labelMatch[1]}") must include ${startH}h–${endH}h`
            );

            const selectMatch = boxHtml.match(new RegExp(`<select\\s+id="${selectId}"[^>]*>([\\s\\S]*?)</select>`));
            assert.ok(selectMatch, `Missing <select id="${selectId}">`);
            const optionsHtml = selectMatch[1];

            for (const [level, weight] of Object.entries(backendDist.CUSTOM_LEVEL_WEIGHTS)) {
                const expectedMult = `${Number(weight).toFixed(1)}x`;
                const optMatch = optionsHtml.match(new RegExp(`<option\\s+value="${level}"([^>]*)>([^<]+)</option>`));
                assert.ok(optMatch, `Missing option value="${level}" in #${selectId}`);
                assert.ok(
                    optMatch[2].includes(expectedMult),
                    `Option "${level}" in #${selectId} ("${optMatch[2]}") must match weight ${expectedMult}`
                );
                const isSelected = /\bselected\b/i.test(optMatch[1]);
                assert.equal(
                    isSelected,
                    level === def.defaultLevel,
                    `Default selected option mismatch for #${selectId} (${level})`
                );
            }
        }
    });

    it('timeDistribution guards Invalid Date bounds and >10-year durations without hanging (backend + frontend mirror)', () => {
        const vm = require('node:vm');
        const backendDist = require('../timeDistribution');
        const frontendSrc = fs.readFileSync(path.join(ROOT_DIR, 'public', 'js', 'timeDistribution.js'), 'utf-8');
        const sandbox = { window: {} };
        vm.runInNewContext(frontendSrc, sandbox);
        const frontendDist = sandbox.window.TimeDistribution;

        const now = Date.now();
        for (const distApi of [backendDist, frontendDist]) {
            const overflowDate = distApi.buildTimeDistribution({
                startTime: 0,
                endTime: 1e16,
                targetClicks: 100
            });
            assert.equal(overflowDate.valid, false);
            assert.equal(overflowDate.slices.length, 0);

            const overTenYears = distApi.buildTimeDistribution({
                startTime: now,
                endTime: now + 3700 * 86400000,
                targetClicks: 100
            });
            assert.equal(overTenYears.valid, false);
            assert.equal(overTenYears.slices.length, 0);
            assert.equal(distApi.generateClickSchedule(now, now + 3700 * 86400000, 100).length, 0);
        }
    });

    it('Public access without creating an account: /boost, /boost/, /js/boost.js, /js/timeDistribution.js work; / still redirects to /login.html', async () => {
        const boostPage = await env.request('GET', '/boost');
        assert.equal(boostPage.status, 200);
        assert.ok(boostPage.raw.includes('/js/boost.js'));
        assert.ok(boostPage.raw.includes('/js/timeDistribution.js'));

        const boostSlash = await env.request('GET', '/boost/');
        assert.equal(boostSlash.status, 200);
        assert.ok(boostSlash.raw.includes('/js/boost.js'));

        const boostJs = await env.request('GET', '/js/boost.js');
        assert.equal(boostJs.status, 200);
        assert.ok(boostJs.raw.includes('/api/orders/calculate-cost'));

        const distJs = await env.request('GET', '/js/timeDistribution.js');
        assert.equal(distJs.status, 200);
        assert.ok(distJs.raw.includes('buildTimeDistribution'));

        const rootRes = await env.request('GET', '/');
        assert.equal(rootRes.status, 302);
        assert.equal(rootRes.headers.location, '/login.html');
    });

    it('/api/public-config exposes safe platform metadata & reflects single-account auth roles without leaking webhookSecret', async () => {
        const unauthRes = await env.request('GET', '/api/public-config');
        assert.equal(unauthRes.status, 200);
        assert.equal(unauthRes.body.success, true);
        assert.equal(unauthRes.body.authenticated, false);
        assert.equal(unauthRes.body.role, null);
        assert.equal(unauthRes.body.singleAccountMode, true);
        assert.equal(unauthRes.body.browserMode, 'request');
        assert.deepEqual(unauthRes.body.pricing, { clickRate: 40, hourlyRate: 2000, currency: 'VND' });
        assert.ok(unauthRes.body.bankInfo);
        assert.equal(unauthRes.body.bankInfo.webhookSecret, undefined);

        const guestCookie = await env.loginAsGuest();
        const guestRes = await env.request('GET', '/api/public-config', { cookie: guestCookie });
        assert.equal(guestRes.status, 200);
        assert.equal(guestRes.body.authenticated, true);
        assert.equal(guestRes.body.role, 'guest');

        const adminRes = await env.request('GET', '/api/public-config', { cookie: env.adminCookie });
        assert.equal(adminRes.status, 200);
        assert.equal(adminRes.body.authenticated, true);
        assert.equal(adminRes.body.role, 'admin');
        assert.equal(adminRes.body.username, env.adminUsername);
    });

    it('Guest / unauthenticated customers cannot confirm payment or access single-account admin endpoints', async () => {
        const createRes = await env.request('POST', '/api/orders', {
            body: {
                targetUrl: `http://127.0.0.1:${targetPort}/unpaid`,
                proxyKey: 'K_UNPAID_BOOST_TEST_KEY',
                targetClicks: 5,
                durationHours: 0.5
            }
        });
        assert.equal(createRes.status, 201);
        const orderId = createRes.body.orderId;

        const guestCookie = await env.loginAsGuest();
        const unauthConfirm = await env.request('POST', `/api/orders/${orderId}/confirm`);
        assert.equal(unauthConfirm.status, 403);

        const guestConfirm = await env.request('POST', `/api/orders/${orderId}/confirm`, { cookie: guestCookie });
        assert.equal(guestConfirm.status, 403);

        const unauthAdminOrders = await env.request('GET', '/api/admin/orders');
        assert.equal(unauthAdminOrders.status, 401);

        const guestAdminOrders = await env.request('GET', '/api/admin/orders', { cookie: guestCookie });
        assert.equal(guestAdminOrders.status, 403);

        await new Promise(r => setTimeout(r, 300));
        assert.equal(targetHits.filter(h => h.url === '/unpaid').length, 0, 'Unpaid order must record 0 hits');
    });

    it('Order preserves scheduleMode/dedupIp/randomLinks and executes via local proxy only after single-account admin confirm', async () => {
        const hitUrl = '/boost-live-hit';
        const beforeKiotCount = kiotRequests.length;

        const createRes = await env.request('POST', '/api/orders', {
            body: {
                name: 'Boost Demo Real Execution',
                targetUrl: `http://127.0.0.1:${targetPort}${hitUrl}`,
                proxyKey: 'K_BOOST_LIVE_DEMO_KEY_001',
                targetClicks: 1,
                durationHours: 0.001,
                scheduleMode: 'even',
                dedupIp: false,
                randomLinks: false
            }
        });
        assert.equal(createRes.status, 201);
        assert.equal(createRes.body.scheduleMode, 'even');
        assert.equal(createRes.body.dedupIp, false);
        assert.equal(createRes.body.randomLinks, false);
        assert.equal(createRes.body.browserMode, 'request');
        assert.equal(createRes.body.totalAmount, 1 * 40 + 1 * 2000);

        const orderId = createRes.body.orderId;
        const confirmRes = await env.request('POST', `/api/orders/${orderId}/confirm`, {
            cookie: env.adminCookie
        });
        assert.equal(confirmRes.status, 200);
        assert.equal(confirmRes.body.status, 'paid');
        const campaignId = confirmRes.body.campaignId;
        assert.ok(campaignId);
        env.trackCampaign(campaignId);

        const camp = env.serverModule.campaigns.get(campaignId);
        assert.ok(camp);
        assert.equal(camp.config.scheduleMode, 'even');
        assert.equal(camp.config.dedupIp, false);
        assert.equal(camp.config.randomLinks, false);
        assert.equal(camp.config.browserMode, 'request');
        assert.equal(camp.config.dwellMin, 2);
        assert.equal(camp.config.dwellMax, 5);

        // Wait up to 12s for 1 lightweight HTTP request worker to finish via mock KiotProxy + mock proxy
        const deadline = Date.now() + 12000;
        let orderView = null;
        while (Date.now() < deadline) {
            const getRes = await env.request('GET', `/api/orders/${orderId}`);
            assert.equal(getRes.status, 200);
            orderView = getRes.body.order;
            if (orderView.progress && orderView.progress.status === 'completed') {
                break;
            }
            await new Promise(r => setTimeout(r, 250));
        }

        assert.ok(kiotRequests.slice(beforeKiotCount).some(u => u.includes('K_BOOST_LIVE_DEMO_KEY_001')), 'Expected server.js to rotate customer KiotProxy key');
        assert.ok(targetHits.some(h => h.url === hitUrl), 'Expected target URL to receive real HTTP hit through mock proxy');
        assert.ok(orderView && orderView.progress, 'Expected progress payload on GET /api/orders/:id');
        assert.equal(orderView.progress.status, 'completed');
        assert.equal(orderView.progress.successVisits, 1);
        assert.equal(orderView.progress.totalVisits, 1);
        assert.equal(orderView.progress.uniqueIps, 1);
        assert.equal(orderView.progress.browserMode, 'request');
        assert.equal(orderView.progress.scheduleMode, 'even');
    });

    it('Edge cases: invalid boost order payloads return 400, missing order returns 404, bad single-account login returns 401, and admin can delete finished orders', async () => {
        const badUrl = await env.request('POST', '/api/orders', {
            body: { targetUrl: 'ftp://invalid.test', proxyKey: 'K123456', targetClicks: 10, durationHours: 1 }
        });
        assert.equal(badUrl.status, 400);

        const zeroClicks = await env.request('POST', '/api/orders', {
            body: { targetUrl: `http://127.0.0.1:${targetPort}/`, proxyKey: 'K123456', targetClicks: 0, durationHours: 1 }
        });
        assert.equal(zeroClicks.status, 400);

        const missingKey = await env.request('POST', '/api/orders', {
            body: { targetUrl: `http://127.0.0.1:${targetPort}/`, proxyKey: '   ', targetClicks: 10, durationHours: 1 }
        });
        assert.equal(missingKey.status, 400);

        const missingOrder = await env.request('GET', '/api/orders/ORD-DOES-NOT-EXIST');
        assert.equal(missingOrder.status, 404);

        const badLogin = await env.request('POST', '/api/login', {
            body: { username: 'random_new_user', password: 'wrong' }
        });
        assert.equal(badLogin.status, 401);

        // Create and delete unpaid order as admin
        const createRes = await env.request('POST', '/api/orders', {
            body: { targetUrl: `http://127.0.0.1:${targetPort}/to-delete`, proxyKey: 'K_DEL_KEY', targetClicks: 2, durationHours: 1 }
        });
        assert.equal(createRes.status, 201);
        const orderId = createRes.body.orderId;

        const adminListBefore = await env.request('GET', '/api/admin/orders', { cookie: env.adminCookie });
        assert.equal(adminListBefore.status, 200);
        assert.ok(adminListBefore.body.orders.some(o => o.orderId === orderId));

        const delRes = await env.request('DELETE', `/api/admin/orders/${orderId}`, { cookie: env.adminCookie });
        assert.equal(delRes.status, 200);

        const getAfterDel = await env.request('GET', `/api/orders/${orderId}`);
        assert.equal(getAfterDel.status, 404);
    });

    it('Custom scheduleMode + customBlocks propagate to activated campaign and loadCampaignsFromDisk skips completed linked order campaigns', async () => {
        const createRes = await env.request('POST', '/api/orders', {
            body: {
                name: 'Custom Schedule Order',
                targetUrl: `http://127.0.0.1:${targetPort}/custom-sched`,
                proxyKey: 'K_CUSTOM_SCHED_KEY_01',
                targetClicks: 1,
                durationHours: 0.001,
                scheduleMode: 'custom',
                customBlocks: {
                    night: 'high',
                    early_morning: 'low',
                    morning: 'low',
                    noon: 'medium',
                    afternoon: 'high',
                    evening: 'medium',
                    late_night: 'low'
                },
                dedupIp: true,
                randomLinks: false
            }
        });
        assert.equal(createRes.status, 201);
        assert.equal(createRes.body.scheduleMode, 'custom');
        assert.equal(createRes.body.customBlocks.night, 'high');
        assert.equal(createRes.body.customBlocks.morning, 'low');

        const orderId = createRes.body.orderId;
        const confirmRes = await env.request('POST', `/api/orders/${orderId}/confirm`, { cookie: env.adminCookie });
        assert.equal(confirmRes.status, 200);
        const campaignId = confirmRes.body.campaignId;
        env.trackCampaign(campaignId);
        env.trackProxyKey('K_CUSTOM_SCHED_KEY_01');

        const camp = env.serverModule.campaigns.get(campaignId);
        assert.ok(camp);
        assert.equal(camp.config.scheduleMode, 'custom');
        assert.equal(camp.config.customBlocks.night, 'high');
        assert.equal(camp.config.customBlocks.morning, 'low');

        const deadline = Date.now() + 12000;
        let finalStatus = null;
        while (Date.now() < deadline) {
            const getRes = await env.request('GET', `/api/orders/${orderId}`);
            finalStatus = getRes.body.order.progress && getRes.body.order.progress.status;
            if (finalStatus === 'completed') break;
            await new Promise(r => setTimeout(r, 250));
        }
        assert.equal(finalStatus, 'completed');

        // Simulate server restart reload: disk JSON of a completed order campaign must NOT restart
        env.serverModule.campaigns.delete(campaignId);
        env.serverModule.loadCampaignsFromDisk();
        assert.equal(
            env.serverModule.campaigns.has(campaignId),
            false,
            'Completed order campaign must not be reloaded onto active campaigns map on restart'
        );

        // Creating and confirming a second order after restart must NOT collide with campaignId or overwrite order 1 progress
        const createRes2 = await env.request('POST', '/api/orders', {
            body: {
                name: 'Second Order Non-Collision Check',
                targetUrl: `http://127.0.0.1:${targetPort}/second-noncollision`,
                proxyKey: 'K_SECOND_NONCOLLISION_01',
                targetClicks: 1,
                durationHours: 0.001,
                scheduleMode: 'smart'
            }
        });
        assert.equal(createRes2.status, 201);
        const secondOrderId = createRes2.body.orderId;
        env.trackOrder(secondOrderId);

        const confirmRes2 = await env.request('POST', `/api/orders/${secondOrderId}/confirm`, { cookie: env.adminCookie });
        assert.equal(confirmRes2.status, 200);
        const secondCampaignId = confirmRes2.body.campaignId;
        env.trackCampaign(secondCampaignId);
        env.trackProxyKey('K_SECOND_NONCOLLISION_01');
        assert.notEqual(secondCampaignId, campaignId, 'generateCampaignId must not reuse completed order campaignId after reload');
        assert.ok(Number(secondCampaignId) > Number(campaignId), `Expected strictly higher campaign ID (${secondCampaignId} > ${campaignId})`);

        // Original completed order must retain its completed status & campaignId without poisoning
        const order1After = await env.request('GET', `/api/orders/${orderId}`);
        assert.equal(order1After.status, 200);
        assert.equal(order1After.body.order.progress.status, 'completed');
        assert.equal(order1After.body.order.progress.campaignId, campaignId);
        assert.equal(order1After.body.order.progress.successVisits, 1);

        // Wait for second order to complete, then delete it and confirm its linked campaign file & map entry are also cleaned up
        const deadline2 = Date.now() + 12000;
        let secondStatus = null;
        while (Date.now() < deadline2) {
            const getRes2 = await env.request('GET', `/api/orders/${secondOrderId}`);
            secondStatus = getRes2.body.order.progress && getRes2.body.order.progress.status;
            if (secondStatus === 'completed') break;
            await new Promise(r => setTimeout(r, 250));
        }
        assert.equal(secondStatus, 'completed');

        const del2 = await env.request('DELETE', `/api/admin/orders/${secondOrderId}`, { cookie: env.adminCookie });
        assert.equal(del2.status, 200);
        assert.equal(env.serverModule.campaigns.has(secondCampaignId), false, 'Deleted order campaign must be removed from memory');
        assert.equal(
            fs.existsSync(path.join(ROOT_DIR, 'campaigns', `${secondCampaignId}.json`)),
            false,
            'Deleted order campaign JSON must be removed from disk'
        );
        env.serverModule.loadCampaignsFromDisk();
        assert.equal(env.serverModule.campaigns.has(secondCampaignId), false, 'Deleted order campaign must not resurrect on reload');
    });

    it('Real Browser E2E (/boost): no-signup creation, fractional click guard, 0.001h support, modal admin login, live logs, and delete cleanup', async (t) => {
        const { chromium } = require('playwright');
        const edgeCandidates = [
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
        ];
        try {
            const coreDir = 'C:\\Program Files (x86)\\Microsoft\\EdgeCore';
            if (fs.existsSync(coreDir)) {
                for (const d of fs.readdirSync(coreDir)) {
                    edgeCandidates.unshift(path.join(coreDir, d, 'msedge.exe'));
                }
            }
        } catch {}

        const executablePath = edgeCandidates.find(p => fs.existsSync(p));
        let browser;
        try {
            browser = await chromium.launch({
                ...(executablePath ? { executablePath } : {}),
                headless: true
            });
        } catch (err) {
            t.skip(`No headless browser binary available: ${err.message}`);
            return;
        }

        const consoleErrors = [];
        const pageErrors = [];
        const badResponses = [];
        let allowIntentional404 = false;
        const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

        const adminPath = path.join(ROOT_DIR, 'admin.json');
        const origAdminRaw = fs.readFileSync(adminPath);

        try {
            const context = await browser.newContext();
            const page = await context.newPage();

            await page.route('https://img.vietqr.io/**', (route) => {
                route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1X1 });
            });

            page.on('console', (msg) => {
                if (msg.type() === 'error') {
                    if (allowIntentional404 && msg.text().includes('status of 404')) return;
                    consoleErrors.push(msg.text());
                }
            });
            page.on('pageerror', (err) => pageErrors.push(err.message));
            page.on('response', (res) => {
                if (res.status() >= 400) {
                    if (allowIntentional404 && res.status() === 404 && res.url().endsWith('/api/orders/ORD-DOES-NOT-EXIST')) return;
                    badResponses.push(`${res.status()} ${res.url()}`);
                }
            });

            await page.goto(`${env.baseUrl}/boost`, { waitUntil: 'networkidle' });
            assert.match(await page.textContent('#auth-pill'), /Khách/);
            await page.waitForFunction(() => document.getElementById('socket-pill')?.textContent?.includes('Đã kết nối'));

            // Fractional clicks guard: must show hint + zero totals WITHOUT hitting 400 API error
            await page.fill('#f-clicks', '1.5');
            await page.waitForTimeout(260);
            assert.equal(await page.textContent('#c-total'), '0 VNĐ');
            assert.equal(await page.isVisible('#cost-hint'), true);

            // Verify custom schedule labels/weights in live DOM & live TimeDistribution preview
            await page.fill('#f-clicks', '1000');
            await page.fill('#f-hours', '24');
            await page.selectOption('#f-schedule', 'custom');
            assert.equal(await page.isVisible('#custom-blocks-box'), true);

            const customDomCheck = await page.evaluate(() => {
                const defs = window.TimeDistribution.TIME_BLOCK_DEFINITIONS;
                const weights = window.TimeDistribution.CUSTOM_LEVEL_WEIGHTS;
                return defs.map(def => {
                    const startH = String(def.hours[0]).padStart(2, '0');
                    const endH = String((def.hours[def.hours.length - 1] + 1) % 24).padStart(2, '0');
                    const id = `cb-${def.id}`;
                    const labelEl = document.querySelector(`label[for="${id}"]`);
                    const selEl = document.getElementById(id);
                    const opts = Array.from(selEl.options).map(o => ({ value: o.value, text: o.textContent.trim(), selected: o.selected }));
                    return {
                        id,
                        expectedRange: `${startH}h–${endH}h`,
                        labelText: labelEl ? labelEl.textContent.trim() : '',
                        value: selEl ? selEl.value : '',
                        defaultLevel: def.defaultLevel,
                        opts,
                        expectedWeights: weights
                    };
                });
            });
            for (const row of customDomCheck) {
                assert.ok(row.labelText.includes(row.expectedRange), `DOM label "${row.labelText}" for #${row.id} must include ${row.expectedRange}`);
                assert.equal(row.value, row.defaultLevel, `Initial value for #${row.id} must match defaultLevel`);
                for (const [lvl, w] of Object.entries(row.expectedWeights)) {
                    const opt = row.opts.find(o => o.value === lvl);
                    assert.ok(opt && opt.text.includes(`${Number(w).toFixed(1)}x`), `Option ${lvl} on #${row.id} must show ${Number(w).toFixed(1)}x`);
                }
            }

            await page.waitForFunction(() => document.querySelectorAll('#dist-preview-body tr').length >= 24);
            const sumNightRows = () => page.evaluate(() => {
                let sum = 0;
                for (const tr of document.querySelectorAll('#dist-preview-body tr')) {
                    const cells = tr.querySelectorAll('td');
                    if (cells.length >= 3 && /^(00|01|02|03|04|05):/.test(cells[0].textContent.trim())) {
                        sum += Number(cells[2].textContent.replace(/[^\d]/g, '')) || 0;
                    }
                }
                return sum;
            });
            const nightQuotaLow = await sumNightRows();
            await page.selectOption('#cb-night', 'high');
            await page.waitForFunction((prev) => {
                let sum = 0;
                for (const tr of document.querySelectorAll('#dist-preview-body tr')) {
                    const cells = tr.querySelectorAll('td');
                    if (cells.length >= 3 && /^(00|01|02|03|04|05):/.test(cells[0].textContent.trim())) {
                        sum += Number(cells[2].textContent.replace(/[^\d]/g, '')) || 0;
                    }
                }
                return sum > prev;
            }, nightQuotaLow);
            const nightQuotaHigh = await sumNightRows();
            assert.ok(nightQuotaHigh > nightQuotaLow, `Expected night quota to increase when switched from low (${nightQuotaLow}) to high (${nightQuotaHigh})`);

            // >48h distribution preview must preserve 100% of clicks (collapsed summary row + toggle expand) and guard >8760h
            await page.fill('#f-hours', '72');
            await page.waitForSelector('#dist-preview-footer button[data-action="toggle-preview-slices"]');
            const collapsedCheck = await page.evaluate(() => {
                const rows = Array.from(document.querySelectorAll('#dist-preview-body tr'));
                const sum = rows.reduce((acc, tr) => {
                    const cells = tr.querySelectorAll('td');
                    return acc + (cells.length >= 3 ? (Number(cells[2].textContent.replace(/[^\d]/g, '')) || 0) : 0);
                }, 0);
                return {
                    rowCount: rows.length,
                    hasSummaryRow: Boolean(document.querySelector('#dist-preview-body tr[data-preview-rest-summary="1"]')),
                    sum
                };
            });
            assert.equal(collapsedCheck.rowCount, 49);
            assert.equal(collapsedCheck.hasSummaryRow, true);
            assert.equal(collapsedCheck.sum, 1000, 'Collapsed >48h preview must account for 100% of clicks');

            await page.click('#dist-preview-footer button[data-action="toggle-preview-slices"]');
            await page.waitForFunction(() => document.querySelectorAll('#dist-preview-body tr').length >= 72);
            const expandedSum = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('#dist-preview-body tr')).reduce((acc, tr) => {
                    const cells = tr.querySelectorAll('td');
                    return acc + (cells.length >= 3 ? (Number(cells[2].textContent.replace(/[^\d]/g, '')) || 0) : 0);
                }, 0);
            });
            assert.equal(expandedSum, 1000, 'Expanded 72h preview must sum to 100% of clicks');
            await page.click('#dist-preview-footer button[data-action="toggle-preview-slices"]');

            await page.fill('#f-hours', '100000');
            await page.waitForFunction(() => document.getElementById('dist-capacity-alert')?.textContent?.includes('vượt quá giới hạn xem trước'));

            // Restore integer clicks=1, duration=0.001h (check HTML5 validity!) with custom schedule
            await page.fill('#f-clicks', '1');
            await page.fill('#f-hours', '0.001');
            const hoursValid = await page.evaluate(() => document.getElementById('f-hours').checkValidity());
            assert.equal(hoursValid, true, '0.001h must pass HTML5 constraint validation');
            await page.waitForFunction(() => document.getElementById('c-total')?.textContent?.includes('2.040'));

            // Submit order with ZERO account creation
            await page.fill('#f-name', 'Playwright Boost Demo');
            await page.fill('#f-url', `http://127.0.0.1:${targetPort}/pw-boost`);
            await page.fill('#f-proxy', 'K_PW_BROWSER_KEY_01');
            await page.click('#submit-order-btn');

            await page.waitForSelector('#active-order-panel:not(.hidden)');
            const createdOrderId = (await page.textContent('#ao-id')).trim();
            assert.ok(createdOrderId.startsWith('ORD-'));
            env.trackOrder(createdOrderId);
            env.trackProxyKey('K_PW_BROWSER_KEY_01');

            assert.match(await page.textContent('#ao-status-pill'), /Chờ thanh toán/);
            assert.equal(await page.isVisible('#ao-qr-img'), true);
            assert.equal(await page.isVisible('#inline-admin-confirm-btn'), false);

            // Verify fallback renders when QR img errors without throwing console error
            await page.evaluate(() => {
                document.getElementById('ao-qr-img').dispatchEvent(new Event('error'));
            });
            assert.equal(await page.isVisible('#ao-qr-fallback'), true);

            // Reload page with ?orderId=... and confirm localStorage + tracking restore
            await page.reload({ waitUntil: 'networkidle' });
            await page.waitForSelector('#active-order-panel:not(.hidden)');
            assert.equal((await page.textContent('#ao-id')).trim(), createdOrderId);
            assert.match(await page.textContent('#recent-orders-wrap'), new RegExp(createdOrderId));

            // Invalid order lookup must clear active panel, display error in #lookup-order-msg (not #order-form-msg), and recover via recent-order reload
            allowIntentional404 = true;
            await page.fill('#lookup-order-id', 'ORD-DOES-NOT-EXIST');
            await page.click('#lookup-order-btn');
            await page.waitForFunction(() => document.getElementById('lookup-order-msg')?.textContent?.includes('ORD-DOES-NOT-EXIST'));
            allowIntentional404 = false;
            assert.equal(await page.isHidden('#active-order-panel'), true);
            assert.equal(await page.isVisible('#active-order-empty'), true);
            assert.equal(await page.evaluate(() => new URL(window.location.href).searchParams.get('orderId')), null);
            assert.equal((await page.textContent('#order-form-msg')).includes('ORD-DOES-NOT-EXIST'), false);

            await page.click(`button[data-action="load-recent"][data-id="${createdOrderId}"]`);
            await page.waitForSelector('#active-order-panel:not(.hidden)');
            assert.equal((await page.textContent('#lookup-order-msg')).trim(), '');
            assert.equal((await page.textContent('#ao-id')).trim(), createdOrderId);

            // Test legacy read-only guest (1/1) in modal -> read-only warning, then logout
            await page.click('#open-login-btn');
            await page.fill('#login-user', '1');
            await page.fill('#login-pass', '1');
            await page.click('#submit-login-btn');
            await page.waitForFunction(() => document.getElementById('auth-pill')?.textContent?.includes('Guest'));
            assert.equal(await page.isVisible('#inline-admin-confirm-btn'), false);
            await page.click('#logout-btn');
            await page.waitForFunction(() => document.getElementById('auth-pill')?.textContent?.includes('Khách'));

            // Log in as single admin via modal WITHOUT reloading the page
            const tmpSalt = crypto.randomBytes(8).toString('hex');
            const tmpPass = 'PwDemoSecret_999';
            const tmpHash = crypto.createHmac('sha256', tmpSalt).update(tmpPass).digest('hex');
            const parsedOrig = JSON.parse(origAdminRaw.toString('utf-8'));
            fs.writeFileSync(adminPath, JSON.stringify({
                username: parsedOrig.username,
                salt: tmpSalt,
                passwordHash: tmpHash
            }, null, 4));
            try {
                await page.click('#open-login-btn');
                await page.fill('#login-user', parsedOrig.username);
                await page.fill('#login-pass', tmpPass);
                await page.click('#submit-login-btn');
                await page.waitForFunction(() => document.getElementById('auth-pill')?.textContent?.includes('Admin:'));
            } finally {
                fs.writeFileSync(adminPath, origAdminRaw);
            }

            // Inline admin confirm button appears dynamically on active order without page refresh
            await page.waitForSelector('#inline-admin-confirm-btn:not(.hidden)');
            await page.click('#inline-admin-confirm-btn');

            await page.waitForFunction(
                () => document.getElementById('ao-status-pill')?.textContent?.includes('Đã hoàn thành'),
                null,
                { timeout: 15000 }
            );
            const campId = (await page.textContent('#ao-camp-id')).trim();
            assert.ok(campId && campId !== 'Chưa kích hoạt');
            env.trackCampaign(campId);

            assert.equal((await page.textContent('#st-success')).trim(), '1');
            assert.match(await page.textContent('#ao-time-text'), /^Kết thúc thực tế:/);
            assert.match(await page.textContent('#ao-worker-log'), new RegExp(`\\[C${campId}\\]`));
            assert.ok(targetHits.some(h => h.url === '/pw-boost'), 'Playwright-confirmed order must deliver HTTP hit');

            // Switch to Admin tab and verify order table, server campaigns table, webhook URL, and delete cleanup
            await page.click('[data-tab="admin"]');
            await page.waitForSelector('#admin-workspace:not(.hidden)');
            assert.equal((await page.textContent('#cfg-webhook-url')).trim(), `${env.baseUrl}/api/payment/webhook`);
            assert.match(await page.textContent('#adm-campaigns-body'), new RegExp(campId));
            assert.match(await page.textContent('#adm-orders-body'), new RegExp(createdOrderId));

            await page.click(`button[data-action="adm-delete"][data-id="${createdOrderId}"]`);
            await page.waitForFunction(
                (oid) => !document.getElementById('adm-orders-body')?.textContent?.includes(oid),
                createdOrderId
            );
            assert.equal(await page.isHidden('#active-order-panel'), true);

            const afterDelRes = await env.request('GET', `/api/orders/${createdOrderId}`);
            assert.equal(afterDelRes.status, 404);

            // Logging out of Admin must wipe admin table/summary values cleanly
            await page.click('#logout-btn');
            await page.waitForFunction(() => document.getElementById('auth-pill')?.textContent?.includes('Khách'));
            assert.equal((await page.textContent('#adm-sum-total')).trim(), '0');
            assert.match(await page.textContent('#adm-orders-body'), /Chưa có đơn hàng nào/);

            assert.deepEqual(badResponses, [], `Unexpected HTTP >= 400 responses: ${badResponses.join('; ')}`);
            assert.deepEqual(pageErrors, [], `Unexpected uncaught page errors: ${pageErrors.join('; ')}`);
            assert.deepEqual(consoleErrors, [], `Unexpected console errors: ${consoleErrors.join('; ')}`);
        } finally {
            fs.writeFileSync(adminPath, origAdminRaw);
            await browser.close();
        }
    });
});
