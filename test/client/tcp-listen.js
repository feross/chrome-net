const dgram = require('dgram')
const net = require('net')

const LISTEN_PORT = Number(process.env.LISTEN_PORT)
const READY_PORT = Number(process.env.READY_PORT)

const server = net.createServer()

// If any errors are emitted, log them
server.on('error', function (err) {
  console.error(err.stack)
})

let readySock
server.on('listening', function () {
  // Report to node that the TCP server is listening
  readySock = dgram.createSocket('udp4')
  readySock.on('error', function (err) {
    console.error(err.stack)
  })
  readySock.send('listening', 0, 'listening'.length, READY_PORT, '127.0.0.1')
})

server.on('connection', function (sock) {
  console.log('Connection opened from ' + sock.remoteAddress + ':' + sock.remotePort)

  sock.on('error', function (err) {
    console.error(err.stack)
    sock.write(err.message)
  })

  sock.on('data', function (data) {
    if (data.toString() === 'beep') {
      sock.write('boop')
    } else {
      sock.write('fail')
    }
  })

  // test that client stream ends correctly
  sock.on('end', function () {
    readySock.send('end', 0, 'end'.length, READY_PORT, '127.0.0.1')
  })
})

server.listen(LISTEN_PORT)
