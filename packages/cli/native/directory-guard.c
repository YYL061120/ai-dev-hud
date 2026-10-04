#define _GNU_SOURCE
#define _DARWIN_C_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

/* Small bounded stdin protocol; no filesystem paths or identifiers on stdout.
 * Parent supplies canonical directory dev/ino. All mutations are dirfd-relative.
 * Not a sandbox against processes that can directly mutate our open directory. */
static int exact(void *p, size_t n) { return fread(p, 1, n, stdin) == n ? 0 : -1; }
static int line(char *p, size_t n) {
  if (!fgets(p, (int)n, stdin)) return -1;
  size_t len = strlen(p);
  if (!len || p[len-1] != '\n') return -1;
  p[len-1] = 0; return 0;
}
static int pin(char *path) {
  if (path[0] != '/' || !path[1]) return -1;
  int fd = open("/", O_RDONLY | O_DIRECTORY | O_CLOEXEC);
  char *save = NULL;
  for (char *p = strtok_r(path + 1, "/", &save); p && fd >= 0; p = strtok_r(NULL, "/", &save)) {
    if (!strcmp(p, ".") || !strcmp(p, "..")) { close(fd); return -1; }
    int next = openat(fd, p, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    close(fd); fd = next;
  }
  return fd;
}
static int name_valid(const char *p) {
  if (strlen(p) != 144 || p[64] != '.' || p[101] != '.' || strcmp(p+138, ".jsonl")) return 0;
  for (size_t i=0; i<138; i++) {
    if (i==64 || i==101) continue;
    if (i==73 || i==78 || i==83 || i==88 || i==110 || i==115 || i==120 || i==125) { if (p[i]!='-') return 0; }
    else if (!((p[i]>='a' && p[i]<='f') || (p[i]>='0' && p[i]<='9'))) return 0;
  }
  return 1;
}
static int same_file(int dir, const char *name, const struct stat *expected) {
  struct stat s;
  return !fstatat(dir, name, &s, AT_SYMLINK_NOFOLLOW) && S_ISREG(s.st_mode) && s.st_nlink==1 && s.st_dev==expected->st_dev && s.st_ino==expected->st_ino;
}
static int publish(int dir, const char *name, size_t length) {
  char temporary[160]; snprintf(temporary, sizeof temporary, ".%s.tmp", name);
  int fd = openat(dir, temporary, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0600);
  if (fd<0) return -1;
  struct stat info; int result=-1, owned = !fstat(fd,&info) && S_ISREG(info.st_mode) && info.st_nlink==1;
  if (!owned) goto done;
  char buffer[8192];
  while (length) {
    size_t n=length < sizeof buffer ? length : sizeof buffer;
    if (exact(buffer,n)) goto done;
    size_t offset=0;
    while (offset<n) {
      ssize_t wrote=write(fd,buffer+offset,n-offset);
      if (wrote<0 && errno==EINTR) continue;
      if (wrote<=0) goto done;
      offset+=(size_t)wrote;
    }
    length-=n;
  }
  if (fsync(fd) || !same_file(dir,temporary,&info)) goto done;
#if defined(__APPLE__)
  if (renameatx_np(dir,temporary,dir,name,RENAME_EXCL)) goto done;
#elif defined(__linux__)
  if (renameat2(dir,temporary,dir,name,RENAME_NOREPLACE)) goto done;
#else
#error Unsupported POSIX platform
#endif
  /* Do not claim directory durability if the filesystem refuses fsync.
   * A completed final file may remain on failure; never delete a final batch. */
  if (fsync(dir)) goto done;
  result=0;
done:
  if (result && owned && same_file(dir,temporary,&info)) unlinkat(dir,temporary,0);
  close(fd); return result;
}
int main(void) {
  char request[256], path[32769]; uintmax_t dev, ino; size_t bytes; char extra;
  setvbuf(stdout,NULL,_IOLBF,0);
  if (line(request,sizeof request) || sscanf(request,"%ju %ju %zu %c",&dev,&ino,&bytes,&extra)!=3 || !bytes || bytes>32768 || exact(path,bytes)) goto refused;
  path[bytes]=0;
  if (memchr(path,0,bytes)) goto refused;
  int dir=pin(path); struct stat identity;
  if (dir<0) goto refused;
  if (fstat(dir,&identity) || !S_ISDIR(identity.st_mode) || (uintmax_t)identity.st_dev!=dev || (uintmax_t)identity.st_ino!=ino || fsync(dir)) { close(dir); goto refused; }
  puts("READY");
  while (!line(request,sizeof request)) {
    if (!strcmp(request,"R")) { close(dir); return 0; }
    char name[160];
    if (sscanf(request,"P %159s %zu %c",name,&bytes,&extra)!=2 || !name_valid(name) || bytes>4194304 || publish(dir,name,bytes)) { close(dir); goto refused; }
    puts("PUBLISHED");
  }
  close(dir); return 0;
refused:
  puts("REFUSED"); return 1;
}
