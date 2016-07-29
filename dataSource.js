/** This module defines the DataSource class, which represents 
 *  data, which hasn't been yet loaded into a buffer.
 */


var File = require('./file')
var Data = require('./data')

/** Constructs the data source from a file and optional offset and length.
 *
 * @param sourceFile a File where the data should be read from
 * @param offset the offset, where the data starts (default: 0)
 * @param size the length of the data block (default: sourceFile.size-offset)
 */
function DataSource(sourceFile, offset, size) {
  if (!(sourceFile instanceof File)) 
    throw new Error("source must be a File")

  this.source = sourceFile
  this.offset = offset || 0
  this.size   = size //Cannot use || here as 0 might be a valid length
  if (this.size === undefined)
    this.size = this.source.size - this.offset
}


/** Converts the DataSource into a Data object. This works asynchronously, as it
 *  has to read the content from the file
 *
 * @param callback(err,data) the callback getting the result
 */
DataSource.prototype.toData = function(callback) {
  this.source.readSlice(this.offset, this.size, function(err, buffer) {
    if (err)
      return callback(err)

    callback(null, new Data(buffer))
  })
}

DataSource.prototype.toString = function() {
  return "DataSource:[offset:" + this.offset + ",size:" + this.size + "]@File"
}

//Export class
module.exports = DataSource