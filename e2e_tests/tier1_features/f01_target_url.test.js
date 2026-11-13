/**
 * Tier 1: Feature Coverage
 * Feature F01: Target URL Validation
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T1_F01_01',
        name: 'Standard HTTPS URL Submission',
        feature: 'F01',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com/shop',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            assert.equal(res.ok, true, 'Order creation should succeed');
            const order = res.body.order || res.body;
            assert.equal(order.targetUrl, 'https://example.com/shop');
        }
    },
    {
        id: 'T1_F01_02',
        name: 'Standard HTTP URL Submission',
        feature: 'F01',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'http://example.org/blog/post-1',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            assert.equal(res.ok, true);
            const order = res.body.order || res.body;
            assert.ok(order.targetUrl.startsWith('http://'));
        }
    },
    {
        id: 'T1_F01_03',
        name: 'Target URL with Explicit Port',
        feature: 'F01',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'http://127.0.0.1:8080/landing',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            assert.equal(res.ok, true);
            const order = res.body.order || res.body;
            const parsed = new URL(order.targetUrl);
            assert.equal(parsed.port, '8080');
        }
    },
    {
        id: 'T1_F01_04',
        name: 'Target URL with Query Parameters & Fragment',
        feature: 'F01',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://shop.vn/item?id=45&utm_source=fb#details',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            assert.equal(res.ok, true);
            const order = res.body.order || res.body;
            assert.ok(order.targetUrl.includes('utm_source=fb'));
        }
    },
    {
        id: 'T1_F01_05',
        name: 'Target URL with Subdomains and Paths',
        feature: 'F01',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://sub.portal.domain.com.vn/api/v2/view',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            assert.equal(res.ok, true);
            const order = res.body.order || res.body;
            assert.equal(order.targetUrl, 'https://sub.portal.domain.com.vn/api/v2/view');
        }
    }
];
