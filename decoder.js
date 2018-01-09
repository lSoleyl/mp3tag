/** This module defines the decoder/encoder class, which gets set to the tagdata.decoder property and provides
 *  framedecoding and -encoding method based on the tags version.
 */ 

var cp = require('./cp')
var _ = require('lodash')

var Data = require('./data')

/** List of unicode encodings supported as text encoding
 */
var UCEncodings = [
  {encoding:'UTF-16LE', bom:[0xFF, 0xFE], dbe:true}, //dbe = double-byte-encoding
  {encoding:'UTF-16BE', bom:[0xFE, 0xFF], dbe:true},
  {encoding:'UTF-8',    bom:[0xEF, 0xBB, 0xBF], dbe:false},
  {encoding:'UTF-8',    bom:[], dbe:false} //Empty bom sets the default codepage
]

/** Defines the default encoding for the encodeString method
 */
var DEFAULT_ENCODINGS = {
  3: _.defaults({encodingByte:0x01}, UCEncodings[0]),  //UTF-16LE with bom
  4: _.defaults({encodingByte:0x03}, UCEncodings[3])   //UTF-8 without bom
}


/** Creates a new decoder for the given tag version
 */ 
function Decoder(version) {
  this.version = version.major
}

/** This method decodes the given buffer into a js string.
 *
 * @param buffer the buffer to decode (the first byte is the encoding byte)
 *
 * @return the decoded string
 */ 
Decoder.prototype.decodeString = function(buffer) {
  if (!(buffer instanceof Buffer)) {
    throw new Error("Expected buffer, got: " + typeof(buffer) + " - " + util.inspect(buffer, {showHidden:true}))
  }

  var data = buffer.slice(1)
  try {
    return internal.decodeString(this, data, buffer[0])
  } catch(e) {
    throw new Error("Unsupported buffer encoding: " + buffer.inspect())
  }
}

/** Decodes a comment frame buffer into a structure of {language,short,long}
 *
 * @param buffer the buffer of the comment frame to decode
 *
 * @return the decoded comment object
 */
Decoder.prototype.decodeComment = function(buffer) {
  if (!(buffer instanceof Buffer)) {
    throw new Error("Expected buffer, got: " + typeof(buffer) + " - " + util.inspect(buffer, {showHidden:true}))
  }


  var encodingByte = buffer[0]
  var language = buffer.toString('ascii', 1, 3)
  var data = buffer.slice(4)
  
  try {
    this.getBufferEncoding(data, encodingByte)
  } catch (e) {
    throw new Error("Unsupported buffer encoding: " + buffer.inspect())
  }

  var cData = internal.decodeCString(this, data, encodingByte) //TODO try catch other error

  var shortComment = cData.string
  var longComment = internal.decodeString(this, data.slice(cData.pastNullPos))

  return {
    language:language,
    short:shortComment,
    long:longComment
  }
}

/** Decodes the popularity object from the given frame buffer.
 *
 * @param buffer the buffer to decode
 *
 * @return {email,rating,playCount}
 */
Decoder.prototype.decodePopularity = function(buffer) { 
                                    //v-- no unicode support for email
  var email = internal.decodeCString(this, buffer, 0x00)
  var rating = buffer[email.pastNullPos]
  var offset = email.pastNullPos + 1
  var played = internal.decodeNumberBE(buffer, offset, buffer.length - offset)

  return {
    email:email.string,
    rating:rating,
    playCount:played
  }
}

Decoder.prototype.decodePicture = function(buffer) {
  if (!(buffer instanceof Buffer)) {
    throw new Error("Expected buffer, got: " + typeof(buffer) + " - " + util.inspect(buffer, {showHidden:true}))
  }

  var encodingByte = buffer[0]

  var dataBuffer = buffer.slice(1)         //v-- MIME will always be ISO-8895-1
  var mimeData = internal.decodeCString(this, dataBuffer, 0x00)
  var mimeType = mimeData.string
  var pictureType = dataBuffer[mimeData.pastNullPos]
  var descriptionBuffer = dataBuffer.slice(mimeData.pastNullPos + 1)
  var descData = internal.decodeCString(this, descriptionBuffer, encodingByte)
  var description = descData.string
  var pictureData = descriptionBuffer.slice(descData.pastNullPos)

  return {
    mimeType: mimeType,      //String
    pictureType: pictureType,//Integer
    description: description,//String
    pictureData: new Data(pictureData) //BufferData
  }
}

/** Returns the encoding for the given buffer and encodingByte
 *  If no encodingByte is passed the encoding is being guessed by searching the buffer
 *  for a BOM.
 *
 * @param buffer the buffer (not containing the encodingByte)
 * @param encodingByte optional encoding byte, which specifies the buffer's encoding
 *
 * @return an encoding {encoding:string, bom:array[byte], dbe:bool} which describes the detected 
 *         buffer encoding
 */
Decoder.prototype.getBufferEncoding = function(buffer, encodingByte) {
  if (encodingByte === undefined)
    encodingByte = 0x01 //Default is unicode if not passed

  if (encodingByte === 0x00) //ISO-8895-1 encoding
    return {encoding:'ISO-8895-1', bom:[], dbe:false}

  if (encodingByte === 0x01) { //UC (search for BOM and look up)
    return _.find(UCEncodings, function(encoding) {
      for(var c = 0; c < encoding.bom.length; ++c) {
        if (buffer[c] !== encoding.bom[c]) 
          return false
      }

      return true
    })
  }

  if (this.version >= 4) { //New encodings added with 2.4
    if (encodingByte === 0x02)
      return {encoding:'UTF-16BE', bom:[], dbe:true} //UTF-16BE without BOM

    if (encodingByte === 0x03)
      return {encoding:'UTF-8', bom:[], dbe:false}
  }

  throw new Error("Unknown encoding byte: '" + encodingByte + "'")
}


/** Encodes the given string into a buffer with the default encoding, which is
 *  UTF-16LE for v2.3 and UTF-8 for v2.4.
 *
 * @param string the string to encode
 *
 * @return the encoded buffer
 */
Decoder.prototype.encodeString = function(string) {
  if (!(typeof string == "string"))
      throw new Error("Expected string, got: " + typeof(string) + " - " + util.inspect(string, {showHidden:true}))

    var encoding = DEFAULT_ENCODINGS[this.version];
    var bomBuf = internal.encodeString(string, encoding)

    var result = new Buffer(bomBuf.length+1)
    result[0] = encoding.encodingByte //set appropriate encoding byte
    bomBuf.copy(result,1)
    return result
}


////
//  INTERNAL HELPER FUNCTIONS
//
//  not implemented as method to not overload the decoder's interface
////

var internal = {}


/** Same as decodeCString, but this string isn't zero terminated. The whole
 *  buffer is treated as string.
 * 
 * @param decoder the decoder to use for the decoding operation
 * @param buffer the buffer to read from
 * @param encodingByte the byte which specifies, which encoding to use
 *
 * @return decoded string
 */
internal.decodeString = function(decoder, buffer, encodingByte) {
  var encoding = decoder.getBufferEncoding(buffer, encodingByte)
  return cp.fromBuffer(buffer.slice(encoding.bom.length), encoding.encoding)
}


/** Receives a zero terminated buffer to decode from and the encoding byte
 *  
 * @param decoder the decoder to use for this operation
 * @param buffer the buffer to read the string from
 * @param encodingByte the byte, which specifies encoding
 *
 * @return returns {string,nullPos,pastNullPos}
 */
internal.decodeCString = function(decoder, buffer, encodingByte) {
  var encoding = decoder.getBufferEncoding(buffer, encodingByte)

  var result = {}
  result.nullPos = internal.getStringEndPos(buffer, encoding.dbe)

  if (result.nullPos == -1)
    throw new Error("Expected NULL terminated string, missing NULL byte(s), with encoding: " + encoding.encoding)

  result.pastNullPos = result.nullPos + (encoding.dbe ? 2 : 1)

  var contentslice = buffer.slice(encoding.bom.length, result.nullPos - encoding.bom.length)
  
  result.string = cp.fromBuffer(contentslice, encoding.encoding)
  return result
}


/** Encodes the string into a buffer with the encoding's BOM.
 *  The encodingByte won't be written into the buffer as this is format specific.
 *  
 * @param string the string to encode
 * @param encoding{encoding,bom,dbe} the encoding object, which represents the encoding to use
 *
 * @return the buffer with the encoded string
 */
internal.encodeString = function(string, encoding) {
  var strBuffer = cp.fromString(string, encoding.encoding)
  var result = new Buffer(strBuffer.length+encoding.bom.length)

  for(var c = 0; c < encoding.bom.length; ++c)
    result[c] = encoding.bom[c]

  strBuffer.copy(result, encoding.bom.length)
  return result
}


/** Returns the offset of the NULL (double-)byte inside a string buffer
 *
 * @param buffer the buffer to search
 * @param isDoubleNull if true, the function treats the byte buffer like a two byte encoding
 */
internal.getStringEndPos = function(buffer, isDoubleNull) {
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

internal.decodeNumberBE = function(buffer, offset, bytes) {
  var result = 0
  for(var c = offset; c < offset + bytes; ++c) {
    result = ((result << 8) | buffer[c]) //Decode big endian number
  }
  return result
}



module.exports = Decoder
