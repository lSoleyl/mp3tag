/** Frame class module
 */

import { File } from "./file";
import { Data } from "./data";

export interface Padding {
  offset: number;
  size: number;
}

//TODO: restrict this type to the known frame ids
export type FrameID = string;

/** 
 * This class represents a single id3 frame in the mp3 file.
 */
export class Frame {
  // Constant size of frame header
  static readonly HEADER_SIZE = 10;

  /**
   * @param id the frame id (no necesarily unique)
   * @param pos byte position in the file
   * @param size the size of the frame
   * @param data the data object for the frame content buffer. If no data is passed, the frame is interpreted as padding frame
   * @param flags the frame flags
   */
  private constructor(public id: FrameID, public pos: number, public size: number, public data: Data, public flags = 0) {}


  /** Used to check whether this frame is a padding frame
   *  Returns false for all regular frames
   */
  isPadding(): boolean { return false; }


  /** Returns a padding structure {offset,size} for the
   *  padding, which this frame represents. For regular non-padding
   *  frames, this returns an empty padding after this frame.
   */
  getPadding() : Padding {
    return {
      offset: this.pos + this.size,
      size: 0
    };
  }

  /** Replaces the internal data by a new data and changes the
   *  size respectively.
   *
   * @param buffer the new buffer to set as the frame's content
   */ 
  setBuffer(buffer: Buffer) {
    this.data = new Data(buffer);
    this.size = buffer.length;
  }

  /** Writes the header into the provided file
   * 
   * @param file the file to write into
   * 
   * @return a promise, resolves to the number of bytes written into the file
   */
  async write(file: File) {
    if (!this.data) {
      throw new Error('Cannot write a padding frame');
    }

    // Set correct write position for frame header
    file.seek(this.pos-Frame.HEADER_SIZE, 'start');

    // Build frame header
    const headerBuffer = Buffer.alloc(Frame.HEADER_SIZE);
    headerBuffer.write(this.id, 0, 4, 'ascii');
    headerBuffer.writeUInt32BE(this.size, 4);
    headerBuffer.writeUInt16BE(this.flags, 8);

    // Write frame header
    await file.write(headerBuffer)

    // Write frame data
    return file.write(this.data.toBuffer())
  }

  /** Returns a frame with the given id, containing the 
   *  passed buffer, but with a valid position. Used for 
   *  insertion of new frames.
   * 
   * @param id the frame id of the allocated frame
   * @param buffer the frame content buffer to use
   */
  static allocate(id: string, buffer: Buffer) {
    return new Frame(id, 0, buffer.length, new Data(buffer));
  }

  /** Reads a frame from the provided file at the current position and returns the parsed frame.
   *  Format: [ID(4)] [size(4)] [flags(2)] [data(size)]
   *  The file position is moved past this frame by this call. This function will return a padding
   *  frame if the frame starts with a NULL byte.
   *
   * @param file the file object to read from
   * @param mediaStart the offset at which the audio stream starts(=`tagSize` from ID3Tag Header)
   * 
   * @return a promise, which resolves to the parsed frame at the current file position.
   */
  static async read(file: File, mediaStart: number) {
    const buffer = Buffer.alloc(Frame.HEADER_SIZE);
    
    // Read first byte to check for padding
    let bytesRead = await file.read(buffer, 0, 1);
    if (bytesRead !== 1) {
      throw new Error("Can't read initial byte of frame header");
    }

    if (buffer[0] == 0) { // Encountered NULL-Byte (padding starts here)
      file.seek(-1, 'pos');
      const offset = file.offset;
      const paddingSize = mediaStart - file.offset;
      file.seek(mediaStart, 'start') // Move file pos to where audio starts

      // Return padding frame
      return new PaddingFrame(offset, paddingSize);
    } else {
      // Now that we know, that we don't have padding, we can read in the remaining frame header
      bytesRead = await file.read(buffer, 1, buffer.length-1);
      
      if (bytesRead < buffer.length-1) {
        throw new Error("Can't read ID3 frame header!");
      }

      const id = buffer.toString('ascii', 0, 4);
      const size = buffer.readUInt32BE(4);
      const flags = buffer.readUInt16BE(8); //TODO: what about the compression and encryption flags!?
      const pos = file.offset;


      file.seek(size);

      // Read the whole frame into a buffer
      const frameBuffer = await file.readSlice(pos, size);
      return new Frame(id, pos, size, new Data(frameBuffer, 0, size), flags);
    }
  }
}

/** There are no such thing as a padding frame in ID3, but we return this structure as a placeholder
 *  for the padding area when Frame.read() is called at the start of the padding area.
 */
export class PaddingFrame implements Padding {
  constructor(public offset: number, public size: number) {}

  /** Used to check whether this frame is a padding frame
   *  Returns true for all padding frames
   */
  isPadding(): boolean { return true; }

  /** Returns a padding structure {offset,size} for the
   *  padding, which this frame represents. If this frame 
   *  isn't a padding frame, then an empty padding after this
   *  frame is returned.
   */
  getPadding() : Padding {
    return this;
  }
}
