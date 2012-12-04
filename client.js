var wormhole = function (socket) {
	this.clientFunctions = {};
	this.serverFunctions = {};
};

wormhole.prototype.sync = function(data) {
	if (data.clientRPC) {
		for (var k in data.clientRPC) {
			this.clientFunctions[k] = data.clientRPC[k];
		}
	}
	if (data.serverRPC) {
		for (var k in data.serverRPC) {
			this[k] = function () {
				console.log(arguments);
			}
		}
	}
};

wormhole.prototype.executeServerFunction = function(first_argument) {
	// body...
};

wormhole.prototype.execute = function(func) {
	var args = [].slice.call(arguments).slice(1);
	var f = eval("("+func+")")
	return f.apply(null, args);
};