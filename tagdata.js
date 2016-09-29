/**
 * module which contains the TagData-class
 *
 * This contains all relevant information about the file's id3 tag.
 * This class makes the assumption, that each tag id is actually unique for the whole tag.
 * This assumtion affects the methods getFrameBuffer/getFrameData/setFrameBuffer
 */
var async = require("async")
var _ = require("lodash")

var encoding = require('./encoding')

var Data = require('./data')
var DataSource = require('./dataSource')


function TagData(file, version, flags, size, frames, padding, audioData) {
  this.file = file        //File read from
  this.version = version  //version tuple {'major','minor'}
  this.flags = flags      //flags field from the header
  this.size = size        //header size with frames and padding = starting offset of audiodata
  this.frames = frames    //list of filtered frames (no zero size frames and no padding frames)
  this.padding = padding  //padding bytes {'offset', 'size'}
  this.audioData = audioData || new DataSource(file, size)
  this.rewrite = false    //true, if adding new frames has depleted all padding and file must be rewritten
}

//Constant size of header
TagData.frameHeaderSize = 10
//Constant size of ID3Tag header size
TagData.tagHeaderSize = 10 

/** This function creates an empty TagData structure. 
 */
TagData.empty = function() {                                             //Empty padding starts directly after header
 return new TagData(undefined, {major:3, minor:0}, 0, TagData.tagHeaderSize, [], {offset:TagData.tagHeaderSize, size:0}, new Data(new Buffer(0)))
}

/** This simple getter searches the frames array for a frame with the given id.
 *
 * @param id the frame's id
 *
 * @return either the frame or undefined if not found
 */
TagData.prototype.getFrame = function(id) {
  return _.find(this.frames, function(frame) { return frame.id == id })
}

/** Returns the frame buffer of the frame, which identified by the given id.
 *  If no such frame is available, undefined is returned. The padding frame is not part of 
 *  of the frames, and can't be retrieved by this method.
 *
 * @param id the frame's id to get the buffer from.
 *
 * @return the frame's buffer, or undefined if the frame does not exist.
 */
TagData.prototype.getFrameBuffer = function(id) {
  var frame = this.getFrame(id)
  if (frame)
    return frame.data.toBuffer()
  
  return undefined
}

/** Inverse to getFrameBuffer.
 *  The buffer is only assigned, not copied, so don't modify it afterwards.
 *  If the frame does not exist, it will be created, otherwise the frame buffer just
 *  gets replaced. The padding of TagData is adapted accordingly.
 *
 * @param id the frame's id
 * @param buffer the buffer to set
 */
TagData.prototype.setFrameBuffer = function(id, buffer) {
  this.reallocateFrame(id, buffer)
}


/** This method will return the frame with the given id, and change it's size
 *  to fit the passed buffer. If the frame doesn't exist, it will be created.
 *  The passed buffer will be set as new data.
 *  
 * @param id the frame's id
 * @param buffer the buffer to set for the frame 
 *
 * @return the reallocated frame
 */
TagData.prototype.reallocateFrame = function(id, buffer) {
  var frame = this.getFrame(id)

  //Allocate if frame doesn't exist  
  if (!frame)
    return this.allocateFrame(id, buffer)

  //Maybe no resizing necessary?
  if (frame.size == size) {
    frame.data = new Data(buffer)
    return frame
  }

  frame.size = buffer.length
  frame.data = new Data(buffer)

  //Take care of realigning frames, adjusting padding and the tag's size
  this.realignFrames()

  return frame
}

/** This method will iterate through all frames and adjust their `pos` according to
 *  their `size` and position in the frames array. The padding and tag size will be
 *  adjusted if necessary.
 */
TagData.prototype.realignFrames = function() {
  var pos = TagData.tagHeaderSize //Starting position
  for(var i = 0; i < this.frames.length; ++i) {
    var frame = this.frames[i]
    pos += TagData.frameHeaderSize //move position to start of data
    
    //Move frame to correct position
    frame.pos = pos
    pos += frame.size
  }

  //Padding start position may have changed
  var paddingDelta = pos - this.padding.pos

  //Move resize padding accordingly
  this.padding.pos  += paddingDelta
  this.padding.size -= paddingDelta

  if (this.padding.size < 0) { //No padding left
    this.size += this.padding.size*(-1) //Tag's size has just increased 
    this.rewrite = true //Audiodata must be moved
    this.padding.size = 0
  }
}

/** This method will create a new frame structure and append it to frames.
 *  The padding will be decreased accordingly. It does not check whether
 *  a frame with this id already exists. The frame will be allocated with
 *  enough size to hold the passed buffer.
 *
 * @param id the frame's id
 * @param buffer the buffer to set as data.
 *
 * @return the newly allocated frame
 */
TagData.prototype.allocateFrame = function(id, buffer) {
  var frame = { 
    id:id,
    size:size,
    data:new Data(buffer)
  }

  this.frames.push(frame)

  //Realign frames will take care of setting the correct position and adjusting the padding
  this.realignFrames()

  return frame
}

/** Returns the data source of the frame. This method should not be used, as it isn't 
 *  very helpful.
 */
TagData.prototype.getFrameData = function(id) {
  console.log("[DEBUG] using deprecated method TagData.getFrameData")
  var frame = this.getFrame(id)
  if (frame)
    return frame.data

  return undefined
}



/** This method will just write back the updated frame data into the file itself.
 *  If possible it will try to use the padding area for that purpose. If the updated
 *  header fits inside the old header+padding then only the header part of the file will
 *  get updated and not the whole file.
 *
 * @param callback(err,res) will be called upon completion
 */
TagData.prototype.save = function(callback) {
  if (!this.file) 
    return callback(new Error("This tag data has no source file!")) //Is true for generated headers

  this.writeToFile(this.file.name, callback)
}

/** This method will write the id3 tag header into the given file. At the correct offset.
 *  This will not write the frames.
 *
 * @param file a File object
 * @param callback(err) the callback, which holds the error, if any.
 */
TagData.prototype.writeTagHeader = function(file, callback) {
  var header = new Buffer(TagData.tagHeaderSize)

  header.asciiWrite("ID3") //Write marker
  header.writeUInt8(this.version.major,3)
  header.writeUInt8(this.version.minor,4)
  header.writeUInt8(this.flags, 5)

  //TagHeader size must be subtracted from the actual size
  header.writeUInt32BE(encoding.encodeUInt7Bit(this.size - TagData.tagHeaderSize), 6)

  //Now write the header
  file.write(header, callback)
}

/** This method will write the content into a file (overwriting existing files) and 
 *  will place a padding area of 1024 bytes after the header. If the file to write into
 *  equals the source file for this tag's audiodata, then it tries to only update the tags itself.
 *  If a new file is written, a default padding of 1024 is added.
 *
 *  If the destination file is a .mp3 file, it will get completely overwritten.
 *  It won't be first parsed to preserve it's audio data.
 * 
 * @param path the file's path to write into
 * @param callback(err, res) will be called upon completion
 */
TagData.prototype.writeToFile = function(path, callback) {
  //FIXME: this is more a pseudo code than acutal code... refactor it
  var self = this
  var sameFile = (self.audioData.source.name === path)
  if (sameFile && self.rewrite) {
    //We have to load the audioData into a buffer, before writing, or else we will overwrite it.
  } 

  //TODO clean this mess a bit up, using async...

  //Open target file for writing

  var fmode = "w"
  if (sameFile && !self.rewrite) {
    fmode = "a" //Don't clear file on open
  }


  File.open(path, fmode, function(err, file) {
    if (err)
      return callback(err)

    self.writeTagHeader(file, function(err) {
      if (err)
        return callback(err)

      //Write frames
      async.eachSeries(self.frames, (frame, cb) => { file.write(frame.data.toBuffer(), cb) }, (err) => {
        if (err)
          return callback(err)


        //TODO write padding
        if (!sameFile || self.rewrite) {
          //TODO we have to write the audiodata
        }
        file.close()
      })
    })
  })

  //TODO implement write to file
  throw new Error("Not implemented yet!")
}



//export class
module.exports = TagData