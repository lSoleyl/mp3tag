/** Test for File class
 */

import { File } from '../file';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
require('chai').should();


describe('File', function() {
  
  const filePath = path.join(os.tmpdir(), 'writeTest.txt');

  beforeEach(function() {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  describe('openFile(w)', function() {
    it('should create a new file if it doesn\'t exist', async function() {
      const file = await File.open(filePath, "w");
      file.close();

      fs.existsSync(filePath).should.equal(true);
    });
  });

  describe('openFile(a)', function() {
    const content = "Test content";

    it('should not clear the file on open', async function() {
      // Create file with content in it
      fs.writeFileSync(filePath, content);

      const file = await File.open(filePath, "a");
      file.close();
      
      fs.readFileSync(filePath).toString().should.equal(content);
    });

    it('should start writing at the beginning of the file', async function() {
      const append = "xxxx";
      const result = "xxxx content";

      // Create file with content in it
      fs.writeFileSync(filePath, content);

      const file = await File.open(filePath, "a");

      await file.write(Buffer.from(append));
      file.close();

      fs.readFileSync(filePath).toString().should.equal(result);
    });
  });

  describe('writeFile', function() {
    const content = "Hello Buffers!";

    it("should start writing at the file's beginning", async function() {
      const file = await File.open(filePath, "w");

      const buf = Buffer.from(content);

      const bytes = await file.write(buf);
      file.close();

      bytes.should.equal(buf.length);
      fs.readFileSync(filePath).toString().should.equal(content);
    });

    it("should continue writing where it left off, when writing multiple times", async function() {
      const content = [ "This is the first part\n", "This is the last part" ];

      const file = await File.open(filePath, "w");
      
      // perform consecutive two writes
      for (const line of content) {
        await file.write(Buffer.from(line));
      }
      
      file.close();
      fs.readFileSync(filePath).toString().should.equal(content.join(""));
    });
  });
});

