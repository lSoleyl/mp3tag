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

function print(str) {
  return function(err, res) {
    if (err) 
      return console.error("error: " + err)

    console.log(str + res)
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

  function printOut(id, asName) {
    tagData.getFrameData(id, print(asName + ": "))
  }

  printOut('TIT2', "Title")
  printOut('TRCK', "Track")
  printOut('TALB', "Album")
  printOut('COMM', "Comment")
  printOut('TYER', "Year")
  printOut('TPE1', "Lead performer")
})

