import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createSiteServer } from './server.mjs';
import { readContent, contentSource } from './content.mjs';
import { loadEnvironment } from './env.mjs';
const source=fileURLToPath(new URL('../',import.meta.url));

async function cleanup(temp) {
  assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));
  assert.ok(path.basename(temp).startsWith('myspace-privacy-'));
  await rm(temp,{recursive:true,force:true});
}

test('clone cria conteúdo genérico sem sobrescrever o perfil pessoal',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'myspace-privacy-'));
  try {
    await mkdir(path.join(temp,'js'));
    await copyFile(path.join(source,'js/site-data.example.js'),path.join(temp,'js/site-data.example.js'));
    const app=createSiteServer({root:temp});await app.ready;
    const {data}=await readContent(temp);
    assert.equal(data.profile.name,'your name');assert.equal(data.tracks.length,0);
    data.profile.name='my own profile';
    const personalized=contentSource(data);
    await writeFile(path.join(temp,'js/site-data.js'),personalized);
    await createSiteServer({root:temp}).ready;
    assert.equal(await readFile(path.join(temp,'js/site-data.js'),'utf8'),personalized);
  } finally { await cleanup(temp); }
});

test('.env é carregado sem substituir valores definidos pela hospedagem',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'myspace-privacy-'));
  const keys=['MYSPACE_ENV_TEST_NEW','MYSPACE_ENV_TEST_EXISTING'];
  const previous=keys.map(key=>process.env[key]);
  try {
    delete process.env.MYSPACE_ENV_TEST_NEW;
    process.env.MYSPACE_ENV_TEST_EXISTING='hosting';
    await writeFile(path.join(temp,'.env'),'MYSPACE_ENV_TEST_NEW=local\nMYSPACE_ENV_TEST_EXISTING=file\n');
    loadEnvironment(temp);
    assert.equal(process.env.MYSPACE_ENV_TEST_NEW,'local');
    assert.equal(process.env.MYSPACE_ENV_TEST_EXISTING,'hosting');
  } finally {
    keys.forEach((key,index)=>{if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index];});
    await cleanup(temp);
  }
});

test('Git exclui segredos, dados privados, perfil pessoal e uploads',()=>{
  const files=['.env','.env.production','.private/admin.json','private/community.json','data/private/admin.json','js/site-data.js','assets/uploads/photo.jpg','assets/audio/nightcall.mp3'];
  const result=spawnSync('git',['check-ignore','--no-index','--stdin'],{cwd:source,input:files.join('\n')+'\n',encoding:'utf8'});
  assert.equal(result.status,0);assert.deepEqual(result.stdout.trim().split(/\r?\n/),files);
  const publicFiles=spawnSync('git',['check-ignore','--no-index','.env.example','js/site-data.example.js'],{cwd:source,encoding:'utf8'});
  assert.equal(publicFiles.status,1);assert.equal(publicFiles.stdout,'');
});
