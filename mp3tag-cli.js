var argv = require('minimist')(process.argv.slice(2))
var _ = require('lodash')
var async = require('async')

var tag = require('./mp3tag')
var File = require('./file')

var out = require('./output')


/** Command line interface to the mp3tag library
 *  Primary options: 
 *    --in <filename>              The source file to read. If not set, an empty file will be genrated.
 *
 *    --write [filename]           Specified that the changes, made to the tags should be written into filename. If filename is left out, the input file is used.
 *  
 *  Other options:
 *    --export-cover [destination]   Export the cover image (if any) to destination (if given, default is "./cover.[mimetype]")
 *    --v                           Output debug info
 *    --show-data                   Prints out the contained tag data
 */
var source = (argv["in"] && typeof argv["in"] == "string") ? argv["in"] : undefined 
var write  = argv["write"]

//Define debug output
if (argv["v"])
  out.config().debug = true

if (write && typeof write != "string") { //only write specified
  write = source
  if (!write) {
    out.error("Missing filename for --in parameter, or --write parameter")
    process.exit(1)
  }
}


function debug(err, result) {
  if (err)
    return out.error(err)

  return console.dir(result)
}

getHeader(source, function(err, tagData) {
  if (err)
    return out.error(err)


  if (argv["show-data"]) {
    showData(tagData)
  }


  if (argv['export-cover']) {
    var destination = (typeof argv['export-cover'] == "string") ? argv['export-cover'] : undefined
    exportCover(tagData, destination, function(err, res) { 
      if (err) 
        return out.error("Cover export failed: " + err)

      out.info("Exported cover picture to: " + res.filename + " (" + res.bytes + " bytes written)")
    })
  }

})

/** Simply prints all known data about the audio
 */
function showData(tagData) {
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

}

/** This function returns an mp3tag header based on the source.
 *  If the passed source is not a string, then an empty header will be returned.
 *
 * @param source the mp3 file to read the header from
 * @param callback(err,tagData) the callback which will be called upon completion
 */
function getHeader(source, callback) {
  if (typeof source == "string") {
    out.debug("Loading audio file form '" + source + "'")
    tag.readHeader(source, callback)
  } else {
    out.debug("No source passed, generating empty audio file")
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
  var frameBuffer = tagData.getFrameBuffer('APIC')
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