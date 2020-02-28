const fs = require('fs')

/** A generic file class, which keeps track of the current writing position and
 *  provides some additional utility methods.
 */
class File {
  constructor(fd, name, size) {
    this.fd = fd;
    this.name = name;
    this.pos = 0;
    this.size = size;
  }
  /** Read data from file at the current file position into the passed buffer
   * 
   * @param {Buffer} buffer the buffer to read into
   * @param {number} offset the offset in the buffer to start writing in
   * @param {number} length the number of bytes to read
   * @param callback optional callback(err,bytesRead,buffer) to call upon complete read. This parameter should
   *                 be left out if the function is used as promise.
   * 
   * @return {Promise<number>} returns a promise that resolves to the number of actually read bytes
   */
  read(buffer, offset, length, callback) {
    return new Promise((resolve, reject) => {
      fs.read(this.fd, buffer, offset, length, this.pos, (err, bytesRead, buffer) => {
        if (err) {
          return callback ? callback(err) : reject(err);
        }
  
        this.pos += bytesRead;
        callback ? callback(null, bytesRead, buffer) : resolve(bytesRead);
      });
    });
  }

  write(buffer, callback) {
    return this.writeSlice(buffer, 0, buffer.length, callback);
  }

  writeSlice(buffer, offset, length, callback) {
    return new Promise((resolve, reject) => {
      fs.write(this.fd, buffer, offset, length, this.pos, function(err, bytes, buffer) {
        if(err) {
          return callback ? callback(err) : reject(err);
        }
  
        this.pos += bytes;
  
        process.nextTick(() => { callback(null, bytes, buffer); });
      });
    });    
  }

  bufferWriter() {
    return File.prototype.writeSlice.bind(this);
  }


  /** This function accepts a file offset and a length and
   *  reads out the data as buffer.
   *
   * @param {number} offset the file offset to start reading
   * @param {number} length the length of the data to read
   * @param callback(err,buff) optional callback to receive the result.
   *          reading less then length bytes is also treated as error.
   * 
   * @return {Promise<Buffer>} a promise that resolves to the read buffer
   */
  readSlice(offset, length, callback) {
    return new Promise((resolve, reject) => {
      const buffer = Buffer.alloc(length);
      if (length === 0) {
        return process.nextTick(() => { callback ? callback(null, buffer) : resolve(buffer); });
      }

      fs.read(this.fd, buffer, 0, length, offset, (err, bytes, buffer) => {
        if (err) {
          return callback ? callback(err) : reject(err);
        }
        if (bytes !== length) { //TODO create a type for this kind of error to handle it programatically
          err = new Error(`File end reached. Only ${bytes} were read instead of ${length}`);
          return callback ? callback(err) : reject(err);
        }

        callback ? callback(null, buffer) : resolve(buffer);
      });
    });    
  }

  /** Sets the file position further by the specified amount of bytes, relative to
   *  either 'pos' or 'start'
   * 
   * @param byte the amount of bytes to move forward
   * @param relativeTo the position to move relative to 'pos' = current pos, 'start' = file start
   */
  seek(bytes, relativeTo) {
    const offset = (relativeTo === 'start') ? 0 : this.pos;
    this.pos = offset + bytes;
  }


  close() {
    fs.close(this.fd, () => {});
    this.fd = undefined;
    this.pos = undefined;
  }
}

/** Actual open function to create a file object by asynchronously opening the specified file.
 * 
 * @param {string} path which file to open
 * @param {string} mode the filemode to open the file with (one of: "r", "w", "a")
 * @param {(error:Error, file:File)=>void} callback optional completion callback
 * 
 * @return {Promise<File>} a promise that resolves to the opened file object
 */
File.open = function(path, mode, callback) {
  if (mode === "a") {
    mode = "r+"; //<- Portable way of making positional writes to existing file
  }

  return new Promise((resolve, reject) => {
    fs.open(path, mode, (err, fd) => {
      if (err) {
        return callback ? callback(err) : reject(err);
      }
  
      fs.stat(path, (err, stat) => {
        if (err) {
          return callback ? callback(err) : reject(err);
        }
  
        process.nextTick(() => { 
          const file = new File(fd, path, stat.size);
          callback ? callback(null, file) : resolve(file);
        });
      });
    });
  });  
};

module.exports = File;

