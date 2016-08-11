/** Test for encoding functions
 */

var mp3tag = require('../mp3tag')
var should = require('chai').should()



describe("7BitUInt", function() {
  var decode = mp3tag.utils.decodeUInt7Bit
  var encode = mp3tag.utils.encodeUInt7Bit

  describe('decoding', function() {
    it("should return 0 for 0", function() {
      decode(0).should.equal(0)
    })

    it('should return 257 for 00 00 02 01', function() {
      decode(0x0201).should.equal(257)
    })

    it("should return 0x0FFFFFFF for 0xFFFFFFFF", function() {
      decode(0xFFFFFFFF).should.equal(0x0FFFFFFF)
    })
  })

  describe('encoding', function() {
    it("should return 0 for 0", function() {
      encode(0).should.equal(0)
    })

    it("should return 00 00 02 01 for 257", function() {
      encode(257).should.equal(0x00000201)
    })

    it("should be symmetric for 0x0FFFFFFF", function() {
      decode(encode(0x0FFFFFFF)).should.equal(0x0FFFFFFF)
    })
  })
})

