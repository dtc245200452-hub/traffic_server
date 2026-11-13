/**
 * Tier 4: Real-World Customer Workloads
 * Flow 4: Deep Dwell Simulation & Internal Sub-link Crawling Journey
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T4_FLOW_04',
        name: 'Deep Dwell Simulation & Sub-link Crawl Flow',
        feature: ['F05', 'F19', 'F20'],
        tier: 4,
        fn: async (ctx) => {
            const axios = require('axios');
            ctx.mockTarget.reset();

            // Step 1: Hit main target URL
            const res = await axios.get(ctx.mockTarget.url);
            assert.equal(res.status, 200);

            // Step 2: Parse internal links
            const html = res.data;
            const linkRegex = /<a[^>]+href=["'](\/[^"']+)["']/gi;
            const links = [];
            let match;
            while ((match = linkRegex.exec(html)) !== null) {
                if (!/\.(css|js|pdf|png)$/i.test(match[1])) {
                    links.push(match[1]);
                }
            }
            assert.ok(links.length > 0, 'Internal links must be discovered');

            // Step 3: Crawl selected sublink with Same-Origin Referer
            const chosenLink = links[0];
            const subRes = await axios.get(`${ctx.mockTarget.url}${chosenLink}`, {
                headers: { Referer: ctx.mockTarget.url }
            });
            assert.equal(subRes.status, 200);

            // Step 4: Verify mock target server recorded both requests with proper referrers
            const reqs = ctx.mockTarget.getRequests();
            assert.ok(reqs.length >= 2, 'Must record initial visit + sublink visit');
            const sublinkReq = reqs[reqs.length - 1];
            assert.equal(sublinkReq.path, chosenLink);
            assert.equal(sublinkReq.headers['referer'], ctx.mockTarget.url);
        }
    }
];
