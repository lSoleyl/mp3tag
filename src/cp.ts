/** Codepage conversion module.
 *  decodes strings from buffers, and encodes strings into buffers.
 *  
 *  BOMs are not generated...
 */

export enum Encoding {
  ISO_8895_1 = 'ISO-8895-1',
  UTF_16LE = 'UTF-16LE',
  UTF_16BE = 'UTF-16BE',
  UTF_8 = 'UTF-8'
}

// All supported buffer->string encodings
export type SourceEncoding = Encoding.ISO_8895_1 | Encoding.UTF_16LE | Encoding.UTF_16BE | Encoding.UTF_8;

// All supported string->buffer encodings
export type TargetEncoding = Encoding.ISO_8895_1 | Encoding.UTF_16LE | Encoding.UTF_8;


/**
 * @param buffer the buffer to decode
 * @param encoding the name of the buffer's encoding
 * 
 * @return the decoded string
 */
export function decodeBuffer<T extends SourceEncoding>(buffer: Buffer, encoding: T) {
  const decoder = from[encoding];
  if (!decoder) {
    throw new Error(`Unsupported encoding: '${encoding}'`);
  }

  return decoder(buffer);
}


/**
 * @param string the string to encode
 * @param encoding the encoding to use
 * 
 * @return {Buffer} the string encoded in the specified encoding
 */
export function encodeString<T extends TargetEncoding>(string: string, encoding: T) { 
  const encoder = to[encoding];
  if (!encoder) {
    throw new Error(`Unsupported encoding: '${encoding}'`);
  }

  return encoder(string);
}


const from = {
  /**
   * @param buffer the buffer to decode into a string
   * 
   * @return the decoded string
   */
  [Encoding.ISO_8895_1]: function(buffer: Buffer) {
    let result = "";
    buffer.forEach(byte => {
      result += String.fromCharCode(byte)
    });
    return result;
  },

  /**
   * @param buffer the buffer to decode into a string
   * 
   * @return the decoded string
   */
  [Encoding.UTF_16LE]: (buffer: Buffer) => buffer.toString('utf16le'),

  /**
   * @param buffer the buffer to decode into a string
   * 
   * @return the decoded string
   */
  [Encoding.UTF_16BE]: function(buffer: Buffer) {
    const bufferLE = Buffer.alloc(buffer.length);

    // Copy the passed buffer into bufferLE while swapping the bytes, making it a LE buffer
    for(let c = 0; c < buffer.length; ++c) {
      if (c % 2 == 0) {
        bufferLE[c+1] = buffer[c];
      } else {
        bufferLE[c-1] = buffer[c];
      }
    }

    // Now we can use our LE conversion
    return from[Encoding.UTF_16LE](bufferLE);
  },

  /**
   * @param buffer the buffer to decode into a string
   * 
   * @return the decoded string
   */
  [Encoding.UTF_8]: (buffer: Buffer) => buffer.toString('utf8')
};


const to = {
  [Encoding.UTF_16LE]: (string: string) => Buffer.from(string, 'utf16le'),
  [Encoding.UTF_8]: (string: string) => Buffer.from(string, 'utf8'),
  [Encoding.ISO_8895_1]: (string: string) => Buffer.from(string, 'latin1')
};
