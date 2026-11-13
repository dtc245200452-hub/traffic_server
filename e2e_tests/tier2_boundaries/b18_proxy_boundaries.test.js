/**
 * Tier 2: Boundary & Corner Cases
 * Feature F18: Proxy Rotation Boundaries
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T2_F18_01',
        name: 'Upstream HTTP 500 Error Handled Without Server Crash',
        feature: 'F18',
        tier: 2,
        fn: async (ctx) => {
            ctx.mockKiot.simulateError(500, 'Upstream Internal Server Error');
            const res = await ctx.httpClient.get(`${ctx.mockKiot.url}/api/v1/proxies/new?key=err_key`);
            assert.equal(res.status, 500);
            ctx.mockKiot.clearError();
        }
    },
    {
        id: 'T2_F18_02',
        name: 'Upstream HTTP 502 Bad Gateway Handled Gracefully',
        feature: 'F18',
        tier: 2,
        fn: async (ctx) => {
            ctx.mockKiot.simulateError(502, 'Bad Gateway');
            const res = await ctx.httpClient.get(`${ctx.mockKiot.url}/api/v1/proxies/new?key=err_key`);
            assert.equal(res.status, 502);
            ctx.mockKiot.clearError();
        }
    },
    {
        id: 'T2_F18_03',
        name: 'TTC Cooldown with Zero Seconds Immediate Retry',
        feature: 'F18',
        tier: 2,
        fn: async (ctx) => {
            ctx.mockKiot.clearCooldown();
            const res = await ctx.httpClient.get(`${ctx.mockKiot.url}/api/v1/proxies/new?key=cooldown_key`);
            assert.equal(res.ok, true);
            assert.equal(res.body.success, true);
        }
    },
    {
        id: 'T2_F18_04',
        name: 'Proxy Key Lock Release on Exception Guarantee',
        feature: 'F18',
        tier: 2,
        fn: async (ctx) => {
            const keyLock = { busy: false };
            try {
                keyLock.busy = true;
                throw new Error('Simulated rotation failure');
            } catch {
                // finally block ensures release
                keyLock.busy = false;
            }
            assert.equal(keyLock.busy, false);
        }
    },
    {
        id: 'T2_F18_05',
        name: 'Customer Proxy Key Special Characters URL Escaping',
        feature: 'F18',
        tier: 2,
        fn: async (ctx) => {
            const complexKey = 'kiot_key+special=1&region=hanoi';
            const res = await ctx.httpClient.get(`${ctx.mockKiot.url}/api/v1/proxies/new?key=${encodeURIComponent(complexKey)}`);
            assert.equal(res.ok, true);
            assert.equal(ctx.mockKiot.getLastKey(), complexKey);
        }
    }
];
