/** This module defines the decoder/encoder class, which gets set to the tagdata.decoder property and provides
 *  framedecoding and -encoding method based on the tags version.
 */ 

const util = require('util');

const cp = require('./cp');
const _ = require('lodash');

const Data = require('./data');

/** List of unicode encodings supported as text encoding
 */
const UCEncodings = [
  {encoding:'UTF-16LE', bom:[0xFF, 0xFE], dbe:true}, //dbe = double-byte-encoding
  {encoding:'UTF-16BE', bom:[0xFE, 0xFF], dbe:true},
  {encoding:'UTF-8',    bom:[0xEF, 0xBB, 0xBF], dbe:false},
  {encoding:'UTF-8',    bom:[], dbe:false} //Empty bom sets the default codepage
];

/** Defines the default encoding for the encodeString method
 */
const DEFAULT_ENCODINGS = {
  3: _.defaults({encodingByte:0x01}, UCEncodings[0]),  //UTF-16LE with bom
  4: _.defaults({encodingByte:0x03}, UCEncodings[3])   //UTF-8 without bom
};


/** Decoder class, used to de- and encode frames
 */
class Decoder {
  /** Creates a new decoder for the given tag version
   */ 
  constructor(version) {
    this.version = version.major;
  }

  /** This method decodes the given buffer into a js string.
   *
   * @param buffer the buffer to decode (the first byte is the encoding byte)
   *
   * @return the decoded string
   */ 
  decodeString(buffer) {
    if (!(buffer instanceof Buffer)) {
      throw new Error(`Expected buffer, got: ${typeof(buffer)} - ${util.inspect(buffer, {showHidden:true})}`);
    }

    var data = buffer.slice(1);
    try {
      return internal.decodeString(this, data, buffer[0]);
    } catch(e) {
      throw new Error(`Unsupported buffer encoding: ${buffer.inspect()}`);
    }
  }

  /** Decodes a comment frame buffer into a structure of {language,short,long}
   *
   * @param buffer the buffer of the comment frame to decode
   *
   * @return the decoded comment object
   */
  decodeComment(buffer) {
    if (!(buffer instanceof Buffer)) {
      throw new Error(`Expected buffer, got: ${typeof(buffer)} - ${util.inspect(buffer, {showHidden:true})}`);
    }


    const encodingByte = buffer[0];
    const language = buffer.toString('ascii', 1, 4); // the language code has acutally 3 characters!
    const data = buffer.slice(4);
    
    try {
      this.getBufferEncoding(data, encodingByte);
    } catch (e) {
      throw new Error(`Unsupported buffer encoding: ${buffer.inspect()}`);
    }

    const cData = internal.decodeCString(this, data, encodingByte); //TODO try catch other error

    const shortComment = cData.string;
    const longComment = internal.decodeString(this, data.slice(cData.pastNullPos));

    return {
      language:language,
      short:shortComment,
      long:longComment
    };
  }

  /** Encodes the given comment object back into a buffer
   *  
   * @param comment a comment object {language,short,long}
   * 
   * @return the encoded buffer
   */
  encodeComment(comment) {
    const encoding = DEFAULT_ENCODINGS[this.version];

    const shortComment = internal.encodeCString(comment.short, encoding);
    const longComment = internal.encodeString(comment.long, encoding);
    

    const result = Buffer.alloc(4 + shortComment.length + longComment.length);
    result[0] = encoding.encodingByte; // set appropriate encoding byte
    result.write(comment.language.substr(0,3).padEnd(3), 1, 3, 'ascii');
    
    shortComment.copy(result, 4);
    longComment.copy(result, 4+shortComment.length);

    return result;
  }

  /** Decodes the popularity object from the given frame buffer.
   *
   * @param buffer the buffer to decode
   *
   * @return {email,rating,playCount}
   */
  decodePopularity(buffer) { 
                                      //v-- no unicode support for email
    const email = internal.decodeCString(this, buffer, 0x00);
    const rating = buffer[email.pastNullPos];
    const offset = email.pastNullPos + 1;
    const played = internal.decodeNumberBE(buffer, offset, buffer.length - offset);

    return {
      email:email.string,
      rating:rating,
      playCount:played
    }
  }

  decodePicture(buffer) {
    if (!(buffer instanceof Buffer)) {
      throw new Error(`Expected buffer, got: ${typeof(buffer)} - ${util.inspect(buffer, {showHidden:true})}`);
    }

    const encodingByte = buffer[0];

    const dataBuffer = buffer.slice(1);         //v-- MIME will always be ISO-8895-1
    const mimeData = internal.decodeCString(this, dataBuffer, 0x00);
    const mimeType = mimeData.string;
    const pictureType = dataBuffer[mimeData.pastNullPos];
    const descriptionBuffer = dataBuffer.slice(mimeData.pastNullPos + 1);
    const descData = internal.decodeCString(this, descriptionBuffer, encodingByte);
    const description = descData.string;
    const pictureData = descriptionBuffer.slice(descData.pastNullPos);

    return {
      mimeType: mimeType,      //String
      pictureType: pictureType,//Integer
      description: description,//String
      pictureData: new Data(pictureData) //BufferData
    };
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
  getBufferEncoding(buffer, encodingByte) {
    if (encodingByte === undefined) {
      encodingByte = 0x01; // Default is unicode if not passed
    }

    if (encodingByte === 0x00) { // ISO-8895-1 encoding
      return {encoding:'ISO-8895-1', bom:[], dbe:false};
    }

    if (encodingByte === 0x01) { // UC (search for BOM and look up)
      return _.find(UCEncodings, (encoding) => {
        for (let c = 0; c < encoding.bom.length; ++c) {
          if (buffer[c] !== encoding.bom[c]) {
            return false;
          }
        }

        return true;
      });
    }

    if (this.version >= 4) { //New encodings added with 2.4
      if (encodingByte === 0x02) {
        return {encoding:'UTF-16BE', bom:[], dbe:true}; // UTF-16BE without BOM
      }

      if (encodingByte === 0x03) {
        return {encoding:'UTF-8', bom:[], dbe:false};
      }
    }

    throw new Error(`Unknown encoding byte: '${encodingByte}'`);
  }


  /** Encodes the given string into a buffer with the default encoding, which is
   *  UTF-16LE for v2.3 and UTF-8 for v2.4.
   *
   * @param string the string to encode
   *
   * @return the encoded buffer
   */
  encodeString(string) {
    if (typeof(string) !== "string") {
        throw new Error(`Expected string, got: ${typeof(string)} - ${util.inspect(string, {showHidden:true})}`);
    }

      const encoding = DEFAULT_ENCODINGS[this.version];
      const bomBuf = internal.encodeString(string, encoding);

      const result = Buffer.alloc(bomBuf.length+1);
      result[0] = encoding.encodingByte; //set appropriate encoding byte
      bomBuf.copy(result, 1);
      return result;
  }
}


////
//  INTERNAL HELPER FUNCTIONS
//
//  not implemented as method to not overload the decoder's interface
////

const internal = {};


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
  const encoding = decoder.getBufferEncoding(buffer, encodingByte);
  return cp.fromBuffer(buffer.slice(encoding.bom.length), encoding.encoding);
};


/** Receives a zero terminated buffer to decode from and the encoding byte
 *  
 * @param decoder the decoder to use for this operation
 * @param buffer the buffer to read the string from
 * @param encodingByte the byte, which specifies encoding
 *
 * @return returns {string,nullPos,pastNullPos}
 */
internal.decodeCString = function(decoder, buffer, encodingByte) {
  const encoding = decoder.getBufferEncoding(buffer, encodingByte);

  const result = {};
  result.nullPos = internal.getStringEndPos(buffer, encoding.dbe);

  if (result.nullPos === -1) {
    throw new Error("Expected NULL terminated string, missing NULL byte(s), with encoding: " + encoding.encoding);
  }

  result.pastNullPos = result.nullPos + (encoding.dbe ? 2 : 1);

  const contentSlice = buffer.slice(encoding.bom.length, result.nullPos);
  
  result.string = cp.fromBuffer(contentSlice, encoding.encoding);
  return result;
};


/** Encodes the string into a buffer with the encoding's BOM.
 *  The encodingByte won't be written into the buffer as this is format specific.
 *  
 * @param string the string to encode
 * @param encoding{encoding,bom,dbe} the encoding object, which represents the encoding to use
 *
 * @return the buffer with the encoded string
 */
internal.encodeString = function(string, encoding) {
  const strBuffer = cp.fromString(string, encoding.encoding);
  const result = Buffer.alloc(strBuffer.length+encoding.bom.length);

  for (let c = 0; c < encoding.bom.length; ++c) {
    result[c] = encoding.bom[c];
  }

  strBuffer.copy(result, encoding.bom.length);
  return result;
};

/** Encodes the string into a buffer with the encoding's BOM and terminates the string with a NULL character.
 *  The encodingByte won't be written into the buffer as this is format specific.
 *  
 * @param string the string to encode
 * @param encoding{encoding,bom,dbe} the encoding object, which represents the encoding to use
 *
 * @return the buffer with the encoded string
 */
internal.encodeCString = function(string, encoding) {
  return internal.encodeString(string+'\0', encoding);
};


/** Returns the offset of the NULL (double-)byte inside a string buffer
 *
 * @param buffer the buffer to search
 * @param isDoubleNull if true, the function treats the byte buffer like a two byte encoding
 */
internal.getStringEndPos = function(buffer, isDoubleNull) {
  for (let c = 0; c < buffer.length; ++c) {
    if (buffer[c] == 0x00 && !isDoubleNull)  {
      return c;
    } else if (buffer[c] == 0x00 && buffer[c+1] == 0x00 && isDoubleNull) {
      return c;
    }

    if (isDoubleNull) {
      ++c; // Additional increment if double byte NULL is expected
    }
  }

  return -1; //Not found
};

internal.decodeNumberBE = function(buffer, offset, bytes) {
  let result = 0;
  for (let c = offset; c < offset + bytes; ++c) {
    result = ((result << 8) | buffer[c]); // Decode big endian number
  }
  return result;
};



module.exports = Decoder;
