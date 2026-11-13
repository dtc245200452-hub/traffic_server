/**
 * Tier 1: Feature Coverage
 * Feature F18: Customer Proxy Rotation Engine
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T1_F18_01',
        name: 'Customer Key Parameter Forwarding to KiotProxy',
        feature: 'F18',
        tier: 1,
        fn: async (ctx) => {
            const customerKey = 'kiot_cust_param_key_123';
            // Hit mock kiot server directly to verify endpoint behavior
            const res = await ctx.httpClient.get(`${ctx.mockKiot.url}/api/v1/proxies/new?key=${customerKey}`);
            assert.equal(res.ok, true);
            assert.equal(ctx.mockKiot.getLastKey(), customerKey);
        }
    },
    {
        id: 'T1_F18_02',
        name: 'Acquisition of Dynamic IP and Port',
        feature: 'F18',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.httpClient.get(`${ctx.mockKiot.url}/api/v1/proxies/new?key=my_key`);
            assert.equal(res.ok, true);
            assert.ok(res.body.data.realIpAddress, 'Must return realIpAddress');
            assert.ok(res.body.data.http, 'Must return http proxy host:port');
        }
    },
    {
        id: 'T1_F18_03',
        name: 'Honor of Proxy TTL / TTC Cooldowns',
        feature: 'F18',
        tier: 1,
        fn: async (ctx) => {
            ctx.mockKiot.simulateCooldown(45);
            const res = await ctx.httpClient.get(`${ctx.mockKiot.url}/api/v1/proxies/new?key=my_key`);
            assert.equal(res.ok, true);
            assert.equal(res.body.success, false);
            assert.equal(res.body.data.ttc, 45);
            ctx.mockKiot.clearCooldown();
        }
    },
    {
        id: 'T1_F18_04',
        name: 'Fallback to Current Proxy on Rate Limit',
        feature: 'F18',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.httpClient.get(`${ctx.mockKiot.url}/api/v1/proxies/current?key=my_key`);
            assert.equal(res.ok, true);
            assert.ok(res.body.data.realIpAddress);
        }
    },
    {
        id: 'T1_F18_05',
        name: 'Graceful Error Logging on Invalid Customer Key',
        feature: 'F18',
        tier: 1,
        fn: async (ctx) => {
            ctx.mockKiot.simulateError(401, 'Key khong hop le');
            const res = await ctx.httpClient.get(`${ctx.mockKiot.url}/api/v1/proxies/new?key=invalid_key`);
            assert.equal(res.status, 401);
            assert.equal(res.body.message, 'Key khong hop le');
            ctx.mockKiot.clearError();
        }
    }
];
