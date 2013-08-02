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
	events.EventEmitter.call(this);
	// Stores the actual reference to the functions.
	this._serverMethods = {};
	this._clientMethods = {};
	this._io = options.io;
	this._express = options.express;
	this._redisPubClient = options.redisPubClient;
	this._redisSubClient = options.redisSubClient;
	this._namespaces = [];
	this._namespaceClientFunctions = {};
};
wormhole.prototype.__proto__ = events.EventEmitter.prototype;
wormhole.prototype.start = function(io, express, options) {
	// body...
};
wormhole.prototype.setupExpressRoutes = function (cb) {
	// body...
};
wormhole.prototype.setupIOEvents = function (cb) {
	// body...
	var self = this;
	this._io.on("connection", function (socket) {
		self.createTraveller(socket, function (err, traveller) {
			// done!! HEHEHE!
			self.setupClientEvents(setupClientEvents, function (err) {
				// LOLOLO
				self.emit("connection", traveller);
			});
		});
	});
	cb && cb();
};
wormhole.prototype.setupClientEvents = function (traveller, cb) {
	// Capture RPC events from traveller.
	async.parallel([
		function (done) {
			traveller.on("executeClientRPC", function (data) {
				// Send RPC data to Client.
			});
			done();
		},
		function (done) {
			// Executing Server RPC.
			traveller.on("executeServerRPC", function (func, isAsync, UUID) {
				var args = [].slice.call(args);
			 	var func = args.shift();
			 	var isAsync = args.shift();
			 	var UUID = args.shift();
			 	// Execute RPC function w/ that name.
			 	// If UUID && isAsync, callback is expected.
			 	if (self._serverMethods[func]) {
			 		var rpcCallback;
				 	if (isAsync && UUID) {
				 		rpcCallback = function () {
				 			// UUID
				 			traveller.callback.apply(traveller, [UUID].concat([].slice.call(arguments)));
				 		}
				 	}
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
	//
};

var wormholeTraveller = function (socket) {
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
};
wormholeTraveller.prototype.__proto__ = events.EventEmitter.prototype;
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
		/* data.function, data.async, data.arguments, data.uuid */
		if (data && data.function) {
			self.executeServerRPC.apply(self, [data.function, data.async, data.uuid].concat(data.arguments));
		}
	});
	this.socket.on("disconnect", function () {
		self.emit("disconnect");
	});
	cb && cb();
};
wormholeTraveller.prototype.callback = function (uuid) {
	var self = this;
};