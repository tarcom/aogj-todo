#!/usr/bin/env python3
"""Deploy todo-appen til aogj.com/todo via FTP (python ftplib).
Host/bruger/adgangskode læses fra en lokal .ftp-credentials (ikke i git).
  python3 deploy.py move-old   # omdøb eksisterende /todo -> /todo-old (én gang)
  python3 deploy.py            # upload site/ -> /todo
"""
import ftplib, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
creds = {}
for line in open(os.path.join(HERE, ".ftp-credentials")):
    line = line.strip()
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1); creds[k] = v
HOST, USER, PW = creds["FTP_HOST"], creds["FTP_USER"], creds["FTP_PASS"]
LOCAL = os.path.join(HERE, "site")
REMOTE = "todo"          # relativt til FTP-login (= web-roden httpd.www)


def connect():
    f = ftplib.FTP(HOST, timeout=40); f.login(USER, PW); return f


def ensure(f, path):
    try: f.mkd(path)
    except ftplib.error_perm: pass


def upload(f, local, remote):
    ensure(f, remote)
    for name in sorted(os.listdir(local)):
        lp = os.path.join(local, name); rp = remote + "/" + name
        if os.path.isdir(lp):
            upload(f, lp, rp)
        else:
            with open(lp, "rb") as fh:
                f.storbinary("STOR " + rp, fh)
            print("  ↑", rp)


if __name__ == "__main__":
    f = connect()
    if len(sys.argv) > 1 and sys.argv[1] == "move-old":
        dst = "todo-old"
        try:
            f.rename(REMOTE, dst); print(f"flyttede {REMOTE} -> {dst}")
        except Exception as e:
            dst = "todo-old-" + time.strftime("%Y%m%d%H%M%S")
            try:
                f.rename(REMOTE, dst); print(f"flyttede {REMOTE} -> {dst}")
            except Exception as e2:
                print("rename fejl:", e2)
    else:
        print(f"Uploader site/ -> ftp://{HOST}{REMOTE}/ ...")
        upload(f, LOCAL, REMOTE)
        print("Færdig -> https://aogj.com/todo")
    f.quit()
