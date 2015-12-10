var argv = require('minimist')(process.argv.slice(2))
var _ = require('lodash')
var async = require('async')

var tag = require('./mp3tag')
var File = require('./file')



//TODO do something with command line args...
//console.dir(argv)

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
    tagData.getFrameData(id, print(asName + ": ", decodefn))
  }

  printOut('TIT2', "Title")
  printOut('TRCK', "Track")
  printOut('TALB', "Album")
  printOut('COMM', "Comment", tag.decodeComment)
  printOut('TYER', "Year")
  printOut('TPE1', "Lead performer")
  printOut('APIC', "Picture", function(buffer) {
    var res = tag.decodePicture(buffer)
    res.pictureData = res.pictureData.inspect()
    return res
  })

  tagData.getFrameData('APIC', function(err, frames) {
    if (frames[0]) {
      var pic = tag.decodePicture(frames[0])
      var filename = "cover." + pic.mimeType.split('/')[1]
      File.open(filename, "w", function(err, file) {
        if (err) 
          throw err

        file.write(pic.pictureData, function(err,res) {
          if (err)
            throw err
          file.close()
          console.log("Exported cover picture to: " + filename + " (" + res + " bytes written)")
        })
      })
    }
  })

})

