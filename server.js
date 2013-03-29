var util = require('util')
  , events = require('events')
  , uglify = require('uglify-js')
  , jsp = uglify.parser
  , pro = uglify.uglify
  , fs = require('fs')
  , jsdom = require('jsdom')
  , async = require('async')
  , request = require('request')
  , websocket_multiplex = require('websocket-multiplex');

var wormhole = function (options, pubClient, subClient) {
	var wormholeConnectJs;
	var wormholeClientJs;
	if (options.express) {
		this.express = options.express;
	}
	if (options.server) {
		this.httpServer = options.server;
	}
	if (options.io) {
		this.io = options.io;
	} else if (options.sockjs) {
		this.sockjs = options.sockjs;
		this.multiplexer = new websocket_multiplex.MultiplexServer(this.sockjs);
	}
	var self = this;
	var setupSocket = function (socket, namespace) {
		if (!socket.store) {
			socket.constructor.prototype.store = {};
			socket.constructor.prototype.store.data = {};
		}
		if (!socket.set) {
			socket.constructor.prototype.set = function (key, data) {
				this.store.data[key] = data;
			};
		}
		if (!socket.get) {
			socket.constructor.prototype.get = function (key, cb) {
				if (this.store.data[key]) {
					cb(null, this.store.data[key]);
				} else {
					cb();
				}
			}
		}
		if (!socket.store || !socket.store.data) {
			socket.constructor.prototype.store = {};
			socket.constructor.prototype.store.data = {};
		}
		if (!socket.sendData) {
			socket.constructor.prototype.sendData = function (emission, data, namespace) {
				if (self.io) {
					this.emit(emission, data);
				} else {
					this.write(JSON.stringify({emission: emission, data: data, namespace: namespace}));
				}
			}
		}

		var disconnectEventHandler = function () {
			async.forEach(travel._subscriptions, function (channel, cb) {
				var indexOfTraveller = subscriptions[channel].indexOf(travel);
				if (indexOfTraveller > -1) {
					subscriptions[channel].splice(indexOfTraveller, 1);
				}

				var remainingSubscriptionsInChannel = subscriptions[channel] || [];
				if (remainingSubscriptionsInChannel.length === 0) {
					subClient.unsubscribe(channel);
					delete subscriptions[channel];
				}
				cb();
			}, function (err) {
				setTimeout(function () {
					if (travel && travel.socket) {
						var ThingsToRemove = Object.keys(travel.socket.store.data);
						for (var i = 0; i < ThingsToRemove.length; i++) {
							var removed = ThingsToRemove[i];
							travel.socket.set(removed, null);
						}
						travel.destruct();
						travel = null;
					}
				}, 25000);
			});
		};

		var rpcResponseEventHandler = function (data) {
			var uuid = data.uuid;
			// The arguments to send to the callback function.
			var params = [].slice.call(data.args);
			// Get function to call from uuidList.
			var func = travel.uuidList[uuid];
			if (func && typeof func === "function") {
				// Remove function from uuidList.
				delete travel.uuidList[uuid];
				// Execute function with arguments! Blama llama lamb! Blam alam alam
				func.apply(travel, params);
			}
		};

		var rpcEventHandler = function (data) {
			if (data && data.function) {
				travel.executeRpc(data.function, data.async, data.arguments, data.uuid);
			}
		};

		var syncRpcFunctionsHandler = function (functinos) {
			var ff = function (){};
			for (var i = 0; i < functinos.length; i++) {
				var methodName = functinos[i];
				travel.addClientRpc(methodName, ff);
			}
		};

		var generalSocketDataHandler = function (data) {
			if (data) {
				// Assume JSON.
				try {
					data = JSON.parse(data);
					if (data.emission == "rpcResponse") {
						rpcResponseEventHandler(data.data);
					} else if (data.emission == "rpc") {
						rpcEventHandler(data.data);
					} else if (data.emission == "syncRpcFunctions") {
						syncRpcFunctionsHandler(data.data);
					}
				} catch (ex) {
					// Not json ^_^, must be a string!
					data = data.split(',');
					if (data[0] === "sub") {
						var namespace = data[1];
					}
				}
			}
		}

		var travel = new traveller(socket, self.io, pubClient, subClient);
		travel.setSubscribeCallback(self.subscribeCallback);

		socket.on('disconnect', disconnectEventHandler);
		socket.on('close', function () {
			this.sendData('disconnect');
		});
		socket.on("rpcResponse", rpcResponseEventHandler);
		socket.on("rpc", rpcEventHandler);
		socket.on("syncRpcFunctions", syncRpcFunctionsHandler);
		socket.on("data", generalSocketDataHandler);
		socket.set('wormhole' + ((self.sockjs) ? "/"+namespace : namespace), travel);
		self.syncData(travel);
		socket.sendData('sync', travel.syncData(), travel.currentNamespace);
		return travel;
	};

	this._methods = {};
	this._clientMethods = {};
	this.rpc = {};
	this.groupRpc = {};
	this._namespaces = [];
	this.wormholeConnectCallbackNamespace = {};

	var setupSocketIOForNamespace = function (namespace) {
		var setupSocketHandler = function (socket) {
			var wh = setupSocket(socket, namespace);
			wh.setNamespace(namespace);
			self._namespaces[namespace](socket, wh);
		};
		if (self.io) {
			self.io.of(namespace).on('connection', setupSocketHandler);
		} else if (self.sockjs) {
			var sockjsConnection = self.multiplexer.registerChannel(namespace);
			sockjsConnection.on('connection', setupSocketHandler);
		}
	};
	this.namespace = function (namespace, cb) {
		if (self.io) {
			if (namespace.substring(0,1) !== "/") {
				namespace = "/" + namespace;
			}
		}
		this._namespaces[namespace] = cb;
		setupSocketIOForNamespace(namespace);
	};
	this.syncData = function (traveller) {
		for (var k in self._clientMethods) {
			traveller.addClientRpc(k, self._clientMethods[k]);
		}
		for (var j in self._methods) {
			traveller.addRpc(j, self._methods[j]);
		}
	};
	this.engage = function (namespace, cb) {
		// this.wormholeConnectCallback = cb;
		this.wormholeConnectCallbackNamespace[namespace] = cb;
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

	this.subscribeCallback = function (channel, traveller) {
		if (!subscriptions[channel]) {
			subscriptions[channel] = [];
		}
		subscriptions[channel].push(traveller);
		subClient.subscribe(channel);
	};

	var subscriptions = {};
	subClient.on("message", function (channel, message) {
		var outObj = JSON.parse(message);
		if (subscriptions[channel]) {
			// OK We have someone subscribed to this! :)
			async.forEach(subscriptions[channel], function (traveller, cb) {
				if (traveller && traveller.subscribeCallback) {
					traveller.subscribeCallback(outObj);
				}
			});
		}
	});
	if (self.sockjs) {
		self.sockjs.installHandlers(self.httpServer, {prefix:'/multiplex'});
	}
	if (this.express) {


		var sendTheClientJs = function (req, res) {
			var data = wormholeClientJs.replace('REPLACETHISFUCKINGSTRINGLOL', '//'+req.headers.host);
			res.end(data);
		}
		this.express.get('/wormhole/client.js', function (req, res) {
			res.setHeader("Content-Type", "application/javascript");
			if (!wormholeClientJs) {
				fs.readFile(__dirname + '/client.js', function (err, data) {
					if (!err) {
						wormholeClientJs = data.toString();
						sendTheClientJs(req, res);
					} else {
						res.end();
					}
				});
			} else {
				sendTheClientJs(req, res);
			}
		});
		this.express.get('/wormhole/wormhole.connect.js', function (req, res) {
			doIt(req, res, "groupnotes");
		});

		this.express.get('/wormhole/extension.connect.js', function (req, res) {
			doIt(req, res, "extension");
		});

		var socketioJs;
		var sockjsJs;

		this.express.get('/wormhole/socket.io.js', function (req, res) {
			res.setHeader('Access-Control-Allow-Origin', '*');
			if (self.io) {
				if (socketioJs) {
					res.jsonp(socketioJs);
				} else {
					request(req.protocol + "://" + req.headers.host + '/socket.io/socket.io.js', function (error, response, body) {
						if (!error && response.statusCode == 200) {
							socketioJs = body.toString();
							res.jsonp(socketioJs);
						}
					});
				}
			} else if (self.sockjs) {
				if (sockjsJs) {
					res.jsonp(sockjsJs);
				} else {
					request("http://cdn.sockjs.org/sockjs-0.3.min.js", function (error, response, body) {
						if (!error && response.statusCode == 200) {
							sockjsJs = body.toString();
							request("http://cdn.sockjs.org/websocket-multiplex-0.1.js", function (err, response, body) {
								if (!err && response.statusCode == 200) {
									sockjsJs = sockjsJs + body.toString();
									sockjsJs = sockjsJs + ";if (WebSocketMultiplex) multiplexer = WebSocketMultiplex;";
									res.jsonp(sockjsJs);
								} else {
									res.jsonp("fuck2");
								}
							});
						} else {
							res.jsonp("fuck1");
						}
					});
				}
			} else {
				res.end();
			}
		});

		var doIt = function (req, res, namespace) {
			res.setHeader("Content-Type", "application/javascript");
			if (self.wormholeConnectCallbackNamespace[namespace]) {
				self.wormholeConnectCallbackNamespace[namespace](req, res, function (func) {
					return {
						using: function () {
							var args = [].slice.call(arguments);
							self.wormholeConnectCallbackArguments = args;
							args = JSON.stringify(args);
							args = args.substring(1);
							args = args.substring(0, args.length-1);
							func = "(" + func.toString() + "(" + args +"))";

							var sendAndCustomizeItBitches = function () {
								var data = wormholeConnectJs.replace(/REPLACETHISSTRINGOKAY/g, func || extFunc || function () {}.toString());
								data = data.replace(/THISISTHENAMESPACEFORSOCKETIO/g, namespace || function () {}.toString());
								data = data.replace(/THISSTRINGSHOULDCONTAINTHERIGHTHOSTNAMEOFTHISSERVER/g, req.protocol + "://" + req.headers.host);
								res.end(data);
							}

							if (!wormholeConnectJs) {
								fs.readFile(__dirname + '/wormhole.connect.js', function (err, data) {
									if (!err) {
										wormholeConnectJs = data.toString();
										sendAndCustomizeItBitches();
									} else {
										res.end();
									}
								});
							} else {
								sendAndCustomizeItBitches();
							}
						}
					};
				});
			} else {
				var sendAndCustomizeItBitches = function () {
					var data = wormholeConnectJs.replace('REPLACETHISSTRINGOKAY', function () {}.toString());
				}
				if (!wormholeConnectJs) {
					fs.readFile(__dirname + '/wormhole.connect.js', function (err, data) {
						if (!err) {
							wormholeConnectJs = data.toString();
							sendAndCustomizeItBitches();
						} else {
							res.end();
						}
					});
				} else {
					sendAndCustomizeItBitches();
				}
			}
		}
	}
};

wormhole.packageFunction = function (func, args) {
  var ret = "function() { return (" + fn.toString() + ").apply(this, " + JSON.stringify(args) + ");}";
  return ret;
};

var traveller = function (socket, io, pubClient, subClient) {
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

	this.destruct = function () {
		if (socket) {
			socket.removeAllListeners();
			socket = null;
		}
		if (this.socket) {
			this.socket.removeAllListeners();
			this.socket = null;
		}
		this.cloakEngaged = null;
		this.uuidList = null;
		this._methods = null;
		this._clientMethods = null;
		this.rpc = null;
		this.groupRpc = null;
		this.othersRpc = null;
		this.io = null;
		this._subscriptions = null;

		// Time to go overboard.
		this.publish = null;
		this.publishTo = null;
		this.subscribeCallback = null;
		this.isInChannel = null;
		this.setChannel = null;
		this.getChannel = null;
		this.setNamespace = null;
		this.getNamespace = null;
		this.isInNamespace = null;
		this.executeRpc = null;
		this.callbackRpc = null;
		this.addRpc = null;
		this.addClientRpc = null;
		this.methods = null;
		this.clientMethods = null;
		this.executeClientRpc = null;
		this.destination = null;
		this.transmit = null;
		this.makeItSo = null;
		this.fire = null;
		this.engageCloak = null;
		this.syncData = null;
		this.setSubscribeCallback = null;
	};
	var transactions = {};
	this.publish = function (obj) {
		this.publishTo(obj, this.getNamespace() + this.currentChannel);
	};
	this.publishTo = function (obj, channel) {
		var transactionId = __randomString();
		transactions[transactionId] = true;
		obj.transactionId = transactionId;
		pubClient.publish(channel, JSON.stringify(obj));
	};
	this.subscribeCallback = function (args) {
		if (args.type === "othersRpc" && args.skipSelf == true && !transactions[args.transactionId]) {
			self.rpc[args.methodName].apply(null, args.arguments);
		} else if (args.type === "groupRpc" || args.type === "rpc") {
			self.rpc[args.methodName].apply(null, args.arguments);
		}
		if (transactions[args.transactionId]) {
			delete transactions[args.transactionId];
		}
	};
	var generateGroupRpc = function (methodName, skipSelf) {
		return function () {
			var args = [].slice.call(arguments);
			var channel = self.currentChannel;
			var publishObj = {
				methodName: methodName,
				arguments: args,
				skipSelf: skipSelf,
				type: skipSelf ? "othersRpc" : "groupRpc"
			};
			self.publish(publishObj);
		};
	};
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
	this.isInChannel = function (channel, cb) {
		if (!cb) {
			return this.currentChannel == channel;
		} else {
			var chan = this.currentChannel;
			cb(channel == chan);
		}
	};
	this.setChannel = function (channel) {
		this.socket.set("channel", channel);
		if (this.socket.join)
			this.socket.join(channel);
		this.currentChannel = channel;
		this.subscribe(channel);
	};
	this.getChannel = function (cb) {
		if (cb) {
			cb(this.currentChannel);
		} else {
			return this.currentChannel;
		}
	};
	this.setNamespace = function (namespace) {
		if (namespace.substring(0,1) !== "/") {
			namespace = "/" + namespace;
		}
		this.socket.set("namespace", namespace);
		this.currentNamespace = namespace;
	};
	this.getNamespace = function () {
		return this.currentNamespace;
	};
	this.isInNamespace = function (namespace) {
		return this.currentNamespace == namespace;
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
		this.socket.sendData("rpcResponse", {uuid: uuid, args: args}, self.currentNamespace);
	};
	this.addRpc = function (methodName, functino) {
		this._methods[methodName] = functino;
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
		if (this.socket) {
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
			this.socket.sendData("rpc", out, self.currentNamespace);
		}
	};
	this.engageCloak = function (engaged) {
		this.cloakEngaged = engaged;
	};
	this.test = function () {

	};
	this.syncData = function () {
		return { serverRPC: Object.keys(self._methods), clientRPC: self._clientMethods };
	};
	this._subscriptions = [];
	var self = this;
	this.setSubscribeCallback = function (cb) {
		this.subscribe = function (channel) {
			self._subscriptions.push(self.getNamespace() + channel);
			cb(self.getNamespace() + channel, self);
		}
	};
};

traveller.encryptFunction = function (funcString) {
	var ast = jsp.parse("var func=" + funcString);
	ast = pro.ast_mangle(ast);
	ast = pro.ast_squeeze(ast);
	var finalCode = pro.gen_code(ast);
	return finalCode.toString().substring("var func=".length);
};

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