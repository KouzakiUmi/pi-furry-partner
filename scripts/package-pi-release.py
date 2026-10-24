"""Archive only the original-resource product from a unified repository tag."""
import argparse, subprocess, zipfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--tag',required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[1]
names=subprocess.check_output(['git','ls-tree','--name-only',a.tag],cwd=root,text=True).splitlines()
names=[name for name in names if name not in {'editions','.github'}]
assert 'index.ts' in names and 'lib' in names and 'assets' in names
subprocess.run(['git','archive','--format=zip','--prefix=pi-furry-partner/',f'--output={a.out.resolve()}',a.tag,'--',*names],cwd=root,check=True)
with zipfile.ZipFile(a.out) as archive:
 assert archive.testzip() is None
 assert not any(name.startswith('pi-furry-partner/editions/') for name in archive.namelist())
print(f'Original-resource archive verified: {a.out}')
