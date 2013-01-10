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
		var travel = new traveller(socket, io);
		self.syncData(travel);
		socket.set('wormhole', travel);
		socket.emit('sync', travel.syncData());
	});
	this._methods = {};
	this._clientMethods = {};
	this.rpc = {};
	this.groupRpc = {};

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
	this.engage = function (cb) {
		this.wormholeConnectCallback = cb;
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
		express.get('/wormhole/wormhole.connect.js', function (req, res) {
			res.setHeader("Content-Type", "application/javascript");
			if (self.wormholeConnectCallback) {
				self.wormholeConnectCallback(req, res, function (func) {
					return {
						using: function () {
							var args = [].slice.call(arguments);
							self.wormholeConnectCallbackArguments = args;
							console.log("SET: self.wormholeConnectCallbackArguments", args);
							args = JSON.stringify(args);
							args = args.substring(1);
							args = args.substring(0, args.length-1);
							func = "(" + func.toString() + "(" + args +"))";
							fs.readFile(__dirname + '/wormhole.connect.js', function (err, data) {
								if (!err) {
									data = data.toString().replace(/REPLACETHISSTRINGOKAY/g, func || function () {}.toString());
									data = data.toString().replace(/THISSTRINGSHOULDCONTAINTHERIGHTHOSTNAMEOFTHISSERVER/g, req.protocol + "://" + req.headers.host);
									res.end(data);
								} else {
									res.end();
								}
							});
						}
					};
				});
			} else {
				fs.readFile(__dirname + '/wormhole.connect.js', function (err, data) {
					if (!err) {
						data = data.toString().replace('REPLACETHISSTRINGOKAY', function () {}.toString());
						res.end(data);
					} else {
						res.end();
					}
				});
			}
		});
	}
};

wormhole.packageFunction = function (func, args) {
  var ret = "function() { return (" + fn.toString() + ").apply(this, " + JSON.stringify(args) + ");}";
  return ret;
};

var traveller = function (socket, io) {
	events.EventEmitter.call(this);
	this.socket = socket;
	this.cloakEngaged = false;
	this.uuidList = {};
	this._methods = {};
	this._clientMethods = {};
	this.rpc = {};
	this.groupRpc = {};
	this.othersRpc = {};
	this.io = io;

	var self = this;
	socket.on("rpcResponse", function (data) {
		var uuid = data.uuid;
		// The arguments to send to the callback function.
		var params = [].slice.call(data.args);
		// Get function to call from uuidList.
		var func = self.uuidList[uuid];
		if (func && typeof func === "function") {
			// Remove function from uuidList.
			delete self.uuidList[uuid];
			// Execute function with arguments! Blama llama lamb! Blam alam alam
			func.apply(self, params);
		}
	});
	socket.on("rpc", function (data) {
		self.executeRpc(data.function, data.async, data.arguments, data.uuid);
	});
	socket.on("syncRpcFunctions", function (functinos) {
		var ff = function (){};
		for (var i = 0; i < functinos.length; i++) {
			var methodName = functinos[i];
			self.addClientRpc(methodName, ff);
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
			self.executeClientRpc(methodName, async, args, callback);
		};
	};
	this.groupExecuteRpc = function (methodName) {
		var args = [].slice.call(arguments).slice(1);
		this.socket.get("channel", function (err, channel) {
			var sockets = io.sockets.clients(channel);
			var doit = function (err, wormhole) {
				if (wormhole.rpc[methodName])
					wormhole.rpc[methodName].apply(null, arguments);
			};
			for (var i in sockets) {
				var socket = sockets[i];
				socket.get("wormhole", doit);
			}
		});
	};
	this.setChannel = function (channel) {
		this.socket.set("channel", channel);
		this.socket.join(channel);
	};
	this.getChannel = function (cb) {
		this.socket.get("channel", cb);
	};
	this.executeRpc = function (methodName, isAsync, args, uuid) {
		if (this._methods[methodName]) {
			if (isAsync && uuid) {
				var argsWithCallback = args.slice(0);
				argsWithCallback.push(function () {
					self.callbackRpc(uuid, [].slice.call(arguments));
				});
				this._methods[methodName].apply(self, argsWithCallback);
			} else if (uuid) {
				var returnValue = this._methods[methodName].apply(self, args);
				self.callbackRpc(uuid, returnValue);
			} else {
				this._methods[methodName].apply(self, args);
			}
		}
	};
	this.callbackRpc = function(uuid, args) {
		this.socket.emit("rpcResponse", {uuid: uuid, args: args});
	};
	this.addRpc = function (methodName, functino) {
		console.log(this._methods, methodName, functino);
		this._methods[methodName] = functino;
	};
	var generateGroupRpc = function (methodName, skipSelf) {
		return function () {
			var args = [].slice.call(arguments);
			self.socket.get("channel", function (err, channel) {
				var sockets = io.sockets.clients(channel);
				var doit = function (err, wormhole) {
					if (!err && wormhole.rpc[methodName]) {
							wormhole.rpc[methodName].apply(null, args);
					} else {
						// ERRRRORRRR
					}
				};
				for (var i in sockets) {
					var socket = sockets[i];
					if ((skipSelf && socket !== self.socket) || !skipSelf)
						socket.get("wormhole", doit);
				}
			});
		};
	};
	this.addClientRpc = function (methodName, functino) {
		this._clientMethods[methodName] = functino.toString();
		this.rpc[methodName] = generateRPCFunction(methodName, true);
		this.rpc[methodName].sync = generateRPCFunction(methodName, false);
		this.groupRpc[methodName] = generateGroupRpc(methodName, false);
		this.othersRpc[methodName] = generateGroupRpc(methodName, true);
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
	this.executeClientRpc = function (functionName, isAsync, args, callback) {
		var hasCallback = (typeof callback === "function");
		var out = {
			"function": functionName,
			"async": isAsync && hasCallback,
			"arguments": args
		};
		if (hasCallback) {
			out.uuid = __randomString();
			self.uuidList[out.uuid] = callback;
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







var probe = function (uuid) {
	this.uuid = uuid;
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