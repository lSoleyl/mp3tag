const File = require('./file');

/** This class wraps a Buffer object to be treated like regular File by
 *  providing the same interface.
 *  All operations are performed immediately as no I/O is needed.
 */
class BufferFile extends File {
  /**
   * @param {Buffer} buffer the buffer to read from / write to
   */
  constructor(buffer) {
    super(buffer, undefined, buffer.length);
    this.buffer = buffer;
  }

  /** Read data from the buffer file at the current file position into the passed buffer
   * 
   * @param {Buffer} buffer the buffer to read into
   * @param {number} offset the offset in the buffer to start writing in
   * @param {number} length the number of bytes to read
   * 
   * @return {Promise<number>} returns a promise that resolves to the number of actually read bytes
   */
  async read(buffer, offset, length) {
    const bytesCopied = this.buffer.copy(buffer, offset, this.pos, this.pos + length);
    
    this.pos += bytesCopied;
    return bytesCopied;
  }

  /** Writes the bytes from the buffer into the file at the buffer file's current
   *  write position. The operation will fail if we would try to write outside the underlying buffer.
   * 
   * @param {Buffer} buffer the buffer to write into the file
   * @param {number} offset the buffer offset to start writing from
   * @param {number} length the number of bytes to write 
   * 
   * @return {Promise<number>} resolves to the number of bytes actually written into the buffer file
   */
  async writeSlice(buffer, offset, length) {
    if (this.pos + length > this.size) {
      throw new Error(`BufferFile not large enough to write ${length} bytes at position ${this.pos}. Buffer size is ${this.size}`);
    }

    const bytesCopied = buffer.copy(this.buffer, this.pos, offset, offset + length);
    this.pos += bytesCopied;
    return bytesCopied;
  }
}

module.exports = BufferFile;
