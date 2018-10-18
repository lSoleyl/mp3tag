/** Tests for Decoder class
 */

var Decoder = require('../decoder');
var should = require('chai').should();

var _ = require('lodash');

describe('Decoder V3', function() {
    var decoder = new Decoder({major:4});

    var endecodeString = function(str) {
        return decoder.decodeString(decoder.encodeString(str));
    };

    var endecodeComment = function(comment) {
        return decoder.decodeComment(decoder.encodeComment(comment));
    };


    describe('string en-/decoding', function() {
        it('should be symmetrical for an empty string', function() {
            var str = "";
            endecodeString(str).should.equal(str);
        });

        it('should be symmetrical for "aaa"', function() {
            var str = "aaa";
            endecodeString(str).should.equal(str);
        });

        it('should be symmetrical for "äüö€ßµ"', function() {
            var str = "äüö€ßµ";
            endecodeString(str).should.equal(str);
        });
    });

    describe('comment en-/decoding', function() {
        it('should be symmetrical for ("eng","","")', function() {
            var comment = {language:'eng',short:'',long:''};
            endecodeComment(comment).should.be.deep.equal(comment);
        });

        it('should be symmetrical for ("eng","asdka"söldka","dalkdölas"äß09ß@€")', function() {
            var comment = {language:'eng',short:'asdka"söldka',long:'dalkdölas"äß09ß'};
            endecodeComment(comment).should.be.deep.equal(comment);
        });

        it('("en","","") should be en/-decoded to ("en ","","")', function() {
            var comment = {language:'en',short:'',long:''};
            endecodeComment(comment).should.be.deep.equal({language:'en ',short:'',long:''});
        });
    });
});

describe('Decoder V4', function() {
    var decoder = new Decoder({major:4});

    var endecodeString = function(str) {
        return decoder.decodeString(decoder.encodeString(str));
    };

    var endecodeComment = function(comment) {
        return decoder.decodeComment(decoder.encodeComment(comment));
    };


    describe('string en-/decoding', function() {
        it('should be symmetrical for an empty string', function() {
            var str = "";
            endecodeString(str).should.equal(str);
        });

        it('should be symmetrical for "aaa"', function() {
            var str = "aaa";
            endecodeString(str).should.equal(str);
        });

        it('should be symmetrical for "äüö€ßµ"', function() {
            var str = "äüö€ßµ";
            endecodeString(str).should.equal(str);
        });
    });

    describe('comment en-/decoding', function() {
        it('should be symmetrical for ("eng","","")', function() {
            var comment = {language:'eng',short:'',long:''};
            endecodeComment(comment).should.be.deep.equal(comment);
        });

        it('should be symmetrical for ("eng","asdka"söldka","dalkdölas"äß09ß@€")', function() {
            var comment = {language:'eng',short:'asdka"söldka',long:'dalkdölas"äß09ß'};
            endecodeComment(comment).should.be.deep.equal(comment);
        });

        it('("en","","") should be en/-decoded to ("en ","","")', function() {
            var comment = {language:'en',short:'',long:''};
            endecodeComment(comment).should.be.deep.equal({language:'en ',short:'',long:''});
        });
    });
});