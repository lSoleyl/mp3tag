//Node dependencies
const fs = require('fs')
const util = require('util')

//External dependencies
const async = require('async')
const _ = require('lodash')

//Utilities
const cp = require('./cp')
const encoding = require('./encoding')

//Classes
const File = require('./file')
const TagData = require('./tagdata')
const Frame = require('./frame')


module.exports = {
  readHeader: function(path,callback) { return readID3v2(path,callback) },

  /** Returns an empty mp3 tag header
   */
  newHeader: function() { return TagData.empty() }
}


/** 
 * @param path the filepath to read the tag data from
 * @param callback the callback which receives the ID3 tag data
 */
function readID3v2(path, callback) {
  File.open(path, "r", function(err, file) {
    if (err)
      return callback(err)

    var header = new Buffer(TagData.tagHeaderSize)
    file.read(header, 0, header.length, function(err, bytesRead) { //Read 10 Byte header
      if (err)
        return callback(err)
      if (bytesRead < header.length)
        return callback(new Error("Can't read ID3 tag header!"))

      var marker = header.toString('ASCII', 0, 3)
      var majorVersion = header.readUInt8(3)
      var minorVersion = header.readUInt8(4)
      var flags = header.readUInt8(5)

      //Add constant header size to given header size to make it comparable with the file's offset
      var headerSize = encoding.decodeUInt7Bit(header.readUInt32BE(6)) + TagData.tagHeaderSize 

      if (marker != "ID3") { //No header at all
        return callback(new Error("No support for tagless files yet!"))
        //TODO create empty header or something like this
      } else {
        // This library supports v2.3 and v2.4 (though 2.4 is not yet complete)
        var hasFooter = false
        if (majorVersion === 4) {
          hasFooter = (flags & 0x10) != 0 
          if (hasFooter)
            headerSize += TagData.tagFooterSize //footer isn't included in the headersize either

          /** Meaning of the footer:
           *
           *  1. Having a footer means, the file cannot contain padding 
           *  2. The footer is (like the header) not included in the header's size field
           *  3. The footer is 10 bytes long and has the structure:
           *      "3DI" <majorV:1><minorV:1><flags:1><size:4>
           */
        } else if (majorVersion !== 3) {
          return callback(new Error("Unsupported ID3 version: 2." + majorVersion + "." + minorVersion))
        }
        


        var hasExtendedHeader = (flags & 0x40) != 0
        
        if (hasExtendedHeader)
          return callback(new Error("No support for extended header yet!"))

        readFrames(file, headerSize, function(err, frames) {
          if (err)
            return callback(err)

          frames = frames || []                  
          var padding = getPadding(frames, headerSize)         //Filter out padding
          frames = _.filter(frames, function(frame) { return !frame.padding })

          process.nextTick(function() { callback(null, 
            new TagData(file, {'major':majorVersion, 'minor':minorVersion}, flags, headerSize, frames, padding))
          })
        })
      }
    })
  })
}

/** This function determines the padding offset and size for the given frames.
 *
 * @param frames the frames which were returned by getFrames (ordered in that way)
 *
 * @return an object {offset,size} which represents the padding.
 *         Length will be zero if file isn't padded.
 */
function getPadding(frames) {
  var frame = frames[frames.length-1] //Last frame is the padding frame (if any)
  return frame.getPadding()
}

function readFrames(file, tagSize, callback) {
  var frames = []
                //v-- like compose, but correct order
  var fn = async.seq(
    async.apply(readFrame, file, tagSize), 
    function(frame, cb) { 
      frames.push(frame) 
      return cb(null, frame)
    }
  )

  async.whilst(function() { return file.pos < tagSize }, fn, function(err, res) {
    if (err)
      return callback(err)

    return callback(null, frames)
  })
}

/** Reads a single header frame
 *  Format: [ID(4)] [size(4)] [flags(2)] [data(size)]
 *  If the function encounters a NULL byte at the current position, it assumes, it has hit
 *  the padding start. It will move the file's position to one byte after the padding ends, 
 *  this is determined by `mediaStart` and return one frame, which has the field `padding` set to true.
 *  The padding frame's size equals the exact size of the padding in bytes.
 *
 *  frame structure looks as follows: (see frame.js)
 *  {
 *    id      - the frames id as string
 *    pos     - the file position at which this frame's data starts
 *    size    - the size of this frame's data
 *    flags   - the decoded frame flags
 *    padding - set to true if this frame represents padding
 *  }
 *
 * @param file the file object to read from at the current position
 * @param mediaStart the offset at which the audio starts (=tagSize from the tag header)
 * @param callback(err,frame) will be called if frame has been read
 */
function readFrame(file, mediaStart, callback) {
  //TODO remove this forwarding call
  return Frame.read(file, mediaStart, callback)
}