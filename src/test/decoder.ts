/** Tests for Decoder class
 */

import { Comment, Decoder } from "../decoder";

require('chai').should();

describe('Decoder V3', function() {
    const decoder = new Decoder(3);

    const endecodeString = function(str:string) {
        return decoder.decodeString(decoder.encodeString(str));
    };

    const endecodeComment = function(comment:Comment) {
        return decoder.decodeComment(decoder.encodeComment(comment));
    };


    describe('string en-/decoding', function() {
        it('should be symmetrical for an empty string', function() {
            const str = "";
            endecodeString(str).should.equal(str);
        });

        it('should be symmetrical for "aaa"', function() {
            const str = "aaa";
            endecodeString(str).should.equal(str);
        });

        it('should be symmetrical for "äüö€ßµ"', function() {
            const str = "äüö€ßµ";
            endecodeString(str).should.equal(str);
        });
    });

    describe('comment en-/decoding', function() {
        it('should be symmetrical for ("eng","","")', function() {
            const comment = {language:'eng',short:'',long:''};
            endecodeComment(comment).should.be.deep.equal(comment);
        });

        it('should be symmetrical for ("eng","asdka"söldka","dalkdölas"äß09ß@€")', function() {
            const comment = {language:'eng',short:'asdka"söldka',long:'dalkdölas"äß09ß'};
            endecodeComment(comment).should.be.deep.equal(comment);
        });

        it('("en","","") should be en/-decoded to ("en ","","")', function() {
            const comment = {language:'en',short:'',long:''};
            endecodeComment(comment).should.be.deep.equal({language:'en ',short:'',long:''});
        });
    });
});

describe('Decoder V4', function() {
    const decoder = new Decoder(4);

    const endecodeString = function(str:string) {
        return decoder.decodeString(decoder.encodeString(str));
    };

    const endecodeComment = function(comment:Comment) {
        return decoder.decodeComment(decoder.encodeComment(comment));
    };


    describe('string en-/decoding', function() {
        it('should be symmetrical for an empty string', function() {
            const str = "";
            endecodeString(str).should.equal(str);
        });

        it('should be symmetrical for "aaa"', function() {
            const str = "aaa";
            endecodeString(str).should.equal(str);
        });

        it('should be symmetrical for "äüö€ßµ"', function() {
            const str = "äüö€ßµ";
            endecodeString(str).should.equal(str);
        });
    });

    describe('comment en-/decoding', function() {
        it('should be symmetrical for ("eng","","")', function() {
            const comment = {language:'eng',short:'',long:''};
            endecodeComment(comment).should.be.deep.equal(comment);
        });

        it('should be symmetrical for ("eng","asdka"söldka","dalkdölas"äß09ß@€")', function() {
            const comment = {language:'eng',short:'asdka"söldka',long:'dalkdölas"äß09ß'};
            endecodeComment(comment).should.be.deep.equal(comment);
        });

        it('("en","","") should be en/-decoded to ("en ","","")', function() {
            const comment = {language:'en',short:'',long:''};
            endecodeComment(comment).should.be.deep.equal({language:'en ',short:'',long:''});
        });
    });
});