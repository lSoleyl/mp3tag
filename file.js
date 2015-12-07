var fs = require('fs')

function File(fd, name) {
  this.fd = fd
  this.name = name
  this.pos = 0
}

File.open = function(path, mode, callback) {
  fs.open(path, mode, function(err, fd) {
    if (err)
      return callback(err)

    process.nextTick(function() { callback(null, new File(fd, path)) })
  })
}

module.exports = File

File.prototype.read = function(buffer, offset, length, callback) {
  var file = this
  fs.read(this.fd, buffer, offset, length, this.pos, function(err, bytesRead, buffer) {
    if (err)
      return callback(err)

    file.pos += bytesRead
    callback(err, bytesRead, buffer)
  })
}

File.prototype.readSlice = function(data, callback) {
  var buffer = new Buffer(data.size)
  fs.read(this.fd, buffer, 0, data.size, data.offset, callback)
}

/** Sets the file position further by the specified amount of bytes, relative to
 *  either 'pos' or 'start'
 * 
 * @param byte the amount of bytes to move forward
 * @param relativeTo the position to move relative to 'pos' = current pos, 'start' = file start
 */
File.prototype.seek = function(bytes, relativeTo) {
  var offset = (relativeTo == 'start') ? 0 : this.pos
  this.pos = offset + bytes
}


File.prototype.close = function() {
  fs.close(this.fd)
  this.fd = undefined
  this.pos = undefined
}



