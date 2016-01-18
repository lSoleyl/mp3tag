//module which contains the TagData-class

var async = require("async")
var _ = require("lodash")

var Data = require('./data')

function TagData(file, version, flags, size, frames, padding, audioData) {
  this.file = file        //File read from
  this.version = version  //version tuple {'major','minor'}
  this.flags = flags      //flags field from the header
  this.size = size        //header size with frames = starting offset of audiodata
  this.frames = frames    //list of filtered frames (no zero size frames and no padding frames)
  this.padding = padding  //padding bytes {'offset', 'size'}
  this.audioData = audioData || new Data(file, size)
}

//Constant size of header
TagData.size = 10 

/** This function creates an empty TagData structure. 
 */
TagData.empty = function() {
 return new TagData(undefined, {major:3, minor:0}, 0, TagData.size, [], {offset:TagData.size, size:0}, new Data(new Buffer(0)))
}

/** Returns an array of frame buffers, which are identified
 *  by the given id
 */
TagData.prototype.getFrameBuffer = function(id, callback) {
  var frames = _.filter(this.frames, function(frame) { return frame.id == id })

  async.map(frames, function(frame, cb) { frame.data.toBuffer(cb) }, callback)
}

TagData.prototype.getFrameData = function(id) {
  var frames = _.filter(this.frames, function(frame) { return frame.id == id })
  return _.map(frames, function(frame) { return frame.data })
}



//export class
module.exports = TagData