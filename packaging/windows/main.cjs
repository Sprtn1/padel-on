'use strict';
// Hardened desktop shell. The existing web app + Supabase remain authoritative.
// Remote web content has NO Node.js privileges, preload bridge, or file access.
const {app,BrowserWindow,shell}=require('electron');
const {join}=require('node:path');

const BASE_URL='https://padelon.publicvm.com/';
const APP_ORIGIN=new URL(BASE_URL).origin;
function safeExternal(url){
 try{
  const parsed=new URL(url);
  return parsed.protocol==='https:' && parsed.origin!==APP_ORIGIN;
 }catch{return false;}
}
function createMainWindow(){
 const win=new BrowserWindow({
  title:'Padel On',
  icon:join(__dirname,'build','icon.ico'),
  width:1280,height:860,minWidth:375,minHeight:570,
  show:false,backgroundColor:'#f5f8f6',autoHideMenuBar:true,
  webPreferences:{
   nodeIntegration:false,
   contextIsolation:true,
   sandbox:true,
   webSecurity:true,
   allowRunningInsecureContent:false,
   webviewTag:false
  }
 });
 win.once('ready-to-show',()=>win.show());
 win.webContents.setWindowOpenHandler(({url})=>{
  if(safeExternal(url))void shell.openExternal(url);
  return {action:'deny'};
 });
 win.webContents.on('will-navigate',(event,url)=>{
  try{
   if(new URL(url).origin===APP_ORIGIN)return;
  }catch{}
  event.preventDefault();
  if(safeExternal(url))void shell.openExternal(url);
 });
 win.loadURL(BASE_URL);
}
app.whenReady().then(()=>{
 app.setAppUserModelId('com.padelon.management');
 createMainWindow();
 app.on('activate',()=>{
  if(BrowserWindow.getAllWindows().length===0)createMainWindow();
 });
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
