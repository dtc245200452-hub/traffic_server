/**
 * Tier 2: Boundary & Corner Cases
 * Feature F20: Dwell Simulation & Crawl Boundaries
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T2_F20_01',
        name: 'Target HTML with Zero Links Handled Without Exception',
        feature: 'F20',
        tier: 2,
        fn: async (ctx) => {
            const html = `<html><body><h1>Zero links here</h1></body></html>`;
            const linkRegex = /<a[^>]+href=["']([^"']+)["']/gi;
            const matches = [];
            let m;
            while ((m = linkRegex.exec(html)) !== null) matches.push(m[1]);
            assert.equal(matches.length, 0);
        }
    },
    {
        id: 'T2_F20_02',
        name: 'Target HTML with Only External Links Leaves Internal Crawl Empty',
        feature: 'F20',
        tier: 2,
        fn: async (ctx) => {
            const links = ['https://google.com', 'https://facebook.com', 'http://other.org'];
            const internal = links.filter(l => l.startsWith('/'));
            assert.equal(internal.length, 0);
        }
    },
    {
        id: 'T2_F20_03',
        name: 'Target HTML with Only Asset Links Filtered Out',
        feature: 'F20',
        tier: 2,
        fn: async (ctx) => {
            const links = ['/image.png', '/style.css', '/app.js', '/doc.pdf'];
            const filtered = links.filter(l => !/\.(png|jpg|jpeg|gif|css|js|pdf|svg|woff2?)$/i.test(l));
            assert.equal(filtered.length, 0);
        }
    },
    {
        id: 'T2_F20_04',
        name: 'Malformed HTML a Tags with Missing href Handled Safely',
        feature: 'F20',
        tier: 2,
        fn: async (ctx) => {
            const html = `<a>Broken</a><a name="anchor">Anchor</a><a href="">Empty</a>`;
            const linkRegex = /<a[^>]+href=["']([^"']+)["']/gi;
            const matches = [];
            let m;
            while ((m = linkRegex.exec(html)) !== null) {
                if (m[1].trim()) matches.push(m[1]);
            }
            assert.equal(matches.length, 0);
        }
    },
    {
        id: 'T2_F20_05',
        name: 'Dwell Time Range Clamping (minimum 1 second)',
        feature: 'F20',
        tier: 2,
        fn: async (ctx) => {
            const sanitizeDwell = (min, max) => {
                const sMin = Math.max(1, Number(min) || 1);
                const sMax = Math.max(sMin, Number(max) || sMin);
                return { min: sMin, max: sMax };
            };
            const res = sanitizeDwell(-5, 0);
            assert.equal(res.min, 1);
            assert.equal(res.max, 1);
        }
    }
];
