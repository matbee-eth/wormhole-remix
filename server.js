var util = require('util')
  , events = require('events')
  , uglify = require('uglify-js')
  , jsp = uglify.parser
  , pro = uglify.uglify
  , fs = require('fs')
  , jsdom = require('jsdom');

var wormhole = function (io, express) {
	this.io = io;
	events.EventEmitter.call(this);
	var self = this;
	io.sockets.on('connection', function (socket) {
		var travel = new traveller(socket);
		self.syncData(travel);
		socket.set('wormhole', travel);
		socket.emit('sync', travel.syncData());
	});
	this._methods = {};
	this._clientMethods = {};
	this.rpc = {};

	this.sync = function() {
		io.sockets.emit('sync', self.syncData());
	};
	this.syncData = function (traveller) {
		for (var k in self._clientMethods) {
			traveller.addClientRpc(k, self._clientMethods[k]);
		}
		for (var j in self._methods) {
			traveller.addRpc(j, self._methods[j]);
		}
	};
	this.transmitAllFrequencies = function (message) {
		this.io.sockets.emit(message);
	};
	this.transmit = function (channel, message) {
		this.io.sockets.in(channel).emit(message);
	};
	this.methods = function (methods) {
		var self = this;
		for (var k in methods) {
			this._methods[k] = methods[k];
		}
	};
	this.clientMethods = function(methods) {
		for (var k in methods) {
			this._clientMethods[k] = methods[k];
		}
	};

	if (express) {
		express.get('/wormhole/client.js', function (req, res) {
			res.setHeader("Content-Type", "application/javascript");
			fs.readFile(__dirname + '/client.js', function (err, data) {
				if (!err) {
					data = data.toString().replace('REPLACETHISFUCKINGSTRINGLOL', '//'+req.headers.host);
					res.end(data);
				} else {
					res.end();
				}
			});
		});
	}
};

wormhole.packageFunction = function (func, args) {
  var ret = "function() { return (" + fn.toString() + ").apply(this, " + JSON.stringify(args) + ");}";
  return ret;
};

var traveller = function (socket) {
	events.EventEmitter.call(this);
	this.socket = socket;
	this.cloakEngaged = false;
	this.uuidList = {};
	this._methods = {};
	this._clientMethods = {};
	this.rpc = {};

	var self = this;
	socket.on("rpcResponse", function (data) {
		var uuid = data.uuid;
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
	var generateRPCFunction = function (methodName, async) {
		return function () {
			var args = [].slice.call(arguments);
			var callback = null;
			if (typeof(args[args.length-1]) == "function") {
				// do something
				callback = args.splice(args.length-1, 1)[0];
			}
			self.executeRPC(methodName, async, args, callback);
		};
	};
	this.addRpc = function (methodName, functino) {
		console.log(this._methods, methodName, functino);
		this._methods[methodName] = functino;
	};
	this.addClientRpc = function (methodName, functino) {
		this._clientMethods[methodName] = functino.toString();
		this.rpc[methodName] = generateRPCFunction(methodName, true);
		this.rpc[methodName].sync = generateRPCFunction(methodName, false);
	};
	this.methods = function (methods) {
		var self = this;
		for (var k in methods) {
			this._methods[k] = methods[k];
			this.rpc[k] = generateRPCFunction(true);
			this.rpc[k].sync = generateRPCFunction(false);
		}
	};
	this.clientMethods = function(methods) {
		for (var k in methods) {
			this._clientMethods[k] = methods[k].toString();
		}
	};
	this.executeRPC = function (functionName, isAsync, args, callback) {
		var hasCallback = (typeof callback === "function");
		var out = {
			"function": functionName,
			"async": isAsync && hasCallback,
			"arguments": args
		};
		if (hasCallback) {
			out.callbackId = __randomString();
			self.uuidList[out.callbackId] = callback;
		}
		this.socket.emit("rpc", out);
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
	this.engageCloak = function (engaged) {
		this.cloakEngaged = engaged;
	};
	this.test = function () {

	};
	this.syncData = function () {
		return { serverRPC: Object.keys(self._methods), clientRPC: self._clientMethods };
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