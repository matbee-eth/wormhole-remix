var wormhole = function (socket) {
	this.clientFunctions = {};
	this.serverFunctions = {};
	this.socket = socket;
	this.rpc = {};
	var self = this;
	socket.on("sync", function (data) {
		self.sync(data);
	});
	socket.on("rpc", function (data) {
		self.executeRpc(data.function, data.async, data.arguments, data.callbackId);
	});
};
wormhole.prototype.executeRpc = function(methodName, isAsync, args, callbackId) {
	var self = this;
	if (isAsync && callbackId) {
		var argsWithCallback = args.slice(0);
		argsWithCallback.push(function () {
			self.callbackRpc(callbackId);
		});
		this.clientFunctions[methodName].apply(null, argsWithCallback);
	} else if (callbackId) {
		var returnValue = this.clientFunctions[methodName].apply(null, args);
		self.callbackRpc(callbackId, returnValue);
	} else {
		this.clientFunctions[methodName].apply(null, args);
	}
};
wormhole.prototype.syncClientRpc = function (data) {
	for (var k in data) {
		this.clientFunctions[k] = eval("(function () { return " + data[k] + " }())");
	}
};
wormhole.prototype.syncRpc = function (data) {
	for (var j in data) {
		this.rpc[data[j]] = generateRPCFunction(data[j], true);
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
var generateRPCFunction = function (methodName, async) {
	return function () {
		var args = [].slice.call(arguments);
		var callback = null;
		if (typeof(args[args.length-1]) == "function") {
			// do something
			callback = args.splice(args.length-1, 1)[0];
		}
		self.executeRPC(methodName, async, args, callback);
	};
};
wormhole.prototype.executeRPC = function (functionName, isAsync, args, callback) {
	var hasCallback = (typeof callback === "function");
	var out = {
		"function": functionName,
		"async": isAsync && hasCallback,
		"arguments": args
	};
	if (hasCallback) {
		out.callbackId = __randomString();
		this.uuidList[out.callbackId] = callback;
	}
	this.socket.emit("rpc", out);
};
wormhole.prototype.callbackRpc = function(callbackId) {
	this.socket.emit("rpcResponse", {callbackId: callbackId, args: [].slice.call(arguments).slice(1)});
};
wormhole.prototype.executeRPC = function () {
	
};
wormhole.prototype.executeServerFunction = function(first_argument) {
	// body...
};

wormhole.prototype.execute = function(func) {
	var args = [].slice.call(arguments).slice(1);
	var f = eval("("+func+")");
	return f.apply(null, args);
};

// wh.rpc.hello("sayyyywhaaaat?", function (response) {
// 	alert(response);
// });