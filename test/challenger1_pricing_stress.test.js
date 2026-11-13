/**
 * Challenger 1 Independent Empirical Stress-Test Suite for Milestone 1:
 * Commercial Order & Pricing Engine with Strict Payment Gating
 *
 * Verifies:
 * 1. Exact fractional hours: 0.0001h, 0.01h, 0.5h, 0.9999h, 1.0h, 1.0001h, 1.5h, 2.0h, 2.0001h, 23.9h, 24.0h, 72.5h.
 * 2. Duration fee invariant: ALWAYS integer multiple of 2000 VNĐ (durationFee % 2000 === 0, minimum 2000 VNĐ).
 * 3. Click counts: 1, 2, 99, 1000, 50000, 1000000 clicks (always integer multiple of 40 VNĐ).
 * 4. Zero floating point drift: totalAmount === clickFee + durationFee.
 * 5. Input rejection stress-testing: negative numbers, non-numbers, NaN, infinity, objects, SQL injection strings, XSS payloads in URL and ProxyKey.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const orderService = require('../orderService');
const { app, server, campaigns } = require('../server');

describe('Challenger 1: Empirical Pricing & Security Stress Test Suite', () => {

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE 1: Required Fractional Hours Matrix & Rounding Verification
    // ─────────────────────────────────────────────────────────────────────────
    describe('1. Exact Fractional Hours Matrix Verification', () => {
        const testCases = [
            { durationHours: 0.0001, expectedHours: 1, expectedFee: 2000, label: '0.0001h (micro fraction)' },
            { durationHours: 0.01,   expectedHours: 1, expectedFee: 2000, label: '0.01h (small fraction)' },
            { durationHours: 0.5,    expectedHours: 1, expectedFee: 2000, label: '0.5h (half hour)' },
            { durationHours: 0.9999, expectedHours: 1, expectedFee: 2000, label: '0.9999h (sub-1h boundary)' },
            { durationHours: 1.0,    expectedHours: 1, expectedFee: 2000, label: '1.0h (exact 1h boundary)' },
            { durationHours: 1.0001, expectedHours: 2, expectedFee: 4000, label: '1.0001h (just over 1h boundary)' },
            { durationHours: 1.5,    expectedHours: 2, expectedFee: 4000, label: '1.5h (1.5h spec benchmark)' },
            { durationHours: 2.0,    expectedHours: 2, expectedFee: 4000, label: '2.0h (exact 2h boundary)' },
            { durationHours: 2.0001, expectedHours: 3, expectedFee: 6000, label: '2.0001h (just over 2h boundary)' },
            { durationHours: 23.9,   expectedHours: 24, expectedFee: 48000, label: '23.9h (sub-24h boundary)' },
            { durationHours: 24.0,   expectedHours: 24, expectedFee: 48000, label: '24.0h (exact 24h boundary)' },
            { durationHours: 72.5,   expectedHours: 73, expectedFee: 146000, label: '72.5h (multi-day fraction)' }
        ];

        for (const tc of testCases) {
            it(`verifies ${tc.label} -> ${tc.expectedHours}h = ${tc.expectedFee.toLocaleString()} VNĐ`, () => {
                const result = orderService.calculateOrderCost(100, tc.durationHours);
                assert.strictEqual(result.roundedHours, tc.expectedHours, `roundedHours mismatch for ${tc.durationHours}`);
                assert.strictEqual(result.durationFee, tc.expectedFee, `durationFee mismatch for ${tc.durationHours}`);
                assert.strictEqual(result.durationFee % 2000, 0, `durationFee must be multiple of 2000 for ${tc.durationHours}`);
                assert.ok(result.durationFee >= 2000, `durationFee must be at least 2000 for ${tc.durationHours}`);
            });
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE 2: Duration Fee Multiples of 2000 VNĐ & Minimum Bound Invariant
    // ─────────────────────────────────────────────────────────────────────────
    describe('2. Duration Fee Invariant & Fuzzing (Multiple of 2,000 VNĐ, Min 2,000 VNĐ)', () => {
        it('verifies duration fee is strictly integer multiple of 2000 VNĐ across 1,000 random fractional hours', () => {
            for (let i = 0; i < 1000; i++) {
                const randomDuration = 0.00001 + Math.random() * 499.99999;
                const result = orderService.calculateOrderCost(10, randomDuration);

                assert.strictEqual(result.durationFee % 2000, 0, `Duration fee ${result.durationFee} not divisible by 2000 for h=${randomDuration}`);
                assert.ok(result.durationFee >= 2000, `Duration fee ${result.durationFee} < 2000 for h=${randomDuration}`);
                assert.strictEqual(result.roundedHours, Math.ceil(randomDuration), `Ceil rounding error for h=${randomDuration}`);
                assert.strictEqual(result.durationFee, result.roundedHours * 2000);
            }
        });

        it('verifies sub-1 hour fractional values always resolve to exactly 2,000 VNĐ', () => {
            const subOneFractions = [0.000001, 0.0001, 0.001, 0.01, 0.1, 0.25, 0.333, 0.5, 0.75, 0.9, 0.99, 0.999, 0.999999];
            for (const h of subOneFractions) {
                const res = orderService.calculateOrderCost(50, h);
                assert.strictEqual(res.roundedHours, 1, `Sub-1h ${h} did not round up to 1`);
                assert.strictEqual(res.durationFee, 2000, `Sub-1h ${h} duration fee was not 2000 VNĐ`);
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE 3: Required Click Counts Matrix & Multiples of 40 VNĐ
    // ─────────────────────────────────────────────────────────────────────────
    describe('3. Required Click Counts Matrix (Always Integer Multiple of 40 VNĐ)', () => {
        const clickCases = [
            { clicks: 1,       expectedFee: 40,       label: '1 click' },
            { clicks: 2,       expectedFee: 80,       label: '2 clicks' },
            { clicks: 99,      expectedFee: 3960,     label: '99 clicks' },
            { clicks: 1000,    expectedFee: 40000,    label: '1,000 clicks' },
            { clicks: 50000,   expectedFee: 2000000,  label: '50,000 clicks' },
            { clicks: 1000000, expectedFee: 40000000, label: '1,000,000 clicks' }
        ];

        for (const tc of clickCases) {
            it(`verifies ${tc.label} -> ${tc.expectedFee.toLocaleString()} VNĐ (fee % 40 === 0)`, () => {
                const res = orderService.calculateOrderCost(tc.clicks, 1.0);
                assert.strictEqual(res.clickFee, tc.expectedFee, `clickFee mismatch for ${tc.clicks} clicks`);
                assert.strictEqual(res.clickFee % 40, 0, `clickFee must be multiple of 40 for ${tc.clicks} clicks`);
                assert.ok(res.clickFee >= 40, `clickFee must be >= 40`);
            });
        }

        it('verifies click fee is strictly integer multiple of 40 VNĐ across 1,000 random click counts', () => {
            for (let i = 0; i < 1000; i++) {
                const randomClicks = Math.floor(1 + Math.random() * 500000);
                const res = orderService.calculateOrderCost(randomClicks, 1.0);
                assert.strictEqual(res.clickFee % 40, 0, `Click fee ${res.clickFee} not divisible by 40 for clicks=${randomClicks}`);
                assert.strictEqual(res.clickFee, randomClicks * 40);
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE 4: Zero Floating Point Drift & Precision Matrix
    // ─────────────────────────────────────────────────────────────────────────
    describe('4. Zero Floating-Point Drift (totalAmount === clickFee + durationFee)', () => {
        it('verifies exact additive equality on full 12x6 cross-product matrix (72 combinations)', () => {
            const hours = [0.0001, 0.01, 0.5, 0.9999, 1.0, 1.0001, 1.5, 2.0, 2.0001, 23.9, 24.0, 72.5];
            const clicks = [1, 2, 99, 1000, 50000, 1000000];

            for (const h of hours) {
                for (const c of clicks) {
                    const res = orderService.calculateOrderCost(c, h);
                    const expectedTotal = res.clickFee + res.durationFee;

                    assert.strictEqual(res.totalAmount, expectedTotal, `Floating point drift detected for c=${c}, h=${h}`);
                    assert.strictEqual(Number.isSafeInteger(res.totalAmount), true, `Total amount not a safe integer for c=${c}, h=${h}`);
                    assert.strictEqual(res.totalAmount % 1, 0, `Total amount contains fractional decimal for c=${c}, h=${h}`);
                }
            }
        });

        it('verifies large-scale order calculations have zero drift and remain safe integers', () => {
            const largeCases = [
                { clicks: 10000000, hours: 100.5 },  // 10M clicks, 101h
                { clicks: 50000000, hours: 720.0 }   // 50M clicks, 30 days
            ];

            for (const lc of largeCases) {
                const res = orderService.calculateOrderCost(lc.clicks, lc.hours);
                assert.strictEqual(res.totalAmount, res.clickFee + res.durationFee);
                assert.strictEqual(Number.isSafeInteger(res.totalAmount), true);
                assert.strictEqual(res.totalAmount % 20, 0);
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE 5: Input Rejection Stress-Testing on calculateOrderCost
    // ─────────────────────────────────────────────────────────────────────────
    describe('5. Input Rejection Stress-Testing on calculateOrderCost', () => {
        const invalidClicks = [
            { val: 0, label: 'zero' },
            { val: -1, label: 'negative integer' },
            { val: -100, label: 'large negative' },
            { val: 1.5, label: 'float clicks' },
            { val: 0.999, label: 'sub-one float clicks' },
            { val: NaN, label: 'NaN' },
            { val: Infinity, label: 'Infinity' },
            { val: -Infinity, label: '-Infinity' },
            { val: 'abc', label: 'non-numeric string' },
            { val: '100clicks', label: 'alphanumeric string' },
            { val: '', label: 'empty string' },
            { val: null, label: 'null' },
            { val: undefined, label: 'undefined' },
            { val: {}, label: 'empty object' },
            { val: { clicks: 100 }, label: 'object with property' },
            { val: [], label: 'empty array' },
            { val: false, label: 'boolean false' }
        ];

        for (const item of invalidClicks) {
            it(`rejects invalid targetClicks: ${item.label} (${String(item.val)})`, () => {
                assert.throws(
                    () => orderService.calculateOrderCost(item.val, 1.0),
                    /targetClicks must be a positive integer/
                );
            });
        }

        // Adversarial Challenge Observation: Type Coercion Weaknesses
        it('EXPOSES BUG: calculateOrderCost accepts boolean true due to loose Number(true) coercion', () => {
            // Number(true) === 1, so calculateOrderCost(true, 1) succeeds without throwing!
            let threw = false;
            try {
                orderService.calculateOrderCost(true, 1.0);
            } catch {
                threw = true;
            }
            // Documenting empirical finding: calculateOrderCost does NOT throw for boolean true
            assert.strictEqual(threw, false, 'Expected calculateOrderCost to accept true due to Number(true) coercion bug');
        });

        it('EXPOSES BUG: calculateOrderCost accepts single-element array [100] due to loose Number([100]) coercion', () => {
            // Number([100]) === 100, so calculateOrderCost([100], 1.0) succeeds without throwing!
            let threw = false;
            try {
                orderService.calculateOrderCost([100], 1.0);
            } catch {
                threw = true;
            }
            // Documenting empirical finding: calculateOrderCost does NOT throw for array [100]
            assert.strictEqual(threw, false, 'Expected calculateOrderCost to accept [100] due to Number([100]) coercion bug');
        });

        const invalidDurations = [
            { val: 0, label: 'zero duration' },
            { val: -0.0001, label: 'micro negative duration' },
            { val: -1, label: 'negative duration' },
            { val: -24, label: 'large negative duration' },
            { val: NaN, label: 'NaN duration' },
            { val: Infinity, label: 'Infinity duration' },
            { val: -Infinity, label: '-Infinity duration' },
            { val: 'abc', label: 'string abc' },
            { val: '1.5hours', label: 'string with units' },
            { val: '', label: 'empty string' },
            { val: null, label: 'null' },
            { val: undefined, label: 'undefined' },
            { val: {}, label: 'object' },
            { val: [], label: 'empty array' }
        ];

        for (const item of invalidDurations) {
            it(`rejects invalid durationHours: ${item.label} (${String(item.val)})`, () => {
                assert.throws(
                    () => orderService.calculateOrderCost(100, item.val),
                    /durationHours must be a positive number/
                );
            });
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE 6: Parameter Validation & Adversarial Security Payloads
    // ─────────────────────────────────────────────────────────────────────────
    describe('6. Parameter Validation & Security Payloads (SQLi, XSS, Protocols)', () => {
        const baseValid = {
            targetUrl: 'https://example.com/landing',
            proxyKey: 'KIOT_PROXY_KEY_12345',
            targetClicks: 100,
            durationHours: 1.5
        };

        describe('Target URL Security & Scheme Strictness', () => {
            const maliciousUrls = [
                { url: 'javascript:alert(document.cookie)', label: 'XSS javascript: scheme' },
                { url: 'JAVASCRIPT:alert(1)', label: 'XSS uppercase JAVASCRIPT: scheme' },
                { url: 'data:text/html,<script>alert(1)</script>', label: 'XSS data: scheme' },
                { url: 'vbscript:msgbox(1)', label: 'vbscript: scheme' },
                { url: 'file:///etc/passwd', label: 'Local file traversal file:// scheme' },
                { url: 'file:///C:/Windows/win.ini', label: 'Windows file scheme' },
                { url: 'ftp://evil.com/payload', label: 'FTP scheme' },
                { url: 'ldap://evil.com/o=test', label: 'LDAP injection scheme' },
                { url: '<script>alert("xss")</script>', label: 'Direct XSS tag' },
                { url: "https://", label: 'Incomplete https scheme' },
                { url: "http://", label: 'Incomplete http scheme' },
                { url: "not-a-valid-url", label: 'Plain non-URL string' },
                { url: "   ", label: 'Whitespace URL' },
                { url: 12345, label: 'Numeric URL' },
                { url: null, label: 'Null URL' }
            ];

            for (const item of maliciousUrls) {
                it(`rejects malicious targetUrl: ${item.label}`, () => {
                    const result = orderService.validateOrderParams({ ...baseValid, targetUrl: item.url });
                    assert.strictEqual(result.isValid, false, `Failed to reject: ${item.label}`);
                    assert.ok(result.errors.length > 0);
                    assert.strictEqual(result.sanitized, null);
                });
            }

            it('accepts valid HTTP and HTTPS target URLs with complex query params', () => {
                const validUrls = [
                    'http://example.com',
                    'https://example.com',
                    'https://example.com/path/to/page',
                    'https://example.com?query=hello&category=123',
                    'https://subdomain.domain.co.uk:8080/deep/link#anchor'
                ];
                for (const u of validUrls) {
                    const res = orderService.validateOrderParams({ ...baseValid, targetUrl: u });
                    assert.strictEqual(res.isValid, true, `Valid URL rejected: ${u}`);
                    assert.strictEqual(res.sanitized.targetUrl, u);
                }
            });
        });

        describe('Proxy Key Validation & Security Payloads', () => {
            const invalidKeys = [
                { key: '', label: 'empty string' },
                { key: '   ', label: 'whitespace only' },
                { key: null, label: 'null proxyKey' },
                { key: undefined, label: 'undefined proxyKey' },
                { key: 12345, label: 'numeric proxyKey' },
                { key: {}, label: 'object proxyKey' },
                { key: [], label: 'array proxyKey' }
            ];

            for (const item of invalidKeys) {
                it(`rejects invalid proxyKey: ${item.label}`, () => {
                    const res = orderService.validateOrderParams({ ...baseValid, proxyKey: item.key });
                    assert.strictEqual(res.isValid, false, `Failed to reject proxyKey: ${item.label}`);
                    assert.ok(res.errors.some(e => e.includes('proxyKey')));
                });
            }

            // Adversarial Challenge Observation: Unsanitized Proxy Key
            it('EXPOSES VULNERABILITY: validateOrderParams allows XSS payloads in proxyKey', () => {
                const xssPayload = '<script>alert("xss")</script>';
                const res = orderService.validateOrderParams({ ...baseValid, proxyKey: xssPayload });
                // Documenting empirical finding: validateOrderParams currently permits XSS strings
                assert.strictEqual(res.isValid, true, 'Currently accepts unescaped HTML/XSS in proxyKey');
                assert.strictEqual(res.sanitized.proxyKey, xssPayload);
            });

            it('EXPOSES VULNERABILITY: validateOrderParams allows SQL injection payloads in proxyKey', () => {
                const sqliPayload = "'; DROP TABLE orders; --";
                const res = orderService.validateOrderParams({ ...baseValid, proxyKey: sqliPayload });
                // Documenting empirical finding: validateOrderParams currently permits SQLi strings
                assert.strictEqual(res.isValid, true, 'Currently accepts SQL injection syntax in proxyKey');
                assert.strictEqual(res.sanitized.proxyKey, sqliPayload);
            });
        });

        describe('Order ID Sanitization & Path Traversal Immunity', () => {
            const traversalIds = [
                '../../etc/passwd',
                '..\\..\\windows\\system32',
                '..',
                '.',
                '/root/orders/123',
                '\\secret\\file',
                'orders/hack',
                'ORD-12345/../../evil'
            ];

            for (const tid of traversalIds) {
                it(`rejects path traversal attempt in getOrder: ${tid}`, () => {
                    const order = orderService.getOrder(tid);
                    assert.strictEqual(order, null, `Path traversal leaked data for: ${tid}`);
                });
            }

            it('safely handles null, undefined, numeric, and object orderId in getOrder', () => {
                assert.strictEqual(orderService.getOrder(null), null);
                assert.strictEqual(orderService.getOrder(undefined), null);
                assert.strictEqual(orderService.getOrder(12345), null);
                assert.strictEqual(orderService.getOrder({}), null);
            });
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE 7: HTTP API Endpoint Adversarial Stress Testing
    // ─────────────────────────────────────────────────────────────────────────
    describe('7. HTTP API Endpoint Adversarial Stress Testing', () => {
        let testPort = 0;
        let baseUrl = '';
        let testServer = null;

        before(async () => {
            await new Promise((resolve) => {
                testServer = server.listen(0, '127.0.0.1', () => {
                    testPort = testServer.address().port;
                    baseUrl = `http://127.0.0.1:${testPort}`;
                    resolve();
                });
            });
        });

        after(async () => {
            if (testServer) {
                await new Promise((resolve) => testServer.close(resolve));
            }
        });

        function postJson(urlPath, payload) {
            return new Promise((resolve, reject) => {
                const url = new URL(urlPath, baseUrl);
                const data = JSON.stringify(payload);
                const req = http.request({
                    hostname: url.hostname,
                    port: url.port,
                    path: url.pathname,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(data)
                    }
                }, (res) => {
                    let buf = '';
                    res.on('data', chunk => { buf += chunk; });
                    res.on('end', () => {
                        let parsed = null;
                        try { parsed = JSON.parse(buf); } catch { parsed = buf; }
                        resolve({ status: res.statusCode, body: parsed });
                    });
                });
                req.on('error', reject);
                req.write(data);
                req.end();
            });
        }

        it('POST /api/orders/calculate-cost correctly calculates all 12 fractional duration test cases', async () => {
            const cases = [
                { h: 0.0001, expectedHours: 1, expectedTotal: 42000 },
                { h: 0.01,   expectedHours: 1, expectedTotal: 42000 },
                { h: 0.5,    expectedHours: 1, expectedTotal: 42000 },
                { h: 0.9999, expectedHours: 1, expectedTotal: 42000 },
                { h: 1.0,    expectedHours: 1, expectedTotal: 42000 },
                { h: 1.0001, expectedHours: 2, expectedTotal: 44000 },
                { h: 1.5,    expectedHours: 2, expectedTotal: 44000 },
                { h: 2.0,    expectedHours: 2, expectedTotal: 44000 },
                { h: 2.0001, expectedHours: 3, expectedTotal: 46000 },
                { h: 23.9,   expectedHours: 24, expectedTotal: 88000 },
                { h: 24.0,   expectedHours: 24, expectedTotal: 88000 },
                { h: 72.5,   expectedHours: 73, expectedTotal: 186000 }
            ];

            for (const c of cases) {
                const res = await postJson('/api/orders/calculate-cost', {
                    targetClicks: 1000,
                    durationHours: c.h
                });

                assert.strictEqual(res.status, 200, `Failed status for h=${c.h}`);
                assert.strictEqual(res.body.success, true);
                assert.strictEqual(res.body.clickFee, 40000);
                assert.strictEqual(res.body.roundedHours, c.expectedHours);
                assert.strictEqual(res.body.totalAmount, c.expectedTotal);
                assert.strictEqual(res.body.durationFee % 2000, 0);
            }
        });

        it('POST /api/orders/calculate-cost rejects negative and non-numeric inputs with HTTP 400', async () => {
            const badBodies = [
                { targetClicks: -100, durationHours: 1 },
                { targetClicks: 100, durationHours: -1 },
                { targetClicks: 0, durationHours: 1 },
                { targetClicks: 100, durationHours: 0 },
                { targetClicks: 'invalid', durationHours: 1 },
                { targetClicks: 100, durationHours: 'invalid' },
                { targetClicks: 1.5, durationHours: 1 },
                {}
            ];

            for (const b of badBodies) {
                const res = await postJson('/api/orders/calculate-cost', b);
                assert.strictEqual(res.status, 400, `Expected 400 for ${JSON.stringify(b)}, got ${res.status}`);
                assert.strictEqual(res.body.success, false);
            }
        });

        it('EXPOSES API GAP: POST /api/orders/calculate-cost returns 200 OK for boolean true instead of 400', async () => {
            const res = await postJson('/api/orders/calculate-cost', {
                targetClicks: true,
                durationHours: 1
            });
            // Demonstrates that the API endpoint currently accepts boolean true
            assert.strictEqual(res.status, 200, 'API endpoint currently accepts boolean true');
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.targetClicks, 1);
        });

        it('POST /api/orders rejects XSS targetUrl with HTTP 400', async () => {
            const res = await postJson('/api/orders', {
                targetUrl: 'javascript:alert(1)',
                proxyKey: 'VALID_KEY',
                targetClicks: 100,
                durationHours: 1
            });

            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.success, false);
            assert.ok(res.body.message.includes('protocol'));
        });

        it('POST /api/orders rejects empty proxyKey with HTTP 400', async () => {
            const res = await postJson('/api/orders', {
                targetUrl: 'https://example.com',
                proxyKey: '   ',
                targetClicks: 100,
                durationHours: 1
            });

            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.success, false);
            assert.ok(res.body.message.includes('proxyKey'));
        });

        it('POST /api/orders creates valid order with exact VietQR parameters', async () => {
            const res = await postJson('/api/orders', {
                targetUrl: 'https://traffic-test.example.com',
                proxyKey: 'DEMO_KEY_XYZ_999',
                targetClicks: 2500,
                durationHours: 2.1
            });

            assert.strictEqual(res.status, 201);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.targetClicks, 2500);
            assert.strictEqual(res.body.roundedHours, 3);
            assert.strictEqual(res.body.clickFee, 100000); // 2500 * 40
            assert.strictEqual(res.body.durationFee, 6000); // 3 * 2000
            assert.strictEqual(res.body.totalAmount, 106000);
            assert.strictEqual(res.body.status, 'pending_payment');
            assert.ok(res.body.vietQrUrl.includes('amount=106000'));
            assert.ok(res.body.vietQrUrl.includes(`addInfo=${res.body.orderCode}`));

            // Cleanup test file
            const testFilePath = path.join(__dirname, '..', 'orders', `${res.body.orderId}.json`);
            if (fs.existsSync(testFilePath)) {
                fs.unlinkSync(testFilePath);
            }
        });
    });
});
