/** This module defines the decoder/encoder class, which gets set to the tagdata.decoder property and provides
 *  framedecoding and -encoding method based on the tags version.
 */ 

import * as _ from 'lodash';
import * as util from 'util';
import { Data } from './data';
import { Encoding as EncodingName, SourceEncoding, TargetEncoding } from './cp';
import * as cp from './cp';


export interface Comment {
  language: string;
  short:string;
  long: string;
}

export interface Populatrity {
  email: string;
  rating: number;
  playCount: number;
}

export interface Picture {
  mimeType: string;
  pictureType: number;
  description: string;
  pictureData: Data;
}


enum EncodingIdentifier {
  ISO_8895_1 = 'ISO-8895-1',
  UTF_16_LE_BOM = 'UTF-16LE-BOM',
  UTF_16_BE_BOM = 'UTF-16BE-BOM',
  UTF_8_BOM = 'UTF-8-BOM',
  UTF_8 = 'UTF-8'
}



//TODO: Change name to extends SupportedEncodings
class Encoding<Name extends EncodingName> {
  /**
   * @param name the name of the encoding
   * @param bom array of BOM bytes
   * @param dbe true if double-byte encoding (terminated wit 0x00 0x00)
   * @param encodingByte optional encoding byte used for identification
   */
  constructor(public name:Name, public bom:number[], public dbe: boolean, public encodingByte?: number) {}

  static [EncodingIdentifier.ISO_8895_1] = new Encoding(EncodingName.ISO_8895_1, [], false, 0x00);
  static [EncodingIdentifier.UTF_16_LE_BOM] = new Encoding(EncodingName.UTF_16LE, [0xFF, 0xFE], true, 0x01);
  static [EncodingIdentifier.UTF_16_BE_BOM] = new Encoding(EncodingName.UTF_16BE, [0xFE, 0xFF], true);
  static [EncodingIdentifier.UTF_8_BOM] = new Encoding(EncodingName.UTF_8, [0xEF, 0xBB, 0xBF], false);
  static [EncodingIdentifier.UTF_8] = new Encoding(EncodingName.UTF_8, [], false, 0x03);
}





/** List of unicode encodings supported as text encoding
 */
const UCEncodings = [
  Encoding[EncodingIdentifier.UTF_16_LE_BOM],
  Encoding[EncodingIdentifier.UTF_16_BE_BOM],
  Encoding[EncodingIdentifier.UTF_8_BOM],
  Encoding[EncodingIdentifier.UTF_8] // Empty bom sets the default codepage
];



/** Defines the default encoding for the encodeString method
 */
const DEFAULT_ENCODINGS = {
  3: Encoding[EncodingIdentifier.UTF_16_LE_BOM],
  4: Encoding[EncodingIdentifier.UTF_8]
};


/** Decoder class, used to de- and encode frames
 */
export class Decoder {
  private version: number; // major version of tagData

  /** Creates a new decoder for the given tag version
   */ 
  constructor(version: Version) {
    this.version = version.major;
  }

  /** This method decodes the given buffer into a js string.
   *
   * @param buffer the buffer to decode (the first byte is the encoding byte)
   *
   * @return the decoded string
   */ 
  decodeString(buffer: Buffer) {
    if (!(buffer instanceof Buffer)) {
      throw new Error(`Expected buffer, got: ${typeof(buffer)} - ${util.inspect(buffer, {showHidden:true})}`);
    }

    const data = buffer.subarray(1);
    try {
      return internal.decodeString(this, data, buffer[0]);
    } catch(err) {
      throw new Error(`Unsupported buffer encoding: ${util.inspect(buffer)}`);
    }
  }

  /** Decodes a comment frame buffer into a structure of {language,short,long}
   *
   * @param buffer the buffer of the comment frame to decode
   *
   * @return the decoded comment object
   */
  decodeComment(buffer: Buffer): Comment {
    if (!(buffer instanceof Buffer)) {
      throw new Error(`Expected buffer, got: ${typeof(buffer)} - ${util.inspect(buffer, {showHidden:true})}`);
    }


    const encodingByte = buffer[0];
    const language = buffer.toString('ascii', 1, 4); // the language code has acutally 3 characters!
    const data = buffer.subarray(4);
    
    try {
      this.getBufferEncoding(data, encodingByte);
    } catch (e) {
      throw new Error(`Unsupported buffer encoding: ${util.inspect(buffer)}`);
    }

    const cData = internal.decodeCString(this, data, encodingByte); //TODO try catch other error

    const shortComment = cData.string;
    const longComment = internal.decodeString(this, data.subarray(cData.pastNullPos));

    return {
      language:language,
      short:shortComment,
      long:longComment
    };
  }

  /** Encodes the given comment object back into a buffer
   *  
   * @param comment the comment object to encode
   * 
   * @return the encoded buffer
   */
  encodeComment(comment: Comment) {
    const encoding = DEFAULT_ENCODINGS[this.version];

    const shortComment = internal.encodeCString(comment.short, encoding);
    const longComment = internal.encodeString(comment.long, encoding);
    

    const result = Buffer.alloc(4 + shortComment.length + longComment.length);
    result[0] = encoding.encodingByte; // set appropriate encoding byte
    result.write(comment.language.substring(0,3).padEnd(3), 1, 3, 'ascii');
    
    shortComment.copy(result, 4);
    longComment.copy(result, 4+shortComment.length);

    return result;
  }

  /** Decodes the popularity object from the given frame buffer.
   *
   * @param buffer the buffer to decode the popularity from
   *
   * @return the decoded popularity
   */
  decodePopularity(buffer: Buffer): Populatrity { 
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

  /**
   * @param buffer the buffer to decode the buffer from
   * 
   * @return the pictue object
   */
  decodePicture(buffer: Buffer): Picture {
    if (!(buffer instanceof Buffer)) {
      throw new Error(`Expected buffer, got: ${typeof(buffer)} - ${util.inspect(buffer, {showHidden:true})}`);
    }

    const encodingByte = buffer[0];

    const dataBuffer = buffer.subarray(1);                    //v-- MIME will always be ISO-8895-1
    const mimeData = internal.decodeCString(this, dataBuffer, 0x00);
    const mimeType = mimeData.string;
    const pictureType = dataBuffer[mimeData.pastNullPos];
    const descriptionBuffer = dataBuffer.subarray(mimeData.pastNullPos + 1);
    const descData = internal.decodeCString(this, descriptionBuffer, encodingByte);
    const description = descData.string;
    const pictureData = descriptionBuffer.subarray(descData.pastNullPos);

    return {
      mimeType: mimeType,       // String
      pictureType: pictureType, // Integer
      description: description, // String
      pictureData: new Data(pictureData) // BufferData
    };
  }

  /** Encodes the given picture data into a Buffer
   * 
   * @param {Picture} picture the picture information in the same format as returned by decodePicture
   * 
   * @return {Buffer} encoded picture data
   */
  encodePicture(picture: Picture) {
    const defaultEncoding = DEFAULT_ENCODINGS[this.version];

    const frameBuffers = [ 
      Buffer.alloc(1, defaultEncoding.encodingByte),
      internal.encodeCString(picture.mimeType, Encoding[EncodingIdentifier.ISO_8895_1]), // mime is always encoded in ISO-8895-1
      Buffer.alloc(1, picture.pictureType),
      internal.encodeCString(picture.description, defaultEncoding),
      picture.pictureData.toBuffer()
    ];
    
    // Return the resulting buffer
    return Buffer.concat(frameBuffers);
  }

  /** Returns the encoding for the given buffer and encodingByte
   *  If no encodingByte is passed the encoding is being guessed by searching the buffer
   *  for a BOM.
   *
   * @param buffer the buffer (not containing the encodingByte)
   * @param encodingByte optional encoding byte, which specifies the buffer's encoding
   *
   * @return an encoding, which describes the detected buffer encoding
   */
  getBufferEncoding(buffer: Buffer, encodingByte?: number) {
    if (encodingByte === undefined) {
      encodingByte = 0x01; // Default is unicode if not passed
    }

    if (encodingByte === 0x00) { // ISO-8895-1 encoding
      return Encoding[EncodingIdentifier.ISO_8895_1];
    }

    if (encodingByte === 0x01) { // UC (search for BOM and look up)
      return _.find(UCEncodings, (encoding) => {
        for (let c = 0; c < encoding.bom.length; ++c) {
          if (buffer[c] !== encoding.bom[c]) {
            return false;
          }
        }

        return true;
      })!; // ! tells TS that the resull cannot be undefined, because the last UC-encoding has an empty BOM, so it will always match
    }

    if (this.version >= 4) { // New encodings added with 2.4
      if (encodingByte === 0x02) {
        return new Encoding(EncodingName.UTF_16BE, [], true); // UTF-16BE without BOM
      }

      if (encodingByte === 0x03) {
        return new Encoding(EncodingName.UTF_8, [], false);
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
  encodeString(string: string) {
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

type DecodedCString = {string:string, nullPos: number, pastNullPos:number};

const internal = {

  /** Same as decodeCString, but this string isn't zero terminated. The whole
   *  buffer is treated as string.
   * 
   * @param decoder the decoder to use for the decoding operation
   * @param buffer the buffer to read from
   * @param encodingByte optional byte which specifies, which encoding to use
   *
   * @return decoded string
   */
  decodeString: function(decoder: Decoder, buffer: Buffer, encodingByte?: number) {
    const encoding = decoder.getBufferEncoding(buffer, encodingByte);
    return cp.decodeBuffer(buffer.subarray(encoding.bom.length), encoding.name);
  },
  

  /** Receives a zero terminated buffer to decode from and the encoding byte
   *  
   * @param decoder the decoder to use for this operation
   * @param buffer the buffer to read the string from
   * @param encodingByte the byte, which specifies encoding
   *
   * @return the decoded string object
   */
  decodeCString: function(decoder: Decoder, buffer: Buffer, encodingByte: number) : DecodedCString {
    const encoding = decoder.getBufferEncoding(buffer, encodingByte);

    
    const nullPos = internal.getStringEndPos(buffer, encoding.dbe);

    if (nullPos === -1) {
      throw new Error(`Expected NULL terminated string, missing NULL byte(s), with encoding: ${encoding.name}`);
    }

    const pastNullPos = nullPos + (encoding.dbe ? 2 : 1);
    const contentSlice = buffer.subarray(encoding.bom.length, nullPos);
    const string = cp.decodeBuffer(contentSlice, encoding.name);

    return {
      string,
      nullPos,
      pastNullPos      
    };
  },


  /** Encodes the string into a buffer with the encoding's BOM.
   *  The encodingByte won't be written into the buffer as this is format specific.
   *  
   * @param string the string to encode
   * @param encoding the encoding object, which represents the encoding to use
   *
   * @return the buffer with the encoded string
   */
  encodeString: function<Name extends TargetEncoding>(string: string, encoding: Encoding<Name>) {
    const strBuffer = cp.encodeString(string, encoding.name);
    const result = Buffer.alloc(strBuffer.length+encoding.bom.length);

    for (let c = 0; c < encoding.bom.length; ++c) {
      result[c] = encoding.bom[c];
    }

    strBuffer.copy(result, encoding.bom.length);
    return result;
  },

  /** Encodes the string into a buffer with the encoding's BOM and terminates the string with a NULL character.
   *  The encodingByte won't be written into the buffer as this is format specific.
   *  
   * @param string the string to encode
   * @param encoding the encoding object, which represents the encoding to use
   *
   * @return the buffer with the encoded string
   */
  encodeCString: function<Name extends TargetEncoding>(string: string, encoding: Encoding<Name>) {
    return internal.encodeString(string+'\0', encoding);
  },


  /** Returns the offset of the NULL (double-)byte inside a string buffer
   *
   * @param buffer the buffer to search
   * @param isDoubleNull if true, the function treats the byte buffer like a two byte encoding
   * 
   * @return returns the endpos
   */
  getStringEndPos: function(buffer: Buffer, isDoubleNull: boolean) {
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
  },

  /**
   * @param buffer the buffer to decode the number from
   * @param offset the offset to start decoding the number from
   * @param bytes the number of bytes which encode the number
   * 
   * @return the decoded number
   */
  decodeNumberBE: function(buffer: Buffer, offset: number, bytes: number) {
    let result = 0;
    for (let c = offset; c < offset + bytes; ++c) {
      result = ((result << 8) | buffer[c]); // Decode big endian number
    }
    return result;
  }
};
