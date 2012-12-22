(function() {
	var socket = io.connect('http://wormhole.groupnotes.ca:3000');
	var wh = new wormhole(socket);
	wh.ready(function () {
		"REPLACETHISSTRINGOKAY?";
	});
}());