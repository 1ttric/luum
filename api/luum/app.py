#!/usr/bin/env python3
import base64
import io
import threading
import zipfile
from enum import Enum
from pathlib import Path

from PIL import Image
from flask_cors import CORS
from typing import List, Optional, Generator, Dict, Tuple, Any

import gphoto2 as gp
from flask import Flask, jsonify, request, Response, send_file


class CameraWidgetType(Enum):
    WINDOW = 0
    SECTION = 1
    TEXT = 2
    RANGE = 3
    TOGGLE = 4
    RADIO = 5
    MENU = 6
    BUTTON = 7
    DATE = 8


class ThreadsafeCamera:
    class __ThreadsafeCamera:
        def __init__(self, port):
            self._cam = gp.Camera()
            self.mutex = threading.Lock()
            self._connected = False
            self._port = port

        def __enter__(self):
            print("__enter__")
            self.connect()
            return self

        def __exit__(self, *args):
            print("__exit__")
            self.disconnect()

        # Implements some logic to allow tracking of the connected state so repeated calls to init() don't re-init the camera
        def connect_raw(self):
            if self._connected:
                return
            print("connecting")
            port_info_list = gp.PortInfoList()
            port_info_list.load()
            idx = port_info_list.lookup_path(self._port)
            self._cam.set_port_info(port_info_list[idx])
            ret = self._cam.init()
            self._connected = True
            return ret

        def connect(self):
            with self.mutex:
                return self.connect_raw()

        def disconnect(self):
            if not self._connected:
                return
            ret = self._cam.exit()
            self._connected = False
            return ret

        def _get_flat_config(self) -> Generator[None, Tuple[gp.CameraWidget, Dict], None]:
            with self.mutex:
                config = self._cam.get_config()
            yield from flatten_config(config)

        def generate_preview_frames(self, size=0, quality=0):
            while True:
                with self.mutex:
                    preview = self._cam.capture_preview()
                    mimetype = preview.get_mime_type()
                    data = bytes(preview.get_data_and_size())
                    if size or quality:
                        img = Image.open(io.BytesIO(data))
                        if size:
                            img.thumbnail((size, size))
                        buf = io.BytesIO()
                        img.save(buf, "JPEG", quality=(quality or 75))
                        buf.seek(0)
                        data = buf.read()
                yield b"--preview-frame\r\nContent-Type: " + mimetype.encode() + b"\r\n\r\n" + data + b"\r\n"

        def set_config(self, name, value):
            print("setting config", name, value)
            with self.mutex:
                widget = self._cam.get_single_config(name)
                widget.set_value(value)
                self._cam.set_single_config(name, widget)
                changed = self._cam.get_single_config(name).changed()
            print(f"set config value={value}, changed={changed}")

        def get_single_config(self, name):
            with self.mutex:
                widget = self._cam.get_single_config(name)
                return next(flatten_config(widget))[1]

        def get_summary(self):
            with self.mutex:
                return str(self._cam.get_summary())

        def get_file_hierarchy(self):
            def recurse_children(path):
                files = []
                for f in self._cam.folder_list_files(path):
                    fname = f[0]
                    file_data = self._cam.file_get_info(path, fname)
                    file = {
                        "type": "file",
                        "name": fname,
                        "size": file_data.file.size,
                        "mtime": file_data.file.mtime,
                        "permissions": file_data.file.permissions,
                        "mimetype": file_data.file.type,
                        "height": file_data.file.height,
                        "width": file_data.file.width,
                    }
                    files.append(file)
                folders = [{"type": "folder", "name": f[0], "children": recurse_children(str(Path(path) / f[0]))} for f
                           in
                           self._cam.folder_list_folders(path)]
                return folders + files

            with self.mutex:
                return {"type": "folder", "name": "/", "children": recurse_children("/")}

        def capture(self, type):
            with self.mutex:
                # Camera doesn't like it when we have previously been streaming a live preview and then try and take
                # a photo - will throw an I/O error. Need to reconnect before taking the photo
                self.disconnect()
                self.connect_raw()
                # Need to make sure photo is saved to the SD card, not to just camera memory
                cfg = self._cam.get_config()
                cfg.get_child_by_name("capturetarget").set_value("Memory card")
                self._cam.set_config(cfg)
                return self._cam.capture(type)

        def download(self, file_path: str, size: int = 0, quality: int = 0):
            with self.mutex:
                file_path = Path(file_path)
                hierarchy, fname = str(file_path.parent), str(file_path.name)
                camera_file = self._cam.file_get(hierarchy, fname, gp.GP_FILE_TYPE_NORMAL)
                file_data = bytes(camera_file.get_data_and_size())
                mime_type = camera_file.get_mime_type()
                if size or quality:
                    img = Image.open(io.BytesIO(file_data))
                    if size:
                        img.thumbnail((size, size))
                    buf = io.BytesIO()
                    img.save(buf, "JPEG", quality=(quality or 75))
                    buf.seek(0)
                    file_data = buf.read()
                    mime_type = "image/jpeg"
                return [file_data, mime_type]

        def capture_download(self, type):
            with self.mutex:
                cam_f = self._cam.capture(type)
                cam_fold = self._cam.folder_list_files(cam_f.folder)
                cam_fold_fs = [cam_fold.get_name(i) for i in range(cam_fold.count())]
                cam_fnames = [f for f in cam_fold_fs if
                              Path(f).with_suffix("").name == Path(cam_f.name).with_suffix("").name]

                # JPG sometimes won't appear if we don't do this refresh first (not sure if this is necessary)
                # self._cam.exit()
                # self._cam.init()

                zip_data = io.BytesIO()
                with zipfile.ZipFile(zip_data, "w") as zf:
                    for cam_fname in cam_fnames:
                        camera_file = self._cam.file_get(cam_f.folder, cam_fname, gp.GP_FILE_TYPE_NORMAL)
                        file_data = bytes(camera_file.get_data_and_size())
                        zf.writestr(cam_fname, file_data)
                        self._cam.file_delete(cam_f.folder, cam_fname)
                zip_name = Path(cam_f.name).with_suffix(".zip").name
                zip_data.seek(0)
                zip_b64 = base64.b64encode(zip_data.read()).decode()
                return zip_name, zip_b64

    instances = {}

    @staticmethod
    def get_instance(port) -> __ThreadsafeCamera:
        if port not in ThreadsafeCamera.instances:
            ThreadsafeCamera.instances[port] = ThreadsafeCamera.__ThreadsafeCamera(port)
        camera = ThreadsafeCamera.instances[port]
        camera.connect()
        return camera


def flatten_config(widget: gp.widget.CameraWidget, path: Optional[List[str]] = None) -> Generator[
    None, Tuple[gp.CameraWidget, Dict], None]:
    if path is None:
        path = ()
    data = {
        "id": widget.get_id(),
        "info": widget.get_info(),
        "label": widget.get_label(),
        "name": widget.get_name(),
        "readonly": widget.get_readonly(),
        "type": widget.get_type(),
        "changed": widget.changed()
    }
    try:
        data["choices"] = tuple(widget.get_choices())
    except gp.GPhoto2Error:
        pass
    try:
        data["range"] = widget.get_range()
    except gp.GPhoto2Error:
        pass
    try:
        data["value"] = widget.get_value()
    except gp.GPhoto2Error:
        pass

    if data["type"] not in (CameraWidgetType.MENU, CameraWidgetType.SECTION):
        data["path"] = "/" + "/".join(path + (data["name"],))
        yield widget, data
    children = widget.get_children()
    for child in children:
        yield from flatten_config(child, path + (data["name"],))


def list_cameras() -> Tuple[Dict[str, Any]]:
    cameras = tuple(gp.check_result(gp.gp_camera_autodetect()))
    port_info_list = gp.PortInfoList()
    port_info_list.load()
    ret = []
    for name, port in cameras:
        summary = ThreadsafeCamera.get_instance(port).get_summary()
        data = {"name": name, "port": port, "summary": summary}
        ret.append(data)
    return tuple(ret)


app = Flask(__name__)
CORS(app)


@app.route("/api/cameras")
def get_cameras():
    return jsonify(list_cameras())


@app.route("/api/settings")
def get_settings():
    port = request.args["port"]
    camera = ThreadsafeCamera.get_instance(port)
    config = list(camera._get_flat_config())
    return jsonify(list(zip(*config))[1])


@app.route("/api/setting", methods=["GET"])
def get_setting():
    port = request.args["port"]
    path = request.args["path"]
    camera = ThreadsafeCamera.get_instance(port)
    setting = camera.get_single_config(Path(path).name)
    return jsonify(setting)


@app.route("/api/setting", methods=["PUT"])
def set_setting():
    port = request.json["port"]
    setting = request.json["setting"]
    camera = ThreadsafeCamera.get_instance(port)
    camera.set_config(Path(setting["path"]).name, setting["value"])
    return ""


@app.route("/api/hierarchy", methods=["GET"])
def get_hierarchy():
    port = request.args["port"]
    camera = ThreadsafeCamera.get_instance(port)
    return jsonify(camera.get_file_hierarchy())


@app.route("/api/preview.mjpeg")
def get_preview():
    port = request.args["port"]
    size = int(request.args.get("size", "0"))
    quality = int(request.args.get("quality", "0"))
    camera = ThreadsafeCamera.get_instance(port)
    return Response(camera.generate_preview_frames(size, quality),
                    mimetype="multipart/x-mixed-replace; boundary=preview-frame")


@app.route("/api/capture/image")
def capture_image():
    port = request.args["port"]
    camera = ThreadsafeCamera.get_instance(port)
    ret = camera.capture(gp.GP_CAPTURE_IMAGE)
    return jsonify({"folder": ret.folder, "name": ret.name})


@app.route("/api/capturedownload/image")
def capturedownload_image():
    port = request.args["port"]
    camera = ThreadsafeCamera.get_instance(port)
    zip_name, zip_data = camera.capture_download(gp.GP_CAPTURE_IMAGE)
    return jsonify({"name": zip_name, "data": zip_data})


@app.route("/api/download/image")
def download_image():
    port = request.args["port"]
    path = request.args["path"]
    size = int(request.args.get("size", "0"))
    quality = int(request.args.get("quality", "0"))
    camera = ThreadsafeCamera.get_instance(port)
    file_data, mime_type = camera.download(path, size, quality)
    return send_file(io.BytesIO(file_data), mime_type)


if __name__ == "__main__":
    app.run("0.0.0.0", 3001)
