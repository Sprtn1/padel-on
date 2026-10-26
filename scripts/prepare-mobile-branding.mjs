// Capacitor assets is the native icon/splash generator. Feed it the exact logo
// already in use on the web; do not alter the source logo or Supabase files.
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import {copyFile,mkdir} from 'node:fs/promises';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function prepareMobileBranding(){
 const assets=join(root,'packaging','mobile','assets');
 await mkdir(assets,{recursive:true});
 await copyFile(join(root,'assets','logo.svg'),join(assets,'logo.svg'));
 return join(assets,'logo.svg');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.stdout.write('Using Padel On source logo: '+await prepareMobileBranding()+'\n');
}
