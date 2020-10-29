const test = require('tape')
const net = require('net')

const TAPE_PORT = Number(process.env.TAPE_PORT)

const con = net.connect(TAPE_PORT, '127.0.0.1')

let success = false
test.createStream().on('data', function (log) {
  con.write(JSON.stringify({ op: 'log', log: log.toString() }) + '\n')
  success = log === '\n# ok\n'
}).on('end', function () {
  con.write(JSON.stringify({ op: 'end', success }) + '\n')
  con.end()
})

require('./tape-tcp.js')
require('./tape-disconnect.js')
require('./tape-edge-cases.js')
