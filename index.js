#!/usr/bin/env node

var fs       = require('fs')
var os       = require('os')
var path     = require('path')
var chpro    = require('child_process')

var through  = require('through')
var csv      = require("csv").parse
var osenv    = require('osenv')
var duplexer = require('duplexer')
var concat   = require('concat-stream')

var spawn = chpro.spawn
if (os.type() === 'Windows_NT') spawn = require('win-spawn')

module.exports = function (options) {

  var self = this;

  var read = through()
  var duplex

  var filename = path.join(osenv.tmpdir(), '_'+Date.now())

  var spawnArgs = []

  if (options) {
    options.sheet && spawnArgs.push('--sheet') && spawnArgs.push(options.sheet) && delete options.sheet
    options.sheetIndex && spawnArgs.push('--sheet-index') && spawnArgs.push(options.sheetIndex) && delete options.sheetIndex
  }

  spawnArgs.push(filename)

  var csvParser = csv({
    delimiter: ',',
    columns: true,
    relax: true
  })

  var columnCount = null;

  var write = fs.createWriteStream(filename)
    .on('close', function () {
      var child = spawn(require.resolve('j/bin/j.njs'), spawnArgs)
      child.stdout.pipe(csvParser)
        .pipe(through(function (data) {
          var numberOfColumns = Object.keys(data).length;
          if( columnCount == null ){
            columnCount = numberOfColumns;
          } else if( columnCount != numberOfColumns ){
            return;
          }
          var _data = {}
          for(var k in data) {
            var value = data[k].trim()
            _data[k.trim()] = isNaN(value) ? value : +value
          }
          this.queue(_data)
        }))
        .pipe(read)
      child.on('exit', function(code, sig) {
        if(code === null || code !== 0) {
          child.stderr.pipe(concat(function(errstr) {
            duplex.emit('error', new Error(errstr))
          }))
        }
      })
    })


  var result = (duplex = duplexer(write, read));
  result.csvParser = csvParser;
  return result;

}


if(!module.parent) {
  var JSONStream = require('JSONStream')
  var args = require('minimist')(process.argv.slice(2))
  process.stdin
    .pipe(module.exports())
    .pipe(args.lines || args.newlines
      ? JSONStream.stringify('', '\n', '\n', 0)
      : JSONStream.stringify()
    )
    .pipe(process.stdout)
}
