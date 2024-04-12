import * as fs from 'fs';


export type Writer = (buffer: Buffer, offset: number, length: number) => Promise<number>;

/** A generic file class, which keeps track of the current writing position and
 *  provides some additional utility methods.
 */
export class File {
  private pos = 0;

  private constructor(private fd: number, private name: string, private size: number) {}
  

  /** Actual open function to create a file object by asynchronously opening the specified file.
   *  The file read position will be positioned at the start of the file even if "a" is specified.
   * 
   * @param path which file to open
   * @param mode the filemode to open the file with (one of: "r", "w", "a")
   * 
   * @return a promise that resolves to the opened file object
   */
  static open(path: string, mode: string) : Promise<File> {
    if (mode === "a") {
      mode = "r+"; //<- Portable way of making positional writes to existing file
    }

    return new Promise((resolve, reject) => {
      fs.open(path, mode, (err, fd) => {
        if (err) {
          return reject(err);
        }
    
        fs.stat(path, (err, stat) => {
          if (err) {
            return reject(err);
          }
    
          const file = new File(fd, path, stat.size);
          return resolve(file);
        });
      });
    });  
  }




  /** Read data from file at the current file position into the passed buffer
   * 
   * @param buffer the buffer to read into
   * @param offset the offset in the buffer to start writing in
   * @param length the number of bytes to read
   * 
   * @return returns a promise that resolves to the number of actually read bytes
   */
  read(buffer: Buffer, offset: number, length: number) : Promise<number> {
    return new Promise((resolve, reject) => {
      fs.read(this.fd, buffer, offset, length, this.pos, (err, bytesRead, buffer) => {
        if (err) {
          return reject(err);
        }
  
        this.pos += bytesRead;
        resolve(bytesRead);
      });
    });
  }

  /** Writes the given buffer into the file at the current write position
   * 
   * @param buffer the buffer to write
   * 
   * @return a promise, which resolves to the number of bytes written
   */
  write(buffer:Buffer) {
    return this.writeSlice(buffer, 0, buffer.length);
  }

  /** Writes the bytes from the buffer into the file at the file's current
   *  write position.
   * 
   * @param buffer the buffer to write into the file
   * @param offset the buffer offset to start writing from
   * @param length the number of bytes to write 
   * 
   * @return a promise, which resolves to the number of bytes actually written into the file
   */
  writeSlice(buffer: Buffer, offset: number, length: number) : Promise<number> {
    return new Promise((resolve, reject) => {
      fs.write(this.fd, buffer, offset, length, this.pos, (err, bytes, buffer) => {
        if(err) {
          return reject(err);
        }
  
        this.pos += bytes;  
        resolve(bytes);
      });
    });    
  }

  /** Returns a function that can be repeatedly called to write a buffer into 
   *  this file.
   */
  bufferWriter(): Writer {
    return File.prototype.writeSlice.bind(this);
  }


  /** This function accepts a file offset and a length and
   *  reads out the data as buffer.
   *
   * @param offset the file offset to start reading
   * @param length the length of the data to read
   * 
   * @return {Promise<Buffer>} a promise that resolves to the read buffer
   */
  readSlice(offset: number, length: number) {
    return new Promise((resolve, reject) => {
      const buffer = Buffer.alloc(length);
      if (length === 0) {
        return process.nextTick(() => { resolve(buffer); });
      }

      fs.read(this.fd, buffer, 0, length, offset, (err, bytes, buffer) => {
        if (err) {
          return reject(err);
        }
        if (bytes !== length) { 
          // TODO: create a type for this kind of error to handle it programatically
          err = new Error(`File end reached. Only ${bytes} were read instead of ${length}`);
          return reject(err);
        }

        resolve(buffer);
      });
    });    
  }

  /** Sets the file position further by the specified amount of bytes, relative to
   *  either 'pos' or 'start'
   * 
   * @param nBytes the number of bytes to move forward
   * @param relativeTo the position to move relative to 'pos' = current pos, 'start' = file start
   */
  seek(nBytes:number, relativeTo:string) {
    const offset = (relativeTo === 'start') ? 0 : this.pos;
    this.pos = offset + nBytes;
  }

  /** Closes the file
   */
  close() {
    fs.close(this.fd, () => {});
  }


  /** Since upgrading the NodeJS-Version this is only an alias for fs.promises.readFile
   * 
   * @param {string} path the file path
   * @returns {Promise<Buffer>} 
   */
  static readIntoBuffer(path:string) {
    return fs.promises.readFile(path)
  }
}


