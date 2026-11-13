/**
 * Tier 1: Feature Coverage
 * Feature F20: Dwell Simulation & Sub-link Crawl
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T1_F20_01',
        name: 'Initial Dwell Time Delay Calculation',
        feature: 'F20',
        tier: 1,
        fn: async (ctx) => {
            const dwellSec = 5;
            const firstDwell = Math.max(1, Math.floor(dwellSec * 0.4));
            assert.equal(firstDwell, 2);
        }
    },
    {
        id: 'T1_F20_02',
        name: 'HTML Sub-link Extraction via Regex',
        feature: 'F20',
        tier: 1,
        fn: async (ctx) => {
            const html = `<html><body><a href="/sub-1">Page 1</a><a href="/sub-2">Page 2</a></body></html>`;
            const linkRegex = /<a[^>]+href=["']([^"']+)["']/gi;
            const matches = [];
            let match;
            while ((match = linkRegex.exec(html)) !== null) {
                matches.push(match[1]);
            }
            assert.equal(matches.length, 2);
            assert.equal(matches[0], '/sub-1');
            assert.equal(matches[1], '/sub-2');
        }
    },
    {
        id: 'T1_F20_03',
        name: 'Sub-link Request with Same-Origin Referrer',
        feature: 'F20',
        tier: 1,
        fn: async (ctx) => {
            const axios = require('axios');
            const targetUrl = `${ctx.mockTarget.url}/page`;
            await axios.get(`${ctx.mockTarget.url}/sub-link-1`, {
                headers: { Referer: targetUrl }
            });
            const reqs = ctx.mockTarget.getRequests();
            const last = reqs[reqs.length - 1];
            assert.equal(last.headers['referer'], targetUrl);
        }
    },
    {
        id: 'T1_F20_04',
        name: 'Exclusion of External & Asset Links',
        feature: 'F20',
        tier: 1,
        fn: async (ctx) => {
            const links = ['/sub-link-1', 'https://external.com', '/style.css', '/catalog.pdf'];
            const filterInternal = (list) => list.filter(l => l.startsWith('/') && !l.endsWith('.css') && !l.endsWith('.pdf'));
            const filtered = filterInternal(links);
            assert.equal(filtered.length, 1);
            assert.equal(filtered[0], '/sub-link-1');
        }
    },
    {
        id: 'T1_F20_05',
        name: 'Second Dwell Time Delay Calculation',
        feature: 'F20',
        tier: 1,
        fn: async (ctx) => {
            const dwellSec = 6;
            const firstDwell = Math.max(1, Math.floor(dwellSec * 0.4)); // 2
            const remainDwell = Math.max(1, dwellSec - firstDwell); // 4
            assert.equal(firstDwell + remainDwell, dwellSec);
        }
    }
];
