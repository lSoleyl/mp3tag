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

File.prototype.bufferWriter = function() {
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
File.prototype.readSlice = function(offset, length, callback) {
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
File.prototype.seek = function(bytes, relativeTo) {
  var offset = (relativeTo == 'start') ? 0 : this.pos
  this.pos = offset + bytes
}


File.prototype.close = function() {
  fs.close(this.fd)
  this.fd = undefined
  this.pos = undefined
}



