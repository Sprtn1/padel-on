// Reproducible Windows icon: convert Padel On's existing SVG to multiple PNG
// ICO entries, preserving brand colors and a solid dark launcher background.
// Requires the sharp devDependency installed in packaging/windows.
import sharp from 'sharp';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,dirname,resolve} from 'node:path';

const windowsRoot=dirname(fileURLToPath(import.meta.url));
const source=new URL('../../assets/logo.svg',import.meta.url);
const BG='#0b1715';
const SIZES=Object.freeze([16,32,48,64,128,256]);

export function makeIco(images){
 if(!Array.isArray(images)||!images.length||images.length>100)throw Error('ICO must contain icon images');
 const directory=Buffer.alloc(6+16*images.length);
 directory.writeUInt16LE(0,0); // reserved
 directory.writeUInt16LE(1,2); // type: icon
 directory.writeUInt16LE(images.length,4);
 let offset=directory.length;
 for(let index=0;index<images.length;index++){
  const {size,png}=images[index];
  if(!Number.isInteger(size)||size<1||size>256||!Buffer.isBuffer(png)||
   png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Invalid PNG icon');
  const pos=6+index*16;
  directory.writeUInt8(size===256?0:size,pos);
  directory.writeUInt8(size===256?0:size,pos+1);
  directory.writeUInt16LE(1,pos+4);
  directory.writeUInt16LE(32,pos+6);
  directory.writeUInt32LE(png.length,pos+8);
  directory.writeUInt32LE(offset,pos+12);
  offset+=png.length;
 }
 return Buffer.concat([directory,...images.map(x=>x.png)]);
}

export async function createWindowsIcon(destination=join(windowsRoot,'build','icon.ico')){
 const logo=await readFile(source);
 const images=[];
 for(const size of SIZES){
  // The logo's viewbox is wider than tall: leave padding for Windows
  // launcher badges, taskbar icons and app shortcuts.
  const width=Math.max(1,Math.floor(size*0.82));
  const pngLogo=await sharp(logo,{density:384}).resize({width}).png().toBuffer();
  const rendered=await sharp({
   create:{width:size,height:size,channels:4,background:BG}
  }).composite([{input:pngLogo,gravity:'centre'}]).png().toBuffer();
  images.push({size,png:rendered});
 }
 const file=resolve(destination);
 await mkdir(dirname(file),{recursive:true});
 await writeFile(file,makeIco(images));
 return file;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.stdout.write('Generated branded Windows ICO: '+await createWindowsIcon()+'\n');
}
