/** Codepage conversion module.
 *  decodes strings from buffers, and encodes strings into buffers.
 *  
 *  BOMs are not generated...
 */
var _ = require('lodash');

module.exports = {
  /**
   * @param {Buffer} buffer the buffer to decode
   * @param {string} encoding the name of the buffer's encoding
   * 
   * @return {string} the decoded string
   */
  fromBuffer: function(buffer, encoding) {
    encoding = String(encoding).toLowerCase();
    const decoder = from[encoding];
    if (!decoder) {
      throw new Error("Unsupported encoding: '" + encoding + "'");
    }

    return decoder(buffer);
  },

  /**
   * @param {string} string the string to encode
   * @param {string} encoding the encoding to use
   * 
   * @return {Buffer} the string encoded in the specified encoding
   */
  fromString: function(string, encoding) { 
    encoding = String(encoding).toLowerCase();
    let encoder = to[encoding];
    if (!encoder) {
      throw new Error("Unsupported encoding: '" + encoding + "'");
    }

    return encoder(string);
  }
}


const from = {
  /**
   * @param {Buffer} buffer the buffer to decode into a string
   * 
   * @return {string} the decoded string
   */
  "iso-8895-1": function(buffer) {
    let result = "";
    _.each(buffer, function(byte) {
      result += String.fromCharCode(byte)
    });
    return result;
  },

  /**
   * @param {Buffer} buffer the buffer to decode into a string
   * 
   * @return {string} the decoded string
   */
  "utf-16le": function(buffer) { 
    return buffer.toString('utf16le'); 
  },

  /**
   * @param {Buffer} buffer the buffer to decode into a string
   * 
   * @return {string} the decoded string
   */
  "utf-16be": function(buffer) {
    const bufferLE = Buffer.alloc(buffer.length);

    //Copy the passed buffer into bufferLE while swapping the bytes, making it a LE buffer
    for(var c = 0; c < buffer.length; ++c) {
      if (c % 2 == 0) {
        bufferLE[c+1] = buffer[c];
      } else {
        bufferLE[c-1] = buffer[c];
      }
    }

    //Now we can use our LE conversion
    return from["uft-16le"](bufferLE);
  },

  /**
   * @param {Buffer} buffer the buffer to decode into a string
   * 
   * @return {string} the decoded string
   */
  "utf-8": function(buffer) { 
    return buffer.toString('utf8');
  }
};


const to = {
  "utf-16le": function(string) { return Buffer.from(string, 'utf16le'); },
  "utf-8": function(string) { return Buffer.from(string, 'utf8'); }
};
