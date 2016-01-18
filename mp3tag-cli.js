var argv = require('minimist')(process.argv.slice(2))
var _ = require('lodash')
var async = require('async')

var tag = require('./mp3tag')
var File = require('./file')


/** Command line interface to the mp3tag library
 *  Required options: 
 *    --file <filename>               The source file to read
 *  
 *  Other options:
 *    --export-cover [destination]    Export the cover image (if any) to destination (if given, default is "./cover.[mimetype]")
 *
 */
var path = argv["file"]

if (!path) {
  console.error("Please provide an input file with --file")
  return
}

function print(str, decodefn) {
  var decfn = decodefn || tag.decodeString
  return function(err, res) {
    if (err) 
      return console.error("error: " + err)

    var data = _.map(res, function(buffer) {
      var result = decfn(buffer)
      if (typeof result !== 'string')
        result = JSON.stringify(result, null, 2)

      return result
    }).join(';')

    console.log(str + data)
  }
}

function debug(err, result) {
  if (err)
    return console.error("error: " + err)

  return console.dir(result)
}

tag.readHeader(path, function(err, tagData) { 
  if (err)
    return console.error("Error: " + err)

  console.dir(tagData)
  console.log("\n")

  function printOut(id, asName, decodefn) {
    tagData.getFrameBuffer(id, print(asName + ": ", decodefn))
  }

  printOut('TIT2', "Title")
  printOut('TRCK', "Track")
  printOut('TALB', "Album")
  printOut('COMM', "Comment", tag.decodeComment)
  printOut('TYER', "Year")
  printOut('TPE1', "Lead performer")
  printOut('TPE2', "Band")
  printOut('POPM', "Popularimeter", tag.decodePopularity)
  printOut('APIC', "Picture", function(buffer) {
    var res = tag.decodePicture(buffer)
    res.pictureData = res.pictureData.inspect()
    return res
  })


  if (argv['export-cover']) {
    var destination = (typeof argv['export-cover'] == "string") ? argv['export-cover'] : undefined
    exportCover(tagData, destination, function(err) { if (err) console.error("Cover export failed: " + err) })
  }

})

/** This function is used to export the cover picture from the mp3 file.
 *  
 * @param tagData the TagData object which contains the picture
 * @param destination a filepath or undefined, if default filepath should be used
 * @param callback(err,res) will be called upon error or completion.
 *                          res will be the number of bytes, written into the file.
 */
function exportCover(tagData, destination, callback) {
  tagData.getFrameBuffer('APIC', function(err, frames) {
    if (frames[0]) {
      var pic = tag.decodePicture(frames[0])
      var filename = destination || ("cover." + pic.mimeType.split('/')[1])
      File.open(filename, "w", function(err, file) {
        if (err) 
          return callback(err)

        pic.pictureData.writeInto(file, function(err,res) {
          if (err)
            return callback(err)

          file.close()
          console.log("Exported cover picture to: " + filename + " (" + res + " bytes written)")
          process.nextTick(function() { callback(null, res) })
        })
      })
    } else {
      return callback("File has no picture frame")
    }
  })
}