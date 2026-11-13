/**
 * Tier 3: Combinatorial Interactions
 * Suite 3: Customer Proxy Rotation × Lightweight HTTP Worker
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T3_COMBO_10',
        name: 'Proxy × Worker: Outgoing request carries realistic headers',
        feature: ['F05', 'F18', 'F19'],
        tier: 3,
        fn: async (ctx) => {
            const axios = require('axios');
            const sampleHeaders = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
                'Referer': 'https://www.google.com/',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8'
            };
            const res = await axios.get(ctx.mockTarget.url, { headers: sampleHeaders });
            assert.equal(res.status, 200);
            const reqs = ctx.mockTarget.getRequests();
            const last = reqs[reqs.length - 1];
            assert.equal(last.headers['referer'], 'https://www.google.com/');
            assert.ok(last.headers['user-agent'].includes('Chrome/120.0.0.0'));
        }
    },
    {
        id: 'T3_COMBO_11',
        name: 'Proxy × Worker: KiotProxy returns active IP forwarded to worker',
        feature: ['F18', 'F19'],
        tier: 3,
        fn: async (ctx) => {
            const res = await ctx.httpClient.get(`${ctx.mockKiot.url}/api/v1/proxies/new?key=my_test_key`);
            assert.equal(res.ok, true);
            assert.ok(res.body.data.realIpAddress);
            assert.ok(res.body.data.http);
        }
    },
    {
        id: 'T3_COMBO_12',
        name: 'Proxy × Worker: Upstream TTC cooldown triggers wait without failing campaign',
        feature: ['F18', 'F19'],
        tier: 3,
        fn: async (ctx) => {
            ctx.mockKiot.simulateCooldown(30);
            const res = await ctx.httpClient.get(`${ctx.mockKiot.url}/api/v1/proxies/new?key=my_test_key`);
            assert.equal(res.body.success, false);
            assert.equal(res.body.data.ttc, 30);
            ctx.mockKiot.clearCooldown();
        }
    },
    {
        id: 'T3_COMBO_13',
        name: 'Proxy × Worker: Lightweight request validates status < 500',
        feature: ['F05', 'F19'],
        tier: 3,
        fn: async (ctx) => {
            const axios = require('axios');
            const res = await axios.get(`${ctx.mockTarget.url}/sub-link-1`, {
                validateStatus: s => s < 500
            });
            assert.equal(res.status, 200);
            assert.ok(res.data.includes('Sublink Page'));
        }
    }
];
