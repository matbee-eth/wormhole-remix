var util = require('util')
  , events = require('events')
  , uglify = require('uglify-js')
  , jsp = uglify.parser
  , pro = uglify.uglify
  , jsdom = require('jsdom');

var wormhole = function (io) {
	this.io = io;
	events.EventEmitter.call(this);
	var self = this;
	io.sockets.on('connection', function (socket) {
		var travel = new traveller(socket);
		socket.set('wormhole', travel);
		socket.emit('sync', self.syncData());
	});
	this._methods = {};
	this._asyncMethods = {};
	this._clientMethods = {};
	this._asyncClientMethods = {};
	this.rpc = {};

	this.sync = function() {
		io.sockets.emit('sync', self.syncData());
	};
	this.syncData = function () {
		return { async: { serverRPC: Object.keys(this._asyncMethods), clientRPC: this._asyncClientMethods }, serverRPC: Object.keys(this._methods), clientRPC: this._clientMethods };
	};
	this.transmitAllFrequencies = function (message) {
		this.io.sockets.emit(message);
	};
	this.transmit = function (channel, message) {
		this.io.sockets.in(channel).emit(message);
	};
	this.methods = function (methods) {
		for (var k in methods) {
			if (k === "async") {
				for (var j in methods[k]) {
					var key = Object.keys(methods[k][j])[0];
					this._asyncMethods[key] = methods[k][j][key];
				}
			} else {
				this._methods[k] = methods[k];
			}
		}
	};
	this.clientMethods = function(methods) {
		for (var k in methods) {
			if (k === "async") {
				for (var j in methods[k]) {
					var key = Object.keys(methods[k][j])[0];
					this._asyncClientMethods[key] = methods[k][j][key].toString();
				}
			} else {
				this._clientMethods[k] = methods[k].toString();
			}
		}
	};
	this.Execute = function (method, parameters, callbackId) {
		var executeMethod = new methodClass(callbackId);
		if (self._methods[method]) {
			self._methods[method].call(executeMethod, parameters, callbackId);
		}
	};
};

wormhole.packageFunction = function (func, args) {
  var ret = "function() { return (" + fn.toString() + ").apply(this, " + JSON.stringify(args) + ");}";
  return ret;
};

var probe = function (callbackId) {
	this.callbackId = callbackId;
	this.used = false;
};

probe.prototype.return = function() {
	// this is the one-off RPC response.
	var args = [].slice.call(arguments);
	if (!this.used) {
		this.used = true;
		// send off RPC : args
	}
};

probe.prototype.Execute = function () {

};

var traveller = function (socket) {
	events.EventEmitter.call(this);
	this.socket = socket;
	this.cloakEngaged = false;
	this.uuidList = {};
	var self = this;
	socket.on("rpcResponse", function (uuid) {
		// The arguments to send to the callback function.
		var params = [].slice.call(arguments).slice(1);
		// Get function to call from uuidList.
		var func = self.uuidList[uuid];
		if (func && typeof func === "function") {
			// Remove function from uuidList.
			delete self.uuidList[uuid];
			// Execute function with arguments! Blama llama lamb! Blam alam alam
			func.apply(self, params);
		}
	});
	this.execute = function (func) {
		var functionToExecute = this.clientMethods[func];
		var expectedParamsLength = functionToExecute.length;
		var params = [].slice.call(arguments).slice(1);
		var hasCallback = false;
		var out = {};
		if (params.length > expectedParamsLength && typeof params[params.length-1] === "function") {
			// then we assume it's a mofuckin' callback!
			// register UUID for callback
			var callbackFunction = params[params.length-1];
			this.uuidList[__randomString()] = callbackFunction;
			// remove function from params list.
			params.splice(params.length-1,1);
			hasCallback = true;
			out.callbackId = "1234";
		}
		// Execute client-side RPC function with parameters.
		out.function = func;
		out.arguments = params;
		this.socket.transmit("rpc", { "function": func, "arguments": params, hasCallback: hasCallback });
	};
	this.destination = function (channel) {
		this.socket.join(channel);
	};
	this.transmit = function (message) {
		this.socket.emit(message);
	};
	this.makeItSo = function (func) {
		var args = [].slice.call(arguments);
		if (args.length > 1) {
			args = args.slice(1);
		} else {
			args = [];
		}

		if (this.cloakEngaged) {
			this.transmit("function", {func: traveller.encryptFunction(wormhole.packageFunction(func, args)) });
		} else {
			this.transmit("function", {func: wormhole.packageFunction(func, args)});
		}
	};
	this.fire = function (func) {
		this.transmit({rpc: func, args: [].slice.call(arguments).slice(1)});
	};
	this.engageCloak = function () {
		this.cloakEngaged = true;
	};
	this.test = function () {

	};
};

traveller.encryptFunction = function (funcString) {
	var ast = jsp.parse("var func=" + funcString);
	ast = pro.ast_mangle(ast);
	ast = pro.ast_squeeze(ast);
	var finalCode = pro.gen_code(ast);
	return finalCode.toString().substring("var func=".length);
};

util.inherits(wormhole, events.EventEmitter);
util.inherits(traveller, events.EventEmitter);

module.exports = wormhole;

function evaluateWithArgs (fn, args) {
  var ret = "function() { return (" + fn.toString() + ").apply(this, " + JSON.stringify(args) + ");}";
  return ret;
}

__randomString = function() {
	var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";
	var string_length = 64;
	var randomstring = '';
	for (var i=0; i<string_length; i++) {
		var rnum = Math.floor(Math.random() * chars.length);
		randomstring += chars.substring(rnum,rnum+1);
	}
	return randomstring;
};