/** Codepage conversion module
 */
var _ = require('lodash')

module.exports = {
  fromBuffer: function(buffer, encoding) { 
    var decoder = from[String(encoding).toLowerCase()]
    if (!decoder)
      throw new Error("Unsupported encoding: " + encoding)

    return decoder(buffer)
  },

  fromString: function(string, encoding) { 
    var encoder = to[String(encoding).toLowerCase()]
    if (!encoder)
      throw new Error("Unsupported encoding: " + encoding)

    return encoder(string)
  }
}


var from = {
  "iso-8859-1": function(buffer) {
    var result = ""
    _.each(buffer, function(byte) {
      result += String.fromCharCode(byte)
    })
    return result
  },

  "utf-16le": function(buffer) { return buffer.toString('utf16le') }
}


var to = {

}
