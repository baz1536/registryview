const fs = require('fs');
const path = require('path');

// Writes to a temp file and renames it into place, so a crash can't leave a truncated file
function writeFileAtomic(file, contents) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, contents, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, file);
}

module.exports = { writeFileAtomic };
