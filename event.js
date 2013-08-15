var util = require('util')
  , events = require('events')
  , uglify = require('uglify-js')
  , jsp = uglify.parser
  , pro = uglify.uglify
  , fs = require('fs')
  , jsdom = require('jsdom')
  , async = require('async')
  , request = require('request')
  , events = require('events')
  , redispubsub = require('redis-sub');

var wormhole = function (options) {
	options = options || {};
	events.EventEmitter.call(this);
	// Stores the actual reference to the functions.
	this._serverMethods = {};
	this._clientMethods = {};
	this._io = options.io;
	this._express = options.express;
	this._redisPubClient = options.redisPubClient;
	this._redisSubClient = options.redisSubClient;
	this._sessionStore = options.sessionStore;
	this._cookieParser = options.cookieParser;
	this._sessionKey = options.sessionKey;

	this._port = options.port;
	this._hostname = options.hostname;
	this._protocol = options.protocol;

	this._namespaces = [];
	this._cachedNamespace = {};
	this._namespaceClientFunctions = {};
	this._uuidList = {};

	// Javascript file cache.
	this.__wormholeClientJs;
	this.__socketIOJs;
	this.setupListeners();
};
wormhole.prototype.__proto__ = events.EventEmitter.prototype;
wormhole.prototype.setupListeners = function(cb) {
	// this.on("removeListener", this._unsubscribe);
	var self = this;
	this.on("newListener", function (event, func) {
		if (event != "removeListener" && event != "newListener" && event != "connection" && event != "sessionUpdated") {
			// Oh, this is an RPC, Add the fucker!
			var method = {};
			method[event] = func;
			self.serverMethods([method]);
		}
	});
};
wormhole.prototype.setPath = function(path) {
	this.__wormholeScriptPath = path;
};
wormhole.prototype.start = function(options, callback) {
	var self = this;
	// io, express and redis pub/sub are all mandatory.
	if (options && typeof options === "function") {
		// It's a callback, not an options object!
		callback = options;
		options = {};
	}
	options = options || {};
	if (options.port) {
		this._port = options.port;
	}
	if (options.hostname) {
		this._hostname = options.hostname;
	}
	if (options.protocol) {
		this._protocol = options.protocol;
	}
	if (options.io) {
		this._io = options.io;
	}
	if (options.express) {
		this._express = options.express;
	}
	if (options) {
		if (options.redisPubClient) {
			this._redisPubClient = options.redisPubClient;
		}
		if (options.redisSubClient) {
			this._redisSubClient = options._redisSubClient;
		}
	}
	if (options.sessionStore) {
		this._sessionStore = options.sessionStore;
	}
	if (options.cookieParser) {
		this._cookieParser = options.cookieParser;
	}
	if (options.sessionKey) {
		this._sessionKey = options.sessionKey;
	}
	if (!this._io) {
		throw new Error("No Socket.IO");
	}
	if (!this._express) {
		throw new Error("No Express");
	}
	if ((this._sessionStore && (!this._sessionStore.subClient || !this._sessionStore.client)) && (!this._redisPubClient && !this._redisSubClient)) {
		throw new Error("No PubSub clients");
	} else {
		if (!this._redisPubClient || !this._redisPubClient) {
			this._redisPubClient = this._sessionStore.client;
			this._redisSubClient = this._sessionStore.subClient;
		}
		this._pubsub = this._sessionStore.pubsub || new redispubsub({pubClient: this._redisPubClient, subClient: this._redisSubClient});
	}
	if (this._namespaces.length == 0) {
		this.addNamespace('/'); // Atleast support a basic namespace ^_^, geez!
	}
	console.log("Initializing Wormhole.");
	this.getScripts(function (err, response) {
		if (!err && self.__wormholeClientJs && self.__socketIOJs) {
			console.log("Wormhole scripts ready.");
			// Ready, Freddy!
			self.setupExpressRoutes(function (err) {
				console.log("Wormhole Express routes setup.");
				self.setupIOEvents(function (err) {
					callback && callback(err);
				})
			});
		} else {
			console.log("ERROR!", err);
			callback && callback(err);
		}
	});
};
wormhole.prototype.executeChannelClientRPC = function(channel, func) {
	var args = [].slice.call(arguments).slice(2);
	this._redisPubClient.publish("wormhole:" + channel, JSON.stringify({func: func, args: args}));
};
wormhole.prototype.clientMethods = function(methods, cb) {
	var self = this;
	var methodKeys = Object.keys(methods);
	async.forEach(methodKeys, function (method, next) {
		self._clientMethods[method] = methods[method].toString();
		next();
	}, cb);
};
wormhole.prototype.serverMethods = function(methods, cb) {
	var self = this;
	var methodKeys = Object.keys(methods);
	async.forEach(methodKeys, function (method, next) {
		self._serverMethods[method] = methods[method];
		next();
	}, cb);
};
wormhole.prototype.setupExpressRoutes = function (cb) {
	var self = this;
	this._express.get('/wormhole/client.js', function (req, res) {
		res.setHeader("Content-Type", "application/javascript");
		res.end(self.__wormholeClientJs);
	});
	this._express.get('/wormhole/:namespace/connect.js', function (req, res) {
		if (self._namespaces.indexOf("/" + req.params.namespace) > -1) {
			self.sendConnectScript(req.params.namespace, req, res);
		} else {
			res.end();
		}
	});
	cb();
};
wormhole.prototype.sendConnectScript = function(namespace, req, res) {
	res.setHeader("Content-Type", "application/javascript");
	res.send(this._cachedNamespace["/"+namespace]);
};
wormhole.prototype.getScripts = function (cb) {
	var self = this;
	async.parallel([
		function (done) {
			fs.readFile(__dirname + '/client.js', function (err, data) {
				if (!err) {
					var wormholeClientJs = data.toString();
					wormholeClientJs = wormholeClientJs.replace('REPLACETHISFUCKINGSTRINGLOL', '//'+self._hostname + ":" + self._port);
					self.__wormholeClientJs = wormholeClientJs;
				}
				done(err);
			});
		},
		function (done) {
			request(self._protocol + "://" + self._hostname + ":" + self._port + '/socket.io/socket.io.js', function (error, response, body) {
				if (!error && response.statusCode == 200) {
					self.__socketIOJs = body.toString();
					self.__socketIOJs = uglify.minify(self.__socketIOJs, {fromString: true}).code;
				} else {
					console.log("There has been an error with downloading Local Socket.IO", error, response, self._protocol + "://" + self._hostname + self._port + '/socket.io/socket.io.js');
				}
				done(error);
			});
		}
	], function (err) {
		if (!err) {
			fs.readFile(__dirname + '/wormhole.connect.js', function (err, data) {
				if (!err) {
					async.forEach(self._namespaces, function (namespace, next) {
						// data = uglify.minify(data.toString(), {fromString: true}).code;
						fs.readFile(__dirname + '/client.js', function (err, clientJSData) {
							if (!err && clientJSData) {
								// clientJSData = uglify.minify(clientJSData.toString(), {fromString: true}).code;
								self._cachedNamespace[namespace] = clientJSData + ";\n";
								self._cachedNamespace[namespace] = self._cachedNamespace[namespace] + data;
							}
							var func = self._namespaceClientFunctions[namespace] || "(" + function(){}.toString() + "())";
							data = self._cachedNamespace[namespace].replace(/REPLACETHISSTRINGOKAY/g, func);
							data = data.replace(/THISISTHENAMESPACEFORSOCKETIO/g, namespace ? namespace.replace("/", "") : "");
							data = data.replace(/THISSTRINGSHOULDCONTAINTHERIGHTHOSTNAMEOFTHISSERVER/g, self._protocol + "://" + self._hostname + ":" + self._port);
							data = data.replace(/THISSTRINGISTHESOCKETIOSCRIPTLOL/g, self.__socketIOJs);
							data = data.replace(/THISISTHEHOSTNAMEOFTHESCRIPTSERVER/g, self.__wormholeScriptPath || self._protocol + "://" + self._hostname + ":" + self._port);
							self._cachedNamespace[namespace] = data.toString();
							next(err);
						});
					}, cb);
				} else {
					cb(err);
				}
			});
		} else {
			console.log(err);
			cb(err);
		}
	});
};
wormhole.prototype.setupIOEvents = function (cb) {
	// body...
	var self = this;
	async.parallel([
		function (done) {
			if (self._cookieParser && self._sessionStore && self._sessionKey) {
				self._io.set('authorization', function(handshake, callback) {
					console.log("AUTHORIZATION: ", handshake);
					self._cookieParser(handshake, {}, function (err) {
						// Fancy, huh?
						err && callback(err, false);
						// So fancy!
						!err && self._sessionStore.get(handshake.signedCookies[self._sessionKey], function (err, session) {
						handshake.sessionId = handshake.signedCookies[self._sessionKey];
							callback(err, true);
						});
					});
				});
			}
			done();
		}, function (done) {
			console.log("Setting up namespaces", self._namespaces);
			async.forEach(self._namespaces, function (namespace, next) {
				console.log("NAMESPACE:", namespace);
				self._io.of(namespace).on("connection", function (socket) {
					console.log("Welcome the traveller!");
					self.createTraveller(socket, function (err, traveller) {
						console.log("Traveller, welcome to the Wormhole.");
						// done!! HEHEHE!
						if (socket.handshake.sessionId) {
							traveller.setSessionId(socket.handshake.sessionId);
							traveller.sessionId = socket.handshake.sessionId;
							socket.setSessionId(socket.handshake.sessionId);
						}
						self.setupClientEvents(traveller, function (err) {
							// LOLOLO
							console.log("Traveller events set up.");
							traveller.sendRPCFunctions(self._clientMethods, Object.keys(self._serverMethods), function (err) {
								console.log("Sent RPC functions to traveller.");
								self.emit("connection", traveller);
							});
						});
					});
				});
				next();
			}, done);
	}], cb);
};
wormhole.prototype.extendSocket = function(socket, cb) {
	var self = this;
	socket.sessionSubscriptions = [];
	socket.setSessionId = function (id) {
		socket.set("sessionId", id);
	};
	socket.getSession = function (cb) {
		socket.get("sessionId", function (err, id) {
			self._sessionStore.get(id, cb);
		});
	};
	socket.getSessionKey = function (key, cb) {
		socket.getSession(function (err, session) {
			console.log("getSession", err, session);
			cb(err, session ? session[key] : null);
		});
	};
	socket.setSession = function (session, cb) {
		socket.get("sessionId", function (err, id) {
			self._sessionStore.set(id, session, function (err) {
				console.log("setSession, err?", arguments);
				cb(err);
			});
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
	cb();
};
wormhole.prototype.setupClientEvents = function (traveller, cb) {
	// Capture RPC events from traveller.
	var self = this;
	async.parallel([
		function (done) {
			async.forEach(Object.keys(self._clientMethods), function (method, next) {
				next();
				traveller.addClientMethod(method);
			}, done);
		},
		function (done) {
			async.forEach(Object.keys(self._serverMethods), function (method, next) {
				next();
				traveller.addServerMethod(method);
			}, done);
		},
		function (done) {
			traveller.on("executeClientRPC", function (func) {
				// Send RPC data to Client.
				var hasCallback = false;
				var callback;
				var args = [].slice.call(arguments);
				args.shift();
				if (typeof args[args.length-1] === "function") { // Expecting last item to be a callback :)
					hasCallback = true;
					callback = args.pop();
				}
				var out = {
					"function": func,
					"arguments": args
				};
				if (hasCallback) {
					out.uuid = __randomString();
					self._uuidList[out.uuid] = callback;
				}

				traveller.sendClientRPC(out);
			});
			done();
		},
		function (done) {
			traveller.on("executeChannelClientRPC", function (channel, func) {
				// Channel RPC emitted.
				console.log("CHANNEL RPC EMITTED", channel, func);
				var args = [].slice.call(arguments).slice(2);
				self._redisPubClient.publish(channel, JSON.stringify({func: func, args: args}));
			});
			done();
		},
		function (done) {
			// Executing Server RPC.
			traveller.on("executeServerRPC", function (func, UUID) {
				var args = [].slice.call(arguments);
			 	var func = args.shift();
			 	var UUID = args.shift();
			 	// Execute RPC function w/ that name.
			 	// If UUID, callback is expected.
			 	if (self._serverMethods[func]) {
			 		var rpcCallback;
				 	if (UUID) {
				 		rpcCallback = function () {
				 			// UUID
				 			console.log("RPC CALLBACK: ", [null, UUID].concat([].slice.call(arguments)));
				 			traveller.callback.apply(traveller, [null, UUID].concat([].slice.call(arguments)));
				 		}
				 		args.push(rpcCallback);
				 	}
				 	self.executeServerRPC.apply(self, [traveller, func].concat(args));
			 	} else {
			 		traveller.callback("No such method.");
			 	}
			});
			done();
		},
		function (done) {
			traveller.on("callback", function (uuid) {
				console.log("RPC CALLBACK", uuid);
				var args = [].slice.call(arguments);
				args.shift();
				if (uuid && self._uuidList[uuid]) {
					self._uuidList[uuid].apply(traveller, [].slice.call(arguments).slice(1)[0]);
					delete self._uuidList[uuid];
				}
			});
			done();
		},
		function (done) {
			// Subscribe to session Id.
			var id = traveller.getSessionId();
			console.log("Subscribing to: ", id);
			var sessionSubscribe = function (session) {
				self.emit("sessionUpdated", traveller, session);
				traveller.emit.call(traveller, "sessionUpdated", session);
			};
			self._sessionStore.subscribe(id, sessionSubscribe);

			traveller.isConnected = true;
			traveller.on("disconnect", function () {
				// wut?
				// unsubscribe from session id
				traveller.removeAllListeners();
				traveller.socket.removeAllListeners();
				console.log("SESSION UNSUBSCRIBING NOW?!", id, sessionSubscribe);
				self._sessionStore.unsubscribe(id, sessionSubscribe);
				traveller.isConnected = false;
			});
			done();
		}
	],
	function (err) {
		// Done.
		// Now wait for syncClientFunctionsComplete before we call back.
		traveller.on("syncClientFunctionsComplete", function () {
			cb();
		});
	});
};
wormhole.prototype.setupPubSub = function(traveller, cb) {
	var self = this;
	// Connect pubsubbies
	var socketIdSub = function (data) {
		// Now what!?
		// executeChannelClientRPC
		// executeClientRPC
		// executeServerRPC (maybe not.)
		// Should it only execute from Client->Server!?
		// Or Could we enable Server->Server(s)?
		data = JSON.parse(data);
		console.log("SocketID publishies", data.func, data.args);
		allTheFunctions(data.func, data.args);
	};
	var sessionIdSub = function (data) {
		// Now what!?
		data = JSON.parse(data);
		console.log("SessionID publishies", data.func, data.args);
		allTheFunctions(data.func, data.args);
	};
	var allTheFunctions = function (clientFunc, args) {
		console.log("MOTHER OF ALL THE FUNCTIONS!", clientFunc);
		traveller.executeClientRPC([clientFunc].concat(args))
	};
	var sessionIdString;
	var socketIdString = "wormhole:"+traveller.socket.id;
	this._pubsub.on(socketIdString, socketIdSub);
	traveller.socket.get("sessionId", function (err, sessionId) {
		if (sessionId) {
			sessionIdString = "wormhole:"+sessionIdString
			this._pubsub.on(sessionIdString, sessionIdSub);
		}
		// Kill subscriptions-- memory stuff.
		traveller.socket.on("disconnect", function () {
			self._pubsub.removeListener(socketIdString, socketIdSub);
			if (sessionId) {
				self._pubsub.removeListener(sessionIdString, sessionIdSub);
			}
		});
		console.log("Set up pubsub channels");
		cb && cb();
	});
};
wormhole.prototype.createTraveller = function(socket, cb) {
	// body...
	var self = this;
	var traveller = new wormholeTraveller(socket);
	this.extendSocket(socket, function (err) {
		traveller.setupClientEvents(function (err) {
			self.setupPubSub(traveller, function (err) {
				cb && cb(err, traveller);
			});
		});
	});
};
wormhole.prototype.addNamespace = function (namespace, func) {
	if (func && typeof func === "function") {
		var args = [].slice.call(arguments);
		args.shift();
		args.shift();
		func = "(" + func.toString() + "('" + args.join("','") + "'))";
		this._namespaceClientFunctions[namespace] = func;
	}
	this._namespaces.push(namespace);
};
wormhole.prototype.executeServerRPC = function (traveller, func) {
	var args = [].slice.call(arguments);
	traveller = args.shift();
	func = args.shift();
 	this._serverMethods[func].apply(traveller, args);
};

var wormholeTraveller = function (socket) {
	events.EventEmitter.call(this);
	this.socket = socket;
	this.cloakEngaged = false;
	this._methods = {};
	this._clientMethods = {};
	this.rpc = {};
	this.channelRpc = {};

	this._sessionId = null;
};
wormholeTraveller.prototype.__proto__ = events.EventEmitter.prototype;
wormholeTraveller.prototype.setSessionId = function(sessionId) {
	this._sessionId = sessionId;
};
wormholeTraveller.prototype.getSessionId = function() {
	return this._sessionId;
};
wormholeTraveller.prototype.sendRPCFunctions = function(clientMethods, serverMethods, cb) {
	this.socket.emit("syncClientFunctions", clientMethods);
	this.socket.emit("syncServerFunctions", serverMethods);
	cb && cb();
};
wormholeTraveller.prototype.syncClientMethods = function(methods) {
	var keys = Object.keys(methods);
	async.forEach(keys, function (method, next) {
		this.addClientMethod(method, methods[method]);
		next();
	}, cb);
};
wormholeTraveller.prototype.addClientMethod = function(method, func) {
	var self = this;
	this.rpc[method] = function () {
		self.executeClientRPC.apply(self, [method].concat([].slice.call(arguments)));
	};
	this.channelRpc[method] = function (channel) {
		self.executeChannelClientRPC.apply(self, [channel, method].concat([].slice.call(arguments).slice(1)))
	};
};
wormholeTraveller.prototype.syncServerMethods = function (methods, cb) {
	var keys = Object.keys(methods);
	async.forEach(keys, function (method, next) {
		this.addServerMethod(method);
		next();
	}, cb);
};
wormholeTraveller.prototype.addServerMethod = function(method) {
	this._methods[method] = function () {
		this.executeServerRPC.apply(this, [].slice.call(arguments));
	};
};
wormholeTraveller.prototype.executeClientRPC = function(funcName) {
	// Server triggers client RPC execution
	var argsArray = ["executeClientRPC", funcName];
	this.emit.apply(this, argsArray.concat([].slice.call(arguments).slice(1)));
};
wormholeTraveller.prototype.executeChannelClientRPC = function(channel, funcName) {
	// Server triggers client RPC execution
	var argsArray = ["executeChannelClientRPC", "wormhole:"+channel, funcName];
	console.log(argsArray.concat([].slice.call(arguments).slice(2)));
	this.emit.apply(this, argsArray.concat([].slice.call(arguments).slice(2)));
};
wormholeTraveller.prototype.executeServerRPC = function(funcName) {
	// Client triggers server RPC execution
	var argsArray = ["executeServerRPC", funcName];
	this.emit.apply(this, argsArray.concat([].slice.call(arguments).slice(1)));
};
wormholeTraveller.prototype.setupClientEvents = function (cb) {
	var self = this;
	this.socket.on("rpc", function (data) {
		/* data.func, data.async, data.arguments, data.uuid */
		console.log("Executing Server RPC");
		if (data && data.function) {
			self.executeServerRPC.apply(self, [data.function, data.uuid].concat(data.arguments));
		}
	});
	this.socket.on("rpcResponse", function (data) { // ClientRPC response.
		var uuid = data.uuid;
		var args = data.args;
		self.emit.apply(self, ["callback", data.uuid].concat(data.args));
	});
	this.socket.on("disconnect", function () {
		self.emit("disconnect");
	});
	this.socket.on("syncClientFunctions", function (method) {
		console.log("LOLO?", method);
		if (Array.isArray(method)) {
			// Array of client functions
			for (var i in method) {
				self.addClientMethod(method[i]);
			}
		} else {
			// Single client function name.
			self.addClientMethod(method);
		}
		self.emit("syncClientFunctionsComplete");
	});
	cb && cb();
};
wormholeTraveller.prototype.callback = function (err, uuid) {
	var self = this;
	var args = [].slice.call(arguments);
	console.log("CALLBACK");
	this.socket.emit.apply(this.socket, ["callback"].concat(args));
};
wormholeTraveller.prototype.sendClientRPC = function(out) {
	this.socket.emit("rpc", out);
};

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

module.exports = wormhole;
// var wh = new wormhole({io: {}, express: {}, redisPubClient: {}, redisSubClient: {}, port: 5555, hostname: "hp.groupnotes.ca", protocol: "http"});
// wh.start();