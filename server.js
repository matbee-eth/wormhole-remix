var util = require('util')
  , events = require('events')
  , uglify = require('uglify-js')
  , jsp = uglify.parser
  , pro = uglify.uglify
  , fs = require('fs')
  , jsdom = require('jsdom')
  , async = require('async')
  , request = require('request')
  , events = require('events');

var wormhole = function (io, express, pubClient, subClient, options) {
	var wormholeConnectJs;
	var wormholeClientJs;
	options = options || {};
	this.sockjs = options.sockjs;
	this.io = io;
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

		var travel = new traveller(socket, io, pubClient, subClient);
		travel.setSubscribeCallback(self.subscribeCallback);
		socket.on('disconnect', function () {
			async.forEach(travel._subscriptions, function (channel, cb) {
				if (subscriptions[channel]) {
					var indexOfTraveller = subscriptions[channel].indexOf(travel);
					if (indexOfTraveller > -1) {
						subscriptions[channel].splice(indexOfTraveller, 1);
					}

					var remainingSubscriptionsInChannel = subscriptions[channel] || [];
					if (remainingSubscriptionsInChannel.length === 0) {
						subClient.unsubscribe(channel);
						delete subscriptions[channel];
					}
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
		});
		self.syncData(travel);
		socket.set('wormhole'+namespace, travel);
		var out = travel.syncData();
		if (self.cloakEngaged) {
			out = JSON.stringify(out);
			out = new Buffer(out).toJSON();
			socket.emit('syncB', out);
		} else {
			socket.emit('sync', out);
		}
		return travel;
	};

	this._methods = {};
	this._clientMethods = {};
	this.rpc = {};
	this.groupRpc = {};
	this._namespaces = [];
	this._namespaceStrings = {};
	this.wormholeConnectCallbackNamespace = {};

	var setupSocketIOForNamespace = function (namespace) {
		io.of(namespace).on('connection', function (socket) {
			var wh = setupSocket(socket, namespace);
			wh.setNamespace(namespace);
			wh.engageCloak(self.cloakEngaged);
			socket.getSession = function (cb) {
				options.sessionStore.get(socket.handshake.sessionId, cb);
			};
			socket.getSessionKey = function (key, cb) {
				socket.getSession(function (err, session) {
					console.log("getSession", err, session);
					cb(err, session[key]);
				});
			};
			socket.setSession = function (session, cb) {
				options.sessionStore.set(socket.handshake.sessionId, session, function (err) {
					console.log("setSession, err?", arguments);
					cb(err);
				});
			};
			socket.setSessionKey = function (key, value, cb) {
				console.log("setSessionKey", key, value, cb);
				socket.getSession(function (err, session) {
					if (!err && session) {
						session[key] = value;
						socket.setSession(session, cb);
					} else {
						cb && cb(err);
					}
				});
			};
			socket.removeSessionKey = function (key, cb) {
				socket.getSession(function (err, session) {
					delete session[key];
					socket.setSession(session, cb);
				});
			};
		});
	};

	this.engageCloak = function (yes) {
		this.cloakEngaged = yes || false;
	};

	this.namespaces = function (namespaceArray) {
		this._namespaceStrings = namespaceArray;
		for (var i in namespaceArray) {
			if (namespaceArray.hasOwnProperty(i)) {
				this._namespaces.push(i);
				setupSocketIOForNamespace(i);
			}
		}
	};

	this.sync = function() {
		var out = self.syncData();
		if (self.cloakEngaged) {
			out = JSON.stringify(out);
			out = new Buffer(out).toJSON();
		}
		io.sockets.emit('sync', out);
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
			if (self.cloakEngaged) {
				this._clientMethods[k] = traveller.encryptFunction(methods[k]);
			} else {
				this._clientMethods[k] = methods[k];
			}
		}
	};
	this.clientsInNamespaceChannel = function (namespace, channel, asArray, cb) {
		var sockets = this.io.of(namespace).clients(channel);
		if (!asArray)
		return {
			rpc: function (rpcFunction) {
				var args = [].slice.call(arguments);
				args.splice(0,1);
				var doit = function (err, wormhole) {
					if (!err && wormhole && wormhole.rpc && wormhole.rpc[rpcFunction]) {
							wormhole.rpc[rpcFunction].apply(null, args);
					} else {
						// ERRRRORRRR
						console.log("NO RPC FUNCTION LOL");
					}
				};
				for (var i in sockets) {
					var socket = sockets[i];
					if (socket !== self.socket)
						socket.get("wormhole" + namespace, doit);
				}
			},
			clients: sockets
		};
		else {
			return sockets;
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
		if (subscriptions[channel] && subscriptions[channel].length > 0) {
			// OK We have someone subscribed to this! :)
			async.forEach(subscriptions[channel], function (traveller, cb) {
				if (traveller && traveller.subscribeCallback) {
					traveller.subscribeCallback(outObj);
				} else {
					if (subscriptions[channel] && subscriptions[channel][subscriptions[channel].indexOf(traveller)] && subscriptions[channel][subscriptions[channel].indexOf(traveller)].length > -1) {
						subscriptions[channel][subscriptions[channel].indexOf(traveller)] = null;
						traveller = null;
					}
				}
			});
		} else {
			subClient.unsubscribe(channel);
		}
	});

	if (express) {
		if (options.cookieParser && options.sessionStore && options.sessionKey) {
			io.set('authorization', function(handshake, callback) {
			  options.cookieParser(handshake, {}, function (err) {
			    // Fancy, huh?
			    err && callback(err, false);
			    // So fancy!
			    !err && options.sessionStore.get(handshake.signedCookies[options.sessionKey], function (err, session) {
			    	handshake.sessionId = handshake.signedCookies[options.sessionKey];
			  		callback(err, true);
			    });
			  });
			});
		}
		var sendTheClientJs = function (req, res) {
			var port = "";
			if (options.port) {
				port = ":"+options.port;
			}
			var data = wormholeClientJs.replace('REPLACETHISFUCKINGSTRINGLOL', '//'+(options.hostname || req.headers.host) + port);
			res.end(data);
		}

		express.get('/wormhole/client.js', function (req, res) {
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

		express.get('/wormhole/wormhole.connect.js', function (req, res) {
			doIt(req, res, "groupnotes");
		});

		express.get('/wormhole/:namespace/connect.js', function (req, res) {
			doIt(req, res, req.params.namespace);
		});

		express.get('/wormhole/extension.connect.js', function (req, res) {
			doIt(req, res, "extension");
		});
		var port= "";
		if (options.port) {
			port = ":"+options.port;
		}
		var socketioJs;
		request(options.protocol + "://" + options.hostname + port + '/socket.io/socket.io.js', function (error, response, body) {
			if (!error && response.statusCode == 200) {
				socketioJs = body.toString();
				socketioJs = uglify.minify(socketioJs, {fromString: true}).code;
			}
		});
		express.get('/wormhole/socket.io.js', function (req, res) {
			var port= "";
			if (options.port) {
				port = ":"+options.port;
			}
			if (socketioJs) {
				res.jsonp(socketioJs);
			} else {
				request((options.protocol || req.protocol) + "://" + (options.hostname || req.headers.host) + port + '/socket.io/socket.io.js', function (error, response, body) {
					console.log("Downloading SocketIO Script.");
					if (!error && response.statusCode == 200) {
						socketioJs = body.toString();
						res.jsonp(socketioJs);
					}
				});
			}
		});
		var cachedNamespace = {};
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
								var port= "";
								if (options.port) {
									port = ":"+options.port;
								}
								var data = cachedNamespace[namespace].replace(/REPLACETHISSTRINGOKAY/g, func || extFunc || function () {}.toString());
								data = data.replace(/THISISTHENAMESPACEFORSOCKETIO/g, namespace || function () {}.toString());
								data = data.replace(/THISSTRINGSHOULDCONTAINTHERIGHTHOSTNAMEOFTHISSERVER/g, (options.protocol || req.protocol) + "://" + (options.hostname || req.headers.host) + port);
								data = data.replace(/THISSTRINGISTHESOCKETIOSCRIPTLOL/g, socketioJs);
								res.send(data);
							}

							if (!cachedNamespace[namespace]) {
								fs.readFile(__dirname + '/wormhole.connect.js', function (err, data) {
									if (!err) {
										// data = uglify.minify(data.toString(), {fromString: true}).code;
										cachedNamespace[namespace] = data.toString();
										fs.readFile(__dirname + '/client.js', function (err, data) {
											if (!err && data) {
												data = uglify.minify(data.toString(), {fromString: true}).code;
												cachedNamespace[namespace] = data + ";\n" + cachedNamespace[namespace];
												cachedNamespace[namespace] = self._namespaceStrings["/"+namespace] + cachedNamespace[namespace];
												sendAndCustomizeItBitches();
											} else {
												res.end()
											}
										});
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
					var data = cachedNamespace[namespace].replace('REPLACETHISSTRINGOKAY', function () {}.toString());
				}
				if (!cachedNamespace[namespace]) {
					fs.readFile(__dirname + '/wormhole.connect.js', function (err, data) {
						if (!err) {
							cachedNamespace[namespace] = data.toString();
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
	events.EventEmitter.call(this);
	this.socket = socket;
	this.cloakEngaged = false;
	this.uuidList = {};
	this._methods = {};
	this._clientMethods = {};
	this.rpc = {};
	this.groupRpc = {};
	this.othersRpc = {};
	this.customRpc = {};
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
		transactions = null;
	};

	this.disconnect = function () {
		console.log("Disconnecting user.");
		if (socket && socket.emit && socket.disconnect) {
			socket.emit("forcingDisconnect");
			// socket.disconnect();
			socket.manager.onClientDisconnect(socket.id);
		}
	}

	socket.on("forceDisconnect", function () {
		console.log("Requested Disconnecting user.");
		socket.emit("forcingDisconnect");
		socket.manager.onClientDisconnect(socket.id);
		// socket.disconnect();
	});

	socket.on("rpcResponse", function (data) {
		if (data) {
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
		} else {
			// someone's fuckin' with us.
		}
	});
	socket.on("rpc", function (data) {
		console.log(data != null, data);
		if (self.cloakEngaged) {
			data = self.charcodeArrayToString(data);
			console.log(data);
			data = JSON.parse(data);
		}
		if (data && data.function) {
			self.executeRpc(data.function, data.async, data.arguments, data.uuid);
		}
	});
	socket.on("syncRpcFunctions", function (functinos) {
		var ff = function (){};
		for (var i = 0; i < functinos.length; i++) {
			var methodName = functinos[i];
			self.addClientRpc(methodName, ff);
		}
	});
	var transactions = {};

	this.charcodeArrayToString = function (arr) {
		var outString = "";
		for (var i = 0; i < arr.length; i++) {
			outString += String.fromCharCode(arr[i]);
			console.log(String.fromCharCode(arr[i]));
		}
		console.log("charcodeArrayToString", outString);
		return outString;
	};
	this.publish = function (obj, channel) {
		var publishingTo;
		if (channel) {
			publishingTo = this.getNamespace() + channel;
		} else {
			publishingTo = this.getNamespace() + this.currentChannel;
		}
		console.log("Publishing to", publishingTo);
		this.publishTo(obj, publishingTo);
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
	var generateCustomRpc = function (methodName, skipSelf) {
		return function (inner, outer) {
			var args = [].slice.call(arguments);
			args.splice(0,2); // Removing inner and outer :D
			var publishObj = {
				methodName: methodName,
				arguments: args,
				skipSelf: skipSelf,
				type: skipSelf ? "othersRpc" : "groupRpc"
			};
			self.publish(publishObj, inner + outer);
		};
	};
	var generateGroupRpc = function (methodName, skipSelf) {
		return function (url, arr) {
			var channel = null;
			var args = [].slice.call(arguments);
			var publishObj = {
				methodName: methodName,
				arguments: args,
				skipSelf: skipSelf,
				type: skipSelf ? "othersRpc" : "groupRpc"
			};
			if (url && arr) {
				async.each(arr, function (item, cb) {
					self.publish(publishObj, url + item);
					cb();
				}, function (err) {
					// done.
				});
			} else {
				self.publish(publishObj, channel);
			}
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
		var self = this;
		if (this._methods[methodName]) {
			if (isAsync && uuid) {
				var argsWithCallback = args.slice(0);
				argsWithCallback.push(function () {
					if (self.callbackRpc != null && self.callbackRpc instanceof Function) {
						self.callbackRpc(uuid, [].slice.call(arguments));
					}
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
		var out = {uuid: uuid, args: args};
		if (self.cloakEngaged) {
			out = JSON.stringify(out);
			out = new Buffer(out).toJSON();
		}
		this.socket.emit("rpcResponse", out);
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
		this.customRpc[methodName] = generateCustomRpc(methodName, true);
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
			if (self.cloakEngaged) {
				out = JSON.stringify(out);
				out = new Buffer(out).toJSON();
			}
			this.socket.emit("rpc", out);
		}
	};
	this.execute = function (functino) {
		var args = [].slice.call(arguments);
		args = args.slice(1);

		var out = functino.toString();

		if (self.cloakEngaged) {
			out = JSON.stringify(out);
			out = new Buffer(out).toJSON();

			args = JSON.stringify(args);
			args = new Buffer(args).toJSON();
		}
		this.socket.emit("execute", out, args);
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
		console.log("ENGAGING CLOAK?", engaged);
		this.cloakEngaged = engaged || false;
		if (engaged) throw new Error();
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

traveller.prototype.__proto__ = events.EventEmitter.prototype;

traveller.encryptFunction = function (funcString) {
	var yo = uglify.minify("var thisuglyfunc=" + funcString, {fromString: true}).code.toString().substring("var thisuglyfunc=".length);
	return yo;
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