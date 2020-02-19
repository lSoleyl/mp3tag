/** Frame class module
 */

const Data = require('./data');


class Frame {
  constructor(id, pos, size, data, flags = 0) {
    this.id = id;
    this.pos = pos;
    this.size = size;
    if (data) {
      this.data = data;
    }
    this.flags = flags;
    this.padding = false;
  }

  /** Returns a padding structure {offset,size} for the
   *  padding, which this frame represents. If this frame 
   *  isn't a padding frame, then an empty padding after this
   *  frame is returned.
   */
  getPadding() {
    if (this.padding) {
      return {
        offset: this.pos,
        size: this.size
      };
    } else {
      return {
        offset: this.pos + this.size,
        size: 0
      };
    }
  }

  /** Replaces the internal data by a new data and changes the
   *  size respectively.
   *
   * @param buffer the new buffer to set as the frame's content
   */ 
  setBuffer(buffer) {
    this.data = new Data(buffer);
    this.size = buffer.length;
  }

  /** Writes the header into the provided file and calls
   *  the callback upon completion
   * 
   * @param file the file to write into
   * @param callback(err) gets called upon completion
   */
  write(file, callback) {
    // Set correct write position for frame header
    file.seek(this.pos-Frame.headerSize, 'start');

    //Build frame header
    const headerBuffer = new Buffer(Frame.headerSize);
    headerBuffer.write(this.id, 0, 4, 'ASCII');
    headerBuffer.writeUInt32BE(this.size, 4);
    headerBuffer.writeUInt16BE(this.flags, 8);

    //Write frame header
    file.write(headerBuffer, (err) => {
      if (err) {
        return callback(err);
      }

      //Write frame data
      file.write(this.data.toBuffer(), callback);
    });
  }
}

//Constant size of frame header
Frame.headerSize = 10;

/** This static function returns a padding frame
 */
Frame.paddingFrame = function(pos, size) {
  const frame = new Frame('\0\0\0\0', pos, size);
  frame.padding = true;
  return frame;
};

/** Returns a frame with the given id, contianing the 
 *  passed buffer, but with a valid position. Used for 
 *  insertion of new frames.
 */
Frame.allocate = function(id, buffer) {
  return new Frame(id, 0, buffer.length, new Data(buffer));
};

/** Reads a frame from the provided file at the current position and invokes the callback
 *  with the new frame. (Might be a padding frame)
 *
 * @param file the file object to read from
 * @param mediaStart the offset at which the audio stream starts(=tagSize from ID3Tag Header)
 * @param callback(err, frame) gets called upon completion
 */
Frame.read = function(file, mediaStart, callback) {
  const buffer = Buffer.alloc(Frame.headerSize);
  file.read(buffer, 0, 1, (err, byteRead) => { //Read first byte to check for padding
    if (err) {
      return process.nextTick(() => { callback(err); });
    }
    if (byteRead !== 1) {
      return process.nextTick(() => { callback(new Error("Can't read initial byte of frame header")) });
    }

    if (buffer[0] == 0) { //Encountered NULL-Byte (padding starts here)
      file.seek(-1, 'current');
      const offset = file.pos;
      const paddingSize = mediaStart - file.pos;
      file.seek(mediaStart, 'start') //Move file pos to where audio starts

      process.nextTick(() => { //Return padding frame
        callback(null, Frame.paddingFrame(offset, paddingSize));
      });
    } else {
      //Now that we know, that we don't have padding, we can read in the remaining frame header
      file.read(buffer, 1, buffer.length-1, (err, bytesRead) => {
        if (err) {
          return process.nextTick(() => { callback(err); });
        }
        if (bytesRead < buffer.length-1) {
          return process.nextTick(() => { callback(new Error("Can't read ID3 frame header!")); });
        }

        const id = buffer.toString('ASCII', 0, 4);
        const size = buffer.readUInt32BE(4);
        const flags = buffer.readUInt16BE(8); //TODO what about the compression and encryption flags!?
        const pos = file.pos;


        file.seek(size);

        //Read the whole frame into a buffer
        file.readSlice(pos, size, (err, frameBuffer) => {
          if (err) {
            return callback(err);
          }

          callback(null, new Frame(id, pos, size, new Data(frameBuffer, 0, size), flags));
        });
      });
    }
  });
};


//Export class
module.exports = Frame;
