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
	this._namespaceClientFunctions = {};
	this._uuidList = {};

	// Javascript file cache.
	this.__wormholeClientJs;
	this.__socketIOJs;
};
wormhole.prototype.__proto__ = events.EventEmitter.prototype;
wormhole.prototype.start = function(options) {
	// io, express and redis pub/sub are all mandatory.
	var callback;
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
	if (!this._redisPubClient || !this._redisPubClient) {
		throw new Error("No PubSub clients");
	}
	if (this._namespaces.length == 0) {
		this.addNamespace('/'); // Atleast support a basic namespace ^_^, geez!
	}
	console.log("Initializing Wormhole.");
	this.getScripts(function (err, response) {
		if (!err && this.__wormholeClientJs && this.__socketIOJs) {
			console.log("Wormhole scripts ready.");
			// Ready, Freddy!
			this.setupExpressRoutes(function (err) {
				console.log("Wormhole Express routes setup.");
				callback(err);
			});
		}
	});
};
wormhole.prototype.clientMethods = function(methods, cb) {
	var self = this;
	var methodKeys = Object.keys(methods);
	async.forEach(methodKeys, function (method, next) {
		self._clientMethods[method] = methods[method];
		next();
	}, cb);
};
wormhole.prototype.serverMethods = function(methods, cb) {
	var self = this;
	var methodKeys = Object.keys(methods);
	async.forEach(methodKeys, function (method, next) {
		self._clientMethods[method] = methods[method];
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
		doIt(req, res, req.params.namespace);
	});
	cb();
};
wormhole.prototype.getScripts = function (cb) {
	var self = this;
	async.parallel([
		function (done) {
			fs.readFile(__dirname + '/client.js', function (err, data) {
				if (!err) {
					var wormholeClientJs = data.toString();
					var port = "";
					if (self._port) {
						port = ":"+self._port;
					}
					wormholeClientJs = wormholeClientJs.replace('REPLACETHISFUCKINGSTRINGLOL', '//'+self._hostname + self._port);
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
	], cb);
};
wormhole.prototype.setupIOEvents = function (cb) {
	// body...
	var self = this;
	async.parallel([
		function (done) {
			if (self._cookieParser && self._sessionStore && self._sessionKey) {
				io.set('authorization', function(handshake, callback) {
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
			async.forEach(self._namespaces, function (namespace, next) {
				self._io.of(namespace).on("connection", function (socket) {
					self.createTraveller(socket, function (err, traveller) {
						// done!! HEHEHE!
						self.setupClientEvents(setupClientEvents, function (err) {
							// LOLOLO
							traveller.sendRPCFunctions(function (err) {
								self.emit("connection", traveller);
							});
						});
					});
				});
			}, done);
	}], cb);
};
wormhole.prototype.setupClientEvents = function (traveller, cb) {
	// Capture RPC events from traveller.
	async.parallel([
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
					self.uuidList[out.uuid] = callback;
				}

				traveller.send(out);
			});
			done();
		},
		function (done) {
			// Executing Server RPC.
			traveller.on("executeServerRPC", function (func, UUID) {
				var args = [].slice.call(args);
			 	var func = args.shift();
			 	var UUID = args.shift();
			 	// Execute RPC function w/ that name.
			 	// If UUID, callback is expected.
			 	if (self._serverMethods[func]) {
			 		var rpcCallback;
				 	if (UUID) {
				 		rpcCallback = function () {
				 			// UUID
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
		function () {
			traveller.on("disconnect", function () {
				// wut?
			});
			done();
		}
	],
	cb);
};
wormhole.prototype.createTraveller = function(socket, cb) {
	// body...
	var traveller = new wormholeTraveller(socket);
	traveller.setupClientEvents(function (err) {
		cb(err, traveller);
	});
};
wormhole.prototype.addNamespace = function (namespace, options) {
	if (options && options.engagingFunction) {
		this._namespaceClientFunctions[namespace] = options.engagingFunction;
	}
	this._namespaces.push(namespace);
};
wormhole.prototype.executeClientRPC = function (traveller, func) {
	//
};
wormhole.prototype.executeServerRPC = function (traveller, func) {
	var args = [].slice.call(arguments);
	traveller = args.shift();
	func = args.shift();
 	self._serverMethods[func].apply(traveller, args);
};

var wormholeTraveller = function (socket) {
	events.EventEmitter.call(this);
	this.socket = socket;
	this.cloakEngaged = false;
	this._methods = {};
	this._clientMethods = {};
	this.rpc = {};
	this.groupRpc = {};
	this.othersRpc = {};
	this.customRpc = {};
};
wormholeTraveller.prototype.__proto__ = events.EventEmitter.prototype;
wormholeTraveller.prototype.sendRPCFunctions = function(cb) {
	cb();
};
wormholeTraveller.prototype.syncClientMethods = function(methods) {
	var keys = Object.keys(methods);
	async.forEach(keys, function (method, next) {
		this.addClientMethod(method);
		next();
	}, cb);
};
wormholeTraveller.prototype.addClientMethod = function(method) {
	this.rpc[method] = function () {
		this.executeClientRPC.apply(this, [].slice.call(arguments));
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
wormholeTraveller.prototype.executeServerRPC = function(funcName) {
	// Client triggers server RPC execution
	var argsArray = ["executeServerRPC", funcName];
	this.emit.apply(this, argsArray.concat([].slice.call(arguments).slice(1)));
};
wormholeTraveller.prototype.setupClientEvents = function (cb) {
	var self = this;
	this.socket.on("rpc", function (data) {
		/* data.func, data.async, data.arguments, data.uuid */
		if (data && data.func) {
			self.executeServerRPC.apply(self, [data.func, data.uuid].concat(data.arguments));
		}
	});
	this.socket.on("callback", function (data) { // ClientRPC response.
		var uuid = data.uuid;
		var args = data.args;
		self.emit("callback", data);
	});
	this.socket.on("disconnect", function () {
		self.emit("disconnect");
	});
	cb && cb();
};
wormholeTraveller.prototype.callback = function () {
	var self = this;
	var args = [].slice.call(arguments);
	this.socket.emit.apply(this.socket, "callback", args);
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