Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c .venv\Scripts\activate & python backend\scripts\workers.py", 0
WshShell.Run "cmd /c .venv\Scripts\activate & python backend\scripts\osm_sync_ultimate.py --loop=999999", 0
Set WshShell = Nothing
