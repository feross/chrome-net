const test = require('tape')
const net = require('net')

const PORT0 = Number(process.env.PORT0)
const PORT1 = Number(process.env.PORT1)

// listen

test('listen on already listening server', function (t) {
  const server = net.createServer()
  server.listen(0, '127.0.0.1')
  server.once('listening', function () {
    t.ok(server.address().port, 'a port was assigned')
    server.listen(server.address().port, '127.0.0.1')
    server.once('listening', function () {
      server.close()
      t.end()
    })
  })
  server.on('error', function (error) {
    t.error(error, 'should not trigger EADDRINUSE')
  })
})

test('second listen call overrides first', function (t) {
  const server = net.createServer()
  server.listen(PORT0, '127.0.0.1')
  server.listen(PORT1, '127.0.0.1')
  server.once('listening', function () {
    t.equal(server.address().port, PORT1)
    server.close()
    t.end()
  })
})

test('can cancel listen call', function (t) {
  const server = net.createServer()
  server.listen(PORT0, '127.0.0.1')
  server.close()
  server.once('listening', function () {
    t.fail('shouldn\'t be listening')
  })
  setTimeout(function () {
    t.end()
  }, 400)
})

// connect

test('connect on already connected socket', function (t) {
  const server = net.createServer().listen(PORT0, '127.0.0.1')
  server.on('connection', function (con) {
    con.resume() // allow FIN to be received
  })
  server.once('listening', function () {
    const socket = net.connect(PORT0, '127.0.0.1')
    socket.once('connect', function () {
      socket.connect(PORT0, '127.0.0.1')
      socket.once('connect', function () {
        socket.destroy()
        server.close()
        server.on('close', function () { // ensure all connections are closed
          t.end()
        })
      })
    })
    socket.on('error', function (error) {
      t.error(error, 'should not trigger EADDRINUSE')
    })
  })
})

test('second connect call overrides first', function (t) {
  const server = net.createServer().listen(PORT1, '127.0.0.1')
  server.once('listening', function () {
    const socket = net.connect(PORT0, '127.0.0.1')
    socket.connect(PORT1, '127.0.0.1')
    socket.once('connect', function () {
      t.equal(socket.remotePort, PORT1)
      socket.destroy()
      server.close()
      t.end()
    })
    socket.on('error', function (error) {
      t.error(error)
    })
  })
})

test('can cancel connect call', function (t) {
  const socket = net.connect(PORT0, '127.0.0.1')
  socket.destroy()
  socket.once('connect', function () {
    t.fail('shouldn\'t be connected')
  })
  socket.on('error', function (error) {
    t.error(error)
  })
  setTimeout(function () {
    t.end()
  }, 400)
})
