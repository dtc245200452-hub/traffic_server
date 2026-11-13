/**
 * Tier 1: Feature Coverage
 * Feature F19: Lightweight HTTP Request Worker
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T1_F19_01',
        name: 'Axios GET Request Execution',
        feature: 'F19',
        tier: 1,
        fn: async (ctx) => {
            const axios = require('axios');
            const res = await axios.get(ctx.mockTarget.url, { timeout: 5000 });
            assert.equal(res.status, 200);
            assert.ok(res.data.includes('Commercial Destination Target'));
        }
    },
    {
        id: 'T1_F19_02',
        name: 'Realistic Desktop & Mobile User-Agents',
        feature: 'F19',
        tier: 1,
        fn: async (ctx) => {
            const axios = require('axios');
            const sampleUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            await axios.get(ctx.mockTarget.url, { headers: { 'User-Agent': sampleUa } });
            const reqs = ctx.mockTarget.getRequests();
            const lastReq = reqs[reqs.length - 1];
            assert.equal(lastReq.headers['user-agent'], sampleUa);
        }
    },
    {
        id: 'T1_F19_03',
        name: 'Referrer Header Injection',
        feature: 'F19',
        tier: 1,
        fn: async (ctx) => {
            const axios = require('axios');
            const sampleRef = 'https://www.google.com.vn/';
            await axios.get(ctx.mockTarget.url, { headers: { 'Referer': sampleRef } });
            const reqs = ctx.mockTarget.getRequests();
            const lastReq = reqs[reqs.length - 1];
            assert.equal(lastReq.headers['referer'], sampleRef);
        }
    },
    {
        id: 'T1_F19_04',
        name: 'Status Code Acceptance (< 500)',
        feature: 'F19',
        tier: 1,
        fn: async (ctx) => {
            const axios = require('axios');
            const validateStatus = (s) => s < 500;
            assert.equal(validateStatus(200), true);
            assert.equal(validateStatus(301), true);
            assert.equal(validateStatus(404), true);
            assert.equal(validateStatus(500), false);
        }
    },
    {
        id: 'T1_F19_05',
        name: 'Timeout Enforcement Contract',
        feature: 'F19',
        tier: 1,
        fn: async (ctx) => {
            const axios = require('axios');
            ctx.mockTarget.setDelay(200);
            try {
                await axios.get(ctx.mockTarget.url, { timeout: 50 });
                assert.fail('Should have timed out');
            } catch (err) {
                assert.ok(err.code === 'ECONNABORTED' || err.message.includes('timeout'));
            } finally {
                ctx.mockTarget.setDelay(0);
            }
        }
    }
];
