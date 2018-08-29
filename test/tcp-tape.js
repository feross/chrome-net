var auto = require('run-auto')
var helper = require('./helper')
var net = require('net')
var portfinder = require('portfinder')
var test = require('tape')

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
    var child

    var server = net.createServer()

    server.on('listening', function () {
      var env = { TAPE_PORT: r.tapePort, PORT0: r.port0, PORT1: r.port1 }
      helper.browserify('tape-helper.js', env, function (err) {
        t.error(err, 'Clean browserify build')
        child = helper.launchBrowser()
      })
    })

    server.on('connection', function (c) {
      console.log('\noutput from tape on Chrome ------------------------------')
      c.on('data', function (data) {
        data = JSON.parse(data) // TODO: this sometimes fails when two JSON objects arrive in the same packet
        switch (data.op) {
          case 'log':
            process.stdout.write(data.log)
            break
          case 'end':
            console.log('end output from tape on Chrome --------------------------\n')
            t.ok(data.success, 'all tests on Chrome App passed')
            c.end()
            server.close()
            child.kill()
            t.end()
            break
        }
      })
    })

    server.listen(r.tapePort)
  })
})
