var dgram = require('chrome-dgram')
var net = require('../../')

var LISTEN_PORT = Number(process.env.LISTEN_PORT)
var READY_PORT = Number(process.env.READY_PORT)

var server = net.createServer()

// If any errors are emitted, log them
server.on('error', function (err) {
  console.error(err.stack)
})

server.on('listening', function () {
  // Report to node that the TCP server is listening
  var readySock = dgram.createSocket('udp4')
  readySock.on('error', function (err) {
    console.error(err.stack)
  })
  readySock.send('listening', 0, 'listening'.length, READY_PORT, '127.0.0.1')
})

server.on('connection', function (sock) {
  console.log('Connection opened from ' + sock.remoteAddress + ':' + sock.remotePort)

  sock.on('error', function (err) {
    console.error(err)
    console.log(err.stack)
    sock.write(err.message)
  })

  sock.on('data', function (data) {
    console.log('data')
    console.log(data.toString())
    if (data.toString() === 'beep') {
      sock.write('boop')
    } else {
      sock.write('fail')
    }
  })
})

server.listen(LISTEN_PORT)