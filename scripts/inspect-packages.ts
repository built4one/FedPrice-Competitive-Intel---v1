import {readFile,writeFile} from 'node:fs/promises';
process.env.NODE_ENV='test';
const {normalizeAnalysisFiles}=await import('../server');
const cases=JSON.parse(await readFile('acceptance/sources.json','utf8'));
for(const c of cases)for(const f of c.files){const buffer=await readFile(`acceptance/sources/${c.id}/${f.name}`);const [out]=await normalizeAnalysisFiles([{originalname:f.name,mimetype:f.name.endsWith('.xlsx')?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/pdf',size:buffer.length,buffer}]);console.log(c.id,f.name,out.mimetype,out.size);if(out.mimetype==='text/plain')await writeFile(`acceptance/sources/${c.id}/${f.name}.txt`,out.buffer);}
