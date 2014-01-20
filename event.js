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
  , redispubsub = require('redis-sub')
  , fswatch = require('gaze').Gaze
  , debug = require('debug')('wormhole-remix');

var wormhole = function (options) {
	options = options || {};
	events.EventEmitter.call(this);
	var self = this;
	// Stores the actual reference to the functions.
	this._serverMethods = {
		addIceCandidate: function (id, candidate) {
			var traveller = this;
			self._pubsub.publish(prefix+id, JSON.stringify({ action: "candidate", id: traveller.socket.id, candidate: candidate }));
		},
		reinitiateOffer: function (id, channel) {
			var traveller = this;
			self._pubsub.publish(prefix+traveller.socket.id, JSON.stringify({ action: "reinitiateOffer", id: id, channel: channel }));
		},
		getChannelList: function (channel, cb) {
			var traveller = this;
			wormhole.getChannel(self._redisPubClient, channel, cb);
		}
	};
	this._clientMethods = {
		wormholeReady: function () {
			this.emit("ready");
			this.ready();
		},
		joinRTCChannel: function (channel) {
			this.rpc.joinRTCChannel(channel);
		}
	};
	this._io = options.io;
	this._express = options.express;
	this._redisPubClient = options.redisPubClient;
	this._redisSubClient = options.redisSubClient;
	this._sessionStore = options.sessionStore;
	this._cookieParser = options.cookieParser;
	this._sessionKey = options.sessionKey;

	this._rpcClientTimeout = options.rpcTimeout || 30000;

	this._port = options.port;
	this._hostname = options.hostname;
	this._protocol = options.protocol;

	this._namespaces = [];
	this._cachedNamespace = {};
	this._cachedNamespaceCallback = {};
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
			self.serverMethods(method);
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
	if (options.report) {
		self._reporting = true;
	}
	self._reporter = new wormholeReport(this._pubsub);
	if (this._namespaces.length == 0) {
		this.addNamespace('/'); // Atleast support a basic namespace ^_^, geez!
	}
	debug("Initializing Wormhole.");
	this.getScripts(function (err, response) {
		if (!err && self.__wormholeClientJs && self.__socketIOJs) {
			debug("Wormhole scripts ready.");
			// Ready, Freddy!
			self.setupExpressRoutes(function (err) {
				debug("Wormhole Express routes setup.");
				self.setupIOEvents(function (err) {
					callback && callback(err);
				})
			});
		} else {
			debug("ERROR!", err);
			callback && callback(err);
		}
	});

	// Set up Filesystem watching. Leet.
	if (options.watch) {
		this.__watcher = new fswatch(options.watch);
	}
};
wormhole.prototype.executeChannelClientRPC = function(channel, func) {
	var args = [].slice.call(arguments).slice(2);
	this._pubsub.publish("wormhole:" + channel, JSON.stringify({func: func, args: args}));
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
	this._express.get('/wormhole/follow', function (req, res) {
		self._reporter.getUsers(function (err, list) {
          res.send(list);
        });
	});
	this._express.get('/wormhole/follow/:id', function (req, res) {
		self._reporter.getUser(req.params.id, function (err, list) {
          res.send(list);
        });
	});
	cb();
};
wormhole.prototype.sendConnectScript = function(namespace, req, res) {
	res.setHeader("Content-Type", "application/javascript");
	var self = this;
	if (this._cachedNamespaceCallback["/"+namespace]) {
		this._cachedNamespaceCallback["/"+namespace](req, res, function (connectArgs) {
			res.send(self._cachedNamespace["/"+namespace].replace('ThisIsTheConnectOverrideArgs', connectArgs ? JSON.stringify(connectArgs) : ''));
		});
	} else {
		res.send(this._cachedNamespace["/"+namespace].replace('ThisIsTheConnectOverrideArgs', ''));
	}
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
					debug("There has been an error with downloading Local Socket.IO", error, response, self._protocol + "://" + self._hostname +":"+ self._port + '/socket.io/socket.io.js');
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
			debug(err);
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
					debug("AUTHORIZATION: ", handshake);
					self._cookieParser(handshake, {}, function (err) {
						// Fancy, huh?
						err && callback(err, false);
						// So fancy!
						!err && self._sessionStore.get(handshake.signedCookies[self._sessionKey], function (err, session) {
							handshake.sessionId = handshake.signedCookies[self._sessionKey];
							self._reporting && self._reporter.report(handshake.sessionId, "handshake");
							callback(err, true);
						});
					});
				});
			}
			done();
		}, function (done) {
			debug("Setting up namespaces", self._namespaces);
			async.forEach(self._namespaces, function (namespace, next) {
				debug("NAMESPACE:", namespace);
				self._io.of(namespace).on("connection", function (socket) {
					debug("Welcome the traveller!");
					self.createTraveller(socket, function (err, traveller) {
						debug("Traveller, welcome to the Wormhole.");
						// done!! HEHEHE!
						if (socket.handshake.sessionId) {
							traveller.setSessionId(socket.handshake.sessionId);
							traveller.sessionId = socket.handshake.sessionId;
							socket.setSessionId(socket.handshake.sessionId);
							self._reporting && self._reporter.report(traveller.sessionId, "connection", {

							});
						}
						self.setupClientEvents(traveller, function (err) {
							// LOLOLO
							debug("Traveller events set up.");
							traveller.sendRPCFunctions(self._clientMethods, Object.keys(self._serverMethods), function (err) {
								debug("Sent RPC functions to traveller.");
								self._reporting && self._reporter.report(traveller.sessionId, "sync", {

								});
								traveller.rpc.wormholeReady();
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
			cb(err, session ? session[key] : null);
		});
	};
	socket.setSession = function (session, cb) {
		socket.get("sessionId", function (err, id) {
			self._sessionStore.set(id, session, function (err) {
				cb(err);
			});
		});
	};
	socket.setSessionKey = function (key, value, cb) {
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
				debug("executeClientRPC", func, "Am I Connected?", traveller.isConnected);
				var hasCallback = false;
				var callback;
				var args = [].slice.call(arguments);
				args.shift();
				if (typeof args[args.length-1] === "function") { // Expecting last item to be a callback :)
					hasCallback = true;
					callback = args.pop();
				}
				if (traveller.isConnected) {
					var out = {
						"function": func,
						"arguments": args
					};
					if (!hasCallback) {
						out.assureFunction = true;
						callback = function () {
							traveller.removeCallbackId(out.uuid);
						};
					}
					out.uuid = __randomString();
					self._uuidList[out.uuid] = callback;
					traveller.addCallbackId(out.uuid);
					
					self._reporting && self._reporter.report(traveller.sessionId, "clientrpc", {
						func: func,
						args: args,
						uuid: out.uuid
					});

					traveller.sendClientRPC(out);
				} else {
					if (callback) {
						callback("disconnected");
					}
				}
			});
			done();
		},
		function (done) {
			traveller.on("executeChannelClientRPC", function (channel, func) {
				// Channel RPC emitted.
				var args = [].slice.call(arguments).slice(2);
				self._pubsub.publish(channel, JSON.stringify({func: func, args: args}));
				self._reporting && self._reporter.report(traveller.sessionId, "clientrpc", {func: func, args: args});
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
			 	if (self._serverMethods[func] || traveller._methods[func]) {
			 		var rpcCallback;
				 	if (UUID) {
				 		rpcCallback = function () {
				 			// UUID
				 			var args = [null, UUID].concat([].slice.call(arguments));
							self._reporting && self._reporter.report(traveller.sessionId, "clientrpcCallback", {args: [].slice.call(arguments), uuid: UUID});
							traveller.callback.apply(traveller, args);
						}
				 		args.push(rpcCallback);
				 	}
					self._reporting && self._reporter.report(traveller.sessionId, "serverrpc", {
						uuid: UUID,
						args: args,
						func: func
					});
				 	self.executeServerRPC.apply(self, [traveller, func].concat(args));
			 	} else {
			 		traveller.callback("No such method.", UUID);
			 	}
			});
			done();
		},
		function (done) {
			traveller.on("callback", function (uuid) {
				if (uuid && self._uuidList[uuid]) {
					var args = [].slice.call(arguments).slice(1)[0];
					self._uuidList[uuid].apply(traveller, args);
					self._reporting && self._reporter.report(traveller.sessionId, "serverrpcCallback", {
						uuid: uuid,
						args: args
					});
					delete self._uuidList[uuid];
				}
				if (uuid) {
					traveller.removeCallbackId(uuid);
				}
			});
			done();
		},
		function (done) {
			traveller.isConnected = true;
			traveller.on("disconnect", function () {
				// wut?
				// unsubscribe from session id
				debug("Traveller disconnected.");
				traveller.removeAllListeners();
				traveller.socket.removeAllListeners();
				traveller.isConnected = false;
				var ids = traveller.getCallbackIds();
				for (var i = 0; i < ids.length; i++) {
					var uuid = ids[i];
					if (self._uuidList[uuid]) {
						self._uuidList[uuid]("wormhole disconnected");
						debug("Traveller disconnected. Executing dead callback with error.");
					}
					delete self._uuidList[uuid];
					traveller.removeCallbackId(uuid);
				}
				self._reporting && self._reporter.report(traveller.sessionId, "disconnect");
			});
			done();
		},
		function (done) {
			// Setting up Filesystem watching.
			if (self.__watcher) {
				var watchFunction = function (ev, filename) {
					traveller.emit.call(traveller, "fileUpdated", ev, filename);
				};
				self.__watcher.on("all", watchFunction);

				traveller.on("disconnect", function () {
					self.__watcher.removeListener("all", watchFunction);
				});
				done();
			} else {
				done();
			}
		},
		function (done) {
			self._pubsub.on(prefix+traveller.socket.id, function (obj) {
				obj = JSON.parse(obj);
				if (obj.action == "leave") {
					debug("LEAVE LEAVE LEAVE");
					traveller.rpc.handleLeave(obj.id, obj.channel);
				} else if (obj.action == "offer") {
					debug("HANDLE OFFER!!!", obj.id, obj.offer, obj);
					debug("HANDLE OFFER!!!", obj.id, obj.offer);
					debug("HANDLE OFFER!!!", obj.id, obj.offer);
					debug("HANDLE OFFER!!!", obj.id, obj.offer);
					debug("HANDLE OFFER!!!", obj.id, obj.offer);
					debug("HANDLE OFFER!!!", obj.id, obj.offer);
					debug("HANDLE OFFER!!!", obj.id, obj.offer);
					traveller.rpc.handleOffer(obj.id, obj.offer, function (err, answer) {
						debug("traveller.rpc.handleOffer", err, answer);
						debug("traveller.rpc.handleOffer", err, answer);
						debug("traveller.rpc.handleOffer", err, answer);
						debug("traveller.rpc.handleOffer", err, answer);
						debug("traveller.rpc.handleOffer", err, answer);
						debug("traveller.rpc.handleOffer", err, answer);
						debug("traveller.rpc.handleOffer", err, answer);
						debug("traveller.rpc.handleOffer", err, answer);
						debug("traveller.rpc.handleOffer", err, answer);
						debug("traveller.rpc.handleOffer", err, answer);
						debug("traveller.rpc.handleOffer", err, answer);
						if (!err && answer) {
							self._pubsub.publish(prefix+obj.id, JSON.stringify({action: "answer", id: traveller.socket.id, answer: answer}));
						}
					});
				} else if (obj.action == "answer") {
					traveller.rpc.handleAnswer(obj.id, obj.answer);
				} else if (obj.action == "candidate") {
					traveller.rpc.handleIceCandidate(obj.id, obj.candidate);
				} else if (obj.action == "reinitiateOffer") {
					traveller.rpc.createOffer(obj.id, obj.channel, function (err, offer) {
						if (!err && offer) {
							self._pubsub.publish(prefix+obj.id, JSON.stringify({ action: "offer", id: traveller.socket.id, offer: offer }));
						}
					});	
				}
			});
			done();
		},
		function (done) {
			traveller.on("joinRTCChannel", function (channel) {
				debug('whdebug: traveller.on("joinRTCChannel", function (channel) {', channel);
				debug('whdebug: traveller.on("joinRTCChannel", function (channel) {', channel);
				debug('whdebug: traveller.on("joinRTCChannel", function (channel) {', channel);
				debug('whdebug: traveller.on("joinRTCChannel", function (channel) {', channel);
				debug('whdebug: traveller.on("joinRTCChannel", function (channel) {', channel);
				debug('whdebug: traveller.on("joinRTCChannel", function (channel) {', channel);
				debug('whdebug: traveller.on("joinRTCChannel", function (channel) {', channel);
				debug('whdebug: traveller.on("joinRTCChannel", function (channel) {', channel);
				debug('whdebug: traveller.on("joinRTCChannel", function (channel) {', channel);
				debug('whdebug: traveller.on("joinRTCChannel", function (channel) {', channel);
				debug('whdebug: traveller.on("joinRTCChannel", function (channel) {', channel);
				wormhole.addToChannel(self._redisPubClient, channel, traveller.socket.id, { audio:false, video: false, screen: false, data: true }, function (err, members) {
					async.forEach(Object.keys(members), function (member, next) {
						debug("CHANNEL MEMBER", member);
						if (member != traveller.socket.id) {
							traveller.rpc.createOffer(member, channel, function (err, offer) {
								if (!err && offer) {
									self._pubsub.publish(prefix+member, JSON.stringify({ action: "offer", id: traveller.socket.id, offer: offer }));
								} else {
									debug("whdebug: createOffer failed", err, member, channel);
								}
								next();
							});
						} else {
							next();
						}
					}, function (err) {
						// 
					});
				});
				traveller.on("disconnect", function () {
					debug("DISCONNECT", channel);
					// traveller.emit("leaveRTCChannel", channel);
					wormhole.removeFromChannel(self._redisPubClient, channel, traveller.socket.id, function (err, members) {
						debug("CHANNEL MEMBERS:::", err, Object.keys(members));
						async.forEach(Object.keys(members), function (member, next) {
							self._pubsub.publish(prefix+member, JSON.stringify({ action: "leave", id: traveller.socket.id, channel: channel }));
						}, function (err) {
							// 
						});
					});
				});
			});
			done();
		},
		function (done) {
			traveller.on("leaveRTCChannel", function (channel) {
				debug("Leaving RTC channel", channel, traveller.socket.id);
				wormhole.removeFromChannel(self._redisPubClient, channel, traveller.socket.id, function (err, members) {
					debug("CHANNEL MEMBERS:::", err, Object.keys(members));
					async.forEach(Object.keys(members), function (member, next) {
						self._pubsub.publish(prefix+member, JSON.stringify({ action: "leave", id: traveller.socket.id, channel: channel }));
						self._pubsub.publish(prefix+traveller.socket.id, JSON.stringify({ action: "leave", id: member, channel: channel }));
					}, function (err) {
						// 
					});
				});
			});
			done();
		}
	],
	function (err) {
		// Done.
		// Now wait for syncClientFunctionsComplete before we call back.
		var hasCallbacked = false;
		traveller.on("syncClientFunctionsComplete", function () {
			debug("syncClientFunctionsComplete", traveller.rpc);
			traveller.rpc.getServerFunctions(function (clientMethods) {
				async.forEach(clientMethods, function (method, next) {
					traveller.addClientMethod(method);
					next();
				}, function (err) {
					debug("ARRAYOFSTEPS", traveller.arrayOfSteps);
				});
				if (!hasCallbacked) {
					hasCallbacked = true;
					traveller.syncComplete = true;
					cb();
				}
			});
		});

		traveller.once("syncClientFunctionsComplete", function () {
			// Subscribe to session Id.
			var id = traveller.getSessionId();
			var sessionSubscribe = function (session) {
				if (!traveller.isConnected) {
					debug("Session updated for dead traveller, Trying unsubscribe again.", id);
				} else {
					self._sessionStore.subscribeOnce(id, sessionSubscribe);
					self.emit("sessionUpdated", traveller, session);
					self._reporting && self._reporter.report(traveller.sessionId, "sessionUpdated", session);
					traveller.emit.call(traveller, "sessionUpdated", session);
				}
			};
			self._sessionStore.subscribeOnce(id, sessionSubscribe);
			
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
		allTheFunctions(data.func, data.args);
	};
	var sessionIdSub = function (data) {
		// Now what!?
		data = JSON.parse(data);
		allTheFunctions(data.func, data.args);
	};
	var allTheFunctions = function (clientFunc, args) {
		traveller.executeClientRPC([clientFunc].concat(args))
	};
	var sessionIdString;
	var socketIdString = "wormhole:"+traveller.socket.id;
	this._pubsub.on(socketIdString, socketIdSub);
	traveller.socket.get("sessionId", function (err, sessionId) {
		if (sessionId) {
			sessionIdString = "wormhole:"+sessionIdString
			self._pubsub.on(sessionIdString, sessionIdSub);
		}
		// Kill subscriptions-- memory stuff.
		traveller.socket.on("disconnect", function () {
			self._pubsub.removeListener(socketIdString, socketIdSub);
			if (sessionId) {
				self._pubsub.removeListener(sessionIdString, sessionIdSub);
			}
		});
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
				traveller.setRpcTimeout(self._rpcClientTimeout);
				cb && cb(err, traveller);
			});
		});
	});
};
wormhole.prototype.addNamespace = function (namespace, customCB, func) {
	var args = [].slice.call(arguments);
	args.shift(); // namespace.
	if (customCB && typeof customCB == "function") {
		args.shift();
		this._cachedNamespaceCallback[namespace] = customCB;
	}
	if (func && typeof func === "function") {
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
	var functouse;
	if (traveller._methods[func] && typeof traveller._methods[func] == "function") {
 		functouse = traveller._methods[func];
	} else if (this._serverMethods[func]) {
		functouse = this._serverMethods[func];
	}
	functouse.apply(traveller, args);
};

var wormholeTraveller = function (socket) {
	events.EventEmitter.call(this);
	this.socket = socket;
	this.cloakEngaged = false;
	this._methods = {};
	this._clientMethods = {};
	this.rpc = {};
	this.channelRpc = {};
	this._uuidList = {};
	this.rpcTimeout = 30000;

	this.arrayOfSteps = [];

	this._sessionId = null;

	this._RTCChannels = [];

	this.syncComplete = false;
};
wormholeTraveller.prototype.__proto__ = events.EventEmitter.prototype;
wormholeTraveller.prototype.joinRTCChannel = function (channel) {
	this._RTCChannels.push(channel);
	debug("whdebug: Called on Traveller Object.");
	this.emit("joinRTCChannel", channel);
};
wormholeTraveller.prototype.leaveRTCChannel = function(channel) {
	// this._RTCChannels.splice(this._RTCChannels.indexOf(channel), 1);
	this.emit("leaveRTCChannel", channel);
};
wormholeTraveller.prototype.setRpcTimeout = function(timeout) {
	this.rpcTimeout = timeout;
};
wormholeTraveller.prototype.setSessionId = function(sessionId) {
	this._sessionId = sessionId;
};
wormholeTraveller.prototype.getSessionId = function() {
	return this._sessionId;
};
wormholeTraveller.prototype.sendRPCFunctions = function(clientMethods, serverMethods, cb) {
	var self = this;
	this.socket.emit("syncClientFunctions", clientMethods);
	this.socket.emit("syncServerFunctions", serverMethods);
	cb && cb();
};
wormholeTraveller.prototype.syncClientMethods = function(methods, cb) {
	var keys = Object.keys(methods);
	async.forEach(keys, function (method, next) {
		this.addClientMethod(method, methods[method]);
		next();
	}, cb);
};
wormholeTraveller.prototype.addClientMethod = function(method, func) {
	var self = this;
	this.rpc[method] = function () {
		if (self.isConnected) {
			self.executeClientRPC.apply(self, [method].concat([].slice.call(arguments)));
		} else {
			var args = [].slice.call(arguments);
			var funky = args[args.length-1];
			if (funky && typeof funky == "function") {
				funky("disconnected");
			}
		}
	};
	this.channelRpc[method] = function (channel) {
		self.executeChannelClientRPC.apply(self, [channel, method].concat([].slice.call(arguments).slice(1)))
	};
	if (this.syncComplete) {
		console.log("syncComplete:: syncCompletesyncCompletesyncCompletesyncComplete", method);
		console.log("syncComplete:: syncCompletesyncCompletesyncCompletesyncComplete", method);
		console.log("syncComplete:: syncCompletesyncCompletesyncCompletesyncComplete", method);
		console.log("syncComplete:: syncCompletesyncCompletesyncCompletesyncComplete", method);
		console.log("syncComplete:: syncCompletesyncCompletesyncCompletesyncComplete", method);
		console.log("syncComplete:: syncCompletesyncCompletesyncCompletesyncComplete", method);
		console.log("syncComplete:: syncCompletesyncCompletesyncCompletesyncComplete", method);
		console.log("syncComplete:: syncCompletesyncCompletesyncCompletesyncComplete", method);
		this.sendRPCFunctions({method: func}, [], function (err) {
			// 
		});
	}
};
wormholeTraveller.prototype.syncServerMethods = function (methods, cb) {
	var keys = Object.keys(methods);
	async.forEach(keys, function (method, next) {
		this.addServerMethod(method);
		next();
	}, cb);
};
wormholeTraveller.prototype.addServerMethod = function(method, cb) {
	this._methods[method] = cb || function () {
		this.executeServerRPC.apply(this, [].slice.call(arguments));
	};
	
	// if (this.syncComplete) {
		console.log("syncComplete:: syncCompletesyncCompletesyncCompletesyncComplete", method);
		console.log("syncComplete:: syncCompletesyncCompletesyncCompletesyncComplete", method);
		console.log("syncComplete:: syncCompletesyncCompletesyncCompletesyncComplete", method);
		console.log("syncComplete:: syncCompletesyncCompletesyncCompletesyncComplete", method);
		console.log("syncComplete:: syncCompletesyncCompletesyncCompletesyncComplete", method);
		console.log("syncComplete:: syncCompletesyncCompletesyncCompletesyncComplete", method);
		console.log("syncComplete:: syncCompletesyncCompletesyncCompletesyncComplete", method);
		console.log("syncComplete:: syncCompletesyncCompletesyncCompletesyncComplete", method);
		this.sendRPCFunctions({}, [method], function (err) {
			// 
		});
	// }
};
wormholeTraveller.prototype.executeClientRPC = function(funcName) {
	// Server triggers client RPC execution
	var argsArray = ["executeClientRPC", funcName];
	this.emit.apply(this, argsArray.concat([].slice.call(arguments).slice(1)));
};
wormholeTraveller.prototype.executeChannelClientRPC = function(channel, funcName) {
	// Server triggers client RPC execution
	var argsArray = ["executeChannelClientRPC", "wormhole:"+channel, funcName];
	this.emit.apply(this, argsArray.concat([].slice.call(arguments).slice(2)));
};
wormholeTraveller.prototype.executeServerRPC = function(funcName) {
	// Client triggers server RPC execution
	var argsArray = ["executeServerRPC", funcName];
	this.emit.apply(this, argsArray.concat([].slice.call(arguments).slice(1)));
};
wormholeTraveller.prototype.setupClientEvents = function (cb) {
	var self = this;
	this.socket.on("connection", function () {
		self.isConnected = false;
	});
	this.socket.on("rpc", function (data) {
		/* data.func, data.async, data.arguments, data.uuid */
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
		self.isConnected = false;
		self.emit("disconnect");
	});
	this.syncClientFunctionsTimeout = null;
	this.socket.on("syncClientFunctions", function (method) {
		self.arrayOfSteps.push("syncClientFunctions:" + method);
		if (Array.isArray(method)) {
			// Array of client functions
			for (var i in method) {
				self.addClientMethod(method[i]);
			}
		} else {
			// Single client function name.
			self.addClientMethod(method);
		}

		if (self.syncClientFunctionsTimeout) {
			clearTimeout(self.syncClientFunctionsTimeout);
		}
		self.syncClientFunctionsTimeout = setTimeout(function () {
			self.emit("syncClientFunctionsComplete");
			self.arrayOfSteps.push("syncClientFunctionsComplete");
		}, 150);
	});
	cb && cb();
};
wormholeTraveller.prototype.callback = function (err, uuid) {
	var self = this;
	var args = [].slice.call(arguments);
	this.socket.emit.apply(this.socket, ["callback"].concat(args));
};
wormholeTraveller.prototype.sendClientRPC = function(out) {
	this.socket.emit("rpc", out);
};
wormholeTraveller.prototype.addCallbackId = function(id) {
	// body...
	var self = this;
	this._uuidList[id] = setTimeout(function () {
		if (self._uuidList[id]) {
			self.emit.apply(self, ["callback", id, ["Callback timeout."]]);
		}
	}, self.rpcTimeout);
	// Time out after -x- specified seconds.
};
wormholeTraveller.prototype.removeCallbackId = function(id) {
	clearTimeout(this._uuidList[id]);
	delete this._uuidList[id];
};
wormholeTraveller.prototype.getCallbackIds = function() {
	return Object.keys(this._uuidList);
};
/*
* Add following of a user through the wormhole pipe. Use redis.
*/
var wormholeReport = function (redissubclient) {
	events.EventEmitter.call(this);
	this._pubsub = redissubclient;
	this._client = this._pubsub.pubClient;
	this._writeClient = this._pubsub.pubClient;
};
wormholeReport.prototype.__proto__ = events.EventEmitter.prototype;
wormholeReport.prototype.report = function (id, direction, args) {
	var self = this;
	var obj = JSON.stringify({id: id, direction: direction, args: args});
	this._writeClient.publish("wormholeReport", obj);
	this._writeClient.publish("wormholeReport:"+id, obj);
	this._writeClient.rpush("wormholeReport:"+id, obj, function () {
		self._writeClient.ltrim("wormholeReport:"+id, -1000, -1);
	});
	this._writeClient.expire("wormholeReport:"+id, 1800); // 30 minutes.
	this.emit(id, obj);
	this.emit("newReport", obj);
};
wormholeReport.prototype.getUser = function (id, cb) {
	var self = this;
	self._client.lrange("wormholeReport:"+id, 0, -1, function (err, list) {
		for (var i = 0; i < list.length; i++) {
			list[i] = JSON.parse(list[i]);
		}
		cb(err, list);
	});
};
wormholeReport.prototype.getUsers = function(cb) {
	this._client.keys("wormholeReport:*", function (err, list) {
		for (var i = 0; i < list.length; i++) {
			list[i] = list[i].replace("wormholeReport:", "");
		}
		cb(err, list);
	});
};
wormholeReport.prototype.clear = function(id, cb) {
	this._writeClient.del("wormholeReport:"+id, cb)
};

//traveller.pipe.report("init", ["clientcallback", "servercallback", "clientRpc", "serverRpc"], "acidhax", "mail@matbee.com", "www.groupnotes.ca");
/*
* Fun attempt at doing client-side event handling on the server.
*/
var wormholeQuery = function () {
	events.EventEmitter.call(this);

	wormholeQuery.on("newListener", this.__newListener);
	wormholeQuery.on("removeListener", this.__removeListener);

	return this.selector;
};
wormholeQuery.prototype.__proto__ = events.EventEmitter.prototype;
wormholeQuery.prototype.__newListener = function(ev, fn) {
	// body...
};
wormholeQuery.prototype.__removeListener = function(ev, fn) {
	// body...
};
wormholeQuery.prototype.selector = function(selector) {
	// Send selector down to client, get data, then continue.
	this.emit("selector", selector);
	this._selector = selector;
	return this.selected;
};

// Mimic jQuery API.
wormholeQuery.prototype.selected = function() {
	var self = this;
	return {
		bind: function () {
			self.emit("event", [this._selector, "bind"].slice.call(arguments));
		},
		blur: function () {
			self.emit("event", [this._selector, "blur"].slice.call(arguments));
		},
		change: function () {
			self.emit("event", [this._selector, "change"].slice.call(arguments));
		},
		click: function () {
			// Execute this-- server-side.
			self.emit("event", [this._selector, "click"].slice.call(arguments));
		},
		dblclick: function () {
			self.emit("event", [this._selector, "dblclick"].slice.call(arguments));
		}
	}
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

// WebRTC Redis functions...
var prefix = "wormhole:";
wormhole.getChannel = function (readClient, channel, cb) {
	readClient.hgetall(prefix+channel, function (err, members) {
		for (var member in members) {
			if (members.hasOwnProperty(member)) {
				members[member] = JSON.parse(members[member]);
			}
		}
		cb(err, members || []);
	});
};
wormhole.addToChannel = function (client, channel, id, obj, cb) {
	client.hset(prefix+channel, id, JSON.stringify(obj), function () {
		wormhole.getChannel(client, channel, cb);
	});
};

wormhole.removeFromChannel = function (client, channel, id, cb) {
	client.hdel(prefix+channel, id, function (err) {
		wormhole.getChannel(client, channel, cb);
	});
};

wormhole.clearChannel = function (client, channel, cb) {
	client.del(prefix+channel, cb);
};

module.exports = wormhole;
// var wh = new wormhole({io: {}, express: {}, redisPubClient: {}, redisSubClient: {}, port: 5555, hostname: "hp.groupnotes.ca", protocol: "http"});
// wh.start();