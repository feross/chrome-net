const net = require('net')

const PORT = Number(process.env.PORT)

const client = new net.Socket()

// If any errors are emitted, log them
client.on('error', function (err) {
  console.error(err.stack)
})

client.on('data', function (data) {
  if (data.toString() === 'boop') {
    client.write('pass')
  } else {
    client.write('fail')
  }
})

client.connect(PORT, '127.0.0.1')
client.write('beep')

// TODO:
// - test bytesWritten
// - test bytesRead

// streaming
// var through = require('through')
// client.pipe(through(function (data) {
//   console.log(bops.to(data))
// }))
