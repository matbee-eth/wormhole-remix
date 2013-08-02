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
	});
	socket.on("syncClientFunctions", function (data) {
		// console.log("syncClientFunctions", data);
		self.syncClientRpc(data);
	});
	socket.on("syncB", function (data) {
		console.log("SYNCBING");
		data = self.charcodeArrayToString(data);
		data = JSON.parse(data);
		console.log("SYNCBINGssss", data);
		self.sync(data);
		self.ready();
	});
	socket.on("rpc", function (data) {
		if (self.encryptAsBinary) {
			data = self.charcodeArrayToString(data);
			data = JSON.parse(data);
		}
		self.executeRpc(data.function, data.async, data.arguments, data.uuid);
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
	socket.on("execute", function (functino, args) {
		if (self.encryptAsBinary) {
			args = self.charcodeArrayToString(args);
			args = JSON.parse(args);

			functino = self.charcodeArrayToString(functino);
			functino = JSON.parse(functino);
		}
		functino = eval("(function() {return " + functino + ";})()");
		functino.apply(self, args);
	});
	var socketTimeout;
	socket.on('connect', function () {
		if (socketTimeout)
			clearTimeout(socketTimeout);
	});
	socket.on('disconnect', function () {
		if (self.forcingDisconnect) {
			for (var sock in socket.socket.namespaces) {
				if (sock) {
					socket.socket.namespaces[sock].wormhole.forcingDisconnect = true;
					socket.socket.namespaces[sock].socket.transport.websocket.close();
				}
			}
		} else {
			// attempt reconnect?
			if (reconnectionAttempts < maxReconnectionAttempts) {
				// Reconnect
				setTimeout(function () {
					socket.socket.reconnect();
					reconnectionAttempts++;
					reconnectionDelay = reconnectionDelay * 2;
				}, reconnectionDelay);
			} else {
				self.forcingDisconnect = true;
				// Connection failed;
				socket.disconnect();
				if (self._connectionFailed) {
					self._connectionFailed();
				}
			}
		}
	});
	// socket.on('reconnect_failed', function () {
	// 	console.log("client failed to connect, retrying new server.");
	// 	if (self._connectionFailed) {
	// 		self._connectionFailed();
	// 	}
	// });
};
wormhole.prototype.onConnectFailed = function (callback) {
	this._connectionFailed = callback;
};
wormhole.prototype.setSocket = function(socket) {
	this.socket = socket;
};
wormhole.prototype.executeRpc = function(methodName, isAsync, args, uuid) {
	var self = this;
	if (this.clientFunctions[methodName] && this.clientFunctions[methodName].bound) {
		if (isAsync && uuid) {
			var argsWithCallback = args.slice(0);
			argsWithCallback.push(function () {
				self.callbackRpc(uuid, [].slice.call(arguments));
			});
			this.clientFunctions[methodName].bound.apply(self, argsWithCallback);
		} else if (uuid) {
			var returnValue = this.clientFunctions[methodName].bound.apply(self, args);
			self.callbackRpc(uuid, returnValue);
		} else {
			this.clientFunctions[methodName].bound.apply(self, args);
		}
	} else if (this.clientFunctions[methodName]) {
		if (isAsync && uuid) {
			var argsWithCallback = args.slice(0);
			argsWithCallback.push(function () {
				self.callbackRpc(uuid, [].slice.call(arguments));
			});
			this.clientFunctions[methodName].apply(self, argsWithCallback);
		} else if (uuid) {
			var returnValue = this.clientFunctions[methodName].apply(self, args);
			self.callbackRpc(uuid, returnValue);
		} else {
			this.clientFunctions[methodName].apply(self, args);
		}
	}
};
wormhole.prototype.syncClientRpc = function (data) {
	var self = this;
	for (var k in data) {
		this.clientFunctions[k] = eval("(function () { return " + data[k] + "}())");
		this.clientFunctions[k].bindTo = (function (k) {
			return function (func) {
				self.clientFunctions[k].bound = func;
			}
		})(k);
	}
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