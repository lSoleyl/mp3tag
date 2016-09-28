/** Test for File class
 */
var File = require('../file')
var fs = require('fs')
var should = require('chai').should()


describe('File', function() {
  //TODO prepare tests by deleting temporary files
  //TODO determine temp directory based on running operating system /tmp vs %TEMP%

  describe('openFile(w)', function() {
    var path = "/tmp/writeTest"
    it('should create a new file if it doesn\'t exist', function(done) {
      File.open(path, "w", function(err, file) {
        if (err)
          return done(err)

        file.close()
        fs.existsSync(path).should.equal(true)
        done()
      })
    })
  })

  describe('writeFile', function() {
    var path = "/tmp/writeTest2"
    var content = "Hello Buffers!"

    it("should start writing at the file's beginning", function(done) {
      File.open(path, "w", function(err, file) {
        if (err)
          return done(err)


        var buf = new Buffer(content, "utf8")

        file.write(buf, function(err, bytes) {
          if (err)
            return done(err)

          file.close()
          bytes.should.equal(buf.length)
          fs.readFileSync(path).toString().should.equal(content)
          done()
        })
      })
    })

    it("should continue writing where it left off, when writing multiple times", function(done) {
      var path = "/tmp/writeTest3"
      var content = [ "This is the first part\n", "This is the last part" ] 

      File.open(path, "w", function(err, file) {
        if (err)
          return done(err)


        var buffer = new Buffer(content[0], "utf8")
        file.write(buffer, function(err) {
          if (err)
            return done(err)

          buffer = new Buffer(content[1], "utf8")
          file.write(buffer, function(err) {
            if (err)
              return done(err)

            file.close()

            fs.readFileSync(path).toString().should.equal(content.join(""))
            done()
          })
        })
      })
    })
  })







})

