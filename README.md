wormhole-remix RPC
=================

Socket.IO driven event-based RPC system.

## Install
```bash
$ npm install wormhole-remix
```

## Dependencies
  - uglify-js
  - request
  - redis-sub
  - connect-redis-pubsub
## Usage

  - Options - on Instantiation and on .start({})!
    - io: - Mandatory - Socket.IO instance
    - express: - Mandatory - Express instance
	- sessionStore: - Mandatory - for Express Sessions.
	    - redisPubClient: -optional if connect-redis-pubsub sessionStore supplied-, for PubSub across servers.
		- redisSubClient: -optional if connect-redis-pubsub sessionStore supplied-, for PubSub across servers.
	- cookieParser: - Mandatory - To read session cookies.
	- sessionKey: - Mandatory - To decrypt express sessions.
	- port: - Mandatory - To Pass to client for socket.io connection.
	- hostname: - Mandatory - To Pass to client for socket.io connection.
	- protocol: - Mandatory - To Pass to client for socket.io connection.

```javascript
	// Server-Side: Quick and dirty,
	var wormhole = require('wormhole-remix'),
		cookieParser = express.cookieParser('WORMHOLE.SECRET');

	var wh = new wormhole({
	  protocol: "https", /* Socket.IO/Express Protocol. */
	  hostname: require('os').hostname(),
	  port: 3000,
	  sessionStore: require('connect-redis-pubsub'),
	  cookieParser: cookieParser,
	  sessionKey: 'express.sid'
	});

	wh.clientMethods({
		getWebsite: function (cb) { cb(window.location.href); }
	});

	wh.serverMethods({
		whoAmI: function (cb) { cb("You're a wormhol-er that's who!"); }
	});

	// Use this to specify which namespaces to support.
	// Function is optional - Will execute on the client, once connected.
	wh.addNamespace('/example', function (Arg1) {console.log(Arg1);}, "ARG!!!");

	wh.start({io: io,express: app}, function (err) {
      wh.on("connection", function (traveller) {
        traveller.rpc.getWebsite(function (url) {
          console.log("Current RPC Client Website:", url);
        });
      });
    });
```

```javascript
	// After the madness below
	var connected = function () {
		// Yay, I'm connected!
		// Now, lets execute some Server RPC's.
	};
```
```javascript
	// Client-side: Magic!
	var scripty = document.createElement("script");
	scripty.src = "http://localhost:3000/wormhole/example/connect.js";
	document.appendChild(scripty);
	scripty.onload = function () {
		wh.ready(connected);
	};
	// Done.

	// Or do some EVIL EVAL!
	var req = new XMLHttpRequest();
	var wh;
	req.open("GET", "http://localhost:3000" + "/wormhole/example/connect.js", true);
	req.addEventListener("load", function(e) {
	    var window = {}; // I fake the window, yeah, because I'm cool like that.
		eval(req.responseText); // Don't hate me. I didn't have a choice.
		wh = window.wh;
		wh.ready(connected)
	}, false);
	req.send(null);
```

## License (MIT)

Copyright 2013 Mathieu Gosbee

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.