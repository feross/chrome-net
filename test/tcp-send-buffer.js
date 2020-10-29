const helper = require('./helper')
const net = require('net')
const portfinder = require('portfinder')
const test = require('tape')

test('TCP send buffer works', function (t) {
  portfinder.getPort(function (err, port) {
    t.error(err, 'Found free port')
    let child

    const server = net.createServer()

    server.on('listening', function () {
      const env = { PORT: port }
      helper.browserify('tcp-send-buffer.js', env, function (err) {
        t.error(err, 'Clean browserify build')
        child = helper.launchBrowser()
      })
    })

    let i = 0
    server.on('connection', function (c) {
      c.on('data', function (data) {
        if (i === 0) {
          t.equal(data.toString(), 'beep', 'Got beep')
          c.write('boop', 'utf8')
        } else if (i === 1) {
          t.equal(data.toString(), 'pass', 'Boop was received')
          c.end()
          server.close()
          child.kill()
          t.end()
        } else {
          t.fail('TCP client sent unexpected data')
        }
        i += 1
      })
    })

    server.listen(port)
  })
})
