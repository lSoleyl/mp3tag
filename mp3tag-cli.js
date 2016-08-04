var argv = require('minimist')(process.argv.slice(2))
var _ = require('lodash')
var async = require('async')

var tag = require('./mp3tag')
var File = require('./file')


/** Command line interface to the mp3tag library
 *  Required options: 
 *    --file <filename>               The source file to read if empty, then an empty header will be generated
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

function debug(err, result) {
  if (err)
    return console.error("error: " + err)

  return console.dir(result)
}

getHeader(path, function(err, tagData) {
  if (err)
    return console.error("Error: " + err)

  console.dir(tagData)
  console.log("\n")

  function printOut(id, asName, decodefn) {
    var decfn = decodefn || tag.decodeString
    var buffer = tagData.getFrameBuffer(id)

    var result = buffer ? decfn(tagData.getFrameBuffer(id)) : ""
    if (typeof result !== 'string')
      result = JSON.stringify(result, null, 2)
    
    
    console.log(asName + ": " + result)
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
    exportCover(tagData, destination, function(err, res) { 
      if (err) 
        return console.error("Cover export failed: " + err)

      console.log("Exported cover picture to: " + res.filename + " (" + res.bytes + " bytes written)")
    })
  }

})

/** This function returns an mp3tag header based on the source.
 *  If the passed source is not a string, then an empty header will be returned.
 *
 * @param source the mp3 file to read the header from
 * @param callback(err,tagData) the callback which will be called upon completion
 */
function getHeader(source, callback) {
  if (typeof source == "string") {
    tag.readHeader(path, callback)
  } else {
    process.nextTick(function() { callback(null, tag.newHeader()) })
  }
}


/** This function is used to export the cover picture from the mp3 file.
 *  
 * @param tagData the TagData object which contains the picture
 * @param destination a filepath or undefined, if default filepath should be used
 * @param callback(err,{bytes,filename}) will be called upon error or completion.
 *                          bytes will be the number of bytes, written into the file.
 */
function exportCover(tagData, destination, callback) {
  //FIXME the export cover function is currently not working due to the latest refactoring.
  var frameBuffer = tagData.getFrameBuffer('APIC')[0]
  if (!frameBuffer) {
    return callback("File has no picture frame")
  }
  var pic = tag.decodePicture(frameBuffer)
  var filename = destination || ("cover." + pic.mimeType.split('/')[1])
  File.open(filename, "w", function(err, file) {
    if (err) 
      return callback(err)

    pic.pictureData.writeInto(file, function(err,bytes) {
      if (err)
        return callback(err)

      file.close()      
      process.nextTick(function() { callback(null, {bytes:bytes, filename:filename}) })
    })
  })
}