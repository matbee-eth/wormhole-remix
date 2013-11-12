// EventEmitter support
var EventEmitter = (typeof window !== 'undefined') ?
  EventEmitter || {} :
  exports;

(function(exports) {
  var slice = Array.prototype.slice;

  var EventEmitter = function() {
    this._listeners = {};
  };

  EventEmitter.prototype.on = function(name, fn) {
    this._listeners[name] = this._listeners[name] || [];
    this._listeners[name].push(fn);
    this.emit("newListener", name, fn);
    return this;
  };

  EventEmitter.prototype.remove = function(name, fn) {
    fn && this._listeners[name] && this._listeners[name].splice(this._listeners[name].indexOf(fn), 1);
    this.emit("removeListener", name, fn);
  };

  EventEmitter.prototype.emit = function(name) {

    var listeners = this._listeners[name] || [],
        args = slice.call(arguments, 1);
    for(var i = 0, len = listeners.length; i < len; ++i) {
      try {
        listeners[i].apply(this, args);
      } catch(err) {
        this.emit('error', err);
      }
    }
  };

  EventEmitter.prototype.emits = function(name, fn) {
    var ee = this;
    return function() {
      var args = slice.call(arguments),
          result = fn.apply(this, args),
          emit = result instanceof Array ? result : [result];

      // destructuring emit
      ee.emit.apply(ee, [name].concat(emit));
      return result;
    };
  };

  exports.EventEmitter = EventEmitter;
  exports.global = new EventEmitter();
  exports.emits = function() {
    return exports.global.emits.apply(exports.global, slice.call(arguments));
  };
})(EventEmitter);

var wormhole = function (socket, options) {
	EventEmitter.EventEmitter.call(this);
	this.clientFunctions = {};
	this.serverFunctions = {};
	this.socket = socket;
	this.uuidList = {};
	this.rpc = {};
	this.callback = [];
	this.customClientfunctions = [];
	this.peers = [];

	this.options = options;

	this._connected = false;

	var self = this;
	this.setupSocket(socket);
	this.setupClientEvents();

	this.on("wormholeReady", function () {
		self.emit("ready");
		self.ready();
	});

	this.on("whSettings", function (opts) {
		self.socketid = opts.socketid;
	});
	
	this.on("getServerFunctions", function (cb) {
		cb(self.customClientfunctions);
	});

	this.on("createOffer", this.createOffer);
	this.on("handleOffer", this.handleOffer);
	this.on("handleAnswer", this.handleAnswer);
	this.on("handleLeave", this.handleLeave)
	
	this.syncTimeout;
};
wormhole.prototype = Object.create(EventEmitter.EventEmitter.prototype);
wormhole.prototype.setupClientEvents = function() {
	var self = this;
	this.on("newListener", function (event, func) {
		if (event != "newListener" && event != "removeListener" && event != "reconnect" && self.customClientfunctions.indexOf(event) == -1) {
			// Client RPC. Add it!
			this.customClientfunctions.push(event);
			self.addClientFunction(event, func);
			if (self._connected) {
				self.syncClientFunctions();
			}
		}
	});
};
wormhole.prototype.charcodeArrayToString = function (arr) {
	var string = "";
	for (var i = 0; i < arr.length; i++) {
		string += String.fromCharCode(arr[i]);
	}
	return string;
};
wormhole.prototype.stringToCharcodeArray = function (str) {
	var outArray = [];
	for (var i = 0; i < str.length; i++) {
		outArray.push(str.charCodeAt(i));
	}
	return outArray;
};
wormhole.prototype.getSocket = function () {
	return this.socket;
};
wormhole.prototype.setupSocket = function(socket) {
	var self = this;
	this.forcingDisconnect = false;
	var maxReconnectionAttempts = 10;
	var reconnectionAttempts = 0;
	var reconnectionDelay = 500;
	socket.wormhole = this;
	socket.on("forcingDisconnect", function () {
		try {
			self.forcingDisconnect = true;
			socket.disconnect();
		} catch (ex) {

		}
	});
	socket.on("sync", function (data) {
		if (self.encryptAsBinary) {
			data = self.charcodeArrayToString(data);
			data = JSON.parse(data);
		}
		self.sync(data);
		self.ready();
		self.emit("ready");
	});
	socket.on("syncClientFunctions", function (data) {
		self.syncClientRpc(data);
	});
	socket.on("syncServerFunctions", function (data) {
		self.syncRpc(data);
	});
	socket.on("syncB", function (data) {
		data = self.charcodeArrayToString(data);
		data = JSON.parse(data);
		self.sync(data);
		self.ready();
		self.emit("ready");
	});
	socket.on("rpc", function (data) {
		if (self.encryptAsBinary) {
			data = self.charcodeArrayToString(data);
			data = JSON.parse(data);
		}
		self.executeRpc(data.function, data.uuid ? true : false, data.arguments, data.uuid, data.assureFunction);
	});
	socket.on("rpcResponse", function (data) {
		if (self.encryptAsBinary) {
			data = self.charcodeArrayToString(data);
			data = JSON.parse(data);
		}
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
	socket.on("callback", function (err, uuid) {
		var args = [].slice.call(arguments).slice(2);
		var func = self.uuidList[uuid];
		if (func && typeof func === "function") {
			if (!err && uuid) {
				// valid.
				// Execute function with arguments! Blama llama lamb! Blam alam alam
				func.apply(self, args);
			} else {
				// invalid.
				func.apply(self, [err]);
			}
			// Remove function from uuidList.
			if (uuid && self.uuidList[uuid]) {
				delete self.uuidList[uuid];
			}
		}
	});
	socket.on("execute", function (functino, args) {
		if (self.encryptAsBinary) {
			args = self.charcodeArrayToString(args);
			args = JSON.parse(args);

			functino = self.charcodeArrayToString(functino);
			functino = JSON.parse(functino);
		}
		functino = new Function("function() {return " + functino + ";}");
		functino.apply(self, args);
	});
	var socketTimeout;
	socket.on('connect', function () {
		self._connected = true;
		self.syncClientFunctions();
		self.emit("connection");
	});
	var getScript = function (self) {
		var scripty = document.createElement("script");
		scripty.src = self._path;
		scripty.onload = function (e) {
			if (e.status == 200 || e.responseCode == 200) {
				// Yay.
			} else {
				self.emit("reconnect", scripty);
			}
		};
		scripty.onerror = function (err) {
			setTimeout(function() {
				getScript(self);
			}, 1000);
		};

		self.emit("reconnect", scripty);
	};
	socket.on('disconnect', function () {
		for (var k in self.uuidList) {
			try {
				self.uuidList[k].call(self, "disconnected");
				delete self.uuidList[k];
			} catch (ex) {
				delete self.uuidList[k];
				throw ex;
			}
		}
		self._connected = false;
		if (self.forcingDisconnect) {
			for (var sock in socket.socket.namespaces) {
				if (sock) {
					socket.socket.namespaces[sock].wormhole.forcingDisconnect = true;
					socket.socket.namespaces[sock].socket.transport.websocket.close();
				}
			}
		} else {
			getScript(self);
		}
	});
};
wormhole.prototype.syncClientFunctions = function() {
	var self = this;
	if (this.syncTimeout) {
		clearTimeout(this.syncTimeout);
	}
	this.syncTimeout = setTimeout(function () {
		self.socket.emit("syncClientFunctions", self.customClientfunctions);
	}, 300);
};
wormhole.prototype.setPath = function(hostnameOfConnect) {
	this._path = hostnameOfConnect;
};
wormhole.prototype.onConnectFailed = function (callback) {
	this._connectionFailed = callback;
};
wormhole.prototype.setSocket = function(socket) {
	this.socket = socket;
};
wormhole.prototype.executeRpc = function(methodName, isAsync, args, uuid, assureFunction) {
	var self = this;
	if (this.clientFunctions[methodName] && this.clientFunctions[methodName].bound) {
		if (!assureFunction && isAsync && uuid) {
			var argsWithCallback = args.slice(0);
			argsWithCallback.push(function () {
				self.callbackRpc(uuid, [].slice.call(arguments));
			});
			this.clientFunctions[methodName].bound.apply(self, argsWithCallback);
		} else if (assureFunction || uuid) {
			var returnValue = this.clientFunctions[methodName].bound.apply(self, args);
			self.callbackRpc(uuid, returnValue);
		} else {
			this.clientFunctions[methodName].bound.apply(self, args);
		}
	} else if (this.clientFunctions[methodName]) {
		if (!assureFunction && isAsync && uuid) {
			var argsWithCallback = args.slice(0);
			argsWithCallback.push(function () {
				self.callbackRpc(uuid, [].slice.call(arguments));
			});
			this.clientFunctions[methodName].apply(self, argsWithCallback);
		} else if (assureFunction || uuid) {
			var returnValue = this.clientFunctions[methodName].apply(self, args);
			self.callbackRpc(uuid, returnValue);
		} else {
			this.clientFunctions[methodName].apply(self, args);
		}
	}
	this.emit.apply(this, ["executeRPC", methodName].concat(args));
};
wormhole.prototype.syncClientRpc = function (data) {
	var self = this;
	for (var k in data) {
		var key = k;
		var func = eval("(function () { return " + data[k] + "}())");;
		this.addClientFunction(k, func);
	}
};
wormhole.prototype.addClientFunction = function(key, func) {
	var self = this;
	this.clientFunctions[key] = func;
	func.bindTo = (function (key) {
		return function (func) {
			self.clientFunctions[key].bound = func;
		}
	})(key);
};
wormhole.prototype.syncRpc = function (data) {
	for (var j in data) {
		this.rpc[data[j]] = generateRPCFunction(this, data[j], true);
	}
};
wormhole.prototype.sync = function(data) {
	this.syncRpc(data.serverRPC);
	if (data.clientRPC) {
		this.syncClientRpc(data.clientRPC);
	}
	if (data.serverRPC) {
		this.syncRpc(data.serverRPC);
	}
};
var generateRPCFunction = function (self, methodName, async) {
	return function () {
		var args = [].slice.call(arguments);
		var callback = null;
		if (typeof(args[args.length-1]) == "function") {
			// do something
			callback = args.splice(args.length-1, 1)[0];
		}
		self.executeServerFunction(methodName, async, args, callback);
	};
};
wormhole.prototype.executeServerFunction = function (functionName, isAsync, args, callback) {
	var self = this;
	var _callback = function () {
		callback.apply(null, [].slice.call(arguments));
	}
	var hasCallback = (typeof callback === "function");
	var out = {
		"function": functionName,
		"async": isAsync && hasCallback,
		"arguments": args
	};
	if (hasCallback) {
		out.uuid = __randomString();
		this.uuidList[out.uuid] = _callback;
		setTimeout(function () {
			if (self.uuidList[out.uuid]) {
				try {
					self.uuidList[out.uuid].call(self, "timeout");
					delete self.uuidList[out.uuid];
				} catch (ex) {
					delete self.uuidList[out.uuid];
					throw ex;
				}
			}
		}, 30000);
	}
	if (this.encryptAsBinary) {
		out = this.stringToCharcodeArray(JSON.stringify(out));
	}
	this.socket.emit("rpc", out);
};
wormhole.prototype.callbackRpc = function(uuid) {
	this.socket.emit("rpcResponse", {uuid: uuid, args: [].slice.call(arguments).slice(1)});
};
// wormhole.prototype.methods = function(methods) {
// 	var outMethods = [];
// 	for (var k in methods) {
// 		this.clientFunctions[k] = methods[k];
// 		outMethods.push(k);
// 	}
// 	this.socket.emit("syncRpcFunctions", outMethods);
// };
wormhole.prototype.execute = function(func) {
	var args = [].slice.call(arguments).slice(1);
	var f = eval("("+func+")");
	return f.apply(null, args);
};
wormhole.prototype.ready = function (cb) {
	if (cb) {
		this.callback.push(cb);
		if (this._readyFired) {
			cb.call(this);
		}
	} else {
		this._readyFired = true;
		for (var i =0; i < this.callback.length; i++) {
			this.callback[i].call(this);
		}
	}
};

wormhole.prototype.createOffer = function(id, cb) {
	var _offerDescription;
	var self = this;
	var connect = this.createConnection(id);
	connect.createOffer(
		function(desc) {
			_offerDescription = desc;
			connect.setLocalDescription(desc);
			cb(desc);
		},
		function(){
			console.log(arguments);
		}
	);
};

wormhole.prototype.createConnection = function(id) {
	var self = this;
	if (!this.peers) {
		this.peers = {};
	}
	this.peers[id] = new webkitRTCPeerConnection({
		iceServers: [
			{ url: "stun:stun.l.google.com:19302" },
			{ url: 'turn:asdf@ec2-54-227-128-105.compute-1.amazonaws.com:3479', credential:'asdf' }
		]
	});

	this.peers[id].onicecandidate = function (event) {
		self.rpc.addIceCandidate(id, event.candidate);
	};

	return this.peers[id];
};

wormhole.prototype.handleOffer = function(id, offerDescription, cb) {
	var self = this;
	var connect = this.createConnection(id);
	var remoteDescription = new RTCSessionDescription(offerDescription);
	connect.setRemoteDescription(remoteDescription);
	connection.createAnswer(function (answer) {
		connect.setLocalDescription(answer);
		// self.rpc.sendAnswer(id, answer);
		cb(answer);
	}, function (err) {
		// 
	});
};

wormhole.prototype.handleAnswer = function(id, answerDescription, cb) {
	var connect = this.peers[id];
	var remoteDescription = new RTCSessionDescription(answerDescription);
	connect.setRemoteDescription(remoteDescription);
};

wormhole.prototype.handleLeave = function(id) {
	// remove ID
};

wormhole.prototype.getPeers = function(cb) {
	
};

var wormholePeer = function (type, transport, rpcFunctions) {
	this.type = type;
	this.transport = transport;
	this.convertFunctions(rpcFunctions);
};
wormholePeer.prototype.send = function() {
	
};
wormholePeer.prototype.convertFunctions = function(rpcFunctions) {
	this._rpcFunctions = rpcFunctions;
};

var __randomString = function() {
	var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";
	var string_length = 64;
	var randomstring = '';
	for (var i=0; i<string_length; i++) {
		var rnum = Math.floor(Math.random() * chars.length);
		randomstring += chars.substring(rnum,rnum+1);
	}
	return randomstring;
};

/*
	---
 */

// wh.methods({
// 	updateNoteColor: noteController.updateNoteColor,
// 	updateNoteContent: noteController.updateNoteContent
// });