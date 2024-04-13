/**
 * module which contains the TagData-class
 *
 * This contains all relevant information about the file's id3 tag.
 * This class makes the assumption, that each tag id is actually unique for the whole tag.
 * This assumtion affects the methods getFrameBuffer/getFrameData/setFrameBuffer
 */
import * as _ from 'lodash';

import * as encoding from './encoding';

import { Data } from './data';
import { DataSource } from './dataSource';
import { File } from './file';
import { Frame, FrameID, Padding } from './frame';
import { Decoder, SupportedMajorVersion } from './decoder';



export interface Version {
  major: number,
  minor: number
}


export class TagData {
  /** File read from. 
   */
  private file: File;

  /** the version tuple {'major','minor'}
   */
  private version: Version;

  /** flags field from the header
   */
  private flags: number;

  /** header size with frames and padding/footer = starting offset of audiodata
   */
  private size: number;

  /** list of filtered frames (no zero size frames and no padding frames)
   */
  private frames: Frame[];

  /** padding bytes {'offset', 'size'}
   */
  private padding: Padding;

  /** location of the audio data in this mp3 file
   */
  private audioData: DataSource;

  /** true, if adding new frames has depleted all padding and file must be rewritten
   */
  private rewrite = false;

  /** true if any of the tag data has been changed since creation if the file isn't dirty saving into the same file is a no
   */
  private dirty = false;

  private decoder: Decoder<SupportedMajorVersion>;

  private hasFooter: boolean;


  // Constant size of ID3Tag header/footer size
  private static readonly TAG_HEADER_SIZE = 10;
  private static readonly TAG_FOOTER_SIZE = 10;


  /**
   * @param file the file from which this tagdata has been read
   * @param version the minor,major version tuple read from the header
   * @param flags the flags field from the header
   * @param size frame size with padding/footer = starting offset of audtio
   * @param frames list of filtered frames in this mp3 file (no zero size frames and no padding frames)
   * @param padding offset and size of padding in mp3 file
   * @param audioData location of the audio data in this mp3 file
   */
  constructor(file: File, version: Version, flags: number, size: number, frames: Frame[], padding: Padding, audioData?: DataSource) {
    this.file = file;        
    this.version = version;
    this.flags = flags;
    this.size = size;
    this.frames = frames;
    this.padding = padding;
    this.audioData = audioData ?? new DataSource(file, size);
    
    const {major} = version;
    if (major === 3 || major === 4) {
      this.decoder = new Decoder(major);
    } else {
      throw new Error(`Unsupported major id3 version: ${version}`);
    }

    this.hasFooter = version.major >= 4 && (flags & 0x10) != 0;
  }

  /** This function creates an empty tag with no frames and the audio data references the whole file.
   * 
   * @param audioFile the file containing only the audio data
   * 
   * @return the empty header object
   */
  public static noHeader(audioFile: File) : TagData {
    // We must set the size to the TAG_HEADER_SIZE and padding start correctly or else writing this empty
    // header into a new file will fail.
    return new TagData(audioFile, {major:3, minor:0}, 0/*flags*/, TagData.TAG_HEADER_SIZE/*size*/, [], {offset:TagData.TAG_HEADER_SIZE, size:0}/*no padding*/, new DataSource(audioFile));
  }

  /** This simple getter searches the frames array for the first frame with the given id.
   *
   * @param {string} id the frame's id
   *
   * @return {Frame} either the frame or undefined if not found
   */
  getFrame(id: FrameID): Frame|undefined {
    return _.find(this.frames, frame => frame.id == id);
  }

  /** This simple getter returns all frames for the given id or an empty array
   *  if no such frame exists. There are cases where the frame id isn't actually
   *  a unique Identifier and multiple frames with the same id exist.
   *
   * @param id the frame's id
   *
   * @return the list of frames with that id
   */
  getFrames(id: FrameID): Frame[] {
    return _.filter(this.frames, frame => frame.id == id);
  }

  /** Returns the frame buffer of the frame, which identified by the given id.
   *  If no such frame is available, undefined is returned. The padding frame is not part of 
   *  of the frames, and can't be retrieved by this method.
   *
   * @param id the frame's id to get the buffer for.
   *
   * @return the frame's buffer, or undefined if the frame does not exist.
   */
  getFrameBuffer(id: FrameID): Buffer | undefined {
    const frame = this.getFrame(id);
    return frame?.data.toBuffer();
  }

  /** Returns the frame buffer of the frame, which identified by the given id.
   *  Since there are cases in which a file contains multiple frames with the same id,
   *  (in most cases custom frames) this method can be used to retrieve all buffers 
   *  for these frames. The buffers are returned as array.
   *
   * @param id the frame's id to get the buffer for.
   *
   * @return an array of buffers, on for each frame found with the given id
   */
  getFrameBuffers(id: FrameID): Buffer[] {
    return _.map(this.getFrames(id), frame => frame.data.toBuffer());
  }

  /** Inverse to getFrameBuffer.
   *  The buffer is only assigned, not copied, so don't modify it afterwards.
   *  If the frame does not exist, it will be created, otherwise the frame buffer just
   *  gets replaced. The padding of TagData is adapted accordingly.
   *
   * @param id the frame's id
   * @param buffer the buffer to set
   */
  setFrameBuffer(id: FrameID, buffer: Buffer): void {
    this.reallocateFrame(id, buffer);
  }

  /** Completely removes the given frame(s). 
   *  If the frame doesn't exist, it does nothing.
   *  The method doesn't prevent the deletion of required frames.
   *
   * @param id the id of the frame to delete
   */
  removeFrame(id: FrameID): void {
    _.remove(this.frames, (frame) => { return frame.id == id; });
    this.realignFrames(); // Realign all frames after a frame got deleted
  }

  /** This method will return the frame with the given id, and change it's size
   *  to fit the passed buffer. If the frame doesn't exist, it will be created.
   *  The passed buffer will be set as new data.
   *  
   * @param id the frame's id
   * @param buffer the buffer to set for the frame 
   *
   * @return the reallocated frame
   */
  reallocateFrame(id: FrameID, buffer: Buffer): Frame {
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
  realignFrames(): void {
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
   * @param id the frame's id
   * @param buffer the buffer to set as data.
   *
   * @return the newly allocated frame
   */
  allocateFrame(id: FrameID, buffer: Buffer): Frame {
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
   * @return A promise that gets resolved once the file has been written.
   */
  async save(): Promise<void> {
    return this.writeToFile(this.file.name);
  }
  
  /** Checks whether the footer should better be disabled based on a used padding
   */
  checkFooter(): void {
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
   * @return the content size in bytes
   */
  getContentSize(): number {
    let size = this.size - TagData.TAG_HEADER_SIZE;

    if (this.hasFooter) {
      size -= TagData.TAG_FOOTER_SIZE;
    }

    return size;
  }

  /** This method will write the id3 tag header into the given file. At the correct offset.
   *  This will not write the frames.
   *
   * @param file a File object
   * 
   * @return a promise, which resolves to the number of written bytes upon success. 
   *         This should be equal to TagData.TAG_HEADER_SIZE
   */
  async writeTagHeader(file: File): Promise<number> {
    // check whether we have to disable the footer to set the correct flags
    this.checkFooter(); 

    const header = Buffer.alloc(TagData.TAG_HEADER_SIZE);

    header.write("ID3"); // Write marker
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
   * @param file the File object to write into
   * 
   * @return a promise, which resolves to the number of written bytes.
   *         This will equal TagData.TAG_FOOTER_SIZE if the file has a footer
   *         or 0 if the file doesn't need / cannot have a footer (due to padding)
   */
  async writeTagFooter(file: File): Promise<number> {
    this.checkFooter();

    if (!this.hasFooter) {
      // so 0 bytes have been written, but this is not an error
      return 0;
    }

    const footer = Buffer.alloc(TagData.TAG_FOOTER_SIZE);

    footer.write("3DI"); // Write footer marker (basically ID3 reversed)
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
   * @return the used decoder instance for this tag
   */
  getDecoder(): Decoder<SupportedMajorVersion> {
    return this.decoder;
  }

  /** Reads the audio data from the file into a buffer and returns it.
   * 
   * @return a promise, which resolves to the buffer containing the file's audio data
   */
  async getAudioBuffer(): Promise<Buffer> {
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
   * @return a promise, which gets resolved if the file has been successfully written.
   */
  async writeToFile(path: string): Promise<void> {
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
   * @param data the loaded audio data to write back. May be undefined if 
   *             writing back the audio isn't necessary.
   */
  constructor(private data?: Data) {}

  /** 
   * @param file the file to write into
   * 
   * @return a promise, which resolves to the number of bytes written
   */
  async writeToFile(file: File): Promise<number> {
    if (this.data !== undefined) {
      return file.write(this.data.toBuffer());
    } else {
      // no bytes written... wasn't necessary
      return 0; 
    }
  }
}

