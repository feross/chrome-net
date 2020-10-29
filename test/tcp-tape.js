const auto = require('run-auto')
const helper = require('./helper')
const net = require('net')
const portfinder = require('portfinder')
const test = require('tape')

test('tape running on Chrome App', function (t) {
  auto({
    tapePort: function (cb) {
      portfinder.getPort(cb)
    },
    port0: function (cb) {
      portfinder.getPort(cb)
    },
    port1: function (cb) {
      portfinder.getPort(cb)
    }
  }, function (err, r) {
    t.error(err, 'Found free ports')
    let child

    const server = net.createServer()

    server.on('listening', function () {
      const env = { TAPE_PORT: r.tapePort, PORT0: r.port0, PORT1: r.port1 }
      helper.browserify('tape-helper.js', env, function (err) {
        t.error(err, 'Clean browserify build')
        child = helper.launchBrowser()
      })
    })

    server.on('connection', function (c) {
      console.log('\noutput from tape on Chrome ------------------------------')
      let rest = ''
      c.on('data', function (data) {
        data = (rest + data).split('\n')
        rest = data.pop()
        for (let i = 0; i < data.length; i++) {
          const msg = JSON.parse(data[i])
          switch (msg.op) {
            case 'log':
              process.stdout.write(msg.log)
              break
            case 'end':
              console.log('end output from tape on Chrome --------------------------\n')
              t.ok(msg.success, 'all tests on Chrome App passed')
              c.end()
              server.close()
              child.kill()
              t.end()
              break
          }
        }
      })
    })

    server.listen(r.tapePort)
  })
})
