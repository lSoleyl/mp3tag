#!/usr/bin/env node
const _ = require('lodash');

const mp3tag = require('./mp3tag');
const File = require('./file');

const out = require('./output');


const parser = require('./cli/taskParser');
const Interpolator = require('./cli/interpolator');

const options = {
  verbose: false
};

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

let resolver;
let sourceFile;

//Options
parser.defineTask('v', {
  type:'option',
  help_text: 'Verbose output'
}, async function() {
  options.verbose = true;
  out.config().debug = true; // Enable debug logger
  return;
});


 //Sources
parser.defineTask('in', {
  max_args:1,
  type:'source',
  arg_display:'[filename]',
  help_text: 'The source file to read. If not set, an empty file will be generated.'
  }, function(cb) {
    sourceFile = this.args[0]; //Set the source from which the file has been read
    getHeader(sourceFile, (err, tagData) => {
      resolver = new Interpolator(sourceFile, tagData);
      return cb(err, tagData);
    });
});


//Read operations
const exportProperties = {}; // The collected properties to export
parser.defineTask('export-album', {
  max_args:1,
  type:'read',
  arg_display: '[property name]',
  help_text: 'exports the album name'
}, function(tagData, cb) {
  const property = this.args[0] || 'album';
  const buffer = tagData.getFrameBuffer('TALB');
  exportProperties[property] = buffer ? tagData.decoder.decodeString(buffer) : '';
  cb();
});

parser.defineTask('export-artist', {
  max_args: 1,
  type: 'read',
  arg_display: '[property name]',
  help_text: 'exports the artist'
}, function(tagData, cb) {
  const property = this.args[0] || 'artist';
  const buffer = tagData.getFrameBuffer('TPE1');
  exportProperties[property] = buffer ? tagData.decoder.decodeString(buffer) : '';
  cb();
});

parser.defineTask('export-band', {
  max_args: 1,
  type: 'read',
  arg_display: '[property name]',
  help_text: 'exports the band name'
}, function(tagData, cb) {
  const property = this.args[0] || 'band';
  const buffer = tagData.getFrameBuffer('TPE2');
  exportProperties[property] = buffer ? tagData.decoder.decodeString(buffer) : '';
  cb();
});


parser.defineTask('export-cover', {
  max_args:1,
  type:'read',
  arg_display:'[destination]',
  help_text: 'Export the cover image (if any) to destination (if given, default is "./cover.[mimetype]")'
}, function(tagData, cb) {
  exportCover(tagData, this.args[0], function(err, res) { 
    if (err) {
      return cb("Cover export failed: " + err);
    }

    out.info("Exported cover picture to: " + res.filename + " (" + res.bytes + " bytes written)");
    cb();
  });
});

parser.defineTask('export-title', {
  max_args: 1,
  type: 'read',
  arg_display: '[property name]',
  help_text: 'exports the title'
}, function(tagData, cb) {
  const property = this.args[0] || 'title';
  const buffer = tagData.getFrameBuffer('TIT2');
  exportProperties[property] = buffer ? tagDat.decoder.decodeString(buffer) : '';
  cb();
});

parser.defineTask('export-track', {
  max_args: 1,
  type: 'read',
  arg_display: '[property name]',
  help_text: 'exports the track'
}, function(tagData, cb) {
  const property = this.args[0] || 'track';
  const buffer = tagData.getFrameBuffer('TRCK');
  exportProperties[property] = buffer ? tagData.decoder.decodeString(buffer) : '';
  cb();
});

parser.defineTask('export-publisher', {
  max_args: 1,
  type: 'read',
  arg_display: '[property name]',
  help_text: 'exports the publisher'
}, function(tagData, cb) {
  const property = this.args[0] || 'publisher';
  const buffer = tagData.getFrameBuffer('TPUB');
  exportProperties[property] = buffer ? tagData.decoder.decodeString(buffer) : '';
  cb();
});


parser.defineTask('export-comment-lang', {
  max_args: 1,
  type: 'read',
  arg_display: '[property name]',
  help_text: 'exports the comment\'s language'
}, function(tagData, cb) {
  const property = this.args[0] || 'comment-lang';
  const buffer = tagData.getFrameBuffer('COMM');
  exportProperties[property] = buffer ? tagData.decoder.decodeComment(buffer).language : '';
  cb();
});

parser.defineTask('export-comment-short', {
  max_args: 1,
  type: 'read',
  arg_display: '[property name]',
  help_text: 'exports the comment\'s short text'
}, function(tagData, cb) {
  const property = this.args[0] || 'comment-short';
  const buffer = tagData.getFrameBuffer('COMM');
  exportProperties[property] = buffer ? tagData.decoder.decodeComment(buffer).short : '';
  cb();
});

parser.defineTask('export-comment-long', {
  max_args: 1,
  type: 'read',
  arg_display: '[property name]',
  help_text: 'exports the comment text'
}, function(tagData, cb) {
  const property = this.args[0] || 'comment-long';
  const buffer = tagData.getFrameBuffer('COMM');
  exportProperties[property] = buffer ? tagData.decoder.decodeComment(buffer).long : '';
  cb();
});

parser.defineTask('export-comment', {
  max_args: 1,
  type: 'read',
  arg_display: '[property name]',
  help_text: 'exports the comment'
}, function(tagData, cb) {
  const property = this.args[0] || 'comment';
  const buffer = tagData.getFrameBuffer('COMM');
  exportProperties[property] = buffer ? tagData.decoder.decodeComment(buffer) : '';
  cb();
});

parser.defineTask('export-text-frame', {
  min_args: 1,
  max_args: 2,
  type: 'read',
  arg_display: '[frame id] [property name]',
  help_text: 'Display the text content of a frame specified by id'
}, function(tagData, cb) {
  const frameId = this.args[0];
  const property = this.args[1] || frameId;
  // could be multiple frames with the same id
  const frameStrings = _.map(tagData.getFrameBuffers(frameId), function(buffer) { return tagData.decoder.decodeString(buffer); });

  if (frameStrings.length == 0) {
    exportProperties[property] = null;
  } else if (frameStrings.length == 1) {
    exportProperties[property] = frameStrings[0];
  } else {
    exportProperties[property] = frameStrings;
  }
  cb();
});

parser.defineTask('export-format', {
  max_args: 1,
  type: 'read',
  arg_display: '[format]',
  help_text: 'actually exports the properties, which were exported via export-* tasks. Supported formats are: json,...'
}, function(tagData, cb) {
  const format = this.args[0] || 'json';

  if (format === 'json') {
    console.log(JSON.stringify(exportProperties));
  }  
  //TODO support other formats aswell

  exportProperties = {};
  cb();
});

parser.defineTask('show-data', {
  type:'read',
  help_text:'Prints out the contained tag data'
}, function(tagData, cb) {
  showData(tagData);
  cb();
});

// Write operations
parser.defineTask('set-album', {
  max_args: 1,
  type: 'write',
  arg_display: '[name]',
  help_text: 'Sets/Unsets album name'
}, function(tagData, cb) {
  setFrameString(tagData, 'TALB', this.args[0]);
  cb();
});

parser.defineTask('set-artist', {
  max_args: 1,
  type: 'write',
  arg_display: '[name]',
  help_text: 'Sets/Unsets artist name'
}, function(tagData, cb) {
  resolver.interpolate(this.args[0]).then((argString) => {
    setFrameString(tagData, 'TPE1', argString);
    cb();
  });
});

parser.defineTask('set-band', {
  max_args: 1,
  type: 'write',
  arg_display: '[name]',
  help_text: 'Sets/Unsets band name'
}, function(tagData, cb) {
  setFrameString(tagData, 'TPE2', this.args[0]);
  cb();
});


parser.defineTask('set-title', {
  max_args: 1,
  type: 'write',
  arg_display: '[title]',
  help_text: 'Sets/Unsets the title'
}, function(tagData, cb) {
  setFrameString(tagData, 'TIT2', this.args[0]);
  cb();
});

parser.defineTask('set-track', {
  max_args: 1,
  type: 'write',
  arg_display: '[trackNr]',
  help_text: 'Sets/Unsets the track number'
}, function(tagData, cb) {
  setFrameString(tagData, 'TRCK', this.args[0]);
  cb();
});

parser.defineTask('set-publisher', {
  max_args: 1,
  type: 'write',
  arg_display: '[publisher]',
  help_text: 'Sets/Unsets the publisher'
}, function(tagData, cb) {
  setFrameString(tagData, 'TPUB', this.args[0]);
  cb();
});

parser.defineTask('set-comment', {
  max_args: 1,
  type: 'write',
  arg_display: '["lang;short;long"]',
  help_text: 'Set/Clear comment (a semicolon separated string)'
}, function(tagData, cb) {
  if (!this.args[0]) {
    tagData.removeFrame('COMM');
  } else {
    const parts = this.args[0].split(';');
    let comment;
    if (parts.length === 1) {
      // special case only long comment
      comment = {language:'eng', short:'', long:parts[0]};
    } else if (parts.length === 2) {
      // only language and long
      comment = { language: parts[0], short: '', long: parts[1]};
    } else {
      // regular comment
      comment = {language: parts[0], short:parts[1], long:parts[2]};
    }

    tagData.setFrameBuffer('COMM', tagData.decoder.encodeComment(comment));
  }

  cb();
});


parser.defineTask('delete-frame', {
  args: 1,
  type: 'write',
  arg_display: '[frame id]',
  help_text: 'delete the frame(s) with the given frame id'
}, function(tagData, cb) {
  const frameId = this.args[0];
  tagData.removeFrame(frameId);
  cb();
});


///----------------------
//TODO define other tasks
///----------------------


//Sinks
parser.defineTask('write', {
  max_args:1,
  type:'sink',
  arg_display:'[filename]',
  help_text:'Specifies that the changes, made to the tags should be written into filename. If filename is left out, the input file is used.' + 
  'The filename may not be left out if no filename was specified with --in'
}, function(tagData, cb) {
  const target = this.args[0] || sourceFile;
  if (!target) {
    return cb("Failed to write changes into file. No file passed to --in or --write task.");
  }

  out.debug("Writing mp3 to '" + target + "'");
  tagData.writeToFile(target, (err) => {
    if (err) {
      return cb("Write to file failed: " + err);
    }

    out.info("Successfully written '" + target + "'");
    return cb();
  });
});


try {
  parser.run(process.argv.slice(2), function(err) {
    if (err) {
      console.error("ERROR: ", err);
      process.exitCode = 2;
    }
  }); //TODO handle errors in callback
} catch (err) { //Parsing might have failed
  out.error("Startup error: " + err.message);
  console.error(err);
  process.exit(1);
}




/** Simply prints all known data about the audio
 */
function showData(tagData) {
  const decoder = tagData.decoder;
  console.dir(tagData);
  console.log("\n");

  function printOut(id, asName, decodefn) {
    const decfn = decodefn || decoder.decodeString;
    const buffer = tagData.getFrameBuffer(id);

    let result = buffer ? decfn.call(decoder, tagData.getFrameBuffer(id)) : "";
    if (typeof result !== 'string') {
      result = JSON.stringify(result, null, 2);
    }  
    
    
    console.log(`${asName} : ${result}`);
  }

  //TODO define methods to read/write these properties

  printOut('TIT2', "Title");
  printOut('TRCK', "Track");
  printOut('TALB', "Album");
  printOut('COMM', "Comment", decoder.decodeComment);
  printOut('TYER', "Year");
  printOut('TPE1', "Lead performer");
  printOut('TPE2', "Band");
  printOut('POPM', "Popularimeter", decoder.decodePopularity);
  printOut('APIC', "Picture", (buffer) => {
    const res = decoder.decodePicture(buffer);
    res.pictureData = res.pictureData.inspect();
    return res;
  });
}

/** This function returns an mp3tag header based on the source.
 *  If the passed source is not a string, then an empty header will be returned.
 *
 * @param {string} source the mp3 file path to read the header from
 */
async function getHeader(source) {
  if (typeof(source) === "string") {
    out.debug(`Loading audio file form '${source}'`);
    mp3tag.readHeader(source, callback); //FIXME: Not async yet!
  } else {
    out.debug("No source passed, generating empty audio file");
    process.nextTick(() => { callback(null, mp3tag.newHeader()); });
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
  const frameBuffer = tagData.getFrameBuffer('APIC');
  if (!frameBuffer) {
    return callback("File has no picture frame");
  }
  const pic = tagData.decoder.decodePicture(frameBuffer);
  const filename = destination || ("cover." + pic.mimeType.split('/')[1]);
  File.open(filename, "w", function(err, file) {
    if (err) {
      return callback(err);
    }

    pic.pictureData.writeInto(file, function(err,bytes) {
      if (err) {
        return callback(err);
      }

      file.close();
      process.nextTick(() => { callback(null, {bytes:bytes, filename:filename}); });
    });
  });
}

/** Generic string writing utiltiy for string properties
 */
function setFrameString(tagData, frameID, value) {
  if (typeof(value) !== 'string') {
    tagData.removeFrame(frameID); // Just remove the frame
  } else {
    tagData.setFrameBuffer(frameID, tagData.decoder.encodeString(value));
  }
}
