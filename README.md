# chrome-net

### Use the Node `net` API in cordova Apps with the chrome-socket plugins

This module lets you use the Node.js [net](http://nodejs.org/api/net.html) (TCP) API in cordova/ionic mobile apps using `cordova-plugin-chrome-apps-sockets-tcp` and `cordova-plugin-chrome-apps-sockets-tcpserver` plugins for cordova.

Instead of learning the quirks of Chrome's `chrome.sockets` API for networking in Chrome Apps just **use the higher-level node API you're familiar with**. Then, compile your code with [browserify](https://github.com/substack/node-browserify) and you're all set!

This module is used by [cordova-bitcore](https://github.com/theveloped/cordova-bitcore.git).

## install

```
npm install chrome-net
```

## methods

Use node's `net` API, including all parameter list shorthands and variations.

Example TCP client:

```js
var net = require('chrome-net')

var client = net.createConnection({
  port: 1337,
  host: '127.0.0.1'
})

client.write('beep')

client.on('data', function (data) {
  console.log(data)
})

// .pipe() streaming API works too!

```

Example TCP server:

```js
var net = require('chrome-net')

var server = net.createServer()

server.on('listening', function () {
  console.log('listening')
})

server.on('connection', function (sock) {
  console.log('Connection from ' + sock.remoteAddress + ':' + sock.remotePort)
  sock.on('data', function (data) {
    console.log(data)
  })
})

server.listen(1337)

```

See nodejs.org for full API documentation: [net](http://nodejs.org/api/net.html)

## license

MIT. Copyright (c) [Feross Aboukhadijeh](http://feross.org) & John Hiesey.
