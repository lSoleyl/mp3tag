/** This module defines the decoder/encoder class, which gets set to the tagdata.decoder property and provides
 *  framedecoding and -encoding method based on the tags version.
 */ 

var cp = require('./cp')

/** List of unicode encodings supported as text encoding
 */
var UCEncodings = [
  {encoding:'UTF-16LE', bom:[0xFF, 0xFE], dbe:true}, //dbe = double-byte-encoding
  {encoding:'UTF-16BE', bom:[0xFE, 0xFF], dbe:true},
  {encoding:'UTF-8',    bom:[0xEF, 0xBB, 0xBF], dbe:false},
  {encoding:'UTF-8',    bom:[], dbe:false} //Empty bom sets the default codepage
]


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
    var encoding = this.getBufferEncoding(data, buffer[0])
    return cp.fromBuffer(data.slice(encoding.bom.length), encoding.encoding)
  } catch(e) {
    throw new Error("Unsupported buffer encoding: " + buffer.inspect())
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


//TODO move missing methods (decodeComment, decodePicture, encodeString, ...)



module.exports = Decoder
