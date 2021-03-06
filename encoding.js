/** Encoding module to provide some de-/encoding utilties
 */ 

 module.exports = {

  /** Decodes a 7bit encoded unsigned integer:
   *  Format: 0b0xxxxxx0xxxxxx0xxxxxx0xxxxxx
   *
   * @param {number} uint28 the number to decode
   *
   * @return {number} the decoded number
   */
  decodeUInt7Bit: function(uint28) {
    const x = uint28;
    return (x & 0x7F) | ((x & 0x7F00) >> 1) | ((x & 0x7F0000) >> 2) | ((x & 0x7F000000) >> 3);
  },

  /** Encodes a unsigned integer into a  7bit unsigned integer. 
   *  The first 4 bits get cut off. 
   *
   * @param {number} uint32 the integer to encode
   *
   * @return {number} a 28 bit encoded integer
   */
  encodeUInt7Bit: function(uint32) {
    const x = uint32;
    return (x & 0x7F) | (((x >> 7) & 0x7F) << 8) | (((x >> 14) & 0x7F) << 16) | (((x >> 21) & 0x7F) << 24);
  }
  
 };
