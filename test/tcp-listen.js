const auto = require('run-auto')
const dgram = require('dgram')
const helper = require('./helper')
const net = require('net')
const portfinder = require('portfinder')
const test = require('tape')

test('TCP listen works (echo test)', function (t) {
  auto({
    listenPort: function (cb) {
      portfinder.getPort(cb)
    },
    readyPort: function (cb) {
      portfinder.getPort(cb)
    }
  }, function (err, r) {
    t.error(err, 'Found free ports')
    let child

    // Socket for client to notify node when its TCP server is listening
    const readySocket = dgram.createSocket('udp4')
    readySocket.on('listening', function () {
      // Start app
      const env = { LISTEN_PORT: r.listenPort, READY_PORT: r.readyPort }
      helper.browserify('tcp-listen.js', env, function (err) {
        t.error(err, 'Clean browserify build')
        child = helper.launchBrowser()
      })
    })

    readySocket.on('message', function (message, remote) {
      if (message.toString() === 'listening') {
        t.pass('Client listens')

        // Do TCP echo test
        const socket = net.createConnection({ port: r.listenPort })
        socket.on('connect', function () {
          socket.write('beep', 'utf8')
        })

        let i = 0
        socket.on('data', function (data) {
          if (i === 0) {
            t.equal(data.toString(), 'boop', 'Beep/boop looks good')
            socket.end()
          } else {
            t.fail('TCP server sent unexpected data')
          }
          i += 1
        })
      } else if (message.toString() === 'end') {
        t.pass('Client stream ended correctly')
        readySocket.close()
        child.kill()
        t.end()
      }
    })

    readySocket.bind(r.readyPort)
  })
})
