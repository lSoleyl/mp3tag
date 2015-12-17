var fs = require('fs')
var File = require('./file')
var Data = require('./data')
var cp = require('./cp')

var async = require('async')
var _ = require('lodash')
var util = require('util')

module.exports = {
  readHeader: function(path,callback) { return readID3v2(path,callback) },

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
      encoding: encodingByte,  //Integer
      mimeType: mimeType,      //String
      pictureType: pictureType,//Integer
      description: description,//String
      pictureData: new Data(pictureData) //BufferedData
    }
  }


  //TODO export functions
}


var BOMs = [
  {encoding:'UTF-16LE', bom:[0xFF, 0xFE], dbe:true},
  {encoding:'UTF-16BE', bom:[0xFE, 0xFF], dbe:true},
  {encoding:'UTF-8',    bom:[0xEF, 0xBB, 0xBF], dbe:false},
  {encoding:'UTF-8',    bom:[], dbe:false} //Empty bom sets the default codepage
]

function TagData(file, version, flags, size, frames) {
  this.file = file        //File read from
  this.version = version  //version tuple {'major','minor'}
  this.flags = flags      //flags field from the header
  this.size = size        //header size with frames = starting offset of audiodata
  this.frames = frames    //list of filtered frames (no zero size frames)
}

/** Returns an array of frame buffers, which are identified
 *  by the given id
 */
TagData.prototype.getFrameData = function(id, callback) {
  var data = []
  var file = this.file
  var frames = _.filter(this.frames, function(frame) { return frame.id == id })

  async.map(frames, function(frame, cb) { frame.data.toBuffer(cb) }, callback)
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

/** Decodes a 7bit encoded unsigned integer:
 *  Format: 0b0xxxxxx0xxxxxx0xxxxxx0xxxxxx
 */
function decodeUInt7Bit(uint7bit) {
  var x = uint7bit
  return (x & 0x7F) | ((x & 0x7F00) >> 1) | ((x & 0x7F0000) >> 2) | ((x & 0x7F000000) >> 3)
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

    var header = new Buffer(10)
    file.read(header, 0, 10, function(err, bytesRead) { //Read 10 Byte header
      if (err)
        return callback(err)
      if (bytesRead < 10)
        return callback("Can't read ID3 tag header!")

      var marker = header.toString('ASCII', 0, 3)
      var majorVersion = header.readUInt8(3)
      var minorVersion = header.readUInt8(4)
      var flags = header.readUInt8(5)

      var headerSize = decodeUInt7Bit(header.readUInt32BE(6)) + 10

      if (marker != "ID3") { //No header at all
        return callback("No support for tagless files yet!")
        //TODO create empty header or something like this
      } else {
        if (majorVersion != 3) //TODO implement support for other versions as well
          return callback("Unsupported ID3 version: " + version)
        


        var hasExtendedHeader = (flags & 0x40) != 0
        if (hasExtendedHeader)
          return callback("No support for extended header yet!")

        readFrames(file, headerSize, function(err, frames) {
          if (err)
            return callback(err)

          frames = frames || []
          frames = _.filter(frames, function(frame) { return frame.data.size > 0 && frame.id !== "\0\0\0\0" })

          process.nextTick(function() { callback(null, 
            new TagData(file, {'major':majorVersion, 'minor':minorVersion}, flags, headerSize, frames))
          })
        })
      }
    })
  })
}

function readFrames(file, tagSize, callback) {
  var frames = []
                //v-- like compose, but correct order
  var fn = async.seq(
    async.apply(readFrame, file), 
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


function readFrame(file, callback) {
  var buffer = new Buffer(10)
  file.read(buffer, 0, 10, function(err, bytesRead) {
    if (err)
      return process.nextTick(function() { callback(err) })
    if (bytesRead < 10)
      return process.nextTick(function() { callback("Can't read ID3 frame header!") })

    var id = buffer.toString('ASCII', 0, 4)
    var size = buffer.readUInt32BE(4)
    var flags = buffer.readUInt16BE(8)
    var pos = file.pos

    file.seek(size)

    process.nextTick(function() { callback(null, { 
      id:id,           //Four character frame id
      data: new Data(file, pos, size), //Frame content reference
      flags:flags      //Frame header flags
    })})
  })
}