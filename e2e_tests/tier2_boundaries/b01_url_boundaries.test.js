/**
 * Tier 2: Boundary & Corner Cases
 * Feature F01: Target URL Boundaries
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T2_F01_01',
        name: 'Empty Target URL Rejected',
        feature: 'F01',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: '',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            assert.equal(res.ok, false);
            assert.equal(res.status, 400);
        }
    },
    {
        id: 'T2_F01_02',
        name: 'Whitespace Only Target URL Rejected',
        feature: 'F01',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: '    ',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            assert.equal(res.ok, false);
            assert.equal(res.status, 400);
        }
    },
    {
        id: 'T2_F01_03',
        name: 'Invalid Scheme (FTP) Rejected',
        feature: 'F01',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'ftp://files.example.com/data.zip',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            assert.equal(res.ok, false);
            assert.equal(res.status, 400);
        }
    },
    {
        id: 'T2_F01_04',
        name: 'Malformed Non-URL String Rejected',
        feature: 'F01',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'not_a_valid_url_string',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            assert.equal(res.ok, false);
            assert.equal(res.status, 400);
        }
    },
    {
        id: 'T2_F01_05',
        name: 'Javascript Pseudo-Protocol Scheme Rejected (XSS Prevention)',
        feature: 'F01',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'javascript:alert(1)',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            assert.equal(res.ok, false);
            assert.equal(res.status, 400);
        }
    }
];
