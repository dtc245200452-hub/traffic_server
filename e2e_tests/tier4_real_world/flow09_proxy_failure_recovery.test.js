/**
 * Tier 4: Real-World Customer Workloads
 * Flow 9: Upstream Proxy Failure Recovery & Backoff
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T4_FLOW_09',
        name: 'Proxy Failure Recovery: Upstream 502 Backoff and Graceful Resumption',
        feature: ['F18', 'F19'],
        tier: 4,
        fn: async (ctx) => {
            // Step 1: Upstream fails with 502
            ctx.mockKiot.simulateError(502, 'Bad Gateway from Upstream Telco');
            const failRes = await ctx.httpClient.get(`${ctx.mockKiot.url}/api/v1/proxies/new?key=failover_key`);
            assert.equal(failRes.status, 502);

            // Step 2: Upstream recovers
            ctx.mockKiot.clearError();
            const okRes = await ctx.httpClient.get(`${ctx.mockKiot.url}/api/v1/proxies/new?key=failover_key`);
            assert.equal(okRes.status, 200);
            assert.equal(okRes.body.success, true);
            assert.ok(okRes.body.data.realIpAddress);
        }
    }
];
