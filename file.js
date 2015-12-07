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

File.prototype.seek = function(bytes) {
  this.pos += (bytes || 0)
}


File.prototype.close = function() {
  fs.close(this.fd)
  this.fd = undefined
  this.pos = undefined
}



