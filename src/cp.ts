/** Codepage conversion module.
 *  decodes strings from buffers, and encodes strings into buffers.
 *  
 *  BOMs are not generated...
 */
import * as _ from 'lodash';


enum SourceEncoding {
  ISO8895_1 = 'iso-8895-1',
  UTF_16LE = 'utf-16le',
  UTF_16BE = 'utf-16be',
  UTF_8 = 'utf-8'
}


/**
 * @param buffer the buffer to decode
 * @param encoding the name of the buffer's encoding
 * 
 * @return the decoded string
 */
export function fromBuffer<T extends string>(buffer: Buffer, encoding: Lowercase<T> extends SourceEncoding ? T : SourceEncoding) {
  const sourceEncoding = String(encoding).toLowerCase() as SourceEncoding;
  const decoder = from[sourceEncoding];
  if (!decoder) {
    throw new Error(`Unsupported encoding: '${encoding}'`);
  }

  return decoder(buffer);
}

enum TargetEncoding {
  ISO8895_1 = 'iso-8895-1',
  UTF_16LE = 'utf-16le',
  UTF_8 = 'utf-8'
}

/**
 * @param string the string to encode
 * @param encoding the encoding to use
 * 
 * @return {Buffer} the string encoded in the specified encoding
 */
export function fromString<T extends string>(string: string, encoding: Lowercase<T> extends TargetEncoding ? T : TargetEncoding) { 
  const targetEncoding = String(encoding).toLowerCase() as TargetEncoding;
  const encoder = to[targetEncoding];
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
  [SourceEncoding.ISO8895_1]: function(buffer: Buffer) {
    let result = "";
    _.each(buffer, function(byte) {
      result += String.fromCharCode(byte)
    });
    return result;
  },

  /**
   * @param buffer the buffer to decode into a string
   * 
   * @return the decoded string
   */
  [SourceEncoding.UTF_16LE]: (buffer: Buffer) => buffer.toString('utf16le'),

  /**
   * @param buffer the buffer to decode into a string
   * 
   * @return the decoded string
   */
  [SourceEncoding.UTF_16BE]: function(buffer: Buffer) {
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
    return from[SourceEncoding.UTF_16LE](bufferLE);
  },

  /**
   * @param buffer the buffer to decode into a string
   * 
   * @return the decoded string
   */
  [SourceEncoding.UTF_8]: (buffer: Buffer) => buffer.toString('utf8')
};


const to = {
  [TargetEncoding.UTF_16LE]: (string: string) => Buffer.from(string, 'utf16le'),
  [TargetEncoding.UTF_8]: (string: string) => Buffer.from(string, 'utf8'),
  [TargetEncoding.ISO8895_1]: (string: string) => Buffer.from(string, 'latin1')
};
