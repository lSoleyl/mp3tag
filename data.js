/** This module defines the data class. This class represents
 *  data, which has been loaded into a buffer.
 */
var File = require('./file');

class Data {
  /** Constructor for Data object
   *
   * @param source a Buffer containing the data
   * @param offset the offset where the data starts (default 0)
   * @param size the length of the data (default buffer.length)
   */
  constructor(source, offset, size) {
    let dataSize;
    if (source instanceof Buffer) {
      dataSize = source.length;
    } else {
      throw new Error("Source must be either a Buffer");
    }

    this.offset = offset || 0;
    this.size = size || (dataSize - this.offset);
    this.source = source;
  }

  /** Write the data into a file at the file's current position. 
   *  The whole buffer is simply written into the given file
   *  (while respecting offset and size). 
   *
   * @param writer either a File opened in write mode or a writer of type:
   *               function(buffer, offset, length, cb(err, bytes))
   * @param callback(err, bytes) will be called upon completion or error
   *                 bytes = total amount of bytes written to file
   */
  writeInto(writer, callback) {
    const write = writer;
    if (writer instanceof File) {
      write = writer.bufferWriter();
    }

    write(this.source, this.offset, this.size, callback);
  }

  /** Returns the buffer, which the data holds.
   *  If offset == 0 and size == buffer.length, then the whole underlying buffer is returned.
   *  Otherwise a slice of it is returned.
   *  
   * @return the buffer, represented by this data object.                            
   */
  toBuffer() {
    if (this.offset == 0 && this.size == this.source.length) {
      return this.source;
    }
    
    return this.source.slice(this.offset, this.size);
  }

  toString() {
    return "Data:[offset:" + this.offset + ",size:" + this.size + "]@Buffer";
  }

  inspect() {
    return this.toString();
  }
}

// Export the class
module.exports = Data;
