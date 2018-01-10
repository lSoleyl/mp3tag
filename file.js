const fs = require('fs')

/** A generic file class, which keeps track of the current writing position and
 *  provides some additional utility methods.
 */
class File {
  constructor(fd, name, size) {
    this.fd = fd
    this.name = name
    this.pos = 0
    this.size = size
  }

  read(buffer, offset, length, callback) {
    var self = this
    fs.read(self.fd, buffer, offset, length, self.pos, function(err, bytesRead, buffer) {
      if (err)
        return callback(err)

      self.pos += bytesRead
      callback(err, bytesRead, buffer)
    })
  }

  write(buffer, callback) {
    this.writeSlice(buffer, 0, buffer.length, callback)
  }

  writeSlice(buffer, offset, length, callback) {
    var self = this
    fs.write(self.fd, buffer, offset, length, self.pos, function(err, bytes, buffer) {
      if(err)
        return callback(err)

      self.pos += bytes

      process.nextTick(function() { callback(null, bytes, buffer) })
    })
  }

  bufferWriter() {
    return File.prototype.writeSlice.bind(this)
  }


  /** This function accepts an file offset and a length and
   *  reads out the data as buffer.
   *
   * @param offset the offset to start reading
   * @param length the length of the data to read
   * @param callback(err,buff) the callback to receive the result.
   *          reading less then length bytes is also treated as error.
   */
  readSlice(offset, length, callback) {
    var buffer = new Buffer(length)
    if (length == 0)
      return process.nextTick(function() { callback(null, buffer) })

    fs.read(this.fd, buffer, 0, length, offset, function(err,bytes,buffer) {
      if (err)
        return callback(err);
      if (bytes != length)  //TODO create a type for this kind of error to handle it programatically
        return callback(new Error("File end reached. Only " + bytes + " were read instead of " + length))

      callback(null, buffer)
    })
  }

  /** Sets the file position further by the specified amount of bytes, relative to
   *  either 'pos' or 'start'
   * 
   * @param byte the amount of bytes to move forward
   * @param relativeTo the position to move relative to 'pos' = current pos, 'start' = file start
   */
  seek(bytes, relativeTo) {
    var offset = (relativeTo == 'start') ? 0 : this.pos
    this.pos = offset + bytes
  }


  close() {
    fs.close(this.fd, function() {})
    this.fd = undefined
    this.pos = undefined
  }
}


File.open = function(path, mode, callback) {
  if (mode == "a")
    mode = "r+" //<- Portable way of making positional writes to existing file

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




