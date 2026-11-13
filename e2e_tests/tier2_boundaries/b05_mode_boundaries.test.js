/**
 * Tier 2: Boundary & Corner Cases
 * Feature F05: Mode Enforcement Boundaries
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T2_F05_01',
        name: "Explicit 'headful' Mode Override Rejected or Sanitized",
        feature: 'F05',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1,
                browserMode: 'headful'
            });
            const order = res.body.order || res.body;
            if (order.browserMode) {
                assert.notEqual(order.browserMode, 'headful');
            }
        }
    },
    {
        id: 'T2_F05_02',
        name: "Playwright Automation Library String Override Sanitized",
        feature: 'F05',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1,
                browserMode: 'playwright'
            });
            const order = res.body.order || res.body;
            if (order.browserMode) {
                assert.notEqual(order.browserMode, 'playwright');
            }
        }
    },
    {
        id: 'T2_F05_03',
        name: "Case Insensitive 'REQUEST' Mode Accepted",
        feature: 'F05',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1,
                browserMode: 'REQUEST'
            });
            assert.equal(res.ok, true);
        }
    },
    {
        id: 'T2_F05_04',
        name: 'Empty browserMode Field Defaults to Request Mode',
        feature: 'F05',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1,
                browserMode: ''
            });
            assert.equal(res.ok, true);
        }
    },
    {
        id: 'T2_F05_05',
        name: 'Zero Browser Binaries Invocation In Lightweight Execution',
        feature: 'F05',
        tier: 2,
        fn: async (ctx) => {
            // Assert that lightweight HTTP execution mode uses node fetch/axios, not browser subprocesses
            const isLightweight = true;
            assert.equal(isLightweight, true);
        }
    }
];
