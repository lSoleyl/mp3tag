# mp3tag - A mp3 tag editing library

*This library is not a complete implementation for all ID3 tags. It has basic support for the most common v2.3 and v2.4 features. More advanced features, like frame encryption are not yet supported.*

Detailed information about the meaning of certain frame fields/flags can be found in the file format reference at: http://id3.org/id3v2.3.0 

Check out [retagger](https://github.com/lSoleyl/retagger) for an example project on how to use this library.

## Basic CLI usage

Installation: 

    npm install -g mp3tag

Help command:

    mp3tag --help


Printing out the most common tags and an overview of the available tags:

    mp3tag --in "./input.mp3" --show-data

Saving the cover image into a file: \
*If no `fileName` is provided then the file is exported as `cover.png` or `cover.jpeg` depending on the cover's MIME type.*

    mp3tag --in "./input.mp3" --export-cover [fileName]

Setting a new album and writing the changes into a new file: \
*If no output file is provided, the changes are written back into the input file. If possible without rewriting the whole file (if the file has a padding area).*

    mp3tag --in "./input.mp3" --set-album "test" --write "./output.mp3"


## Basic API usage (using async/await)

Install dependency:

    npm install --save mp3tag

Code example:
```js
const mp3tag = require('mp3tag');
const tagData = await mp3tag.readHeader('./file.mp3');

const buffer = tagData.getFrameBuffer('TALB');
if (buffer) {
  console.log("Album: " + tagData.decoder.decodeString(buffer));
} else {
  console.log("No album frame");
}
```

## API

### `mp3tag.readHeader(path:string) -> Promise<TagData>`
Reads in the source file at the specified path and returns a promise, which resolves to the parsed `TagData` object.

All frames are loaded into memory when constructing this object so that the frame content can be read/written without performing any File-IO.

### `TagData.getDecoder() -> Decoder`
Returns the `Decoder` object, which can be used to decode/encode the binary frame buffers.

### `TagData.getFrame(id:string) -> Frame`
If the parsed file contains a frame with the given `id` then it is returned. When accessing the Frame's content, `getFrameBuffer()`/`setFrameBuffer()` should be used instead.

### `TagData.getFrames(id:string) -> Frame[]`
Returns all frames, which have the given frame id. (A mp3 file may contain multiple frames with the same id)

### `TagData.getFrameBuffer(id:string) -> Buffer`
Directly returns the frame content as `Buffer`. The frame's buffer should only be modified using `setFrameBuffer()` to ensure proper frame alignment.

The binary frame content of text frames can be decoded as follows:
`tagData.decoder.decodeString(buffer)`


### `TagData.getFrameBuffers(id:string) -> Buffer[]`
Same as `getFrameBuffer()` but may return multiple `Buffer` objects if there are multiple Frames with the same `id`.

### `TagData.setFrameBuffer(id:string, buffer:Buffer)`
Assigns the given `Buffer` object as the frame's new content. The frame will be created if the has no such frame and the frame will be resized to fit the passed buffer. The buffer is only assigend by reference and not copied, so modifying the assigned buffer will modify the frame's content.

### `TagData.removeFrame(id:string)`
Removes all frames with the given `id`.

### `TagData.getAudioBuffer() -> Promise<Buffer>`
Loads the whole audio data from the file into a `Buffer` and returns a promise, which resolves to this buffer.

### `TagData.save() -> Promise<void>`
Writes all changes back into the source file. When writing back the changes, the file's padding area resized to accomodate all changes without rewriting the audio data if possible.

### `TagData.writeToFile(path:string) -> Promise<void>`
Writes the change frames and audio data into the specified file.

### `Decoder.decodeString(buffer:Buffer) -> string`
Decodes the content of text frames. The buffer's first byte specifies the used buffer encoding and the remaining bytes are treated as string content.

Ids of text frames typically start with `T` (eg. `TALB`)

### `Decoder.decodeComment(buffer:Buffer) -> Comment`
The decoded comment object contains three string properties: `{language,short,long}`

The comment is stored in the `COMM` frame.

### `Decoder.encodeComment(comment:Comment) -> Buffer`
Encodes a comment object back into a buffer.

### `Decoder.decodePopularity(buffer:Buffer) -> Popularity`
The decoded popularity object has the following fields:

 * `email:string` - The user's email
 * `rating:number` - Rating value [0-255]
 * `playCount:number` - Number of times this has been played.

 The popularity object is stored in the `POPM` frame.

 ### `Decoder.decodePicture(buffer:Buffer) -> Picture`
 The decoded picture object contains the following properties:

  * `mimeType:string`
  * `pictureType:number` 
  * `description:string`
  * `pictureData:Data` - a reference to the picture's data, which is basically a `Buffer` wrapper. The buffer can be retrieved by calling `toBuffer()` on it.

The picture is stored in the `APIC` frame.

