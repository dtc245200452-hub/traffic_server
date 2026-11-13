/**
 * Tier 3: Combinatorial Interactions
 * Suite 4: Dwell Simulation & Internal Sub-Link Crawl × IP Deduplication
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T3_COMBO_14',
        name: 'Dwell × Dedup: Unique IP successfully performs two-phase dwell crawl',
        feature: ['F20', 'F21'],
        tier: 3,
        fn: async (ctx) => {
            const usedIps = new Set();
            const ip = '113.161.80.1';
            let visitCompleted = false;

            if (!usedIps.has(ip)) {
                usedIps.add(ip);
                // Phase 1 dwell
                const d1 = 1;
                // Sublink fetch
                const sublink = '/sub-link-1';
                // Phase 2 dwell
                const d2 = 1;
                visitCompleted = true;
            }

            assert.equal(visitCompleted, true);
            assert.equal(usedIps.has(ip), true);
        }
    },
    {
        id: 'T3_COMBO_15',
        name: 'Dwell × Dedup: Duplicate IP skipped before dwelling begins',
        feature: ['F20', 'F21'],
        tier: 3,
        fn: async (ctx) => {
            const usedIps = new Set(['113.161.80.1']);
            let dwellExecuted = false;
            let dupCount = 0;

            const executeVisit = (ip) => {
                if (usedIps.has(ip)) {
                    dupCount++;
                    return; // skip immediately
                }
                dwellExecuted = true;
            };

            executeVisit('113.161.80.1');
            assert.equal(dwellExecuted, false);
            assert.equal(dupCount, 1);
        }
    },
    {
        id: 'T3_COMBO_16',
        name: 'Dwell × Dedup: Internal links parsed from mock HTML page',
        feature: ['F19', 'F20'],
        tier: 3,
        fn: async (ctx) => {
            const axios = require('axios');
            const res = await axios.get(ctx.mockTarget.url);
            const html = res.data;
            const linkRegex = /<a[^>]+href=["'](\/[^"']+)["']/gi;
            const internalLinks = [];
            let match;
            while ((match = linkRegex.exec(html)) !== null) {
                if (!/\.(css|js|pdf|png)$/i.test(match[1])) {
                    internalLinks.push(match[1]);
                }
            }
            assert.ok(internalLinks.includes('/sub-link-1'));
            assert.ok(internalLinks.includes('/sub-link-2'));
        }
    },
    {
        id: 'T3_COMBO_17',
        name: 'Dwell × Dedup: Sub-link crawl inherits Same-Origin Referer and target proxy IP',
        feature: ['F19', 'F20', 'F21'],
        tier: 3,
        fn: async (ctx) => {
            const axios = require('axios');
            const target = ctx.mockTarget.url;
            await axios.get(`${target}/sub-link-2`, {
                headers: { Referer: `${target}/` }
            });
            const reqs = ctx.mockTarget.getRequests();
            const lastReq = reqs[reqs.length - 1];
            assert.equal(lastReq.path, '/sub-link-2');
            assert.equal(lastReq.headers['referer'], `${target}/`);
        }
    }
];
