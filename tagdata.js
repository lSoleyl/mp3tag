//module which contains the TagData-class

var async = require("async")
var _ = require("lodash")

var Data = require('./data')
var DataSource = require('./dataSource')

function TagData(file, version, flags, size, frames, padding, audioData) {
  this.file = file        //File read from
  this.version = version  //version tuple {'major','minor'}
  this.flags = flags      //flags field from the header
  this.size = size        //header size with frames = starting offset of audiodata
  this.frames = frames    //list of filtered frames (no zero size frames and no padding frames)
  this.padding = padding  //padding bytes {'offset', 'size'}
  this.audioData = audioData || new DataSource(file, size)
}

//Constant size of header
TagData.size = 10 

/** This function creates an empty TagData structure. 
 */
TagData.empty = function() {
 return new TagData(undefined, {major:3, minor:0}, 0, TagData.size, [], {offset:TagData.size, size:0}, new Data(new Buffer(0)))
}

/** Returns an array of frame buffers, which are identified
 *  by the given id.
 */
TagData.prototype.getFrameBuffer = function(id) {
  var frames = _.filter(this.frames, function(frame) { return frame.id == id })
  return _.map(frames, function(frame) { return frame.data.toBuffer() })
}

TagData.prototype.getFrameData = function(id) {
  var frames = _.filter(this.frames, function(frame) { return frame.id == id })
  return _.map(frames, function(frame) { return frame.data })
}

/** This method will just write back the updated frame data into the file itself.
 *  If possible ut will try to use the padding area for that purpose. If the updated
 *  header fits inside the old header+padding then only the header part of the file will
 *  get updated and not the whole file.
 *
 * @param callback(err,res) will be called upon completion
 */
TagData.prototype.save = function(callback) {
  if (!this.file) 
    return callback(new Error("This tag data has no source file!"))

  var availableSpace = this.padding.offset + this.padding.size

  //TODO implement this
  throw new Error("Not implemented yet!")
}

/** This method will write the content into a file (overwriting existing files) and 
 *  will place a padding area of 1024 bytes after the header.
 *
 * @param file the file to write into
 * @param callback(err, res) will be called upon completion
 */
TagData.prototype.writeToFile = function(file, callback) {
  //TODO implement write to file
  throw new Error("Not implemented yet!")
}



//export class
module.exports = TagData