/** Codepage conversion module
 */
var _ = require('lodash')

module.exports = {
  fromBuffer: function(buffer, encoding) {
    encoding = String(encoding).toLowerCase()
    var decoder = from[encoding]
    if (!decoder)
      throw new Error("Unsupported encoding: '" + encoding + "'")

    return decoder(buffer)
  },

  fromString: function(string, encoding) { 
    encoding = String(encoding).toLowerCase()
    var encoder = to[encoding]
    if (!encoder)
      throw new Error("Unsupported encoding: '" + encoding + "'")

    return encoder(string)
  }
}


var from = {
  "iso-8895-1": function(buffer) {
    var result = ""
    _.each(buffer, function(byte) {
      result += String.fromCharCode(byte)
    })
    return result
  },

  "utf-16le": function(buffer) { return buffer.toString('utf16le') },


  "utf-16be": function(buffer) {
    var bufferLE = new Buffer(buffer.length)

    //Copy the passed buffer into bufferLE while swapping the bytes, making it a LE buffer
    for(var c = 0; c < buffer.length; ++c) {
      if (c % 2 == 0)
        bufferLE[c+1] = buffer[c]
      else
        bufferLE[c-1] = buffer[c]
    }

    //Now we can use our LE conversion
    return from["uft-16le"](bufferLE)
  },

  "utf-8": function(buffer) { return buffer.toString('utf8') }
}


var to = {

}
