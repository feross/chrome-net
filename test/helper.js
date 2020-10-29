const browserify = require('browserify')
const builtins = require('browserify/lib/builtins.js')
const cp = require('child_process')
const envify = require('envify/custom')
const fs = require('fs')
const once = require('once')
const path = require('path')

let CHROME
if (process.env.CHROME) {
  CHROME = process.env.CHROME
} else if (process.platform === 'win32') {
  CHROME = '"%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"'
} else {
  CHROME = '/Applications/Google\\ Chrome\\ Canary.app/Contents/MacOS/Google\\ Chrome\\ Canary'
}

const BUNDLE_PATH = path.join(__dirname, 'chrome-app/bundle.js')

builtins.net = require.resolve('../')
builtins.dgram = require.resolve('chrome-dgram')
builtins['function-bind'] = require.resolve('./function-bind.js')

exports.browserify = function (filename, env, cb) {
  if (!env) env = {}
  if (!cb) cb = function () {}
  cb = once(cb)

  const b = browserify()
  b.add(path.join(__dirname, 'client', filename))
  b.transform(envify(env))

  b.bundle()
    .pipe(fs.createWriteStream(BUNDLE_PATH))
    .on('close', cb)
    .on('error', cb)
}

exports.launchBrowser = function () {
  // chrome 40.0.2188.2 won't open extensions without absolute path.
  const app = path.join(__dirname, '..', 'test/chrome-app')
  const command = CHROME + ' --load-and-launch-app=' + app
  const env = { cwd: path.join(__dirname, '..') }

  return cp.exec(command, env, function () {})
}
