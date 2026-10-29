"""Isolated browser-test fixture; never deployed or used by production service."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from backend.app import create_app
from tests.test_review import ReviewEngine

if __name__=='__main__':
    app=create_app({'DATABASE':sys.argv[1], 'ENGINE':ReviewEngine(), 'PUBLIC_ORIGIN':'http://127.0.0.1:18972','GUEST_COOKIE_PATH':'/'})
    app.run(host='127.0.0.1',port=18972,threaded=True)
