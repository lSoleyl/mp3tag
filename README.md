# mp3tag - A mp3 tag editing library

*This library is still incomplete and has basic support for ID3 tags v2.3 and v2.4. More advanced features, like frame encoding and encryption are not yet supported.*

## Basic usage

    const tag = require('id3tag');
    tag.readHeader('./file.mp3', (err, tagData) => {
      var buffer = tagData.getBuffer('TALB');
      if (buffer) {
        console.log("Album: " + tagData.decoder.decodeString(buffer));
      } else {
        console.log("No album frame");
      }
    });


*TODO...*