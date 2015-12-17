var fs = require('fs')

function File(fd, name, size) {
  this.fd = fd
  this.name = name
  this.pos = 0
  this.size = size
}

File.open = function(path, mode, callback) {
  fs.open(path, mode, function(err, fd) {
    if (err)
      return callback(err)

    fs.stat(path, function(err, stat) {
      if (err)
        return callback(err)

      process.nextTick(function() { callback(null, new File(fd, path, stat.size)) })  
    })
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

File.prototype.write = function(buffer, callback) {
  this.writeSlice(buffer, 0, buffer.length, callback)
}

File.prototype.writeSlice = function(buffer, offset, length, callback) {
  fs.write(this.fd, buffer, offset, length, null, function(err, bytes, buffer) {
    if(err)
      return callback(err)

    this.pos += bytes

    process.nextTick(function() { callback(null, bytes, buffer) })
  })
}

File.prototype.readSlice = function(offset, length, callback) {
  var buffer = new Buffer(length)
  fs.read(this.fd, buffer, 0, length, offset, callback)
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



