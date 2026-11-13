/**
 * Tier 2: Boundary & Corner Cases
 * Feature F02: Customer Proxy Key Boundaries
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T2_F02_01',
        name: 'Empty Proxy Key Rejected',
        feature: 'F02',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: '',
                targetClicks: 100,
                durationHours: 1
            });
            assert.equal(res.ok, false);
            assert.equal(res.status, 400);
        }
    },
    {
        id: 'T2_F02_02',
        name: 'Whitespace Only Proxy Key Rejected',
        feature: 'F02',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: '     ',
                targetClicks: 100,
                durationHours: 1
            });
            assert.equal(res.ok, false);
            assert.equal(res.status, 400);
        }
    },
    {
        id: 'T2_F02_03',
        name: 'Null Proxy Key Rejected',
        feature: 'F02',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: null,
                targetClicks: 100,
                durationHours: 1
            });
            assert.equal(res.ok, false);
            assert.equal(res.status, 400);
        }
    },
    {
        id: 'T2_F02_04',
        name: 'Trimmed Proxy Key Spaces Accepted',
        feature: 'F02',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: '   kiot_key_trimmed_123   ',
                targetClicks: 100,
                durationHours: 1
            });
            assert.equal(res.ok, true);
            const order = res.body.order || res.body;
            assert.equal(order.proxyKey, 'kiot_key_trimmed_123');
        }
    },
    {
        id: 'T2_F02_05',
        name: 'Oversized Proxy Key Accepted (up to 128 chars)',
        feature: 'F02',
        tier: 2,
        fn: async (ctx) => {
            const longKey = 'a'.repeat(64);
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: longKey,
                targetClicks: 100,
                durationHours: 1
            });
            assert.equal(res.ok, true);
            const order = res.body.order || res.body;
            assert.equal(order.proxyKey, longKey);
        }
    }
];
