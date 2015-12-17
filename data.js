/** This module defines the data class
 *  The data class is a reference to a specified byte block referenced by
 *  file, offset, length
 *
 *  The data can alternatively be constructed from a buffer
 */
var File = require('./file')

/** Constructor for Data object
 *
 * @param source either a Buffer or a File containing the data
 * @param offset the offset where the data starts (default 0)
 * @param size the length of the data (default buffer.length|file.size)
 */
function Data(source, offset, size) {
  var dataSize
  if (source instanceof Buffer)
    dataSize = source.length
  else if(source instanceof File)
    dataSize = source.size
  else
    throw new Error("Source must be either a Buffer or a File")

  this.size = size || dataSize
  this.source = source
  this.offset = offset || 0  
}

/** Write the data into a file at the file's current position
 */
Data.prototype.writeInto = function(file, callback) {
  if (this.source instanceof Buffer) {
    file.writeSlice(this.source, this.offset, this.size, callback)
  } else {
    var self = this
    this.source.readSlice(buffer, this.offset, this.size, function(err, bytes, buffer) {
      if (err) 
        return callback(err)
      if (bytes != self.size)
        return callback(new Error("Failed to read " + self.size + " bytes, just got " + bytes))

      file.write(buffer, callback)
    })
  }
}

/** Asynchronous conversion from data to buffer.
 *  Either returns a slice of the source buffer, or reads the source file into
 *  a buffer. Postcondition: buffer.length == this.size
 *  
 * @param callback(err,buffer) the returned buffer.
 *                             
 */
Data.prototype.toBuffer = function(callback) {
  var self = this
  if (this.source instanceof Buffer) {
    process.nextTick(function() { callback(null, self.source.slice(self.offset, self.size)) })
  } else {
    this.source.readSlice(this.offset, this.size, function(err, bytes, buffer) {
      if (err)
        return callback(err)
      if (bytes != self.size)
        return callback(new Error("Failed to read " + self.size + " bytes, just got " + bytes))

      return callback(null, buffer)
    })
  }
}

Data.prototype.toString = function() {
  var str = "Data:[offset:" + this.offset + ",length:" + this.size + "]@"
  if (this.source instanceof File) {
    return str + "File"
  } else {
    return str + "Buffer"
  }
}

Data.prototype.inspect = function() {
  var str = this.toString()
  //if (this.source instanceof File)
  //  str += "(" + this.source.name + ")"

  return str
}

module.exports = Data
