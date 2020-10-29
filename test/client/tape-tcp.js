const test = require('tape')
const net = require('net')

const PORT0 = Number(process.env.PORT0)

test('TCP listen', function (t) {
  t.throws(function () {
    net.createServer().listen({ fd: 0 })
  }, /fd is not supported/, 'throws when trying to use named pipes')
  t.throws(function () {
    net.createServer().listen({ path: 'pipename' })
  }, /Pipes are not supported/, 'throws when trying to use named pipes')
  t.throws(function () {
    net.createServer().listen(65536)
  }, /"port" argument must be >= 0 and < 65536/, 'throws when using invalid port 65536')
  t.end()
})

test('TCP connect', function (t) {
  t.throws(function () {
    net.connect('pipename')
  }, /Pipes are not supported/, 'throws when trying to use named pipes')
  t.throws(function () {
    net.connect(65536)
  }, /"port" option should be >= 0 and < 65536/, 'throws when using invalid port 65536')
  t.end()
})

function isPaused (socket) {
  return socket.isPaused()
}

test('Pause on connect', function (t) {
  const server = net.createServer({ pauseOnConnect: true })
  let socket
  server.listen(0, '127.0.0.1')
  server.on('connection', function (con) {
    con.on('data', function () {})
    t.ok(isPaused(con), 'isPaused() returns true for incoming socket')
    socket.destroy()
    server.close()
    t.end()
  })
  server.on('listening', function () {
    t.ok(server.address().port, 'a port was assigned')
    socket = net.connect(server.address().port, '127.0.0.1')
  })
})

test('Pause on connect = false', function (t) {
  const server = net.createServer()
  let socket
  server.listen(0, '127.0.0.1')
  server.on('connection', function (con) {
    con.on('data', function () {})
    t.ok(!isPaused(con), 'isPaused() returns false for incoming socket')
    t.ok(!isPaused(socket), 'isPaused() returns false for outgoing socket')
    socket.destroy()
    server.close()
    t.end()
  })
  server.on('listening', function () {
    t.ok(server.address().port, 'a port was assigned')
    socket = net.connect(server.address().port, '127.0.0.1')
    socket.on('data', function () {})
  })
})

test('server only emits close when 0 connections', function (t) {
  let socketClosed = false
  const server = net.createServer().listen(PORT0, '127.0.0.1')
  server.on('listening', function () {
    const socket = net.connect(PORT0, '127.0.0.1')
    socket.once('connect', function () {
      server.close()
      setTimeout(function () {
        socket.destroy()
        socketClosed = true
      }, 300)
    })
  })
  server.on('close', function () {
    t.ok(socketClosed, 'socket is closed on server close event')
    t.end()
  })
  server.on('connection', function (con) {
    con.resume() // allow FIN to be received
  })
})

test('IPv4/v6 for listen', function (t) {
  const server = net.createServer().listen(0, '127.0.0.1')
  server.once('listening', function () {
    t.equal(server.address().family, 'IPv4')
    server.listen(0, '::1')
    server.once('listening', function () {
      t.equal(server.address().family, 'IPv6')
      server.close()
      t.end()
    })
  })
  server.on('error', function (error) {
    t.error(error)
    server.close()
    t.end()
  })
})

test('IPv4/v6 for connect', function (t) {
  const server = net.createServer().listen(PORT0, '::0')
  server.once('listening', function () {
    const socket = net.connect(PORT0, '127.0.0.1')
    socket.once('connect', function () {
      t.equal(socket.remoteFamily, 'IPv4')
      socket.connect(PORT0, '::1')
      socket.once('connect', function () {
        t.equal(socket.remoteFamily, 'IPv6')
        socket.destroy()
        server.close()
        t.end()
      })
    })
    socket.on('error', function (error) {
      t.error(error)
      socket.destroy()
      server.close()
      t.end()
    })
  })
})

test('socket setTimeout', function (t) {
  const server = net.createServer().listen(PORT0, '127.0.0.1')
  server.once('listening', function () {
    const socket = net.connect(PORT0, '127.0.0.1')
    let timeoutExpected = false
    socket.setTimeout(100, function () {
      t.ok(timeoutExpected, 'Timeout is expected')
      socket.destroy()
      server.close()
      t.end()
    })

    setTimeout(function () {
      socket.write('Ping')
    }, 60)
    socket.on('data', function () {
      setTimeout(function () {
        timeoutExpected = true
      }, 60)
    })

    server.on('connection', function (con) {
      con.on('data', function () {
        setTimeout(function () {
          con.write('Pong')
        }, 60)
      })
    })
  })
})

test('accepted socket', function (t) {
  const server = net.createServer().listen(PORT0, '127.0.0.1')
  server.once('listening', function () {
    const socket = net.connect(PORT0, '127.0.0.1')

    server.on('connection', function (con) {
      t.ok(con.writable, 'socket.writable is true')
      socket.destroy()
      server.close()
      t.end()
    })
  })
})
