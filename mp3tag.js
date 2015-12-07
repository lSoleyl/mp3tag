var fs = require('fs')
var File = require('./file')
var async = require('async')
var _ = require('lodash')

exports = {
  //TODO export functions
}


/** opens a file with read access and retrievs the current file size
 * @param path the file to open
 * @param callback a (err,res) callback with result = {'fd':fd, 'size':size}
 */
function openWithSize(path, callback) {
  fs.open(path, "r", function(err, fd) {
    if (err)
      return callback(err)

    fs.fstat(fd, function(err, stat) {
      if (err)
        return callback(err)

      return callback(null, { fd:fd, size:stat.size })
    })
  })
}

/** Decodes a 7bit encoded unsigned integer:
 *  Format: 0b0xxxxxx0xxxxxx0xxxxxx0xxxxxx
 */
function decodeUInt7Bit(uint7bit) {
  var x = uint7bit
  return (x & 0x7F) | ((x & 0x7F00) >> 1) | ((x & 0x7F0000) >> 2) | ((x & 0x7F000000) >> 3)
}

/** 
 * @param file a File object to read from
 * @param callback the callback which receives the ID3 tag data
 */
function readID3v2(file, callback) {
  var header = new Buffer(10)
  file.read(header, 0, 10, function(err, bytesRead) { //Read 10 Byte header
    if (err)
      return callback(err)
    if (bytesRead < 10)
      return callback("Can't read ID3 tag header!")

    var marker = header.toString('ASCII', 0, 3)
    var majorVersion = header.readUInt8(3)
    var minorVersion = header.readUInt8(4)
    var flags = header.readUInt8(5)

    var headerSize = decodeUInt7Bit(header.readUInt16BE(6))

    if (marker != "ID3") { //No header at all
      return callback("No support for tagless files yet!")
      //TODO create empty header or something like this
    } else {
      if (majorVersion != 3) { //TODO implement support for other versions as well
        return callback("Unsupported ID3 version: " + version)
      }


      var hasExtendedHeader = (flags & 0x40) != 0
      if (hasExtendedHeader) {
        return callback("No support for extended header yet!")
      }

      readFrames(file, headerSize, function(err, frames) {
        if (err)
          return callback(err)

        process.nextTick(function() {
          callback(null, {
            version: {'major':majorVersion, 'minor':minorVersion},
            flags: flags,
            size: headerSize,
            frames: frames
          })
        })
      })
    }
  }
}

function readFrames(file, totalSize, callback) {
  var curried = _.curry(readFrame)(file)
  async.whilst(function() { return file.pos < totalSize + 10 }, curried, callback)
}


function readFrame(file, callback) {
  var buffer = new Buffer(10)
  file.read(buffer, 0, 10, function(err, bytesRead) {
    if (err)
      return callback(err)
    if (bytesRead < 10)
      return callback("Can't read ID3 frame header!")

    var id = buffer.toString('ASCII', 0, 4)
    var size = buffer.readUInt32BE(4)
    var flags = buffer.readUInt16BE(8)

    file.seek(size)

    process.nextTick(function() { callback(null, { id:id, size:size, flags:flags })})
  })
}