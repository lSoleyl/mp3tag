/**
 * module which contains the TagData-class
 *
 * This contains all relevant information about the file's id3 tag.
 * This class makes the assumption, that each tag id is actually unique for the whole tag.
 * This assumtion affects the methods getFrameBuffer/getFrameData/setFrameBuffer
 */
const async = require("async")
const _ = require("lodash")

const encoding = require('./encoding')

const Data = require('./data')
const DataSource = require('./dataSource')
const File = require('./file')
const Frame = require('./frame')
const Decoder = require('./decoder')


class TagData {
  constructor(file, version, flags, size, frames, padding, audioData) {
    this.file = file        //File read from
    this.version = version  //version tuple {'major','minor'}
    this.flags = flags      //flags field from the header
    this.size = size        //header size with frames and padding/footer = starting offset of audiodata
    this.frames = frames    //list of filtered frames (no zero size frames and no padding frames)
    this.padding = padding  //padding bytes {'offset', 'size'}
    this.audioData = audioData || new DataSource(file, size)
    this.rewrite = false    //true, if adding new frames has depleted all padding and file must be rewritten
    this.dirty = false      //true if any of the tag data has been changed since creation if the file isn't dirty saving into the same file is a noop
    this.decoder = new Decoder(version)
    this.hasFooter = version.major >= 4 && (flags & 0x10) != 0;
  }

  /** This simple getter searches the frames array for a frame with the given id.
   *
   * @param id the frame's id
   *
   * @return either the frame or undefined if not found
   */
  getFrame(id) {
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
  getFrameBuffer(id) {
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
  setFrameBuffer(id, buffer) {
    this.reallocateFrame(id, buffer)
  }

  /** Completely removes the given frame. 
   *  If the frame doesn't exist, it does nothing.
   *  It doesn't prevent the deletion of required frames.
   *
   * @param id the id of the frame to delete
   */
  removeFrame(id) {
    _.remove(this.frames, function(frame) { return frame.id == id })
    this.realignFrames() //Realign all frames after a frame got deleted
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
  reallocateFrame(id, buffer) {
    var frame = this.getFrame(id)

    //Allocate if frame doesn't exist  
    if (!frame)
      return this.allocateFrame(id, buffer)

    //No change in data necessary, setting same content
    if (frame.data.toBuffer().equals(buffer))
      return frame

    //Maybe no resizing necessary?
    var size = frame.size
    frame.setBuffer(buffer)

    if (frame.size != size) {
      //Take care of realigning frames, adjusting padding and the tag's size
      this.realignFrames()
    }

    this.dirty = true //Change in data happened

    return frame
  }

  /** This method will iterate through all frames and adjust their `pos` according to
   *  their `size` and position in the frames array. The padding and tag size will be
   *  adjusted if necessary.
   */
  realignFrames() {
    var pos = TagData.tagHeaderSize //Starting position
    for(var i = 0; i < this.frames.length; ++i) {
      var frame = this.frames[i]
      pos += Frame.headerSize //move position to start of data
      
      //Move frame to correct position
      frame.pos = pos
      pos += frame.size
    }

    //Padding start position may have changed
    var paddingDelta = pos - this.padding.offset

    //Move resize padding accordingly
    this.padding.offset  += paddingDelta
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
  allocateFrame(id, buffer) {
    var frame = Frame.allocate(id, buffer)

    this.frames.push(frame) //Insert as last frame

    //Realign frames will take care of setting the correct position and adjusting the padding
    this.realignFrames()

    this.dirty = true //Data has changed

    return frame
  }

  /** This method will just write back the updated frame data into the file itself.
   *  If possible it will try to use the padding area for that purpose. If the updated
   *  header fits inside the old header+padding then only the header part of the file will
   *  get updated and not the whole file.
   *  If the tag data hasn't been changed, then no write operation takes place.
   *
   * @param callback(err,res) will be called upon completion
   */
  save(callback) {
    if (!this.file) 
      return callback(new Error("This tag data has no source file!")) //Is true for generated headers

    this.writeToFile(this.file.name, callback)
  }

  /** Checks whether the footer should better be disabled based on a used padding
   */
  checkFooter() {
    //Footer processing (we don't want to write the footer if we have included padding)
    if (this.hasFooter && this.padding.size > 0) {
      // remove footer, add it's size to the padding and disable the flag
      this.hasFooter = false
      this.padding.size += TagData.tagFooterSize
      this.flags &= ~0x10
    }
  }

  /** Returns the size of the tag's content not counting header and footer, but padding is included.
   *  This value is equal to the size value encoded in the tag header/footer
   */
  getContentSize() {
    var size = this.size - TagData.tagHeaderSize

    if (this.hasFooter)
      size -= TagData.tagFooterSize

    return size
  }

  /** This method will write the id3 tag header into the given file. At the correct offset.
   *  This will not write the frames.
   *
   * @param file a File object
   * @param callback(err) the callback, which holds the error, if any.
   */
  writeTagHeader(file, callback) {
    this.checkFooter(); //check whether have to disable the footer to set the correct flags

    var header = new Buffer(TagData.tagHeaderSize)  

    header.asciiWrite("ID3") //Write marker
    header.writeUInt8(this.version.major,3)
    header.writeUInt8(this.version.minor,4)
    header.writeUInt8(this.flags, 5)

    //TagHeader size must be subtracted from the actual size
    header.writeUInt32BE(encoding.encodeUInt7Bit(this.getContentSize()), 6)

    //Now write the header
    file.write(header, callback)
  }

  /** This method will write the id3 tag footer if the file still has a footer
   *
   * @param file the File object to write into
   * @param callback(err) the callback to call upon completion
   */
  writeTagFooter(file, callback) {
    this.checkFooter();

    if (!this.hasFooter)
      return callback(null);

    var footer = new Buffer(TagData.tagFooterSize)  

    footer.asciiWrite("3DI") //Write marker (basically ID3 reversed)
    footer.writeUInt8(this.version.major,3)
    footer.writeUInt8(this.version.minor,4)
    footer.writeUInt8(this.flags, 5)

    //TagHeader size must be subtracted from the actual size
    footer.writeUInt32BE(encoding.encodeUInt7Bit(this.getContentSize()), 6)

    //Now write the footer
    file.write(footer, callback)
  }

  /** This method will write the content into a file (overwriting existing files) and 
   *  will place a padding area of 1024 bytes after the header. If the file to write into
   *  equals the source file for this tag's audiodata, then it tries to only update the tags itself.
   *  If a new file is written, a default padding of 1024 is added.
   *
   *  If the destination file is a .mp3 file, it will get completely overwritten.
   *  It won't be first parsed to preserve it's audio data.
   *  If the target file equals this tagData's source file and the tagData hasn't changed since last load
   *  or save then no file access occurrs. If the data has changed, then this operation will
   *  reset this state.
   * 
   * @param path the file's path to write into
   * @param callback(err, res) will be called upon completion
   */
  writeToFile(path, callback) {
    var self = this
    var sameFile = (self.audioData.source.name === path)

    //No change & same file -> no write necessary
    if (sameFile && !this.dirty) {
      return process.nextTick(callback)
    }

    /**This function will retrive the audioFN and call the provided callback with it.
     * AudioFN is a nop if no audio write is necessary
     *
     * @param cb(err, audioFn(file, innerCB)) - this callback gets called with an error or
     *           an audioFn. The audioFn is used to write the audio data of the tagData into
     *           the provided file. the innerCB is invoked if the audio data has been successfully written.
     */ 
    function withAudioFN(cb) {
      //We don't have to write audio if a rewrite isn't necessary and we write into the same file
      if (sameFile && !self.rewrite) {
        //Basically return a NOP
        process.nextTick(function() { cb(null, function(file, innerCB) { process.nextTick(innerCB) }) })
      } else { //Otherwise, writing audio is necessary
        //We have to load the audioData into a buffer, before writing, or else we will overwrite it.
        self.audioData.toData(function(err, data) {
          if (err)
            return cb(err)

          cb(null, function(file, innerCB) {
            file.write(data.toBuffer(), innerCB)
          })
        })
      }
    }

    //Load audio data if necessary and bind to audioFN
    withAudioFN(function(err, audioFN) {
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
          async.eachSeries(self.frames, 
            function(frame, cb) { frame.write(file, cb) }, 
            function(err) {
            if (err)
              return callback(err)

            //Write padding
            var padding = new Buffer(self.padding.size)
            padding.fill(0x00) //Fill generated buffer with zero bytes
            file.write(padding, function(err) {
              if (err)
                return callback(err)

              self.writeTagFooter(file, function(err) {
                //Now write the audio data (if needed) and close the file
                audioFN(file, function(err) {
                  file.close()
                  if (err)
                    return callback(err)

                  if (sameFile) //Clear dirty flag if we have just updated the source file
                    self.dirty = false

                  process.nextTick(callback)
                })
              })
            })
          })
        })
      })

    })
  }
}

//Constant size of ID3Tag header/footer size
TagData.tagHeaderSize = 10 
TagData.tagFooterSize = 10

/** This function creates an empty TagData structure. 
 */
TagData.empty = function() {                                             //Empty padding starts directly after header
 return new TagData(undefined, {major:3, minor:0}, 0, TagData.tagHeaderSize, [], {offset:TagData.tagHeaderSize, size:0}, new Data(new Buffer(0)))
}

//export class
module.exports = TagData
