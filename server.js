var util = require('util')
  , events = require('events');
  , uglify = require('uglify-js')
  , jsp = uglify.parser
  , pro = uglify.uglify
  , jsdom = require('jsdom');
  
var wormhole = function (io) {
	this.io = io;
	events.EventEmitter.call(this);
	io.sockets.on('connection', function (socket) {
		socket.set('wormhole', new traveller(socket));
	});
};

wormhole.prototype.transmitAllFrequencies = function (message) {
	this.io.sockets.emit(message);
};

wormhole.prototype.transmit = function(channel, message) {
	this.io.sockets.in(channel).emit(message);
};

wormhole.packageFunction = function (func, args) {
  var ret = "function() { return (" + fn.toString() + ").apply(this, " + JSON.stringify(args) + ");}";
  return ret;
};

var traveller = function (socket) {
	events.EventEmitter.call(this);
	this.socket = socket;
	this.cloakEngaged = false;
};

traveller.prototype.destination = function(channel) {
	this.socket.join(channel);
};

traveller.prototype.transmit = function(message) {
	this.socket.emit(message);
};

traveller.prototype.makeItSo = function (func) {
	var args = [].slice.call(arguments);
	if (args.length > 1) {
		args = args.slice(1);
	} else {
		args = [];
	}

	if (this.cloakEngaged) {
		this.transmit({func: traveller.encryptFunction(wormhole.packageFunction(func, args)) });
	} else {
		this.transmit({func: wormhole.packageFunction(func, args)});
	}
};

traveller.encryptFunction = function (funcString) {
 	var ast = jsp.parse("var func=" + funcString),
	ast = pro.ast_mangle(ast);
	ast = pro.ast_squeeze(ast);
	var finalCode = pro.gen_code(ast);
	return finalCode.toString().substring("var func=".length);
};

traveller.prototype.engageCloak = function () {
	this.cloakEngaged = true;
};

traveller.prototype.test = function () {

};

util.inherits(wormhole, events.EventEmitter);
util.inherits(traveller, events.EventEmitter);

module.exports = wormhole;

function evaluateWithArgs(fn, args) {
  var ret = "function() { return (" + fn.toString() + ").apply(this, " + JSON.stringify(args) + ");}";
  return ret;
}