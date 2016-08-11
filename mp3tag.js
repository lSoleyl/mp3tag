//Node dependencies
var fs = require('fs')
var util = require('util')

//External dependencies
var async = require('async')
var _ = require('lodash')

//Utilities
var cp = require('./cp')

//Classes
var File = require('./file')
var Data = require('./data')
var TagData = require('./tagdata')


var mp3Tag = {
  readHeader: function(path,callback) { return readID3v2(path,callback) },

  /** Returns an empty mp3 tag header
   */
  newHeader: function() { return TagData.empty() },

  decodeString: function(buffer) {
    if (!(buffer instanceof Buffer)) {
      throw new Error("Expected buffer, got: " + typeof(buffer) + " - " + util.inspect(buffer, {showHidden:true}))
    }

    var data = buffer.slice(1)
    try {
      return decodeString(data, buffer[0])
    } catch(e) {
      throw new Error("Unsupported buffer encoding: " + buffer.inspect())
    }
  }, 


  encodeString: function(string) {
    if (!(typeof string == "string"))
      throw new Error("Expected string, got: " + typeof(string) + " - " + util.inspect(string, {showHidden:true}))

    var bomBuf = encodeString(string, "UTF-16LE")

    var result = new Buffer(bomBuf.length+1)
    result[0] = 0x01 //encoding byte = unicode
    bomBuf.copy(result,1)
    return result
  },

  decodePopularity:function(buffer) { //v-- no unicode support for email
    var email = decodeCString(buffer, 0x00)
    var rating = buffer[email.pastNullPos]
    var offset = email.pastNullPos + 1
    var played = decodeNumberBE(buffer, offset, buffer.length - offset)

    return {
      email:email.string,
      rating:rating,
      playCount:played
    }
  },


  decodeComment:function(buffer) {
    if (!(buffer instanceof Buffer)) {
      throw new Error("Expected buffer, got: " + typeof(buffer) + " - " + util.inspect(buffer, {showHidden:true}))
    }


    var encodingByte = buffer[0]
    var language = buffer.toString('ascii', 1, 3)
    var data = buffer.slice(4)
    
    try {
      encoding = getBufferEncoding(data, encodingByte)
    } catch (e) {
      throw new Error("Unsupported buffer encoding: " + buffer.inspect())
    }

    var cData = decodeCString(data, encodingByte) //TODO try catch other error

    var shortComment = cData.string
    var longComment = decodeString(data.slice(cData.pastNullPos))

    return {
      language:language,
      short:shortComment,
      long:longComment
    }
  },

  decodePicture: function(buffer) {
    if (!(buffer instanceof Buffer)) {
      throw new Error("Expected buffer, got: " + typeof(buffer) + " - " + util.inspect(buffer, {showHidden:true}))
    }

    var encodingByte = buffer[0]

    var dataBuffer = buffer.slice(1)         //v-- MIME will always be ISO-8895-1
    var mimeData = decodeCString(dataBuffer, 0x00)
    var mimeType = mimeData.string
    var pictureType = dataBuffer[mimeData.pastNullPos]
    var descriptionBuffer = dataBuffer.slice(mimeData.pastNullPos + 1)
    var descData = decodeCString(descriptionBuffer, encodingByte)
    var description = descData.string
    var pictureData = descriptionBuffer.slice(descData.pastNullPos)

    return {
      mimeType: mimeType,      //String
      pictureType: pictureType,//Integer
      description: description,//String
      pictureData: new Data(pictureData) //BufferData
    }
  },

  utils: {
    /** Decodes a 7bit encoded unsigned integer:
     *  Format: 0b0xxxxxx0xxxxxx0xxxxxx0xxxxxx
     *
     * @param uint28 the number to decode
     *
     * @return the decoded number
     */
    decodeUInt7Bit: function(uint28) {
      var x = uint28
      return (x & 0x7F) | ((x & 0x7F00) >> 1) | ((x & 0x7F0000) >> 2) | ((x & 0x7F000000) >> 3)
    },

    /** Encodes a unsigned integer into a  7bit unsigned integer. 
     *  The first 4 bits get cut off. 
     *
     * @param uint32 the integer to encode
     *
     * @return a 28 bit encoded integer
     */
    encodeUInt7Bit: function(uint32) {
      var x = uint32
      return (x & 0x7F) | (((x >> 7) & 0x7F) << 8) | (((x >> 14) & 0x7F) << 16) | (((x >> 21) & 0x7F) << 24)
    }
  }
}

module.exports = mp3Tag

var BOMs = [
  {encoding:'UTF-16LE', bom:[0xFF, 0xFE], dbe:true},
  {encoding:'UTF-16BE', bom:[0xFE, 0xFF], dbe:true},
  {encoding:'UTF-8',    bom:[0xEF, 0xBB, 0xBF], dbe:false},
  {encoding:'UTF-8',    bom:[], dbe:false} //Empty bom sets the default codepage
]

function decodeNumberBE(buffer, offset, bytes) {
  var result = 0
  for(var c = offset; c < offset + bytes; ++c) {
    result = ((result << 8) | buffer[c]) //Decode big endian number
  }
  return result
}



/** Receives a zero terminated buffer to decode from and the encoding byte
 *  
 * @param buffer the buffer to read the string from
 * @param encodingByte the byte, which specifies encoding
 *
 * @return returns {string,nullPos,pastNullPos}
 */
function decodeCString(buffer, encodingByte) {
  var encoding = getBufferEncoding(buffer, encodingByte)

  var result = {}
  result.nullPos = getStringEndPos(buffer, encoding.dbe)

  if (result.nullPos == -1)
    throw new Error("Expected NULL terminated string, missing NULL byte(s), with encoding: " + encoding.encoding)

  result.pastNullPos = result.nullPos + (encoding.dbe ? 2 : 1)

  var contentslice = buffer.slice(encoding.bom.length, result.nullPos - encoding.bom.length)
  
  result.string = cp.fromBuffer(contentslice, encoding.encoding)
  return result
}

/** Same as decodeCString, but this string isn't zero terminated. The whole
 *  buffer is treated as string.
 * 
 * @param buffer the buffer to read from
 * @param encodingByte the byte which specifies, which encoding to use
 *
 * @return decoded string
 */
function decodeString(buffer, encodingByte) {
  var encoding = getBufferEncoding(buffer, encodingByte)
  return cp.fromBuffer(buffer.slice(encoding.bom.length), encoding.encoding)
}

/** Encodes the string into a buffer with the encoding's BOM.
 *  The encodingByte won't be written into the buffer as this is format specific.
 *  
 * @param string the string to encode
 * @param encoding the name of the encoding to use
 *
 * @return the buffer with the encoded string
 */
function encodeString(string, encoding) {
  var cp = _.find(BOMs, function(bom) { return bom.encoding.toLowerCase() == encoding.toLowerCase() })
  var strBuffer = cp.fromString(string, cp.encoding)
  var result = new Buffer(strBuffer.length+cp.bom.length)

  for(var c = 0; c < cp.bom.length; ++c)
    result[c] = cp.bom[c]

  strBuffer.copy(result, cp.bom.length)
  return result
}

/** Returns the offset of the NULL (double-)byte inside a string buffer
 *
 * @param buffer the buffer to search
 * @param isDoubleNull if true, the function treats the byte buffer like a two byte encoding
 */
function getStringEndPos(buffer, isDoubleNull) {
  for(var c = 0; c < buffer.length; ++c) {
    if (buffer[c] == 0x00 && !isDoubleNull) 
      return c
    else if (buffer[c] == 0x00 && buffer[c+1] == 0x00 && isDoubleNull) {
      return c
    }

    if (isDoubleNull)
      ++c //Additional increment if double byte NULL is expected
  }

  return -1 //Not found
}


function getBufferEncoding(buffer, encodingByte) {
  if (encodingByte === undefined)
    encodingByte = 0x01 //Default is unicode if not passed

  if (encodingByte === 0x00) //ISO-8895-1 encoding
    return {encoding:'ISO-8895-1', bom:[], dbe:false}

  if (encodingByte === 0x01) { //UC (search for BOM and look up)
    return _.find(BOMs, function(encoding) {
      for(var c = 0; c < encoding.bom.length; ++c) {
        if (buffer[c] !== encoding.bom[c]) 
          return false
      }

      return true
    })
  }

  throw new Error("Unknown encoding byte: '" + encodingByte + "'")
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
flags
      var marker = header.toString('ASCII', 0, 3)
      var majorVersion = header.readUInt8(3)
      var minorVersion = header.readUInt8(4)
      var flags = header.readUInt8(5)

      //Add constant header size to given header size to make it comparable with the file's offset
      var headerSize = mp3Tag.utils.decodeUInt7Bit(header.readUInt32BE(6)) + TagData.tagHeaderSize 

      if (marker != "ID3") { //No header at all
        return callback(new Error("No support for tagless files yet!"))
        //TODO create empty header or something like this
      } else {
        if (majorVersion != 3) //TODO implement support for other versions as well
          return callback(new Error("Unsupported ID3 version: " + version))
        


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
  
  if (frame.padding) { //Is this actually a padding frame?
    return {
      offset:frame.pos,
      size:frame.size
    }
  } else {
    return {
      offset:frame.pos + frame.size, //Padding starts after last frame
      size: 0                        //and has a size of 0
    }
  }
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
 *  frame structure looks as follows:
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
  var buffer = new Buffer(TagData.frameHeaderSize)
  file.read(buffer, 0, 1, function(err, byteRead) { //Read first byte to check for padding
    if (err)
      return process.nextTick(function() { callback(err) })
    if (byteRead != 1)
      return process.nextTick(function() { callback("Can't read initial byte of frame header") })

    if (buffer[0] == 0) { //Encountered NULL-Byte (padding starts here)
      file.seek(-1, 'curent')
      var offset = file.pos
      var paddingSize = mediaStart - file.pos
      file.seek(mediaStart, 'start') //Move file pos to where audio starts

      process.nextTick(function() { //Return padding frame
        callback(null, {
          id:"\0\0\0\0", //Padding has no id
          pos:offset,
          size:paddingSize,
          flags:0,
          padding:true
        })
      })
    } else {
      //Now that we know, that we don't have padding, we can read in the remaining frame header
      file.read(buffer, 1, buffer.length-1, function(err, bytesRead) {
        if (err)
          return process.nextTick(function() { callback(err) })
        if (bytesRead < buffer.length-1)
          return process.nextTick(function() { callback("Can't read ID3 frame header!") })

        var id = buffer.toString('ASCII', 0, 4)
        var size = buffer.readUInt32BE(4)
        var flags = buffer.readUInt16BE(8)
        var pos = file.pos


        file.seek(size)

        //Read the whole frame into a buffer
        file.readSlice(pos, size, function(err, frameBuffer) {
          if (err)
            return callback(err)

          callback(null, {
            id:id,
            pos:pos,
            size:size,
            data: new Data(frameBuffer, 0, size),
            flags:flags
          })
        })
      })


    }
  })
}