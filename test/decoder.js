/** Tests for Decoder class
 */

var Decoder = require('../decoder');
var should = require('chai').should();


describe('Decoder V3', function() {
    var decoder = new Decoder({major:4});
    describe('string en-/decoding', function() {
        it('should be symmetrical for an empty string', function() {
            var str = "";
            decoder.decodeString(decoder.encodeString(str)).should.equal(str);
        });

        it('should be symmetrical for "aaa"', function() {
            var str = "aaa";
            decoder.decodeString(decoder.encodeString(str)).should.equal(str);
        });

        it('should be symmetrical for "äüö€ßµ"', function() {
            var str = "äüö€ßµ";
            decoder.decodeString(decoder.encodeString(str)).should.equal(str);
        });
    });
});

describe('Decoder V4', function() {
    var decoder = new Decoder({major:4});
    describe('string en-/decoding', function() {
        it('should be symmetrical for an empty string', function() {
            var str = "";
            decoder.decodeString(decoder.encodeString(str)).should.equal(str);
        });

        it('should be symmetrical for "aaa"', function() {
            var str = "aaa";
            decoder.decodeString(decoder.encodeString(str)).should.equal(str);
        });

        it('should be symmetrical for "äüö€ßµ"', function() {
            var str = "äüö€ßµ";
            decoder.decodeString(decoder.encodeString(str)).should.equal(str);
        });
    });
});