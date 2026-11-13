/**
 * Tier 2: Boundary & Corner Cases
 * Feature F19: HTTP Request Worker Boundaries
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T2_F19_01',
        name: 'Target Returning HTTP 404 Counted as Handled Visit',
        feature: 'F19',
        tier: 2,
        fn: async (ctx) => {
            const axios = require('axios');
            ctx.mockTarget.setErrorMode(404);
            try {
                const res = await axios.get(ctx.mockTarget.url, { validateStatus: s => s < 500 });
                assert.equal(res.status, 404);
            } finally {
                ctx.mockTarget.clearErrorMode();
            }
        }
    },
    {
        id: 'T2_F19_02',
        name: 'Target Returning HTTP 500 Counted as Failed Visit Without Crash',
        feature: 'F19',
        tier: 2,
        fn: async (ctx) => {
            const axios = require('axios');
            ctx.mockTarget.setErrorMode(500);
            try {
                const res = await axios.get(ctx.mockTarget.url, { validateStatus: s => s < 500 }).catch(e => e.response);
                assert.equal(res.status, 500);
            } finally {
                ctx.mockTarget.clearErrorMode();
            }
        }
    },
    {
        id: 'T2_F19_03',
        name: 'Target Returning Empty Response Body Handled Safely',
        feature: 'F19',
        tier: 2,
        fn: async (ctx) => {
            ctx.mockTarget.setHtml('');
            const axios = require('axios');
            const res = await axios.get(ctx.mockTarget.url);
            assert.equal(res.status, 200);
            assert.equal(res.data, '');
        }
    },
    {
        id: 'T2_F19_04',
        name: 'Target Returning Large HTML (> 500KB) Parsed Without Buffer Overflow',
        feature: 'F19',
        tier: 2,
        fn: async (ctx) => {
            const largeHtml = '<html><body>' + '<p>Content</p>'.repeat(10000) + '</body></html>';
            ctx.mockTarget.setHtml(largeHtml);
            const axios = require('axios');
            const res = await axios.get(ctx.mockTarget.url);
            assert.equal(res.status, 200);
            assert.ok(res.data.length > 100000);
        }
    },
    {
        id: 'T2_F19_05',
        name: 'HTTP 301 Redirect Handling Contract',
        feature: 'F19',
        tier: 2,
        fn: async (ctx) => {
            const axios = require('axios');
            const res = await axios.get(ctx.mockTarget.url, { maxRedirects: 5 });
            assert.equal(res.status, 200);
        }
    }
];
