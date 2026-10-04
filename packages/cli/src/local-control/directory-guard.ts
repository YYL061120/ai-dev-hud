import { spawn } from 'node:child_process'
import { LocalControlError } from './projects.js'

/** Windows binds publication to a native directory handle: relative NtCreateFile
 * and handle-relative rename never re-resolve a parent path. Unsupported
 * filesystems/platforms fail closed. No path or
 * native identifier is emitted by the helper; no executable is installed. */
const script = String.raw`
$ErrorActionPreference='Stop'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;
public static class HudDirectoryGuard {
 [StructLayout(LayoutKind.Sequential)] public struct Info {
  public uint Attributes; public System.Runtime.InteropServices.ComTypes.FILETIME Creation,Access,Write;
  public uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;
 }
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
 static extern SafeFileHandle CreateFileW(string name,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
 [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle h,out Info info);
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern uint GetFinalPathNameByHandleW(SafeFileHandle h,StringBuilder text,uint length,uint flags);
 [StructLayout(LayoutKind.Sequential)] struct UnicodeString { public ushort Length, MaximumLength; public IntPtr Buffer; }
 [StructLayout(LayoutKind.Sequential)] struct ObjectAttributes { public uint Length; public IntPtr RootDirectory,ObjectName; public uint Attributes; public IntPtr SecurityDescriptor,SecurityQualityOfService; }
 [StructLayout(LayoutKind.Sequential)] struct IoStatus { public IntPtr Status,Information; }
 [DllImport("ntdll.dll")] static extern int NtCreateFile(out SafeFileHandle file,uint access,ref ObjectAttributes attributes,out IoStatus io,IntPtr allocation,uint fileAttributes,uint share,uint disposition,uint options,IntPtr ea,uint eaLength);
 [DllImport("ntdll.dll")] static extern int NtSetInformationFile(SafeFileHandle file,out IoStatus io,IntPtr info,uint length,int type);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetFileInformationByHandle(SafeFileHandle file,int type,IntPtr info,uint size);
 public static List<SafeFileHandle> Lock(string directory) {
  var result=new List<SafeFileHandle>();
  try {
   string full=System.IO.Path.GetFullPath(directory);
   if(full.Length<3 || full[1]!=':' || full[2]!='\\') throw new Exception("unsupported-root");
   var paths=new List<string>(); paths.Add(full);
   foreach(string name in paths) {
    // Deny delete/rename. Sharing writes is necessary for native child rename;
    // relative create uses OBJ_DONT_REPARSE instead of trusting path checks.
    var h=CreateFileW(name,0x80000000,3,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
    if(h.IsInvalid) { int code=Marshal.GetLastWin32Error(); h.Dispose(); throw new Exception("open-"+result.Count+"-"+code); }
    result.Add(h); Info info;
    if(!GetFileInformationByHandle(h,out info) || (info.Attributes&0x10)==0 || (info.Attributes&0x400)!=0) throw new Exception("unsafe-attributes");
    var actual=new StringBuilder(32768); uint size=GetFinalPathNameByHandleW(h,actual,(uint)actual.Capacity,0);
    if(size==0 || size>=actual.Capacity || !String.Equals(actual.ToString().TrimEnd('\\'),("\\\\?\\"+name).TrimEnd('\\'),StringComparison.OrdinalIgnoreCase)) throw new Exception("redirected-handle");
   }
   return result;
  } catch { foreach(var h in result) h.Dispose(); throw; }
 }
 public static void Publish(SafeFileHandle directory,string name,string text) {
  Info current;
  if(!GetFileInformationByHandle(directory,out current) || (current.Attributes&0x400)!=0) throw new Exception("unsafe-directory-handle");
  string temporary="."+name+".tmp";
  IntPtr stringBuffer=Marshal.StringToHGlobalUni(temporary), unicodeBuffer=IntPtr.Zero;
  SafeFileHandle file=null; System.IO.FileStream stream=null; bool published=false;
  try {
   var unicode=new UnicodeString {Length=(ushort)(temporary.Length*2),MaximumLength=(ushort)(temporary.Length*2),Buffer=stringBuffer};
   unicodeBuffer=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(UnicodeString))); Marshal.StructureToPtr(unicode,unicodeBuffer,false);
   var attributes=new ObjectAttributes {Length=(uint)Marshal.SizeOf(typeof(ObjectAttributes)),RootDirectory=directory.DangerousGetHandle(),ObjectName=unicodeBuffer,Attributes=0x1040};
   IoStatus io; int status=NtCreateFile(out file,0x40110000,ref attributes,out io,IntPtr.Zero,0x80,0,2,0x200060,IntPtr.Zero,0);
   if(status<0 || file==null || file.IsInvalid) throw new Exception("relative-create-refused-"+status.ToString("X"));
   stream=new System.IO.FileStream(file,System.IO.FileAccess.Write,4096,false);
   byte[] bytes=new UTF8Encoding(false).GetBytes(text); stream.Write(bytes,0,bytes.Length); stream.Flush(true);
   byte[] finalName=Encoding.Unicode.GetBytes(name); int rootOffset=IntPtr.Size==8?8:4, lengthOffset=rootOffset+IntPtr.Size, nameOffset=lengthOffset+4;
   IntPtr rename=Marshal.AllocHGlobal(nameOffset+finalName.Length+2);
   try {
    for(int i=0;i<nameOffset;i++) Marshal.WriteByte(rename,i,0);
    Marshal.WriteIntPtr(rename,rootOffset,directory.DangerousGetHandle()); Marshal.WriteInt32(rename,lengthOffset,finalName.Length); Marshal.Copy(finalName,0,IntPtr.Add(rename,nameOffset),finalName.Length); Marshal.WriteInt16(rename,nameOffset+finalName.Length,0);
    status=NtSetInformationFile(file,out io,rename,(uint)(nameOffset+finalName.Length+2),10);
    if(status<0) throw new Exception("relative-rename-refused-"+status.ToString("X"));
    published=true;
   } finally { Marshal.FreeHGlobal(rename); }
  } finally {
   // Delete our failed temp by file handle, never by a potentially redirected path.
   if(!published && file!=null && !file.IsInvalid) {
    IntPtr deletion=Marshal.AllocHGlobal(4);
    try { Marshal.WriteInt32(deletion,1); SetFileInformationByHandle(file,4,deletion,4); } finally { Marshal.FreeHGlobal(deletion); }
   }
   if(stream!=null) stream.Dispose(); if(file!=null) file.Dispose();
   if(unicodeBuffer!=IntPtr.Zero) Marshal.FreeHGlobal(unicodeBuffer); Marshal.FreeHGlobal(stringBuffer);
  }
 }
}
'@
$handles=$null
try {
 $directory=([Console]::ReadLine() | ConvertFrom-Json).directory
 $handles=[HudDirectoryGuard]::Lock($directory)
 [Console]::WriteLine('READY')
 while($line=[Console]::ReadLine()) {
  $request=$line | ConvertFrom-Json
  if($request.action -eq 'release') { break }
  if($request.action -ne 'publish' -or $request.filename -notmatch '^[a-f0-9]{64}\.[a-f0-9-]{36}\.[a-f0-9-]{36}\.jsonl$' -or $request.text.Length -gt 4194304) { throw 'invalid' }
  [HudDirectoryGuard]::Publish($handles[0],$request.filename,$request.text)
  [Console]::WriteLine('PUBLISHED')
 }
} catch { [Console]::WriteLine('REFUSED'); exit 1 }
finally { if($handles) { foreach($handle in $handles) { $handle.Dispose() } } }
`
export interface DirectoryLease { readonly alive: boolean; publish(filename: string, text: string): Promise<void>; release(): Promise<void> }
export async function lockSyncDirectory(directory: string, platform: NodeJS.Platform = process.platform): Promise<DirectoryLease> {
  if (platform !== 'win32') throw new LocalControlError('本平台尚无经验证的安全目录句柄适配器；自动文件夹同步暂不可启用，请继续本机采集或手动 metadata 传输', 409)
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let alive = false, closed = false
  const completion = new Promise<void>(resolve => child.once('close', () => { alive = false; closed = true; resolve() }))
  // Drain without logging OS error text or paths.
  child.stderr.resume(); child.stdin.on('error', () => {})
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new LocalControlError('安全目录句柄准备超时；未写入同步目录', 409)) }, 8000)
      let output = ''
      const fail = () => { clearTimeout(timer); reject(new LocalControlError('目录不能建立安全原生句柄，可能被占用、重定向或文件系统不支持；拒绝同步', 409)) }
      child.once('error', fail); child.once('close', fail)
      child.stdout.on('data', part => {
        output += part.toString('utf8')
        if (output.length > 64 || output.includes('REFUSED')) fail()
        if (output.includes('READY\r\n') || output.includes('READY\n')) { clearTimeout(timer); child.off('error', fail); child.off('close', fail); alive = true; resolve() }
      })
      child.stdin.write(JSON.stringify({ directory }) + '\n')
    })
    return { get alive() { return alive }, async publish(filename, text) {
      if (!alive) throw new LocalControlError('安全目录句柄已关闭；拒绝发布', 409)
      await new Promise<void>((resolve, reject) => {
        let output = ''
        const cleanup = () => { clearTimeout(timer); child.stdout.off('data', receive); child.off('close', fail) }
        const fail = () => { cleanup(); reject(new LocalControlError('安全目录发布失败；没有按路径降级写入', 409)) }
        const receive = (part: Buffer) => { output += part.toString('utf8'); if (output.includes('PUBLISHED')) { cleanup(); resolve() } else if (output.length > 64 || output.includes('REFUSED')) fail() }
        const timer = setTimeout(() => { child.kill(); fail() }, 8000)
        child.stdout.on('data', receive); child.once('close', fail)
        child.stdin.write(JSON.stringify({ action: 'publish', filename, text }) + '\n')
      })
    }, async release() {
      alive = false
      if (!closed) child.stdin.end(JSON.stringify({ action: 'release' }) + '\n')
      const timer = setTimeout(() => child.kill(), 2000)
      try { await completion } finally { clearTimeout(timer) }
    } }
  } catch (error) { child.kill(); await completion; throw error }
}
