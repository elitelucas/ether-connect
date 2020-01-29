var chai = require('chai');
var assert = chai.assert;
var FakeIpcProvider = require('./helpers/FakeIpcProvider');
var FakeHttpProvider = require('./helpers/FakeHttpProvider');
var Web3 = require('../packages/web3');
var sha3 = require('../packages/web3-utils').sha3;
var formatters = require('web3-core-helpers').formatters;
var abiCoder = require('web3-eth-abi');
var utils = require('web3-utils');
var namehash = require('eth-ens-namehash');
var asciiToHex = require('../packages/web3-utils').asciiToHex;

/**
 * Injects the required validations and results for the `eth_sendTransaction` call
 *
 * @method prepareProviderForSetter
 *
 * @param {FakeIpcProvider} provider
 * @param {String} signature
 * @param {Array} types
 * @param {Array} params
 *
 * @returns {void}
 */
function prepareProviderForSetter(provider, signature, types, params) {
    provider.injectValidation(function (payload) {
        assert.equal(payload.jsonrpc, '2.0');
        assert.equal(payload.method, 'eth_sendTransaction');
        assert.deepEqual(
            payload.params,
            [{
                from: '0x0123456701234567012345670123456701234567',
                gas: '0x64',
                gasPrice: '0x64',
                nonce: '0x1',
                data: sha3(signature).slice(0, 10) + abiCoder.encodeParameters(types, params).substr(2),
                to: '0x314159265dd8dbb310642f98f50c066173c1259b'
            }]
        );
    });
    provider.injectResult('0x1234000000000000000000000000000000000000000000000000000000056789');

    provider.injectValidation(function (payload) {
        assert.equal(payload.method, 'eth_getTransactionReceipt');
        assert.deepEqual(payload.params, ['0x1234000000000000000000000000000000000000000000000000000000056789']);
    });
    provider.injectResult(null);

    provider.injectValidation(function (payload) {
        assert.equal(payload.method, 'eth_subscribe');
        assert.deepEqual(payload.params, ['newHeads']);
    });
    provider.injectResult('0x1234567');

    // fake newBlock
    provider.injectNotification({
        method: 'eth_subscription',
        params: {
            subscription: '0x1234567',
            result: {
                blockNumber: '0x10'
            }
        }
    });

    provider.injectValidation(function (payload) {
        assert.equal(payload.method, 'eth_getTransactionReceipt');
        assert.deepEqual(payload.params, ['0x1234000000000000000000000000000000000000000000000000000000056789']);
    });
    provider.injectResult({
        contractAddress: '0x314159265dd8dbb310642f98f50c066173c1259b',
        cumulativeGasUsed: '0xa',
        transactionIndex: '0x3',
        blockNumber: '0xa',
        blockHash: '0xbf1234',
        gasUsed: '0x0'
    });
    provider.injectValidation(function (payload) {
        assert.equal(payload.method, 'eth_unsubscribe');
        assert.deepEqual(payload.params, ['0x1234567']);
    });
    provider.injectResult('0x321');
}

/**
 * Checks if the receipt got mapped as expected and not manipulated in a strange way within the ENS module
 *
 * @method isExpectedReceipt
 *
 * @param {Object} receipt
 *
 * @returns {void}
 */
function isExpectedReceipt(receipt) {
    assert.equal(receipt.contractAddress, '0x314159265dD8dbb310642f98f50C066173C1259b');
    assert.equal(receipt.cumulativeGasUsed, 10);
    assert.equal(receipt.transactionIndex, 3);
    assert.equal(receipt.blockNumber, 10);
    assert.equal(receipt.blockHash, '0xbf1234');
    assert.equal(receipt.gasUsed, 0);
}

describe('ens', function () {
    var provider;
    var web3;
    const hashedName = namehash.hash('foobar.eth');
    const name = 'foobar.eth';

    describe('setters', function () {
        beforeEach(function () {
            provider = new FakeIpcProvider();
            web3 = new Web3(provider);

            provider.injectResult({
                timestamp: Math.floor(new Date() / 1000) - 60,
            });
            provider.injectValidation(function (payload) {
                assert.equal(payload.jsonrpc, '2.0');
                assert.equal(payload.method, 'eth_getBlockByNumber');
                assert.deepEqual(payload.params, ['latest', false]);
            });

            provider.injectResult(1);
            provider.injectValidation(function (payload) {
                assert.equal(payload.jsonrpc, '2.0');
                assert.equal(payload.method, 'net_version');
                assert.deepEqual(payload.params, []);
            });

            provider.injectResult({
                hash: '0xd4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3',
                blockNumber: '0x0'
            });

            provider.injectValidation(function (payload) {
                assert.equal(payload.jsonrpc, '2.0');
                assert.equal(payload.method, 'eth_getBlockByNumber');
                assert.deepEqual(payload.params, ['0x0', false]);
            });
        });

        it('should set the owner record for a name', async function () {
            const signature = 'setOwner(bytes32,address)';

            prepareProviderForSetter(
                provider,
                signature,
                ['bytes32', 'address'],
                [hashedName, '0x0123456701234567012345670123456701234567']
            );

            const receipt = await web3.eth.ens.registry.setOwner(
                name,
                '0x0123456701234567012345670123456701234567',
                {
                    from: '0x0123456701234567012345670123456701234567',
                    gas: 100,
                    gasPrice: 100,
                    nonce: 1
                });

            isExpectedReceipt(receipt);
        });

        it('should set the resolver record for a name', async function () {
            const signature = 'setResolver(bytes32,address)';

            prepareProviderForSetter(
                provider,
                signature,
                ['bytes32', 'address'],
                [hashedName, '0x0123456701234567012345670123456701234567']
            );

            const receipt = await web3.eth.ens.registry.setResolver(
                name,
                '0x0123456701234567012345670123456701234567',
                {
                    from: '0x0123456701234567012345670123456701234567',
                    gas: 100,
                    gasPrice: 100,
                    nonce: 1
                });

            isExpectedReceipt(receipt);
        });

        it('should set the TTL (caching time) record for a name', async function () {
            const signature = 'setTTL(bytes32,uint64)';

            prepareProviderForSetter(
                provider,
                signature,
                ['bytes32', 'uint64'],
                [hashedName, '1']
            );

            const receipt = await web3.eth.ens.registry.setTTL(
                name,
                '1',
                {
                    from: '0x0123456701234567012345670123456701234567',
                    gas: 100,
                    gasPrice: 100,
                    nonce: 1
                });

            isExpectedReceipt(receipt);
        });

        it('should create a new sub node with the specified label and owner', async function () {
            const signature = 'setSubnodeOwner(bytes32,bytes32,address)';

            prepareProviderForSetter(
                provider,
                signature,
                ['bytes32', 'bytes32', 'address'],
                [hashedName, utils.sha3('label'), '0x0123456701234567012345670123456701234567']
            );

            const receipt = await web3.eth.ens.registry.setSubnodeOwner(
                name,
                'label',
                '0x0123456701234567012345670123456701234567',
                {
                    from: '0x0123456701234567012345670123456701234567',
                    gas: 100,
                    gasPrice: 100,
                    nonce: 1
                });

            isExpectedReceipt(receipt);
        });
    });

    describe('getters', function () {
        beforeEach(function () {
            provider = new FakeHttpProvider();
            web3 = new Web3(provider);

            provider.injectResult({
                timestamp: Math.floor(new Date() / 1000) - 60,
            });
            provider.injectValidation(function (payload) {
                assert.equal(payload.jsonrpc, '2.0');
                assert.equal(payload.method, 'eth_getBlockByNumber');
                assert.deepEqual(payload.params, ['latest', false]);
            });

            provider.injectResult(1);
            provider.injectValidation(function (payload) {
                assert.equal(payload.jsonrpc, '2.0');
                assert.equal(payload.method, 'net_version');
                assert.deepEqual(payload.params, []);
            });

            provider.injectResult({
                hash: '0xd4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3',
                blockNumber: '0x0'
            });

            provider.injectValidation(function (payload) {
                assert.equal(payload.jsonrpc, '2.0');
                assert.equal(payload.method, 'eth_getBlockByNumber');
                assert.deepEqual(payload.params, ['0x0', false]);
            });
        });

        it('should return the owner record for a name (owner)', async function () {
            var signature = 'owner(bytes32)';

            provider.injectValidation(function (payload) {
                assert.equal(payload.jsonrpc, '2.0');
                assert.equal(payload.method, 'eth_call');
                assert.deepEqual(payload.params, [{
                    data: sha3(signature).slice(0, 10) + '1757b5941987904c18c7594de32c1726cda093fdddacb738cfbc4a7cd1ef4370',
                    to: '0x314159265dd8dbb310642f98f50c066173c1259b',
                }, 'latest']);
            });
            provider.injectResult('0x0000000000000000000000000123456701234567012345670123456701234567');

            const owner = await web3.eth.ens.registry.owner('foobar.eth');

            assert.equal(owner, '0x0123456701234567012345670123456701234567');
        });

        it('should return the owner record for a name (getOwner)', async function () {
            var signature = 'owner(bytes32)';

            provider.injectValidation(function (payload) {
                assert.equal(payload.jsonrpc, '2.0');
                assert.equal(payload.method, 'eth_call');
                assert.deepEqual(payload.params, [{
                    data: sha3(signature).slice(0, 10) + '1757b5941987904c18c7594de32c1726cda093fdddacb738cfbc4a7cd1ef4370',
                    to: '0x314159265dd8dbb310642f98f50c066173c1259b',
                }, 'latest']);
            });
            provider.injectResult('0x0000000000000000000000000123456701234567012345670123456701234567');

            const owner = await web3.eth.ens.registry.getOwner('foobar.eth');

            assert.equal(owner, '0x0123456701234567012345670123456701234567');
        });

        it('should fetch the resolver for a name (resolver)', async function () {
            var signature = 'resolver(bytes32)';

            provider.injectValidation(function (payload) {
                assert.equal(payload.jsonrpc, '2.0');
                assert.equal(payload.method, 'eth_call');
                assert.deepEqual(payload.params, [{
                    data: sha3(signature).slice(0, 10) + '1757b5941987904c18c7594de32c1726cda093fdddacb738cfbc4a7cd1ef4370',
                    to: '0x314159265dd8dbb310642f98f50c066173c1259b',
                }, 'latest']);
            });
            provider.injectResult('0x0000000000000000000000000123456701234567012345670123456701234567');

            const resolver = await web3.eth.ens.registry.resolver('foobar.eth');

            assert.equal(resolver.options.address, '0x0123456701234567012345670123456701234567');
        });

        it('should fetch the resolver for a name (getResolver)', async function () {
            var signature = 'resolver(bytes32)';

            provider.injectValidation(function (payload) {
                assert.equal(payload.jsonrpc, '2.0');
                assert.equal(payload.method, 'eth_call');
                assert.deepEqual(payload.params, [{
                    data: sha3(signature).slice(0, 10) + '1757b5941987904c18c7594de32c1726cda093fdddacb738cfbc4a7cd1ef4370',
                    to: '0x314159265dd8dbb310642f98f50c066173c1259b',
                }, 'latest']);
            });
            provider.injectResult('0x0000000000000000000000000123456701234567012345670123456701234567');

            const resolver = await web3.eth.ens.registry.getResolver('foobar.eth');

            assert.equal(resolver.options.address, '0x0123456701234567012345670123456701234567');
        });

        it('should return the addr record for a name', async function () {
            var resolverSig = 'resolver(bytes32)';
            var addrSig = 'addr(bytes32)';

            provider.injectValidation(function (payload) {
                assert.equal(payload.jsonrpc, '2.0');
                assert.equal(payload.method, 'eth_call');
                assert.deepEqual(payload.params, [{
                    data: sha3(resolverSig).slice(0, 10) + '1757b5941987904c18c7594de32c1726cda093fdddacb738cfbc4a7cd1ef4370',
                    to: '0x314159265dd8dbb310642f98f50c066173c1259b',
                }, 'latest']);
            });
            provider.injectResult('0x0000000000000000000000000123456701234567012345670123456701234567');

            provider.injectValidation(function (payload) {
                assert.equal(payload.jsonrpc, '2.0');
                assert.equal(payload.method, 'eth_call');
                assert.deepEqual(payload.params, [{
                    data: sha3(addrSig).slice(0, 10) + '1757b5941987904c18c7594de32c1726cda093fdddacb738cfbc4a7cd1ef4370',
                    to: '0x0123456701234567012345670123456701234567',
                }, 'latest']);
            });
            provider.injectResult('0x0000000000000000000000001234567012345670123456701234567012345670');

            const addr = await web3.eth.ens.getAddress('foobar.eth');

            assert.equal(addr, '0x1234567012345670123456701234567012345670');
        });

        it('should return x and y from an public key for en specific ens name', async function () {
            var resolverSignature = 'resolver(bytes32)';
            var pubkeySignature = 'pubkey(bytes32)';

            provider.injectValidation(function (payload) {
                assert.equal(payload.jsonrpc, '2.0');
                assert.equal(payload.method, 'eth_call');
                assert.deepEqual(payload.params, [{
                    data: sha3(resolverSignature).slice(0, 10) + '1757b5941987904c18c7594de32c1726cda093fdddacb738cfbc4a7cd1ef4370',
                    to: '0x314159265dd8dbb310642f98f50c066173c1259b',
                }, 'latest']);
            });
            provider.injectResult('0x0000000000000000000000000123456701234567012345670123456701234567');

            provider.injectValidation(function (payload) {
                assert.equal(payload.jsonrpc, '2.0');
                assert.equal(payload.method, 'eth_call');
                assert.deepEqual(payload.params, [{
                    data: sha3(pubkeySignature).slice(0, 10) + '1757b5941987904c18c7594de32c1726cda093fdddacb738cfbc4a7cd1ef4370',
                    to: '0x0123456701234567012345670123456701234567',
                }, 'latest']);
            });

            var pubkeyCoordinateAsHex = asciiToHex('0x0000000000000000000000000000000000000000000000000000000000000000');
            provider.injectResult([
                pubkeyCoordinateAsHex,
                pubkeyCoordinateAsHex
            ]);

            const result = await web3.eth.ens.getPubkey('foobar.eth');

            assert.equal(result[0][0], '0x3078303030303030303030303030303030303030303030303030303030303030');
            assert.equal(result[0][1], '0x3030303030303030303030303030303030303030303030303030303030303030');
        });

        it('should get the content of an resolver', async function () {
            var resolverSignature = 'resolver(bytes32)';
            var contentSignature = 'content(bytes32)';

            provider.injectValidation(function (payload) {
                assert.equal(payload.jsonrpc, '2.0');
                assert.equal(payload.method, 'eth_call');
                assert.deepEqual(payload.params, [{
                    data: sha3(resolverSignature).slice(0, 10) + '1757b5941987904c18c7594de32c1726cda093fdddacb738cfbc4a7cd1ef4370',
                    to: '0x314159265dd8dbb310642f98f50c066173c1259b',
                }, 'latest']);
            });
            provider.injectResult('0x0000000000000000000000000123456701234567012345670123456701234567');

            provider.injectValidation(function (payload) {
                assert.equal(payload.jsonrpc, '2.0');
                assert.equal(payload.method, 'eth_call');
                assert.deepEqual(payload.params, [{
                    data: sha3(contentSignature).slice(0, 10) + '1757b5941987904c18c7594de32c1726cda093fdddacb738cfbc4a7cd1ef4370',
                    to: '0x0123456701234567012345670123456701234567',
                }, 'latest']);
            });

            provider.injectResult('0x0000000000000000000000000000000000000000000000000000000000000000');

            const result = await web3.eth.ens.getContent('foobar.eth');

            assert.equal(result, '0x0000000000000000000000000000000000000000000000000000000000000000');
        });
    });


    it("won't resolve on an unknown network", async function () {
        provider = new FakeHttpProvider();
        web3 = new Web3(provider);

        provider.injectResult({
            timestamp: Math.floor(new Date() / 1000) - 60,
        });
        provider.injectValidation(function (payload) {
            assert.equal(payload.jsonrpc, '2.0');
            assert.equal(payload.method, 'eth_getBlockByNumber');
            assert.deepEqual(payload.params, ['latest', false]);
        });

        provider.injectResult(1);
        provider.injectValidation(function (payload) {
            assert.equal(payload.jsonrpc, '2.0');
            assert.equal(payload.method, 'net_version');
            assert.deepEqual(payload.params, []);
        });

        provider.injectResult({
            hash: '0x0123456701234567012345670123456701234567012345670123456701234567',
            blockNumber: '0x0'
        });
        provider.injectValidation(function (payload) {
            assert.equal(payload.jsonrpc, '2.0');
            assert.equal(payload.method, 'eth_getBlockByNumber');
            assert.deepEqual(payload.params, ['0x0', false]);
        });

        try {
            await web3.eth.ens.getAddress('foobar.eth');
            assert.fail();
        } catch(err) {
            assert.isTrue(err instanceof Error, 'Should throw error');
        }
    });

    it("won't resolve when out of date", async function () {
        provider = new FakeHttpProvider();
        web3 = new Web3(provider);

        provider.injectResult({
            timestamp: Math.floor(new Date() / 1000) - 3660,
        });
        provider.injectValidation(function (payload) {
            assert.equal(payload.jsonrpc, '2.0');
            assert.equal(payload.method, 'eth_getBlockByNumber');
            assert.deepEqual(payload.params, ['latest', false]);
        });

        try {
            await web3.eth.ens.getAddress('foobar.eth');
            assert.fail();
        } catch(err) {
            assert.isTrue(err instanceof Error, 'Should throw error');
        }
    });

    it('should only check if the connected node is synced if at least a hour is gone', async function () {
        provider = new FakeHttpProvider();
        web3 = new Web3(provider);
        web3.eth.ens._lastSyncCheck = new Date() / 1000;

        try {
            await web3.eth.ens.checkNetwork();

            assert.fail();
        } catch (error) {
            return true;
        }
    });

    describe('custom registry address', function () {
        let web3;
        let provider;
        const address = '0x314159265dD8dbb310642f98f50C066173C1259b';

        beforeEach(function () {
            provider = new FakeHttpProvider();

            // getBlock in checkNetwork
            provider.injectResult({
                timestamp: Math.floor(new Date() / 1000) - 60,
            });
            provider.injectValidation(function (payload) {
                assert.equal(payload.jsonrpc, '2.0');
                assert.equal(payload.method, 'eth_getBlockByNumber');
                assert.deepEqual(payload.params, ['latest', false]);
            });

            web3 = new Web3(provider);
            web3.eth.ens.registryAddress = address;
        });

        it('should use the custom defined registry address in checkNetwork', async function () {
            const currentRegistry = await web3.eth.ens.checkNetwork();

            assert.equal(currentRegistry, formatters.inputAddressFormatter(address));
            assert.equal(web3.eth.ens.registryAddress, formatters.inputAddressFormatter(address));
        });

        it('should keep the custom defined registry address if the provider changes', async function () {
            web3.eth.setProvider(provider);
            const currentRegistry = await web3.eth.ens.checkNetwork();

            assert.equal(currentRegistry, formatters.inputAddressFormatter(address));
            assert.equal(web3.eth.ens.registryAddress, formatters.inputAddressFormatter(address));
        });
    });
});
