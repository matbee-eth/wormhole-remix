var wormhole = function (socket) {
	this.clientFunctions = {};
	this.serverFunctions = {};
	this.socket = socket;
	this.uuidList = {};
	this.rpc = {};
	this.callback = function () {};
	var self = this;
	this.setupSocket(socket);
};
wormhole.prototype.getSocket = function () {
	return this.socket;
};
wormhole.prototype.setupSocket = function(socket) {
	var self = this;
	var disconnectTimer;
	var __callbackHandlers = {};
	if (!socket.lolo) {
		socket.constructor.prototype.lolo = function (event, cb) {
			if (socket.send) {
				if (!__callbackHandlers[event]) {
					__callbackHandlers[event] = [];
				}
				__callbackHandlers[event].push(cb);
			} else {
				socket.on(event,cb);
			}
		}
	} else {
		console.log("wut?");
	}

	if (!socket.sendData) {
		console.log("socket.sendData doesn't exist");
		socket.constructor.prototype.sendData = function (event, data) {
			if (socket.send) {
				console.log("socket.send", event, data);
				socket.send(JSON.stringify({"emission": event, data: data}));
			} else {
				console.log("socket.emit", event, data);
				socket.emit(event, data);
			}
		}
	} else {
		console.log("Socket.sendData exists");
	}
	socket.onmessage = function (data) {
		data = JSON.parse(data.data);
		console.log("socket.onmessage", data.emission);
		if(__callbackHandlers[data.emission]) {
			for (var i = 0; i < __callbackHandlers[data.emission].length; i++) {
				__callbackHandlers[data.emission][i](data.data);
			}
		}
	};
	socket.onopen = function () {
		if(__callbackHandlers["connect"]) {
			for (var i = 0; i < __callbackHandlers["connect"].length; i++) {
				__callbackHandlers["connect"][i]();
			}
		}
	};
	socket.onclose = function () {
		console.log("closed");
		if(__callbackHandlers["disconnect"]) {
			for (var i = 0; i < __callbackHandlers["disconnect"].length; i++) {
				__callbackHandlers["disconnect"][i]();
			}
		}
	};
	socket.lolo("sync", function (data) {
		self.sync(data);
		self.ready();
	});
	socket.lolo("rpc", function (data) {
		self.executeRpc(data.function, data.async, data.arguments, data.uuid);
	});
	socket.lolo("rpcResponse", function (data) {
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
	var socketTimeout;
	socket.lolo('connect', function () {
		console.log("Connected to server before retrying new server.");
		if (socketTimeout)
			clearTimeout(socketTimeout);
	});
	socket.lolo('disconnect', function () {
		console.log("Disconnected. Waiting to retry new server.");
	});
	socket.lolo('reconnect_failed', function () {
		console.log("client failed to connect, retrying new server.");
		if (self._connectionFailed) {
			self._connectionFailed();
		}
	});
};
wormhole.prototype.onConnectFailed = function (callback) {
	this._connectionFailed = callback;
};
wormhole.prototype.setSocket = function(socket) {
	this.socket = socket;
};
wormhole.prototype.executeRpc = function(methodName, isAsync, args, uuid) {
	console.log("ExecuteRPC", arguments);
	var self = this;
	if (this.clientFunctions[methodName] && this.clientFunctions[methodName].bound) {
		if (isAsync && uuid) {
			var argsWithCallback = args.slice(0);
			argsWithCallback.push(function () {
				self.callbackRpc(uuid, [].slice.call(arguments));
			});
			this.clientFunctions[methodName].bound.apply(null, argsWithCallback);
		} else if (uuid) {
			var returnValue = this.clientFunctions[methodName].bound.apply(null, args);
			self.callbackRpc(uuid, returnValue);
		} else {
			this.clientFunctions[methodName].bound.apply(null, args);
		}
	} else if (this.clientFunctions[methodName]) {
		if (isAsync && uuid) {
			var argsWithCallback = args.slice(0);
			argsWithCallback.push(function () {
				self.callbackRpc(uuid, [].slice.call(arguments));
			});
			this.clientFunctions[methodName].apply(null, argsWithCallback);
		} else if (uuid) {
			var returnValue = this.clientFunctions[methodName].apply(null, args);
			self.callbackRpc(uuid, returnValue);
		} else {
			this.clientFunctions[methodName].apply(null, args);
		}
	}
};
wormhole.prototype.syncClientRpc = function (data) {
	var self = this;
	for (var k in data) {
		// console.log("syncClientRpc", k);
		this.clientFunctions[k] = eval("(function () { return " + data[k] + " }())");
		this.clientFunctions[k].bindTo = (function (k) {
			return function (func) {
				self.clientFunctions[k].bound = func;
			}
		})(k);
	}
};
wormhole.prototype.syncRpc = function (data) {
	for (var j in data) {
		// console.log("syncRpc", data[j]);
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
	var hasCallback = (typeof callback === "function");
	var out = {
		"function": functionName,
		"async": isAsync && hasCallback,
		"arguments": args
	};
	if (hasCallback) {
		out.uuid = __randomString();
		this.uuidList[out.uuid] = callback;
	}
	this.socket.sendData("rpc", out);
};
wormhole.prototype.callbackRpc = function(uuid) {
	this.socket.sendData("rpcResponse", {uuid: uuid, args: [].slice.call(arguments).slice(1)});
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
		this.callback = cb;
	} else {
		if (this.callback) {
			this.callback();
		}
	}
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