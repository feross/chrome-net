const test = require('tape')
const net = require('net')

const PORT0 = Number(process.env.PORT0)

test('disconnect client socket with wait', function (t) {
  const server = net.createServer().listen(PORT0, '127.0.0.1')
  server.once('listening', function () {
    const socket = net.connect(PORT0, '127.0.0.1')
    socket.once('connect', function () {
      setTimeout(function () {
        socket.destroy()
      }, 500)
    })
  })
  server.on('connection', function (con) {
    con.resume() // allow FIN to be received
    con.on('close', function () {
      server.close()
      t.end()
    })
  })
})

test('disconnect server socket with wait', function (t) {
  const server = net.createServer().listen(PORT0, '127.0.0.1')
  server.once('listening', function () {
    const socket = net.connect(PORT0, '127.0.0.1')
    socket.once('connect', function () {
      socket.resume() // allow FIN to be received
    })
    socket.on('close', function () {
      server.close()
      t.end()
    })
  })
  server.on('connection', function (con) {
    setTimeout(function () {
      con.destroy()
    }, 500)
  })
})

test('disconnect client socket', function (t) {
  const server = net.createServer().listen(PORT0, '127.0.0.1')
  server.once('listening', function () {
    const socket = net.connect(PORT0, '127.0.0.1')
    socket.once('connect', function () {
      socket.destroy()
    })
  })
  server.on('connection', function (con) {
    con.resume() // allow FIN to be received
    con.on('close', function () {
      server.close()
      t.end()
    })
    con.on('error', function () {})
  })
})

test('disconnect server socket', function (t) {
  const server = net.createServer().listen(PORT0, '127.0.0.1')
  server.once('listening', function () {
    const socket = net.connect(PORT0, '127.0.0.1')
    socket.once('connect', function () {
      socket.resume() // allow FIN to be received
    })
    socket.on('close', function () {
      server.close()
      t.end()
    })
    socket.on('error', function () {})
  })
  server.on('connection', function (con) {
    con.destroy()
  })
})
