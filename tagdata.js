/**
 * module which contains the TagData-class
 *
 * This contains all relevant information about the file's id3 tag.
 * This class makes the assumption, that each tag id is actually unique for the whole tag.
 * This assumtion affects the methods getFrameBuffer/getFrameData/setFrameBuffer
 */
const _ = require("lodash");

const encoding = require('./encoding');

const Data = require('./data');
const DataSource = require('./dataSource');
const File = require('./file');
const Frame = require('./frame');
const Decoder = require('./decoder');


class TagData {

  /** @typedef {{major:number,minor:number}} Version
   */

  /** @typedef {{offset:number,size:number}} Padding
   */

  /**
   * @param {File} file the file from which this tagdata has been read
   * @param {Version} version the minor,major version tuple read from the header
   * @param {number} flags the flags field from the header
   * @param {number} size frame size with padding/footer = starting offset of audtio
   * @param {Frame[]} frames list of filtered frames in this mp3 file (no zero size frames and no padding frames)
   * @param {Padding} padding offset and size of padding in mp3 file
   * @param {DataSource} audioData location of the audio data in this mp3 file
   */
  constructor(file, version, flags, size, frames, padding, audioData) {
    this.file = file;        //File read from
    this.version = version;  //version tuple {'major','minor'}
    this.flags = flags;      //flags field from the header
    this.size = size ;       //header size with frames and padding/footer = starting offset of audiodata
    this.frames = frames;    //list of filtered frames (no zero size frames and no padding frames)
    this.padding = padding;  //padding bytes {'offset', 'size'}
    this.audioData = audioData || new DataSource(file, size);
    this.rewrite = false;    //true, if adding new frames has depleted all padding and file must be rewritten
    this.dirty = false;      //true if any of the tag data has been changed since creation if the file isn't dirty saving into the same file is a noop
    this.decoder = new Decoder(version);
    this.hasFooter = version.major >= 4 && (flags & 0x10) != 0;
  }

  /** This simple getter searches the frames array for the first frame with the given id.
   *
   * @param {string} id the frame's id
   *
   * @return {Frame} either the frame or undefined if not found
   */
  getFrame(id) {
    return _.find(this.frames, (frame) => { return frame.id == id; });
  }

  /** This simple getter returns all frames for the given id or an empty array
   *  if no such frame exists. There are cases where the frame id isn't actually
   *  a unique Identifier and multiple frames with the same id exist.
   *
   * @param {string} id the frame's id
   *
   * @return {Frame[]} the list of frames with that id
   */
  getFrames(id) {
    return _.filter(this.frames, (frame) => { return frame.id == id; });
  }

  /** Returns the frame buffer of the frame, which identified by the given id.
   *  If no such frame is available, undefined is returned. The padding frame is not part of 
   *  of the frames, and can't be retrieved by this method.
   *
   * @param {string} id the frame's id to get the buffer for.
   *
   * @return {Buffer} the frame's buffer, or undefined if the frame does not exist.
   */
  getFrameBuffer(id) {
    const frame = this.getFrame(id);
    if (frame) {
      return frame.data.toBuffer();
    }
    
    return undefined;
  }

  /** Returns the frame buffer of the frame, which identified by the given id.
   *  Since there are cases in which a file contains multiple frames with the same id,
   *  (in most cases custom frames) this method can be used to retrieve all buffers 
   *  for these frames. The buffers are returned as array.
   *
   * @param {string} id the frame's id to get the buffer for.
   *
   * @return {Buffer[]} an array of buffers, on for each frame found with the given id
   */
  getFrameBuffers(id) {
    return _.map(this.getFrames(id), (frame) => { return frame.data.toBuffer(); });
  }

  /** Inverse to getFrameBuffer.
   *  The buffer is only assigned, not copied, so don't modify it afterwards.
   *  If the frame does not exist, it will be created, otherwise the frame buffer just
   *  gets replaced. The padding of TagData is adapted accordingly.
   *
   * @param {string} id the frame's id
   * @param {Buffer} buffer the buffer to set
   */
  setFrameBuffer(id, buffer) {
    this.reallocateFrame(id, buffer);
  }

  /** Completely removes the given frame(s). 
   *  If the frame doesn't exist, it does nothing.
   *  The method doesn't prevent the deletion of required frames.
   *
   * @param {string} id the id of the frame to delete
   */
  removeFrame(id) {
    _.remove(this.frames, (frame) => { return frame.id == id; });
    this.realignFrames(); // Realign all frames after a frame got deleted
  }

  /** This method will return the frame with the given id, and change it's size
   *  to fit the passed buffer. If the frame doesn't exist, it will be created.
   *  The passed buffer will be set as new data.
   *  
   * @param {string} id the frame's id
   * @param {Buffer} buffer the buffer to set for the frame 
   *
   * @return {Frame} the reallocated frame
   */
  reallocateFrame(id, buffer) {
    const frame = this.getFrame(id);

    // Allocate if frame doesn't exist  
    if (!frame) {
      return this.allocateFrame(id, buffer);
    }

    // No change in data necessary, setting same content
    if (frame.data.toBuffer().equals(buffer)) {
      return frame;
    }

    // Maybe no resizing necessary?
    const size = frame.size;
    frame.setBuffer(buffer);

    if (frame.size != size) {
      // Take care of realigning frames, adjusting padding and the tag's size
      this.realignFrames();
    }

    this.dirty = true; // Change in data happened

    return frame;
  }

  /** This method will iterate through all frames and adjust their `pos` according to
   *  their `size` and position in the frames array. The padding and tag size will be
   *  adjusted if necessary.
   */
  realignFrames() {
    let pos = TagData.TAG_HEADER_SIZE; // Starting position
    for (const frame of this.frames) {
      pos += Frame.HEADER_SIZE; // move position to start of data
      
      // Move frame to correct position
      frame.pos = pos;
      pos += frame.size;
    }

    // Padding start position may have changed
    const paddingDelta = pos - this.padding.offset;
    this.dirty = true; // data has probably changed (new frame or removed a frame)

    // Move resize padding accordingly
    this.padding.offset += paddingDelta;
    this.padding.size -= paddingDelta;

    if (this.padding.size < 0) { // No padding left
      this.size += this.padding.size*(-1); // Tag's size has just increased 
      this.rewrite = true; // Audiodata must be moved
      this.padding.size = 0;
    }
  }

  /** This method will create a new frame structure and append it to frames.
   *  The padding will be decreased accordingly. It does not check whether
   *  a frame with this id already exists. The frame will be allocated with
   *  enough size to hold the passed buffer.
   *
   * @param {string} id the frame's id
   * @param {Buffer} buffer the buffer to set as data.
   *
   * @return {Frame} the newly allocated frame
   */
  allocateFrame(id, buffer) {
    const frame = Frame.allocate(id, buffer);

    // Insert as last frame
    this.frames.push(frame);

    // Realign frames will take care of setting the correct position and adjusting the padding
    this.realignFrames();
    return frame;
  }

  /** This method will just write back the updated frame data into the file itself.
   *  If possible it will try to use the padding area for that purpose. If the updated
   *  header fits inside the old header+padding then only the header part of the file will
   *  get updated and not the whole file.
   *  If the tag data hasn't been changed, then no write operation takes place.
   *
   * @return {Promise<void>} A promise that gets resolved once the file has been written.
   */
  async save() {
    if (!this.file) {
      throw new Error("This tag data has no source file!"); // Is true for generated headers
    }

    return this.writeToFile(this.file.name);
  }
  
  /** Checks whether the footer should better be disabled based on a used padding
   */
  checkFooter() {
    // Footer processing (we don't want to write the footer if we have included padding)
    if (this.hasFooter && this.padding.size > 0) {
      // remove footer, add it's size to the padding and disable the flag
      this.hasFooter = false;
      this.padding.size += TagData.TAG_FOOTER_SIZE;
      this.flags &= ~0x10;
    }
  }

  /** Returns the size of the tag's content not counting header and footer, but padding is included.
   *  This value is equal to the size value encoded in the tag header/footer.
   * 
   * @return {number} the content size in bytes
   */
  getContentSize() {
    let size = this.size - TagData.TAG_HEADER_SIZE;

    if (this.hasFooter) {
      size -= TagData.TAG_FOOTER_SIZE;
    }

    return size;
  }

  /** This method will write the id3 tag header into the given file. At the correct offset.
   *  This will not write the frames.
   *
   * @param {File} file a File object
   * 
   * @return {Promise<number>} resolves to the number of written bytes upon success. This should
   *                           be equal to TagData.TAG_HEADER_SIZE
   */
  async writeTagHeader(file) {
    // check whether we have to disable the footer to set the correct flags
    this.checkFooter(); 

    const header = Buffer.alloc(TagData.TAG_HEADER_SIZE);

    header.asciiWrite("ID3"); // Write marker
    header.writeUInt8(this.version.major,3);
    header.writeUInt8(this.version.minor,4);
    header.writeUInt8(this.flags, 5);

    // TagHeader size must be subtracted from the actual size
    header.writeUInt32BE(encoding.encodeUInt7Bit(this.getContentSize()), 6);

    // Now write the header
    return file.write(header);
  }

  /** This method will write the id3 tag footer if the file still has a footer
   *
   * @param {File} file the File object to write into
   * 
   * @return {Promise<number>} resolves to the number of written bytes.
   *                           This will equal TagData.TAG_FOOTER_SIZE if the file has a footer
   *                           or 0 if the file doesn't need / cannot have a footer (due to padding)
   */
  async writeTagFooter(file) {
    this.checkFooter();

    if (!this.hasFooter) {
      // so 0 bytes have been written, but this is not an error
      return 0;
    }

    const footer = Buffer.alloc(TagData.TAG_FOOTER_SIZE);

    footer.asciiWrite("3DI"); // Write footer marker (basically ID3 reversed)
    footer.writeUInt8(this.version.major,3);
    footer.writeUInt8(this.version.minor,4);
    footer.writeUInt8(this.flags, 5);

    // TagHeader size must be subtracted from the actual size
    footer.writeUInt32BE(encoding.encodeUInt7Bit(this.getContentSize()), 6);

    // Now write the footer
    return file.write(footer);
  }

  /** Basically a getter for the decoder property
   * 
   * @return {Decoder} the used decoder instance for this tag
   */
  getDecoder() {
    return this.decoder;
  }

  /** Reads the audio data from the file into a buffer and returns it.
   * 
   * @return {Promise<Buffer>} resolves to the buffer containing the file's audio data
   */
  async getAudioBuffer() {
    const data = await this.audioData.toData();
    return data.toBuffer();
  }

  /** This method will write the content into a file (overwriting existing files) and 
   *  will place a padding area of 1024 bytes after the header. If the file to write into
   *  equals the source file for this tag's audiodata, then it tries to only update the tags itself.
   *  If a new file is written, a default padding of 1024 is added.
   *
   *  If the destination file is a .mp3 file, it will get completely overwritten.
   *  It won't be first parsed to preserve it's audio data.
   *  If the target file equals this tagData's source file and the tagData hasn't changed since last load
   *  or save then no file access occurrs. If the data has changed, then this operation will
   *  reset this state.
   * 
   * @param path the file's path to write into
   *
   * @return {Promise<void>} gets resolved if the file has been successfully written.
   */
  async writeToFile(path) {
    const sameFile = (this.audioData.source.name === path);

    // No change & same file -> no write necessary
    if (sameFile && !this.dirty) {
      return;
    }

    /** This helper function will load the audio data into a buffer iff rewriting the file
     *  is necessary to prevent overwriting the audio data when writing out the tag frames.
     *  AudioData.writeToFile() should be called on the returned object to write the buffered
     *  audio data back into the file.
     * 
     * @return {Promise<AudioData>} the object holding the optionally buffered audio data.
     */ 
    const getAudioData = async () => {
      // We don't have to write audio if a rewrite isn't necessary and we write into the same file
      if (sameFile && !this.rewrite) {
        // AudioData.writeToFile() will be a NOP
        return new AudioData();
      } else { 
        // Otherwise, writing audio is necessary
        // We have to load the audioData into a buffer, before writing any frames,
        // or else we will overwrite it.
        return new AudioData(await this.audioData.toData());
      }
    };

    // load audio data if necessary
    const audioData = await getAudioData();

    // Open target file for writing
    let fmode = "w";
    if (sameFile && !this.rewrite) {
      // Don't clear file on open
      fmode = "a"; 
    }

    const file = await File.open(path, fmode);
    
    // Write the file parts in order
    await this.writeTagHeader(file);

    // Write frames
    for (const frame of this.frames) {
      await frame.write(file);
    }

    // Write padding (generate a buffer filled with 0x00)
    const padding = Buffer.alloc(this.padding.size, 0x00);
    await file.write(padding);

    // Write footer (if any)
    await this.writeTagFooter(file);

    // Now write the audio data (if needed) and close the file
    await audioData.writeToFile(file);
    file.close();
    
    if (sameFile) {
      // Clear dirty flag if we have just updated the source file
      this.dirty = false;
    }
    
    return;
  }
}


/** Helper class for writing back the mp3's audio data
 */
class AudioData {
  /** 
   * @param {Data?} data the loaded audio data to write back. May be undefined if 
   *                     writing back the audio isn't necessary.
   */
  constructor(data) {
    this.data = data;
  }

  /** 
   * @param {File} file the file to write into
   * 
   * @return {Promise<number>} resolves to the number of bytes written
   */
  async writeToFile(file) {
    if (this.data !== undefined) {
      return file.write(this.data.toBuffer());
    } else {
      // no bytes written... wasn't necessary
      return 0; 
    }
  }
}

// Constant size of ID3Tag header/footer size
TagData.TAG_HEADER_SIZE = 10;
TagData.TAG_FOOTER_SIZE = 10;

/** This function creates an empty tag with no frames and the audio data references the whole file.
 * 
 * @param {File} audioFile the file containing only the audio data
 * 
 * @return {TagData} the empty header object
 */
TagData.noHeader = function(audioFile) {
  // We must set the size to the TAG_HEADER_SIZE and padding start correctly or else writing this empty
  // header into a new file will fail.
  return new TagData(audioFile, {major:3, minor:0}, 0/*flags*/, TagData.TAG_HEADER_SIZE/*size*/, [], {offset:TagData.TAG_HEADER_SIZE, size:0}, new DataSource(audioFile));
};

// export class
module.exports = TagData;
