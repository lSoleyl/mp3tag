//External dependencies
const _ = require('lodash');

//Utilities
const encoding = require('./encoding');

//Classes
const File = require('./file');
const TagData = require('./tagdata');
const Frame = require('./frame');


module.exports = {
  /** Reads the id3v2 tag data from the provided file.
   * 
   * @param {string} path the file path to read the tagdata from
   * 
   * @return {Promise<TagData>} resolves to the parsed tag data
   */
  readHeader: function(path) { 
    return readID3v2(path);
  }
};

/** Reads the id3v2 tag data from the provided file. 
 * 
 * @param {string} path the filepath to read the tag data from
 * 
 * @return {Promise<TagData>} resolves to the parsed tag data
 */
async function readID3v2(path) {
  const file = await File.open(path, "r");

  const header = Buffer.alloc(TagData.TAG_HEADER_SIZE);
  const bytesRead = await file.read(header, 0, header.length); // Read 10 Byte header

  if (bytesRead < TagData.TAG_HEADER_SIZE) {
    throw new Error("Can't read ID3 tag header!");
  }

  const marker = header.toString('ASCII', 0, 3);
  const majorVersion = header.readUInt8(3);
  const minorVersion = header.readUInt8(4);
  const flags = header.readUInt8(5);

  // Add constant header size to given header size to make it comparable with the file's offset
  let headerSize = encoding.decodeUInt7Bit(header.readUInt32BE(6)) + TagData.TAG_HEADER_SIZE;

  if (marker !== "ID3") { //No header at all
    // Simply return an empty dummy header that won't be written unless a frame gets created
    return TagData.noHeader(file);
  } else {
    // This library supports v2.3 and v2.4 (though 2.4 is not yet complete)
    let hasFooter = false;
    if (majorVersion === 4) {
      hasFooter = (flags & 0x10) != 0;
      if (hasFooter) {
        headerSize += TagData.TAG_FOOTER_SIZE; // footer isn't included in the headersize either
      }

      /** Meaning of the footer:
       *
       *  1. Having a footer means, the file cannot contain padding 
       *  2. The footer is (like the header) not included in the header's size field
       *  3. The footer is 10 bytes long and has the structure:
       *      "3DI" <majorV:1><minorV:1><flags:1><size:4>
       */
    } else if (majorVersion !== 3) {
      throw new Error(`Unsupported ID3 version: 2.${majorVersion}.${minorVersion}`);
    }
    

    const hasExtendedHeader = (flags & 0x40) != 0;
    
    if (hasExtendedHeader) {
      throw new Error("No support for extended header yet!");
    }

    let frames = await readFrames(file, headerSize);
    frames = frames || [];

    const padding = getPadding(frames, headerSize);  // Filter out padding
    frames = _.filter(frames, (frame) => { return !frame.padding; });

    return new TagData(file, {'major':majorVersion, 'minor':minorVersion}, flags, headerSize, frames, padding);    
  }
}

/** @typedef {{offset:number,size:number}} Padding
 */

/** This function determines the padding offset and size for the given frames.
 *
 * @param {Frame[]} frames the frames which were returned by getFrames (ordered in that way)
 *
 * @return {Padding} an object  which represents the file's padding.
 *                  Length will be zero if file isn't padded.
 */
function getPadding(frames) {
  // Last frame is the padding frame (if any)
  const lastFrame = frames[frames.length-1];
  return lastFrame.getPadding();
}

/** Reads the frames from the provided tag file into a frame array. The first frame is
 *  read from the current file position and frame reading stops at file position `tagSize`.
 * 
 * @param {File} file the file to read the frames from
 * @param {number} tagSize the parsed tag size (position in file where the frames end)
 * 
 * @return {Promise<Frame[]>} resolves to all parsed frames including padding frames if present.
 */
async function readFrames(file, tagSize) {
  /** @type {Frame[]}
   */
  const frames = [];

  while (file.pos < tagSize) {
    frames.push(await Frame.read(file, tagSize));
  }

  return frames;
}
