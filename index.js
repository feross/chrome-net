/*global chrome */

/**
 * net
 * ===
 *
 * The net module provides you with an asynchronous network wrapper. It
 * contains methods for creating both servers and clients (called streams).
 * You can include this module with require('chrome-net')
 */

var EventEmitter = require('events').EventEmitter
var inherits = require('inherits')
var is = require('core-util-is')
var stream = require('stream')
var deprecate = require('util').deprecate
var timers = require('timers')

// Track open servers and sockets to route incoming sockets (via onAccept and onReceive)
// to the right handlers.
var servers = {}
var sockets = {}
var listenersAdded = false

// if (typeof chrome !== 'undefined') {
//   chrome.sockets.tcpServer.onAccept.addListener(onAccept)
//   chrome.sockets.tcpServer.onAcceptError.addListener(onAcceptError)
//   chrome.sockets.tcp.onReceive.addListener(onReceive)
//   chrome.sockets.tcp.onReceiveError.addListener(onReceiveError)
// }

function onAccept (info) {
  if (info.socketId in servers) {
    servers[info.socketId]._onAccept(info.clientSocketId)
  } else {
    console.error('Unknown server socket id: ' + info.socketId)
  }
}

function onAcceptError (info) {
  if (info.socketId in servers) {
    servers[info.socketId]._onAcceptError(info.resultCode)
  } else {
    console.error('Unknown server socket id: ' + info.socketId)
  }
}

function onReceive (info) {
  if (info.socketId in sockets) {
    sockets[info.socketId]._onReceive(info.data)
  } else {
    console.error('Unknown socket id: ' + info.socketId)
  }
}

function onReceiveError (info) {
  if (info.socketId in sockets) {
    sockets[info.socketId]._onReceiveError(info.resultCode)
  } else {
    if (info.resultCode === -100) return // net::ERR_CONNECTION_CLOSED
    console.error('Unknown socket id: ' + info.socketId)
  }
}

/**
 * Creates a new TCP server. The connectionListener argument is automatically
 * set as a listener for the 'connection' event.
 *
 * @param  {Object} options
 * @param  {function} listener
 * @return {Server}
 */
exports.createServer = function (options, listener) {
  return new Server(options, listener)
}

/**
 * net.connect(options, [connectionListener])
 * net.createConnection(options, [connectionListener])
 *
 * Constructs a new socket object and opens the socket to the given location.
 * When the socket is established, the 'connect' event will be emitted.
 *
 * For TCP sockets, options argument should be an object which specifies:
 *
 *   port: Port the client should connect to (Required).
 *   host: Host the client should connect to. Defaults to 'localhost'.
 *   localAddress: Local interface to bind to for network connections.
 *
 * ===============================================================
 *
 * net.connect(port, [host], [connectListener])
 * net.createConnection(port, [host], [connectListener])
 *
 * Creates a TCP connection to port on host. If host is omitted,
 * 'localhost' will be assumed. The connectListener parameter will be
 * added as an listener for the 'connect' event.
 *
 * @param {Object} options
 * @param {function} listener
 * @return {Socket}
 */
exports.connect = exports.createConnection = function () {
  var args = normalizeConnectArgs(arguments)
  var s = new Socket(args[0])
  return Socket.prototype.connect.apply(s, args)
}

inherits(Server, EventEmitter)

/**
 * Class: net.Server
 * =================
 *
 * This class is used to create a TCP server.
 *
 * Event: 'listening'
 *   Emitted when the server has been bound after calling server.listen.
 *
 * Event: 'connection'
 *   - Socket object The connection object
 *   Emitted when a new connection is made. socket is an instance of net.Socket.
 *
 * Event: 'close'
 *   Emitted when the server closes. Note that if connections exist, this event
 *   is not emitted until all connections are ended.
 *
 * Event: 'error'
 *   - Error Object
 *   Emitted when an error occurs. The 'close' event will be called directly
 *   following this event. See example in discussion of server.listen.
 */
function Server (/* [options], listener */) {
  var self = this
  if (!(self instanceof Server)) return new Server(arguments[0], arguments[1])
  EventEmitter.call(self)
  
  if (!listenersAdded) {
    if (typeof chrome !== 'undefined') {
      chrome.sockets.tcpServer.onAccept.addListener(onAccept)
      chrome.sockets.tcpServer.onAcceptError.addListener(onAcceptError)
      chrome.sockets.tcp.onReceive.addListener(onReceive)
      chrome.sockets.tcp.onReceiveError.addListener(onReceiveError)
      listenersAdded = true
    }
  }

  var options

  if (is.isFunction(arguments[0])) {
    options = {}
    self.on('connection', arguments[0])
  } else {
    options = arguments[0] || {}

    if (is.isFunction(arguments[1])) {
      self.on('connection', arguments[1])
    }
  }

  self._connections = 0

  Object.defineProperty(self, 'connections', {
    get: deprecate(function () {
      return self._connections
    }, 'connections property is deprecated. Use getConnections() method'),
    set: deprecate(function (val) {
      return (self._connections = val)
    }, 'connections property is deprecated. Use getConnections() method'),
    configurable: true, enumerable: false
  })

  self.id = null // a number > 0
  self._connecting = false

  self.allowHalfOpen = options.allowHalfOpen || false
  self.pauseOnConnect = !!options.pauseOnConnect
  self._address = null

  self._host = null
  self._port = null
  self._backlog = null
}
exports.Server = Server

Server.prototype._usingSlaves = false // not used

/**
 * server.listen(port, [host], [backlog], [callback])
 *
 * Begin accepting connections on the specified port and host. If the host is
 * omitted, the server will accept connections directed to any IPv4 address
 * (INADDR_ANY). A port value of zero will assign a random port.
 *
 * Backlog is the maximum length of the queue of pending connections. The
 * actual length will be determined by your OS through sysctl settings such as
 * tcp_max_syn_backlog and somaxconn on linux. The default value of this
 * parameter is 511 (not 512).
 *
 * This function is asynchronous. When the server has been bound, 'listening'
 * event will be emitted. The last parameter callback will be added as an
 * listener for the 'listening' event.
 *
 * @return {Socket}
 */
Server.prototype.listen = function (/* variable arguments... */) {
  var self = this

  var lastArg = arguments[arguments.length - 1]
  if (is.isFunction(lastArg)) {
    self.once('listening', lastArg)
  }

  var port = toNumber(arguments[0])

  var address

  // The third optional argument is the backlog size.
  // When the ip is omitted it can be the second argument.
  var backlog = toNumber(arguments[1]) || toNumber(arguments[2]) || undefined

  if (is.isObject(arguments[0])) {
    var h = arguments[0]

    if (h._handle || h.handle) {
      throw new Error('handle is not supported in Chrome Apps.')
    }
    if (is.isNumber(h.fd) && h.fd >= 0) {
      throw new Error('fd is not supported in Chrome Apps.')
    }

    // The first argument is a configuration object
    if (h.backlog) {
      backlog = h.backlog
    }

    if (is.isNumber(h.port)) {
      address = h.host || null
      port = h.port
    } else if (h.path && isPipeName(h.path)) {
      throw new Error('Pipes are not supported in Chrome Apps.')
    } else {
      throw new Error('Invalid listen argument: ' + h)
    }
  } else if (isPipeName(arguments[0])) {
    // UNIX socket or Windows pipe.
    throw new Error('Pipes are not supported in Chrome Apps.')
  } else if (is.isUndefined(arguments[1]) ||
             is.isFunction(arguments[1]) ||
             is.isNumber(arguments[1])) {
    // The first argument is the port, no IP given.
    address = null
  } else {
    // The first argument is the port, the second an IP.
    address = arguments[1]
  }

  // now do something with port, address, backlog

  if (self.id) {
    self.close()
  }

  // If port is invalid or undefined, bind to a random port.
  self._port = port | 0
  if (self._port < 0 || self._port > 65535) { // allow 0 for random port
    throw new RangeError('port should be >= 0 and < 65536: ' + self._port)
  }

  self._host = address

  var isAny6 = !self._host
  if (isAny6) {
    self._host = '::'
  }

  self._backlog = is.isNumber(backlog) ? backlog : undefined

  self._connecting = true

  chrome.sockets.tcpServer.create(function (createInfo) {
    if (!self._connecting || self.id) {
      // ignoreLastError()
      chrome.sockets.tcpServer.close(createInfo.socketId)
      return
    }
    // if (chrome.runtime.lastError) {
    //   self.emit('error', new Error(chrome.runtime.lastError.message))
    //   return
    // }

    var socketId = self.id = createInfo.socketId
    servers[self.id] = self

    function listen () {
      chrome.sockets.tcpServer.listen(self.id, self._host, self._port,
          self._backlog, function (result) {
        // callback may be after close
        if (self.id !== socketId) {
          // ignoreLastError()
          return
        }
        if (result !== 0 && isAny6) {
          // ignoreLastError()
          self._host = '0.0.0.0' // try IPv4
          isAny6 = false
          return listen()
        }

        self._onListen(result)
      })
    }
    listen()
  })

  return self
}

Server.prototype._onListen = function (result) {
  var self = this
  self._connecting = false

  if (result === 0) {
    var idBefore = self.id
    chrome.sockets.tcpServer.getInfo(self.id, function (info) {
      if (self.id !== idBefore) {
        // ignoreLastError()
        return
      }
      // if (chrome.runtime.lastError) {
      //   self._onListen(-2) // net::ERR_FAILED
      //   return
      // }

      self._address = {
        port: info.localPort,
        family: info.localAddress &&
          info.localAddress.indexOf(':') !== -1 ? 'IPv6' : 'IPv4',
        address: info.localAddress
      }
      self.emit('listening')
    })
  } else {
    self.emit('error', errnoException(result, 'listen'))
    chrome.sockets.tcpServer.close(self.id)
    delete servers[self.id]
    self.id = null
  }
}

Server.prototype._onAccept = function (clientSocketId) {
  var self = this

  // Set the `maxConnections` property to reject connections when the server's
  // connection count gets high.
  if (self.maxConnections && self._connections >= self.maxConnections) {
    chrome.sockets.tcp.close(clientSocketId)
    console.warn('Rejected connection - hit `maxConnections` limit')
    return
  }

  self._connections += 1

  var acceptedSocket = new Socket({
    server: self,
    id: clientSocketId,
    allowHalfOpen: self.allowHalfOpen,
    pauseOnCreate: self.pauseOnConnect
  })
  acceptedSocket.on('connect', function () {
    self.emit('connection', acceptedSocket)
  })
}

Server.prototype._onAcceptError = function (resultCode) {
  var self = this
  self.emit('error', errnoException(resultCode, 'accept'))
  self.close()
}

/**
 * Stops the server from accepting new connections and keeps existing
 * connections. This function is asynchronous, the server is finally closed
 * when all connections are ended and the server emits a 'close' event.
 * Optionally, you can pass a callback to listen for the 'close' event.
 * @param  {function} callback
 */
Server.prototype.close = function (callback) {
  var self = this

  if (callback) {
    if (!self.id) {
      self.once('close', function () {
        callback(new Error('Not running'))
      })
    } else {
      self.once('close', callback)
    }
  }

  if (self.id) {
    chrome.sockets.tcpServer.close(self.id)
    delete servers[self.id]
    self.id = null
  }
  self._address = null
  self._connecting = false

  self._emitCloseIfDrained()

  return self
}

Server.prototype._emitCloseIfDrained = function () {
  var self = this

  if (self.id || self._connecting || self._connections) {
    return
  }

  process.nextTick(function () {
    if (self.id || self._connecting || self._connections) {
      return
    }
    self.emit('close')
  })
}

/**
 * Returns the bound address, the address family name and port of the socket
 * as reported by the operating system. Returns an object with three
 * properties, e.g. { port: 12346, family: 'IPv4', address: '127.0.0.1' }
 *
 * @return {Object} information
 */
Server.prototype.address = function () {
  return this._address
}

Server.prototype.unref = function () {
  // No chrome.socket equivalent
}

Server.prototype.ref = function () {
  // No chrome.socket equivalent
}

/**
 * Asynchronously get the number of concurrent connections on the server.
 * Works when sockets were sent to forks.
 *
 * Callback should take two arguments err and count.
 *
 * @param  {function} callback
 */
Server.prototype.getConnections = function (callback) {
  var self = this
  process.nextTick(function () {
    callback(null, self._connections)
  })
}

inherits(Socket, stream.Duplex)

/**
 * Class: net.Socket
 * =================
 *
 * This object is an abstraction of a TCP or UNIX socket. net.Socket instances
 * implement a duplex Stream interface. They can be created by the user and
 * used as a client (with connect()) or they can be created by Node and passed
 * to the user through the 'connection' event of a server.
 *
 * Construct a new socket object.
 *
 * options is an object with the following defaults:
 *
 *   { fd: null // NO CHROME EQUIVALENT
 *     type: null
 *     allowHalfOpen: false // NO CHROME EQUIVALENT
 *   }
 *
 * `type` can only be 'tcp4' (for now).
 *
 * Event: 'connect'
 *   Emitted when a socket connection is successfully established. See
 *   connect().
 *
 * Event: 'data'
 *   - Buffer object
 *   Emitted when data is received. The argument data will be a Buffer or
 *   String. Encoding of data is set by socket.setEncoding(). (See the Readable
 *   Stream section for more information.)
 *
 *   Note that the data will be lost if there is no listener when a Socket
 *   emits a 'data' event.
 *
 * Event: 'end'
 *   Emitted when the other end of the socket sends a FIN packet.
 *
 *   By default (allowHalfOpen == false) the socket will destroy its file
 *   descriptor once it has written out its pending write queue. However,
 *   by setting allowHalfOpen == true the socket will not automatically
 *   end() its side allowing the user to write arbitrary amounts of data,
 *   with the caveat that the user is required to end() their side now.
 *
 * Event: 'timeout'
 *   Emitted if the socket times out from inactivity. This is only to notify
 *   that the socket has been idle. The user must manually close the connection.
 *
 *   See also: socket.setTimeout()
 *
 * Event: 'drain'
 *   Emitted when the write buffer becomes empty. Can be used to throttle
 *   uploads.
 *
 *   See also: the return values of socket.write()
 *
 * Event: 'error'
 *   - Error object
 *   Emitted when an error occurs. The 'close' event will be called directly
 *   following this event.
 *
 * Event: 'close'
 *   - had_error Boolean true if the socket had a transmission error
 *   Emitted once the socket is fully closed. The argument had_error is a
 *   boolean which says if the socket was closed due to a transmission error.
 */
function Socket (options) {
  var self = this
  if (!(self instanceof Socket)) return new Socket(options)

  if (!listenersAdded) {
    if (typeof chrome !== 'undefined') {
      chrome.sockets.tcpServer.onAccept.addListener(onAccept)
      chrome.sockets.tcpServer.onAcceptError.addListener(onAcceptError)
      chrome.sockets.tcp.onReceive.addListener(onReceive)
      chrome.sockets.tcp.onReceiveError.addListener(onReceiveError)
      listenersAdded = true
    }
  }

  if (is.isNumber(options)) {
    options = { fd: options } // Legacy interface.
  } else if (is.isUndefined(options)) {
    options = {}
  }

  if (options.handle) {
    throw new Error('handle is not supported in Chrome Apps.')
  } else if (!is.isUndefined(options.fd)) {
    throw new Error('fd is not supported in Chrome Apps.')
  }

  options.decodeStrings = true
  options.objectMode = false
  stream.Duplex.call(self, options)

  self.destroyed = false
  self._hadError = false // Used by _http_client.js
  self.id = null // a number > 0
  self._parent = null
  self._host = null
  self._port = null
  self._pendingData = null

  self.ondata = null
  self.onend = null

  self._init()
  self._reset()

  // default to *not* allowing half open sockets
  // Note: this is not possible in Chrome Apps, see https://crbug.com/124952
  self.allowHalfOpen = options.allowHalfOpen || false

  // shut down the socket when we're finished with it.
  self.on('finish', self.destroy)

  if (options.server) {
    self.server = options.server
    self.id = options.id
    sockets[self.id] = self

    if (options.pauseOnCreate) {
      // stop the handle from reading and pause the stream
      // (Already paused in Chrome version)
      self._readableState.flowing = false
    }

    // For incoming sockets (from server), it's already connected.
    self._connecting = true
    self.writable = true
    self._onConnect()
  }
}
exports.Socket = Socket

// called when creating new Socket, or when re-using a closed Socket
Socket.prototype._init = function () {
  var self = this

  // The amount of received bytes.
  self.bytesRead = 0

  self._bytesDispatched = 0
}

// called when creating new Socket, or when closing a Socket
Socket.prototype._reset = function () {
  var self = this

  self.remoteAddress = self.remotePort =
      self.localAddress = self.localPort = null
  self.remoteFamily = 'IPv4'
  self.readable = self.writable = false
  self._connecting = false
}

/**
 * socket.connect(port, [host], [connectListener])
 * socket.connect(options, [connectListener])
 *
 * Opens the connection for a given socket. If port and host are given, then
 * the socket will be opened as a TCP socket, if host is omitted, localhost
 * will be assumed. If a path is given, the socket will be opened as a unix
 * socket to that path.
 *
 * Normally this method is not needed, as net.createConnection opens the
 * socket. Use this only if you are implementing a custom Socket.
 *
 * This function is asynchronous. When the 'connect' event is emitted the
 * socket is established. If there is a problem connecting, the 'connect'
 * event will not be emitted, the 'error' event will be emitted with the
 * exception.
 *
 * The connectListener parameter will be added as an listener for the
 * 'connect' event.
 *
 * @param  {Object} options
 * @param  {function} cb
 * @return {Socket}   this socket (for chaining)
 */
Socket.prototype.connect = function () {
  var self = this
  var args = normalizeConnectArgs(arguments)
  var options = args[0]
  var cb = args[1]

  if (options.path) {
    throw new Error('Pipes are not supported in Chrome Apps.')
  }

  if (self.id) {
    // already connected, destroy and connect again
    self.destroy()
  }

  if (self.destroyed) {
    self._readableState.reading = false
    self._readableState.ended = false
    self._readableState.endEmitted = false
    self._writableState.ended = false
    self._writableState.ending = false
    self._writableState.finished = false
    self._writableState.errorEmitted = false
    self._writableState.length = 0
    self.destroyed = false
  }

  self._connecting = true
  self.writable = true

  self._host = options.host || 'localhost'
  self._port = Number(options.port)

  if (self._port < 0 || self._port > 65535 || isNaN(self._port)) {
    throw new RangeError('port should be >= 0 and < 65536: ' + options.port)
  }

  self._init()

  self._unrefTimer()

  if (is.isFunction(cb)) {
    self.once('connect', cb)
  }

  chrome.sockets.tcp.create(function (createInfo) {
    if (!self._connecting || self.id) {
      // ignoreLastError()
      chrome.sockets.tcp.close(createInfo.socketId)
      return
    }
    // if (chrome.runtime.lastError) {
    //   self.destroy(new Error(chrome.runtime.lastError.message))
    //   return
    // }

    self.id = createInfo.socketId
    sockets[self.id] = self

    chrome.sockets.tcp.setPaused(self.id, true)

    chrome.sockets.tcp.connect(self.id, self._host, self._port, function (result) {
      // callback may come after call to destroy
      if (self.id !== createInfo.socketId) {
        // ignoreLastError()
        return
      }
      if (result !== 0) {
        self.destroy(errnoException(result, 'connect'))
        return
      }

      self._unrefTimer()
      self._onConnect()
    })
  })

  return self
}

Socket.prototype._onConnect = function () {
  var self = this

  var idBefore = self.id
  chrome.sockets.tcp.getInfo(self.id, function (result) {
    if (self.id !== idBefore) {
      // ignoreLastError()
      return
    }
    // if (chrome.runtime.lastError) {
    //   self.destroy(new Error(chrome.runtime.lastError.message))
    //   return
    // }

    self.remoteAddress = result.peerAddress
    self.remoteFamily = result.peerAddress &&
        result.peerAddress.indexOf(':') !== -1 ? 'IPv6' : 'IPv4'
    self.remotePort = result.peerPort
    self.localAddress = result.localAddress
    self.localPort = result.localPort

    self._connecting = false
    self.readable = true

    self.emit('connect')
    // start the first read, or get an immediate EOF.
    // this doesn't actually consume any bytes, because len=0
    // TODO: replace _readableState.flowing with isPaused() after https://github.com/substack/node-browserify/issues/1341
    if (self._readableState.flowing) self.read(0)
  })
}

/**
 * The number of characters currently buffered to be written.
 * @type {number}
 */
Object.defineProperty(Socket.prototype, 'bufferSize', {
  get: function () {
    var self = this
    if (self.id) {
      var bytes = this._writableState.length
      if (self._pendingData) bytes += self._pendingData.length
      return bytes
    }
  }
})

Socket.prototype.end = function (data, encoding) {
  var self = this
  stream.Duplex.prototype.end.call(self, data, encoding)
  self.writable = false
}

Socket.prototype._write = function (chunk, encoding, callback) {
  var self = this
  if (!callback) callback = function () {}

  if (self._connecting) {
    self._pendingData = chunk
    self.once('connect', function () {
      self._write(chunk, encoding, callback)
    })
    return
  }
  self._pendingData = null

  if (!this.id) {
    callback(new Error('This socket is closed.'))
    return
  }

  // assuming buffer is browser implementation (`buffer` package on npm)
  var buffer = chunk.buffer
  if (chunk.byteOffset || chunk.byteLength !== buffer.byteLength) {
    buffer = buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength)
  }

  var idBefore = self.id
  chrome.sockets.tcp.send(self.id, buffer, function (sendInfo) {
    if (self.id !== idBefore) {
      // ignoreLastError()
      return
    }

    if (sendInfo.resultCode < 0) {
      self.destroy(errnoException(sendInfo.resultCode, 'write'), callback)
    } else {
      self._unrefTimer()
      callback(null)
    }
  })

  self._bytesDispatched += chunk.length
}

Socket.prototype._read = function (bufferSize) {
  var self = this
  if (self._connecting || !self.id) {
    self.once('connect', self._read.bind(self, bufferSize))
    return
  }

  chrome.sockets.tcp.setPaused(self.id, false)

  var idBefore = self.id
  chrome.sockets.tcp.getInfo(self.id, function (result) {
    if (self.id !== idBefore) {
      // ignoreLastError()
      return
    }
    // if (chrome.runtime.lastError || !result.connected) {
    //   self._onReceiveError(-15) // workaround for https://crbug.com/518161
    // }
    if (!result.connected) {
      self._onReceiveError(-15) // workaround for https://crbug.com/518161
    }
  })
}

Socket.prototype._onReceive = function (data) {
  var self = this
  // assuming buffer is browser implementation (`buffer` package on npm)
  var buffer = Buffer._augment(new Uint8Array(data))
  var offset = self.bytesRead

  self.bytesRead += buffer.length
  self._unrefTimer()

  if (self.ondata) {
    console.error('socket.ondata = func is non-standard, use socket.on(\'data\', func)')
    self.ondata(buffer, offset, self.bytesRead)
  }
  if (!self.push(buffer)) { // if returns false, then apply backpressure
    chrome.sockets.tcp.setPaused(self.id, true)
  }
}

Socket.prototype._onReceiveError = function (resultCode) {
  var self = this
  if (resultCode === -100) { // net::ERR_CONNECTION_CLOSED
    if (self.onend) {
      console.error('socket.onend = func is non-standard, use socket.on(\'end\', func)')
      self.once('end', self.onend)
    }
    self.push(null)
    self.destroy()
  } else if (resultCode < 0) {
    self.destroy(errnoException(resultCode, 'read'))
  }
}

/**
 * The amount of bytes sent.
 * @return {number}
 */
Object.defineProperty(Socket.prototype, 'bytesWritten', {
  get: function () {
    var self = this
    if (self.id) return self._bytesDispatched + self.bufferSize
  }
})

Socket.prototype.destroy = function (exception) {
  var self = this
  self._destroy(exception)
}

Socket.prototype._destroy = function (exception, cb) {
  var self = this

  function fireErrorCallbacks () {
    if (cb) cb(exception)
    if (exception && !self._writableState.errorEmitted) {
      process.nextTick(function () {
        self.emit('error', exception)
      })
      self._writableState.errorEmitted = true
    }
  }

  if (self.destroyed) {
    // already destroyed, fire error callbacks
    fireErrorCallbacks()
    return
  }

  if (self.server) {
    self.server._connections -= 1
    if (self.server._emitCloseIfDrained) self.server._emitCloseIfDrained()
    self.server = null
  }

  self._reset()

  for (var s = self; s !== null; s = s._parent) timers.unenroll(s)

  self.destroyed = true

  // If _destroy() has been called before chrome.sockets.tcp.create()
  // callback, we don't have an id. Therefore we don't need to close
  // or disconnect
  if (self.id) {
    delete sockets[self.id]
    chrome.sockets.tcp.close(self.id, function () {
      if (self.destroyed) {
        self.emit('close', !!exception)
      }
    })
    self.id = null
  }

  fireErrorCallbacks()
}

Socket.prototype.destroySoon = function () {
  var self = this

  if (self.writable) self.end()

  if (self._writableState.finished) self.destroy()
}

/**
 * Sets the socket to timeout after timeout milliseconds of inactivity on the socket.
 * By default net.Socket do not have a timeout. When an idle timeout is triggered the
 * socket will receive a 'timeout' event but the connection will not be severed. The
 * user must manually end() or destroy() the socket.
 *
 * If timeout is 0, then the existing idle timeout is disabled.
 *
 * The optional callback parameter will be added as a one time listener for the 'timeout' event.
 *
 * @param {number}   timeout
 * @param {function} callback
 */
Socket.prototype.setTimeout = function (timeout, callback) {
  var self = this

  if (timeout === 0) {
    timers.unenroll(self)
    if (callback) {
      self.removeListener('timeout', callback)
    }
  } else {
    timers.enroll(self, timeout)
    timers._unrefActive(self)
    if (callback) {
      self.once('timeout', callback)
    }
  }
}

Socket.prototype._onTimeout = function () {
  this.emit('timeout')
}

Socket.prototype._unrefTimer = function unrefTimer () {
  for (var s = this; s !== null; s = s._parent) {
    timers._unrefActive(s)
  }
}

/**
 * Disables the Nagle algorithm. By default TCP connections use the Nagle
 * algorithm, they buffer data before sending it off. Setting true for noDelay
 * will immediately fire off data each time socket.write() is called. noDelay
 * defaults to true.
 *
 * NOTE: The Chrome version of this function is async, whereas the node
 * version is sync. Keep this in mind.
 *
 * @param {boolean} [noDelay] Optional
 * @param {function} callback CHROME-SPECIFIC: Called when the configuration
 *                            operation is done.
 */
Socket.prototype.setNoDelay = function (noDelay, callback) {
  var self = this
  if (self.id) {
    // backwards compatibility: assume true when `enable` is omitted
    noDelay = is.isUndefined(noDelay) ? true : !!noDelay
    chrome.sockets.tcp.setNoDelay(self.id, noDelay, chromeCallbackWrap(callback))
  }
}

/**
 * Enable/disable keep-alive functionality, and optionally set the initial
 * delay before the first keepalive probe is sent on an idle socket. enable
 * defaults to false.
 *
 * Set initialDelay (in milliseconds) to set the delay between the last data
 * packet received and the first keepalive probe. Setting 0 for initialDelay
 * will leave the value unchanged from the default (or previous) setting.
 * Defaults to 0.
 *
 * NOTE: The Chrome version of this function is async, whereas the node
 * version is sync. Keep this in mind.
 *
 * @param {boolean} [enable] Optional
 * @param {number} [initialDelay]
 * @param {function} callback CHROME-SPECIFIC: Called when the configuration
 *                            operation is done.
 */
Socket.prototype.setKeepAlive = function (enable, initialDelay, callback) {
  var self = this
  if (self.id) {
    chrome.sockets.tcp.setKeepAlive(self.id, !!enable, ~~(initialDelay / 1000),
        chromeCallbackWrap(callback))
  }
}

/**
 * Returns the bound address, the address family name and port of the socket
 * as reported by the operating system. Returns an object with three
 * properties, e.g. { port: 12346, family: 'IPv4', address: '127.0.0.1' }
 *
 * @return {Object} information
 */
Socket.prototype.address = function () {
  var self = this
  return {
    address: self.localAddress,
    port: self.localPort,
    family: self.localAddress &&
      self.localAddress.indexOf(':') !== -1 ? 'IPv6' : 'IPv4'
  }
}

Object.defineProperty(Socket.prototype, 'readyState', {
  get: function () {
    var self = this
    if (self._connecting) {
      return 'opening'
    } else if (self.readable && self.writable) {
      return 'open'
    } else {
      return 'closed'
    }
  }
})

Socket.prototype.unref = function () {
  // No chrome.socket equivalent
}

Socket.prototype.ref = function () {
  // No chrome.socket equivalent
}

//
// EXPORTED HELPERS
//

// Source: https://developers.google.com/web/fundamentals/input/form/provide-real-time-validation#use-these-attributes-to-validate-input
var IPv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
var IPv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]).){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]).){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/

exports.isIPv4 = IPv4Regex.test.bind(IPv4Regex)
exports.isIPv6 = IPv6Regex.test.bind(IPv6Regex)

exports.isIP = function (ip) {
  return exports.isIPv4(ip) ? 4 : exports.isIPv6(ip) ? 6 : 0
}

//
// HELPERS
//

/**
 * Returns an array [options] or [options, cb]
 * It is the same as the argument of Socket.prototype.connect().
 */
function normalizeConnectArgs (args) {
  var options = {}

  if (is.isObject(args[0])) {
    // connect(options, [cb])
    options = args[0]
  } else if (isPipeName(args[0])) {
    // connect(path, [cb])
    throw new Error('Pipes are not supported in Chrome Apps.')
  } else {
    // connect(port, [host], [cb])
    options.port = args[0]
    if (is.isString(args[1])) {
      options.host = args[1]
    }
  }

  var cb = args[args.length - 1]
  return is.isFunction(cb) ? [options, cb] : [options]
}

function toNumber (x) {
  return (x = Number(x)) >= 0 ? x : false
}

function isPipeName (s) {
  return is.isString(s) && toNumber(s) === false
}

 // This prevents "Unchecked runtime.lastError" errors
// function ignoreLastError () {
//   chrome.runtime.lastError // call the getter function
// }

function chromeCallbackWrap (callback) {
  return function () {
    var error
    // if (chrome.runtime.lastError) {
    //   console.error(chrome.runtime.lastError.message)
    //   error = new Error(chrome.runtime.lastError.message)
    // }
    if (callback) callback(error)
  }
}

// Full list of possible error codes: https://code.google.com/p/chrome-browser/source/browse/trunk/src/net/base/net_error_list.h
// TODO: Try to reproduce errors in both node & Chrome Apps and extend this list
//       (what conditions lead to EPIPE?)
var errorChromeToUv = {
  '-10': 'EACCES',
  '-22': 'EACCES',
  '-138': 'EACCES',
  '-147': 'EADDRINUSE',
  '-108': 'EADDRNOTAVAIL',
  '-103': 'ECONNABORTED',
  '-102': 'ECONNREFUSED',
  '-101': 'ECONNRESET',
  '-16': 'EEXIST',
  '-8': 'EFBIG',
  '-109': 'EHOSTUNREACH',
  '-4': 'EINVAL',
  '-23': 'EISCONN',
  '-6': 'ENOENT',
  '-13': 'ENOMEM',
  '-106': 'ENONET',
  '-18': 'ENOSPC',
  '-11': 'ENOSYS',
  '-15': 'ENOTCONN',
  '-105': 'ENOTFOUND',
  '-118': 'ETIMEDOUT',
  '-100': 'EOF'
}
function errnoException (err, syscall) {
  var uvCode = errorChromeToUv[err] || 'UNKNOWN'
  var message = syscall + ' ' + err
  // if (chrome.runtime.lastError) {
  //   message += ' ' + chrome.runtime.lastError.message
  // }
  message += ' (mapped uv code: ' + uvCode + ')'
  var e = new Error(message)
  e.code = e.errno = uvCode
  // TODO: expose chrome error code; what property name?
  e.syscall = syscall
  return e
}
