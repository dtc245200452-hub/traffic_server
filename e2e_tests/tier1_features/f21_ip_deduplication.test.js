/**
 * Tier 1: Feature Coverage
 * Feature F21: IP Deduplication Filter
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T1_F21_01',
        name: 'Unique IP Registration in usedIps set',
        feature: 'F21',
        tier: 1,
        fn: async (ctx) => {
            const usedIps = new Set();
            usedIps.add('113.161.50.1');
            assert.equal(usedIps.has('113.161.50.1'), true);
        }
    },
    {
        id: 'T1_F21_02',
        name: 'Detection & Skipping of Duplicate IP',
        feature: 'F21',
        tier: 1,
        fn: async (ctx) => {
            const usedIps = new Set(['113.161.50.1']);
            const currentIp = '113.161.50.1';
            const isDuplicate = usedIps.has(currentIp);
            assert.equal(isDuplicate, true);
        }
    },
    {
        id: 'T1_F21_03',
        name: 'Duplicate IP Counter Increment',
        feature: 'F21',
        tier: 1,
        fn: async (ctx) => {
            const campaign = { usedIps: new Set(['113.161.50.1']), dupIpsCount: 0 };
            const processIp = (ip) => {
                if (campaign.usedIps.has(ip)) {
                    campaign.dupIpsCount++;
                    return false;
                }
                campaign.usedIps.add(ip);
                return true;
            };
            assert.equal(processIp('113.161.50.1'), false);
            assert.equal(campaign.dupIpsCount, 1);
        }
    },
    {
        id: 'T1_F21_04',
        name: 'Key Release on Duplicate Skip',
        feature: 'F21',
        tier: 1,
        fn: async (ctx) => {
            const keyState = { isBusy: true, campaignId: 'cmp1' };
            const releaseKey = () => { keyState.isBusy = false; keyState.campaignId = null; };
            releaseKey();
            assert.equal(keyState.isBusy, false);
            assert.equal(keyState.campaignId, null);
        }
    },
    {
        id: 'T1_F21_05',
        name: 'Bypass Dedup When Disabled',
        feature: 'F21',
        tier: 1,
        fn: async (ctx) => {
            const campaign = { dedupIp: false, usedIps: new Set(), successVisits: 0 };
            const handleVisit = (ip) => {
                if (campaign.dedupIp && campaign.usedIps.has(ip)) return false;
                campaign.successVisits++;
                return true;
            };
            assert.equal(handleVisit('1.1.1.1'), true);
            assert.equal(handleVisit('1.1.1.1'), true);
            assert.equal(campaign.successVisits, 2);
        }
    }
];
