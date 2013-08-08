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

## How to use

###Server
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

	// Defining server-side RPC function.
	wh.on("whoAmI", function (cb) {
		cb("You're a wormhol-er, that's who!");
	});

	// Use this to specify which namespaces to support.
	wh.addNamespace('/example');
	wh.setPath('http://localhost:3000/wormhole/example/connect.js'); // In case of disconnect, retry here.
	wh.start({io: io, express: app}, function (err) {
      wh.on("connection", function (traveller) {
        traveller.rpc.getWebsite(function (url) {
          console.log("Current RPC Client Website:", url);
        });
      });
    });
```

###Client

```javascript
	var connected = function () {
		// Yay, I'm connected!
		// Now, lets execute some Server RPC's.
		this.rpc.whoAmI(function (Iam) { console.log("Server says:", Iam)});
	};
	// Client-side: Magic!
	var scripty = document.createElement("script");
	scripty.src = "http://localhost:3000/wormhole/example/connect.js";
	document.body.appendChild(scripty);
	scripty.onload = function () {
		wh.ready(connected);
		// Create client functions on the client AND/OR server.
		wh.on("getWebsite", function (cb) { cb(window.location.href)});
		wh.on("reconnect", function (script) {
			document.body.appendChild(script);
		});
	};
```
## API

### Server

  Exposed by `require('wormhole-remix')`.

  ### Server()

  Creates a new `Server`.

  ```js
  var WormholeServer = require('wormhole-remix')();
  var wh = new WormholeServer();
  ```

  ### Server(opts:Object)

  Optionally, the first argument (see below) of the `Server`
  constructor can be an options object.

  The following options are supported:

    - io: - Mandatory - Socket.IO instance
    - express: - Mandatory - Express instance
	- sessionStore: - Mandatory - for Express Sessions. Use connect-redis-pubsub.
    	- redisPubClient: -optional if connect-redis-pubsub sessionStore supplied-.
		- redisSubClient: -optional if connect-redis-pubsub sessionStore supplied-.
	- cookieParser: - Mandatory - To read express session cookies.
	- sessionKey: - Mandatory - To decrypt express sessions.
	- port: - Mandatory - To Pass to client for socket.io connection.
	- hostname: - Mandatory - To Pass to client for socket.io connection.
	- protocol: - Mandatory - To Pass to client for socket.io connection.

#### Server#Start(opts:Object)
	`Same options as above.`

#### Server#AddNamespace(namespace:String, clientsideFunction:Function, [argument1, argument2]...)
	`namespace` defines which socket.io namespace it belongs.
	`clientsideFunction`: Function to execute on the client script on connect.
	`[arguments]`: Pass server side arguments to the client function.

### Events

#### Server()
	- `connection`. Fired upon a connection.
		Parameters:
		- `Traveller` the connected socket.io RPC client.
	- `sessionUpdated`. Fired when a connected clients session is updated.

#### Event Example
```javascript
	wh.on("connection", function (traveller) {
		// Traveller is our wormhole rpc object.
		// You also have access to traveller.socket for direct socket.io access.
	});
```

### Custom Server RPC Functions
	Defined before clients are connected.
	- `Callbacks`. Server -> Client callbacks are always "err"-first.
```javascript
	wh.on("CustomRPCFunctionName", function (argument, argument2, cb) {
		// The client calls this function on the server.
		// Supports callbacks to the client.
		cb(null, "Done!");
	});
```
```javascript
	// Client
	wh.rpc.CustomRPCFunctionName("test", "onetwothree", function (err, yes) {
		console.log(yes); // === "Done!"
	});
```

###Client


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