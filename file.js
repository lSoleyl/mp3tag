var fs = require('fs')

function File(fd, name) {
  this.fd = fd
  this.name = name
  this.pos = 0
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






