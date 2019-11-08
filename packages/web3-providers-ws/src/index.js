/*
 This file is part of web3.js.

 web3.js is free software: you can redistribute it and/or modify
 it under the terms of the GNU Lesser General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version.

 web3.js is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU Lesser General Public License for more details.

 You should have received a copy of the GNU Lesser General Public License
 along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
 */
/** @file WebsocketProvider.js
 * @authors:
 *   Fabian Vogelsteller <fabian@ethereum.org>
 * @date 2017
 */

'use strict';

var _ = require('underscore');
var errors = require('web3-core-helpers').errors;
var Ws = require('websocket').w3cwebsocket;
var EventEmitter = require('eventemitter3');

var isNode = Object.prototype.toString.call(typeof process !== 'undefined' ? process : 0) === '[object process]';

var _btoa = null;
var parseURL = null;
if (isNode) {
    _btoa = function(str) {
        return Buffer.from(str).toString('base64');
    };
    var url = require('url');
    if (url.URL) {
        // Use the new Node 6+ API for parsing URLs that supports username/password
        var newURL = url.URL;
        parseURL = function(url) {
            return new newURL(url);
        };
    } else {
        // Web3 supports Node.js 5, so fall back to the legacy URL API if necessary
        parseURL = require('url').parse;
    }
} else {
    _btoa = btoa;
    parseURL = function(url) {
        return new URL(url);
    };
}

/**
 * @param {string} url
 * @param {Object} options
 *
 * @constructor
 */
var WebsocketProvider = function WebsocketProvider(url, options) {
    if (!Ws) {
        throw new Error('websocket is not available');
    }

    options = options || {};
    this.responseCallbacks = {};
    this.requestQueue = new Set();
    this._customTimeout = options.timeout;
    this.reconnectDelay = options.reconnectDelay;
    this.headers = options.headers || {};
    this.protocol = options.protocol || undefined;
    this.autoReconnect = options.autoReconnect;

    this.DATA = 'data';
    this.CLOSE = 'close';
    this.ERROR = 'error';
    this.OPEN = 'open';

    this.SOCKET_DATA = 'socket_data';
    this.SOCKET_CLOSE = 'socket_close';
    this.SOCKET_ERROR = 'socket_error';
    this.SOCKET_OPEN = 'socket_open';

    this.reconnecting = false;
    this.connection = null;

    // The w3cwebsocket implementation does not support Basic Auth
    // username/password in the URL. So generate the basic auth header, and
    // pass through with any additional headers supplied in constructor
    var parsedURL = parseURL(url);
    if (parsedURL.username && parsedURL.password) {
        this.headers.authorization = 'Basic ' + _btoa(parsedURL.username + ':' + parsedURL.password);
    }

    // Allow a custom client configuration
    this.clientConfig = options.clientConfig || undefined;

    // Allow a custom request options
    // https://github.com/theturtle32/WebSocket-Node/blob/master/docs/WebSocketClient.md#connectrequesturl-requestedprotocols-origin-headers-requestoptions
    this.requestOptions = options.requestOptions || undefined;

    // When all node core implementations that do not have the
    // WHATWG compatible URL parser go out of service this line can be removed.
    if (parsedURL.auth) {
        this.headers.authorization = 'Basic ' + _btoa(parsedURL.auth);
    }

    // make property `connected` which will return the current connection status
    Object.defineProperty(this, 'connected', {
        get: function() {
            return this.connection && this.connection.readyState === this.connection.OPEN;
        },
        enumerable: true
    });

    this.connect();
};

// Inherit from EventEmitter
WebsocketProvider.prototype = new EventEmitter();

/**
 * Removes all socket listeners
 *
 * @method removeAllSocketListeners
 *
 * @returns {void}
 */
WebsocketProvider.prototype.removeAllSocketListeners = function() {
    this.removeAllListeners(this.SOCKET_DATA);
    this.removeAllListeners(this.SOCKET_CLOSE);
    this.removeAllListeners(this.SOCKET_ERROR);
    this.removeAllListeners(this.SOCKET_OPEN);
};

/**
 * Connects to the configured node
 *
 * @method connect
 *
 * @returns {void}
 */
WebsocketProvider.prototype.connect = function() {
    this.connection = new Ws(this.url, this.protocol, undefined, this.headers, this.requestOptions, this.clientConfig);
    this.addSocketListeners();
};

/**
 * Listener for the `data` event of the underlying WebSocket object
 *
 * @method onMessage
 *
 * @returns {void}
 */
WebsocketProvider.prototype.onMessage = function(e) {
    var _this = this;

    /*jshint maxcomplexity: 6 */
    var data = (typeof e.data === 'string') ? e.data : '';

    this._parseResponse(data).forEach(function(result) {
        var id = null;

        // get the id which matches the returned id
        if (isArray(response)) {
            id = response[0].id;
        } else {
            id = response.id;
        }

        _this.emit(id, result);
        _this.emit(_this.SOCKET_DATA, result);
    });

};

/**
 * Listener for the `error` event of the underlying WebSocket object
 *
 * @method onError
 *
 * @returns {void}
 */
WebsocketProvider.prototype.onError = function(error) {
    this.emit(this.ERROR, error);
    this.emit(this.SOCKET_ERROR, error);
    this.removeAllSocketListeners();
};

/**
 * Listener for the `open` event of the underlying WebSocket object
 *
 * @method onConnect
 *
 * @returns {void}
 */
WebsocketProvider.prototype.onConnect = function() {
    this.reconnecting = false;

    if (this.requestQueue.size > 0) {
        var _this = this;

        this.requestQueue.forEach(function(request) {
            _this.send(request.payload, request.callback);
            _this.removeListener('error', request.callback);
            _this.requestQueue.delete(request);
        });
    }

    this.emit(this.OPEN);
    this.emit(this.SOCKET_OPEN);
};

/**
 * Listener for the `close` event of the underlying WebSocket object
 *
 * @method onClose
 *
 * @returns {void}
 */
WebsocketProvider.prototype.onClose = function(event) {
    if (this.autoReconnect && (event.code !== 1000 || event.wasClean === false)) {
        this.reconnect();

        return;
    }

    if (this.requestQueue.size > 0) {
        var _this = this;

        this.requestQueue.forEach(function(request) {
            request.callback(new Error('connection not open on send()'));
            _this.requestQueue.delete(request);
        });
    }

    this.emit(this.CLOSE, error);
    this.emit(this.SOCKET_CLOSE, error);
    this.removeAllSocketListeners();
    this.removeAllListeners();
};

/**
 * Will add the error and end event to timeout existing calls
 *
 * @method addSocketListeners
 *
 * @returns {void}
 */
WebsocketProvider.prototype.addSocketListeners = function() {
    this.connection.addEventListener('message', this.onMessage.bind(this));
    this.connection.addEventListener('open', this.onConnect.bind(this));
    this.connection.addEventListener('close', this.onClose.bind(this));
    this.connection.addEventListener('error', this.onError.bind(this));
};

/**
 * Will add the error and end event to timeout existing calls
 *
 * @deprecated
 * @method addDefaultEvents
 *
 * @returns {void}
 */
WebsocketProvider.prototype.addDefaultEvents = function() {
    console.warn('Method addDefaultEvents is deprecated please use addSocketListeners');

    this.addSocketListeners();
};

/**
 * Will parse the response and make an array out of it.
 *
 * @method _parseResponse
 *
 * @param {String} data
 *
 * @returns {Array}
 */
WebsocketProvider.prototype._parseResponse = function(data) {
    var _this = this,
        returnValues = [];

    // DE-CHUNKER
    var dechunkedData = data
        .replace(/\}[\n\r]?\{/g, '}|--|{') // }{
        .replace(/\}\][\n\r]?\[\{/g, '}]|--|[{') // }][{
        .replace(/\}[\n\r]?\[\{/g, '}|--|[{') // }[{
        .replace(/\}\][\n\r]?\{/g, '}]|--|{') // }]{
        .split('|--|');

    dechunkedData.forEach(function(data) {

        // prepend the last chunk
        if (_this.lastChunk)
            data = _this.lastChunk + data;

        var result = null;

        try {
            result = JSON.parse(data);

        } catch (e) {

            _this.lastChunk = data;

            // start timeout to cancel all requests
            clearTimeout(_this.lastChunkTimeout);
            _this.lastChunkTimeout = setTimeout(function() {
                _this.emit('error', errors.InvalidResponse(data));
            }, 1000 * 15);

            return;
        }

        // cancel timeout and set chunk to null
        clearTimeout(_this.lastChunkTimeout);
        _this.lastChunk = null;

        if (result)
            returnValues.push(result);
    });

    return returnValues;
};

/**
 * Does check if the provider is connecting and will add it to the queue or will send it directly
 *
 * @method send
 *
 * @param {Object} payload
 * @param {Function} callback
 *
 * @returns {void}
 */
WebsocketProvider.prototype.send = function(payload, callback) {
    this.once('error', callback);

    if (this.connection.readyState === this.connection.CONNECTING) {
        this.requestQueue.add({payload: payload, callback: callback});

        return;
    }

    if (this.connection.readyState !== this.connection.OPEN) {
        this.removeListener('error', callback);

        if (typeof this.connection.onerror === 'function') {
            this.connection.onerror(new Error('connection not open on send()'));
        } else {
            console.error('no error callback');
        }

        callback(new Error('connection not open on send()'));

        return;
    }

    try {
        this.connection.send(JSON.stringify(payload));
    } catch (error) {
        this.removeListener('error', callback);

        callback(error);
        return;
    }

    var id;

    if (isArray(payload)) {
        id = payload[0].id;
    } else {
        id = payload.id;
    }

    if (this._customTimeout) {
        var timeout = setTimeout(() => {
            this.removeListener('error', callback);
            this.removeAllListeners(id);

            callback(new Error('Connection error: Timeout exceeded'));
        }, this._customTimeout);
    }

    this.once(id, (response) => {
        if (timeout) {
            clearTimeout(timeout);
        }

        this.removeListener('error', callback);

        callback(response);
    });
};

/**
 * Resets the providers, clears all callbacks
 *
 * @method reset
 *
 * @returns {void}
 */
WebsocketProvider.prototype.reset = function() {
    this.removeAllListeners();
    this.addSocketListeners();
};

/**
 * Closes the current connection with the given code and reason arguments
 *
 * @method disconnect
 *
 * @param {number} code
 * @param {string} reason
 *
 * @returns {void}
 */
WebsocketProvider.prototype.disconnect = function(code, reason) {
    if (this.connection) {
        this.connection.close(code, reason);
    }
};

/**
 * Returns the desired boolean.
 *
 * @method supportsSubscriptions
 *
 * @returns {boolean}
 */
WebsocketProvider.prototype.supportsSubscriptions = function() {
    return true;
};

/**
 * Removes the listeners and reconnects to the socket.
 *
 * @method reconnect
 *
 * @returns {void}
 */
WebsocketProvider.prototype.reconnect = function() {
    this.reconnecting = true;

    setTimeout(() => {
        this.removeAllSocketListeners();
        this.connect();
    }, this.reconnectDelay);
};

module.exports = WebsocketProvider;
