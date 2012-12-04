var util = require('util')
  , events = require('events');
  , uglify = require('uglify-js')
  , jsp = uglify.parser
  , pro = uglify.uglify
  , jsdom = require('jsdom');
  
var wormhole = function (io) {
	this.io = io;
	events.EventEmitter.call(this);
	io.sockets.on('connection', function (socket) {
		socket.set('wormhole', new traveller(socket));
		socket.emit('sync', this.syncData());
	});
	this.methods = {};
	this.clientMethods = {};
};

wormhole.prototype.sync = function() {
	io.sockets.emit('sync', this.syncData());
};

wormhole.prototype.syncData = function () {
	return { serverRPC: Object.keys(this.methods), clientRPC: clientMethods };
};

wormhole.prototype.transmitAllFrequencies = function (message) {
	this.io.sockets.emit(message);
};

wormhole.prototype.transmit = function (channel, message) {
	this.io.sockets.in(channel).emit(message);
};

wormhole.prototype.methods = function (methods) {
    for (var k in methods) {
        this.methods[k] = methods[k];
    };
};

wormhole.prototype.clientMethods = function(methods) {
	for (var k in methods) {
		this.clientMethods[k] = methods[k];
	};
};

wormhole.prototype.Execute = function (method, parameters, callbackId) {
    var executeMethod = new methodClass(callbackId);
    if (self.__methods[method]) {
        self.__methods[method].call(executeMethod, parameters, callbackId);
    }
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
};

traveller.prototype.execute = function (func) {
	var functionToExecute = this.clientMethods[func];
	var expectedParamsLength = functionToExecute.length;
	var params = [].slice.call(arguments).slice(1);
	var hasCallback = false;
	if (params.length > expectedParamsLength && typeof params[params.length-1] === "function") {
		// then we assume it's a mofuckin' callback!
		// register UUID for callback
		var callbackFunction = params[params.length-1];
		this.uuidList[__randomString()] = callbackFunction;
		// remove function from params list.
		params.splice(params.length-1,1);
		hasCallback = true;
	}
	// Execute client-side RPC function with parameters.
	this.socket.transmit("rpc", { "function": func, "arguments": params, hasCallback: hasCallback });
};

traveller.prototype.destination = function (channel) {
	this.socket.join(channel);
};

traveller.prototype.transmit = function (message) {
	this.socket.emit(message);
};

traveller.prototype.makeItSo = function (func) {
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

traveller.prototype.fire = function (func) {
	this.transmit({rpc: func, args: [].slice.call(arguments).slice(1)});
};

traveller.encryptFunction = function (funcString) {
 	var ast = jsp.parse("var func=" + funcString),
	ast = pro.ast_mangle(ast);
	ast = pro.ast_squeeze(ast);
	var finalCode = pro.gen_code(ast);
	return finalCode.toString().substring("var func=".length);
};

traveller.prototype.engageCloak = function () {
	this.cloakEngaged = true;
};

traveller.prototype.test = function () {

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