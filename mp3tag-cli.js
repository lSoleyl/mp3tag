#!/usr/bin/env node
var argv = require('minimist')(process.argv.slice(2))
var _ = require('lodash')
var async = require('async')

var tag = require('./mp3tag')
var File = require('./file')

var out = require('./output')


var parser = require('./cli/taskParser')
const Interpolator = require('./cli/interpolator')

var options = {
  verbose: false
}

/** Command line interface to the mp3tag library
 *  Primary options: 
 *    --in [filename]              The source file to read. If not set, an empty file will be genrated.
 *
 *    --write [filename]           Specifies that the changes, made to the tags should be written into filename. If filename is left out, the input file is used.
 *  
 *  Other options:
 *    --export-cover [destination]   Export the cover image (if any) to destination (if given, default is "./cover.[mimetype]")
 *    --export-format [format]       Defines the format in which to export (eg. json)
 *    --export-title [property]      Exports the title into the given property
 *    --export-* [property]          ...
 *    --v                            Output debug info
 *    --show-data                    Prints out the contained tag data
 *    --set-album [name]             Sets/Unsets the album
 *    --set-track [trackNr]          Sets/Unsets the track number
 */

var resolver
var sourceFile

//Options
parser.defineTask('v', {
  type:'option',
  help_text: 'Verbose output'
}, function(cb) {
  options.verbose = true
  out.config().debug = true //Enable debug logger
  cb()
})


 //Sources
parser.defineTask('in', {
  max_args:1,
  type:'source',
  arg_display:'[filename]',
  help_text: 'The source file to read. If not set, an empty file will be generated.'
  }, function(cb) {
    sourceFile = this.args[0] //Set the source from which the file has been read
    getHeader(sourceFile, function(err, tagData) {
      resolver = new Interpolator(sourceFile, tagData)
      return cb(err, tagData)
    })
})


//Read operations
var exportProperties = {} //The collected properties to export
parser.defineTask('export-album', {
  max_args:1,
  type:'read',
  arg_display: '[property name]',
  help_text: 'exports the album name'
}, function(tagData, cb) {
  var property = this.args[0] || 'album'
  var buffer = tagData.getFrameBuffer('TALB')
  exportProperties[property] = buffer ? tag.decodeString(buffer) : ''
  cb()
});

parser.defineTask('export-artist', {
  max_args: 1,
  type: 'read',
  arg_display: '[property name]',
  help_text: 'exports the artist'
}, function(tagData, cb) {
  var property = this.args[0] || 'artist'
  var buffer = tagData.getFrameBuffer('TPE1')
  exportProperties[property] = buffer ? tag.decodeString(buffer) : ''
  cb()
})

parser.defineTask('export-band', {
  max_args: 1,
  type: 'read',
  arg_display: '[property name]',
  help_text: 'exports the band name'
}, function(tagData, cb) {
  var property = this.args[0] || 'band'
  var buffer = tagData.getFrameBuffer('TPE2')
  exportProperties[property] = buffer ? tag.decodeString(buffer) : ''
  cb()
})


parser.defineTask('export-cover', {
  max_args:1,
  type:'read',
  arg_display:'[destination]',
  help_text: 'Export the cover image (if any) to destination (if given, default is "./cover.[mimetype]")'
}, function(tagData, cb) {
  exportCover(tagData, this.args[0], function(err, res) { 
    if (err) 
      return cb("Cover export failed: " + err)

    out.info("Exported cover picture to: " + res.filename + " (" + res.bytes + " bytes written)")
    cb()
  })
})

parser.defineTask('export-title', {
  max_args: 1,
  type: 'read',
  arg_display: '[property name]',
  help_text: 'exports the title'
}, function(tagData, cb) {
  var property = this.args[0] || 'title'
  var buffer = tagData.getFrameBuffer('TIT2')
  exportProperties[property] = buffer ? tag.decodeString(buffer) : ''
  cb()
})

parser.defineTask('export-track', {
  max_args: 1,
  type: 'read',
  arg_display: '[property name]',
  help_text: 'exports the track'
}, function(tagData, cb) {
  var property = this.args[0] || 'track'
  var buffer = tagData.getFrameBuffer('TRCK')
  exportProperties[property] = buffer ? tag.decodeString(buffer) : ''
  cb()
})

parser.defineTask('export-publisher', {
  max_args: 1,
  type: 'read',
  arg_display: '[property name]',
  help_text: 'exports the publisher'
}, function(tagData, cb) {
  var property = this.args[0] || 'publisher'
  var buffer = tagData.getFrameBuffer('TPUB')
  exportProperties[property] = buffer ? tag.decodeString(buffer) : ''
  cb()
})

parser.defineTask('export-format', {
  max_args: 1,
  type: 'read',
  arg_display: '[format]',
  help_text: 'actually exports the properties, which were exported via export-* tasks. Supported formats are: json,...'
}, function(tagData, cb) {
  var format = this.args[0] || 'json'

  if (format === 'json') {
    console.log(JSON.stringify(exportProperties))
  }  
  //TODO support other formats aswell

  exportProperties = {}
  cb()
})

parser.defineTask('show-data', {
  type:'read',
  help_text:'Prints out the contained tag data'
}, function(tagData, cb) {
  showData(tagData)
  cb()
})

//Write operations
parser.defineTask('set-album', {
  max_args: 1,
  type: 'write',
  arg_display: '[name]',
  help_text: 'Sets/Unsets album name'
}, function(tagData, cb) {
  setFrameString(tagData, 'TALB', this.args[0])
  cb()
})

parser.defineTask('set-artist', {
  max_args: 1,
  type: 'write',
  arg_display: '[name]',
  help_text: 'Sets/Unsets artist name'
}, function(tagData, cb) {
  resolver.interpolate(this.args[0]).then((argString) => {
    setFrameString(tagData, 'TPE1', argString)
    cb()
  })
})

parser.defineTask('set-band', {
  max_args: 1,
  type: 'write',
  arg_display: '[name]',
  help_text: 'Sets/Unsets band name'
}, function(tagData, cb) {
  setFrameString(tagData, 'TPE2', this.args[0])
  cb()
})


parser.defineTask('set-title', {
  max_args: 1,
  type: 'write',
  arg_display: '[title]',
  help_text: 'Sets/Unsets the title'
}, function(tagData, cb) {
  setFrameString(tagData, 'TIT2', this.args[0])
  cb()
})

parser.defineTask('set-track', {
  max_args: 1,
  type: 'write',
  arg_display: '[trackNr]',
  help_text: 'Sets/Unsets the track number'
}, function(tagData, cb) {
  setFrameString(tagData, 'TRCK', this.args[0])
  cb()
})

parser.defineTask('set-publisher', {
  max_args: 1,
  type: 'write',
  arg_display: '[publisher]',
  help_text: 'Sets/Unsets the publisher'
}, function(tagData, cb) {
  setFrameString(tagData, 'TPUB', this.args[0])
  cb()
})


///----------------------
//TODO define other tasks
///----------------------


//Sinks
parser.defineTask('write', {
  max_args:1,
  type:'sink',
  arg_display:'[filename]',
  help_text:'Specifies that the changes, made to the tags should be written into filename. If filename is left out, the input file is used.' + 
  'The filename may not be left out if not filename was specified with --in'
}, function(tagData, cb) {
  var target = this.args[0] || sourceFile
  if (!target)
    return cb("Failed to write changes into file. No file passed to --in or --write task.")

  out.debug("Writing mp3 to '" + target + "'")
  tagData.writeToFile(target, function(err) {
    if (err)
      return cb("Write to file failed: " + err)

    out.info("Successfully written '" + target + "'")
    return cb()
  })
})


try {
  parser.run(process.argv.slice(2), function(err) {
    if (err) {
      console.error("ERROR: ", err);
      process.exitCode = 2;
    }
  }) //TODO handle errors in callback
} catch (err) { //Parsing might have failed
  out.error("Startup error: " + err.message) 
  console.error(err)
  process.exit(1)
}




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

  //TODO define methods to read/write these properties

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

/** Generic string writing utiltiy for string properties
 */
function setFrameString(tagData, frameID, value) {
  if (typeof(value) !== 'string') {
    tagData.removeFrame(frameID) //Just remove the frame
  } else {
    tagData.setFrameBuffer(frameID, tag.encodeString(value))
  }
}
