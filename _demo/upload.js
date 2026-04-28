import fs from 'fs';
import path from 'path';

const zipPath = path.join(process.cwd(), '_demo', 'sample-project.zip');
const formData = new FormData();
const fileBuffer = fs.readFileSync(zipPath);
const blob = new Blob([fileBuffer], { type: 'application/zip' });
formData.append('projectZip', blob, 'sample-project.zip');

const res = await fetch('http://localhost:4000/api/uploads/zip', {
  method: 'POST',
  body: formData
});

const data = await res.json();
console.log(JSON.stringify(data, null, 2));
