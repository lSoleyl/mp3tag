/** Frame class module
 */

const Data = require('./data');


/** 
 * This class represents a single id3 frame in the mp3 file.
 */
class Frame {
  /**
   * @param {string} id the frame id (no necesarily unique)
   * @param {number} pos byte position in the file
   * @param {number} size the size of the frame
   * @param {Data} data the data object for the frame content buffer
   * @param {number} flags the frame flags
   */
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
   * @param {Buffer} buffer the new buffer to set as the frame's content
   */ 
  setBuffer(buffer) {
    this.data = new Data(buffer);
    this.size = buffer.length;
  }

  /** Writes the header into the provided file
   * 
   * @param {File} file the file to write into
   * 
   * @return {Promise<number>} resolves to the number of bytes written into the file
   */
  async write(file) {
    // Set correct write position for frame header
    file.seek(this.pos-Frame.headerSize, 'start');

    // Build frame header
    const headerBuffer = new Buffer(Frame.headerSize);
    headerBuffer.write(this.id, 0, 4, 'ASCII');
    headerBuffer.writeUInt32BE(this.size, 4);
    headerBuffer.writeUInt16BE(this.flags, 8);

    // Write frame header
    await file.write(headerBuffer)

    // Write frame data
    return file.write(this.data.toBuffer())
  }
}

//Constant size of frame header
Frame.headerSize = 10;

/** This static function returns a padding frame
 * 
 * @param {number} pos the file offset of the padding
 * @param {number} size the size of the padding
 */
Frame.paddingFrame = function(pos, size) {
  const frame = new Frame('\0\0\0\0', pos, size);
  frame.padding = true;
  return frame;
};

/** Returns a frame with the given id, containing the 
 *  passed buffer, but with a valid position. Used for 
 *  insertion of new frames.
 * 
 * @param {string} id the frame id of the allocated frame
 * @param {Buffer} buffer the frame content buffer to use
 */
Frame.allocate = function(id, buffer) {
  return new Frame(id, 0, buffer.length, new Data(buffer));
};

/** Reads a frame from the provided file at the current position and returns the parsed frame.
 *  Format: [ID(4)] [size(4)] [flags(2)] [data(size)]
 *  The file position is moved past this frame by this call. This function will return a padding
 *  frame if the frame starts with a NULL byte.
 *
 * @param {File} file the file object to read from
 * @param {number} mediaStart the offset at which the audio stream starts(=`tagSize` from ID3Tag Header)
 * 
 * @return {Promise<Frame>} resolves to the parsed frame at the current file position.
 */
Frame.read = async function(file, mediaStart) {
  const buffer = Buffer.alloc(Frame.headerSize);
  
  // Read first byte to check for padding
  let bytesRead = await file.read(buffer, 0, 1);
  if (bytesRead !== 1) {
    throw new Error("Can't read initial byte of frame header");
  }


  if (buffer[0] == 0) { // Encountered NULL-Byte (padding starts here)
    file.seek(-1, 'current');
    const offset = file.pos;
    const paddingSize = mediaStart - file.pos;
    file.seek(mediaStart, 'start') //Move file pos to where audio starts

    // Return padding frame
    return Frame.paddingFrame(offset, paddingSize);
  } else {
    // Now that we know, that we don't have padding, we can read in the remaining frame header
    bytesRead = await file.read(buffer, 1, buffer.length-1);
    
    if (bytesRead < buffer.length-1) {
      throw new Error("Can't read ID3 frame header!");
    }

    const id = buffer.toString('ASCII', 0, 4);
    const size = buffer.readUInt32BE(4);
    const flags = buffer.readUInt16BE(8); //TODO: what about the compression and encryption flags!?
    const pos = file.pos;


    file.seek(size);

    // Read the whole frame into a buffer
    const frameBuffer = await file.readSlice(pos, size);
    return new Frame(id, pos, size, new Data(frameBuffer, 0, size), flags);
  }
};


//Export class
module.exports = Frame;
