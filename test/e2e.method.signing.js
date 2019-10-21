let assert = require('assert');
let Web3 = require('../packages/web3');

describe('transaction and message signing [ @E2E ]', function() {
    let web3;
    let accounts;
    let wallet;

    before(async function(){
        web3 = new Web3('http://localhost:8545');
        accounts = await web3.eth.getAccounts();

        // Create a funded account w/ a private key
        wallet = web3.eth.accounts.wallet.create(10);

        await web3.eth.sendTransaction({
            from: accounts[0],
            to: wallet[0].address,
            value: web3.utils.toWei('50', 'ether'),
        });
    });

    it('sendSignedTransaction (with eth.signTransaction)', async function(){
        // ganache does not support eth_signTransaction
        if (process.env.GANACHE) return;

        const destination = wallet[1].address;
        const source = accounts[0]; // Unlocked geth-dev account

        const txCount = await web3.eth.getTransactionCount(source);

        const rawTx = {
            nonce:    web3.utils.toHex(txCount),
            to:       destination,
            from:     source,
            value:    web3.utils.toHex(web3.utils.toWei('0.1', 'ether')),
            gasLimit: web3.utils.toHex(21000),
            gasPrice: web3.utils.toHex(web3.utils.toWei('10', 'gwei'))
        };

        const signed = await web3.eth.signTransaction(rawTx);
        const receipt = await web3.eth.sendSignedTransaction(signed.raw);

        assert(receipt.status === true);
    });

    it('sendSignedTransaction (accounts.signTransaction with signing options)', async function(){
        const source = wallet[0].address;
        const destination = wallet[1].address;

        const txCount = await web3.eth.getTransactionCount(source);
        const networkId = await web3.eth.net.getId();
        const chainId = await web3.eth.getChainId();


        const customCommon = {
            baseChain: 'mainnet',
            customChain: {
                name: 'custom-network',
                networkId: networkId,
                chainId: chainId,
            },
            harfork: 'petersburg',
        };

        const txObject = {
            nonce:    web3.utils.toHex(txCount),
            to:       destination,
            value:    web3.utils.toHex(web3.utils.toWei('0.1', 'ether')),
            gasLimit: web3.utils.toHex(21000),
            gasPrice: web3.utils.toHex(web3.utils.toWei('10', 'gwei')),
            common: customCommon
        };

        const signed = await web3.eth.accounts.signTransaction(txObject, wallet[0].privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signed.rawTransaction);

        assert(receipt.status === true);
    });

    it('sendSignedTransaction (accounts.signTransaction / without signing options)', async function(){
        const source = wallet[0].address;
        const destination = wallet[1].address;

        const txCount = await web3.eth.getTransactionCount(source);

        const txObject = {
            nonce:    web3.utils.toHex(txCount),
            to:       destination,
            value:    web3.utils.toHex(web3.utils.toWei('0.1', 'ether')),
            gasLimit: web3.utils.toHex(21000),
            gasPrice: web3.utils.toHex(web3.utils.toWei('10', 'gwei')),
        };

        const signed = await web3.eth.accounts.signTransaction(txObject, wallet[0].privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signed.rawTransaction);

        assert(receipt.status === true);
    });

    it('accounts.signTransaction errors when common, chain and hardfork all defined', async function(){
        const source = wallet[0].address;
        const destination = wallet[1].address;

        const txCount = await web3.eth.getTransactionCount(source);

        const txObject = {
            nonce:    web3.utils.toHex(txCount),
            to:       destination,
            value:    web3.utils.toHex(web3.utils.toWei('0.1', 'ether')),
            gasLimit: web3.utils.toHex(21000),
            gasPrice: web3.utils.toHex(web3.utils.toWei('10', 'gwei')),
            chain: "ropsten",
            common: {},
            hardfork: "istanbul"
        };

        try {
            await web3.eth.accounts.signTransaction(txObject, wallet[0].privateKey);
            assert.fail()
        } catch (err) {
            assert(err.message.includes('common object or the chain and hardfork'));
        }
    });

    it('accounts.signTransaction errors when chain specified without hardfork', async function(){
        const source = wallet[0].address;
        const destination = wallet[1].address;

        const txCount = await web3.eth.getTransactionCount(source);

        const txObject = {
            nonce:    web3.utils.toHex(txCount),
            to:       destination,
            value:    web3.utils.toHex(web3.utils.toWei('0.1', 'ether')),
            gasLimit: web3.utils.toHex(21000),
            gasPrice: web3.utils.toHex(web3.utils.toWei('10', 'gwei')),
            chain: "ropsten"
        };

        try {
            await web3.eth.accounts.signTransaction(txObject, wallet[0].privateKey);
            assert.fail()
        } catch (err) {
            assert(err.message.includes('both values must be defined'));
        }
    });

    it('accounts.signTransaction errors when hardfork specified without chain', async function(){
        const source = wallet[0].address;
        const destination = wallet[1].address;

        const txCount = await web3.eth.getTransactionCount(source);

        const txObject = {
            nonce:    web3.utils.toHex(txCount),
            to:       destination,
            value:    web3.utils.toHex(web3.utils.toWei('0.1', 'ether')),
            gasLimit: web3.utils.toHex(21000),
            gasPrice: web3.utils.toHex(web3.utils.toWei('10', 'gwei')),
            hardfork: "istanbul"
        };

        try {
            await web3.eth.accounts.signTransaction(txObject, wallet[0].privateKey);
            assert.fail()
        } catch (err) {
            assert(err.message.includes('both values must be defined'));
        }
    });

    it('eth.personal.sign', async function(){
        // ganache does not support eth_sign
        if (process.env.GANACHE) return;

        const message = 'hello';

        const signature = await web3.eth.personal.sign(
            message,
            accounts[1],            // Unlocked geth-dev acct
            "left-hand-of-darkness" // Default password at geth-dev
        );

        const recovered = await web3.eth.personal.ecRecover(message, signature);
        assert.equal(accounts[1].toLowerCase(), recovered.toLowerCase());
    });

    it('eth.accounts.sign', async function(){
        // ganache does not support eth_sign
        if (process.env.GANACHE) return;

        const message = 'hello';

        const signed = web3.eth.accounts.sign(message, wallet[0].privateKey);
        const recovered = await web3.eth.personal.ecRecover(message, signed.signature);
        assert.equal(wallet[0].address.toLowerCase(), recovered.toLowerCase());
    })
});

