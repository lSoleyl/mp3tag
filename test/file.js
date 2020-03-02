/** Test for File class
 */
var File = require('../file')
var fs = require('fs')
var os = require('os')
var path = require('path')
var should = require('chai').should()


describe('File', function() {
  
  var filePath = path.join(os.tmpdir(), 'writeTest.txt');

  beforeEach(function() {
    if (fs.existsSync(filePath))
      fs.unlinkSync(filePath)
  })

  describe('openFile(w)', function() {
    it('should create a new file if it doesn\'t exist', function(done) {
      File.open(filePath, "w", function(err, file) {
        if (err)
          return done(err)

        file.close()
        fs.existsSync(filePath).should.equal(true)
        done()
      })
    })
  })

  describe('openFile(a)', function() {
    var content = "Test content"

    it('should not clear the file on open', function(done) {
      //Create file with content in it
      fs.writeFileSync(filePath, content)

      File.open(filePath, "a", function(err, file) {
        if (err)
          return done(err)

        file.close()
        fs.readFileSync(filePath).toString().should.equal(content)
        done() 
      })
    })

    it('should start writing at the beginning of the file', function(done) {
      var append = "xxxx"
      var result = "xxxx content"

      //Create file with content in it
      fs.writeFileSync(filePath, content)

      File.open(filePath, "a", function(err, file) {
        if (err)
          return done(err)

        file.write(Buffer.from(append), function(err) {
          if (err)
            return done(err)

          file.close()

          fs.readFileSync(filePath).toString().should.equal(result)
          done()
        })
      })
    })
  })

  describe('writeFile', function() {
    var content = "Hello Buffers!"

    it("should start writing at the file's beginning", function(done) {
      File.open(filePath, "w", function(err, file) {
        if (err)
          return done(err)


        var buf = Buffer.from(content)

        file.write(buf, function(err, bytes) {
          if (err)
            return done(err)

          file.close()
          bytes.should.equal(buf.length)
          fs.readFileSync(filePath).toString().should.equal(content)
          done()
        })
      })
    })

    it("should continue writing where it left off, when writing multiple times", function(done) {
      var content = [ "This is the first part\n", "This is the last part" ] 

      File.open(filePath, "w", function(err, file) {
        if (err)
          return done(err)


        var buffer = Buffer.from(content[0])
        file.write(buffer, function(err) {
          if (err)
            return done(err)

          buffer = Buffer.from(content[1])
          file.write(buffer, function(err) {
            if (err)
              return done(err)

            file.close()

            fs.readFileSync(filePath).toString().should.equal(content.join(""))
            done()
          })
        })
      })
    })
  })







})

