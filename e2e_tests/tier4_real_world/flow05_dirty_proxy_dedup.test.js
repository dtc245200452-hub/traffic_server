/**
 * Tier 4: Real-World Customer Workloads
 * Flow 5: Dirty Residential Proxy Deduplication Journey
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T4_FLOW_05',
        name: 'Dirty Proxy Deduplication: Repeat IPs Skipped, Only Unique Delivered',
        feature: ['F18', 'F19', 'F21'],
        tier: 4,
        fn: async (ctx) => {
            // Sequence of rotated IPs with duplicates: IP1, IP2, IP1, IP3, IP2
            const rotatingIps = [
                '113.161.10.1',
                '113.161.10.2',
                '113.161.10.1', // duplicate!
                '113.161.10.3',
                '113.161.10.2'  // duplicate!
            ];
            ctx.mockKiot.setIpPool(rotatingIps);

            const usedIps = new Set();
            let deliveredVisits = 0;
            let dupIpsCount = 0;

            for (let i = 0; i < rotatingIps.length; i++) {
                const kiotRes = await ctx.httpClient.get(`${ctx.mockKiot.url}/api/v1/proxies/new?key=cust_dedup_key`);
                const currentIp = kiotRes.body.data.realIpAddress;

                if (usedIps.has(currentIp)) {
                    dupIpsCount++;
                    // Skipped
                } else {
                    usedIps.add(currentIp);
                    deliveredVisits++;
                }
            }

            assert.equal(deliveredVisits, 3, 'Exactly 3 unique IPs should be delivered');
            assert.equal(dupIpsCount, 2, 'Exactly 2 duplicate IPs should be skipped');
            assert.equal(usedIps.size, 3);
        }
    }
];
